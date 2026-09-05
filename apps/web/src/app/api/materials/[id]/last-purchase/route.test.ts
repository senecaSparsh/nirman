import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  authMocks,
  setSessionUser,
  clearSession,
  makeRequest,
  getJson,
  mockPrisma,
} from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET } from "./route";

const OWNER = { role: "OWNER" as const };

describe("GET /api/materials/[id]/last-purchase", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().goodsReceiptLine!.findFirst.mockResolvedValue(null);
    mockPrisma().material!.findUnique.mockResolvedValue({ standardCost: 75, currentCost: 70 });
  });

  it("returns 200 with receipt source when a receipt exists", async () => {
    mockPrisma().goodsReceiptLine!.findFirst.mockResolvedValue({
      unitCost: 80,
      qtyReceived: 100,
      goodsReceipt: {
        receiptDate: new Date("2024-01-15"),
        purchaseOrder: { poNumber: "PO-001" },
      },
    });
    const res = await GET(makeRequest("/api/materials/mat-1/last-purchase"), { params: Promise.resolve({ id: "mat-1" }) });
    expect(res.status).toBe(200);
    const body = await getJson<{ unitCost: number; source: string; poNumber: string }>(res);
    expect(body.source).toBe("receipt");
    expect(body.unitCost).toBe(80);
    expect(body.poNumber).toBe("PO-001");
  });

  it("returns 200 with standard source when no receipt exists", async () => {
    const res = await GET(makeRequest("/api/materials/mat-1/last-purchase"), { params: Promise.resolve({ id: "mat-1" }) });
    expect(res.status).toBe(200);
    const body = await getJson<{ unitCost: number; source: string }>(res);
    expect(body.source).toBe("standard");
    expect(body.unitCost).toBe(75);
  });

  it("returns 200 with none source when no receipt and no standard cost", async () => {
    mockPrisma().material!.findUnique.mockResolvedValue({ standardCost: 0, currentCost: 0 });
    const res = await GET(makeRequest("/api/materials/mat-1/last-purchase"), { params: Promise.resolve({ id: "mat-1" }) });
    expect(res.status).toBe(200);
    const body = await getJson<{ source: string }>(res);
    expect(body.source).toBe("none");
  });

  it("returns 404 when material not found", async () => {
    mockPrisma().material!.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/materials/mat-99/last-purchase"), { params: Promise.resolve({ id: "mat-99" }) });
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/materials/mat-1/last-purchase"), { params: Promise.resolve({ id: "mat-1" }) });
    expect(res.status).toBe(401);
  });
});
