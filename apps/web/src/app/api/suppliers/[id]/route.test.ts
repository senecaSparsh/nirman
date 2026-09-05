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

import { GET, PATCH, DELETE } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };
const SALES_MANAGER = { role: "SALES_MANAGER" as const };

function prismaSupplier(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sup-1",
    name: "Steel Co",
    gstin: "27XYZ5678W",
    phone: "9876543210",
    email: "steel@test.com",
    address: "456 Industrial Area",
    balanceOwed: 50000,
    leadTimeDays: 7,
    companyId: "company-1",
    deletedAt: null,
    version: 1,
    _count: { purchaseOrders: 3, supplierReturns: 0, rateContracts: 1 },
    ...overrides,
  };
}

const ctx = { params: Promise.resolve({ id: "sup-1" }) };

describe("GET /api/suppliers/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().supplier!.findFirst.mockResolvedValue(prismaSupplier());
  });

  it("returns 200 with the supplier", async () => {
    const res = await GET(makeRequest("/api/suppliers/sup-1"), ctx);
    expect(res.status).toBe(200);
    const body = await getJson<{ id: string; name: string }>(res);
    expect(body.id).toBe("sup-1");
    expect(body.name).toBe("Steel Co");
  });

  it("returns 404 when supplier not found", async () => {
    mockPrisma().supplier!.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/suppliers/missing"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks PROCUREMENT_VIEW", async () => {
    setSessionUser(SALES_MANAGER);
    const res = await GET(makeRequest("/api/suppliers/sup-1"), ctx);
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/suppliers/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().supplier!.findFirst.mockResolvedValue(prismaSupplier());
    mockPrisma().supplier!.update.mockResolvedValue(prismaSupplier({ name: "Updated Co", version: 2 }));
  });

  it("returns 200 with the updated supplier", async () => {
    const res = await PATCH(
      makeRequest("/api/suppliers/sup-1", { method: "PATCH", body: { name: "Updated Co" } }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ name: string }>(res);
    expect(body.name).toBe("Updated Co");
  });

  it("returns 400 on invalid input (empty name)", async () => {
    const res = await PATCH(
      makeRequest("/api/suppliers/sup-1", { method: "PATCH", body: { name: "" } }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks PROCUREMENT_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await PATCH(
      makeRequest("/api/suppliers/sup-1", { method: "PATCH", body: { name: "X" } }),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when supplier not found", async () => {
    mockPrisma().supplier!.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("/api/suppliers/missing", { method: "PATCH", body: { name: "X" } }),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 on concurrent edit (version mismatch)", async () => {
    const res = await PATCH(
      makeRequest("/api/suppliers/sup-1", { method: "PATCH", body: { name: "X", version: 5 } }),
      ctx,
    );
    expect(res.status).toBe(409);
    const body = await getJson<{ code: string }>(res);
    expect(body.code).toBe("CONCURRENT_EDIT");
  });
});

describe("DELETE /api/suppliers/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().supplier!.findFirst.mockResolvedValue(prismaSupplier());
    mockPrisma().supplier!.update.mockResolvedValue(prismaSupplier({ deletedAt: new Date() }));
  });

  it("returns 200 with ok:true on successful soft delete", async () => {
    const res = await DELETE(makeRequest("/api/suppliers/sup-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 404 when supplier not found", async () => {
    mockPrisma().supplier!.findFirst.mockResolvedValue(null);
    const res = await DELETE(makeRequest("/api/suppliers/missing", { method: "DELETE" }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks PROCUREMENT_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await DELETE(makeRequest("/api/suppliers/sup-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(403);
  });
});
