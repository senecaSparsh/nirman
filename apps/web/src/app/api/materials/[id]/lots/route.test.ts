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
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    getLotHistory: vi.fn().mockResolvedValue([{ id: "lot-1", lotNumber: "LOT-001", currentQty: 50 }]),
    withSerializableTransaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma())),
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, POST } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

describe("GET /api/materials/[id]/lots", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().material!.findFirst.mockResolvedValue({ id: "mat-1", isLotTracked: true });
  });

  it("returns 200 with lot history", async () => {
    const res = await GET(makeRequest("/api/materials/mat-1/lots"), { params: Promise.resolve({ id: "mat-1" }) });
    expect(res.status).toBe(200);
    const body = await getJson<{ materialId: string; isLotTracked: boolean; lots: unknown[] }>(res);
    expect(body.materialId).toBe("mat-1");
    expect(body.lots).toHaveLength(1);
  });

  it("returns 404 when material not found", async () => {
    mockPrisma().material!.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/materials/mat-99/lots"), { params: Promise.resolve({ id: "mat-99" }) });
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/materials/mat-1/lots"), { params: Promise.resolve({ id: "mat-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks INVENTORY_VIEW", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await GET(makeRequest("/api/materials/mat-1/lots"), { params: Promise.resolve({ id: "mat-1" }) });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/materials/[id]/lots", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().material!.findFirst.mockResolvedValue({ id: "mat-1", isLotTracked: true, name: "Steel", code: "STL-001" });
    mockPrisma().materialLot!.findUnique.mockResolvedValue(null);
    mockPrisma().materialLot!.create.mockResolvedValue({ id: "lot-1", lotNumber: "LOT-001", initialQty: 100 });
  });

  it("returns 201 on successful lot creation", async () => {
    const res = await POST(
      makeRequest("/api/materials/mat-1/lots", {
        method: "POST",
        body: { lotNumber: "LOT-001", receivedDate: "2024-01-15T00:00:00.000Z", initialQty: 100, unitCost: 50 },
      }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(201);
  });

  it("returns 400 on invalid input (missing lotNumber)", async () => {
    const res = await POST(
      makeRequest("/api/materials/mat-1/lots", {
        method: "POST",
        body: { receivedDate: "2024-01-15T00:00:00.000Z", initialQty: 100 },
      }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when material not found", async () => {
    mockPrisma().material!.findFirst.mockResolvedValue(null);
    const res = await POST(
      makeRequest("/api/materials/mat-99/lots", {
        method: "POST",
        body: { lotNumber: "LOT-001", receivedDate: "2024-01-15T00:00:00.000Z", initialQty: 100 },
      }),
      { params: Promise.resolve({ id: "mat-99" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when lot number already exists", async () => {
    mockPrisma().materialLot!.findUnique.mockResolvedValue({ id: "lot-existing", deletedAt: null });
    const res = await POST(
      makeRequest("/api/materials/mat-1/lots", {
        method: "POST",
        body: { lotNumber: "LOT-001", receivedDate: "2024-01-15T00:00:00.000Z", initialQty: 100 },
      }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(409);
  });

  it("returns 403 when the user lacks INVENTORY_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(
      makeRequest("/api/materials/mat-1/lots", {
        method: "POST",
        body: { lotNumber: "LOT-001", receivedDate: "2024-01-15T00:00:00.000Z", initialQty: 100 },
      }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/materials/mat-1/lots", {
        method: "POST",
        body: { lotNumber: "LOT-001", receivedDate: "2024-01-15T00:00:00.000Z", initialQty: 100 },
      }),
      { params: Promise.resolve({ id: "mat-1" }) },
    );
    expect(res.status).toBe(401);
  });
});
