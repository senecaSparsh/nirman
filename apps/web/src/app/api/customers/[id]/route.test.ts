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
const STORE_KEEPER = { role: "STORE_KEEPER" as const };

function prismaCustomer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cust-1",
    name: "Acme Corp",
    phone: "9876543210",
    email: "acme@test.com",
    gstin: "27ABCDE1234F1Z5",
    address: "123 Main St",
    companyId: "company-1",
    deletedAt: null,
    version: 1,
    _count: { assetSales: 2, materialSales: 1 },
    ...overrides,
  };
}

const ctx = { params: Promise.resolve({ id: "cust-1" }) };

describe("GET /api/customers/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().customer!.findFirst.mockResolvedValue(prismaCustomer());
  });

  it("returns 200 with the customer", async () => {
    const res = await GET(makeRequest("/api/customers/cust-1"), ctx);
    expect(res.status).toBe(200);
    const body = await getJson<{ id: string; name: string }>(res);
    expect(body.id).toBe("cust-1");
    expect(body.name).toBe("Acme Corp");
  });

  it("returns 404 when customer not found", async () => {
    mockPrisma().customer!.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("/api/customers/missing"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/customers/cust-1"), ctx);
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/customers/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().customer!.findFirst.mockResolvedValue(prismaCustomer());
    mockPrisma().customer!.update.mockResolvedValue(prismaCustomer({ name: "Updated Corp", version: 2 }));
  });

  it("returns 200 with the updated customer", async () => {
    const res = await PATCH(
      makeRequest("/api/customers/cust-1", { method: "PATCH", body: { name: "Updated Corp" } }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ name: string }>(res);
    expect(body.name).toBe("Updated Corp");
  });

  it("returns 400 on invalid input (empty name)", async () => {
    const res = await PATCH(
      makeRequest("/api/customers/cust-1", { method: "PATCH", body: { name: "" } }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks SALES_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await PATCH(
      makeRequest("/api/customers/cust-1", { method: "PATCH", body: { name: "X" } }),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when customer not found", async () => {
    mockPrisma().customer!.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("/api/customers/missing", { method: "PATCH", body: { name: "X" } }),
      ctx,
    );
    expect(res.status).toBe(500);
  });

  it("returns 409 on concurrent edit (version mismatch)", async () => {
    const res = await PATCH(
      makeRequest("/api/customers/cust-1", { method: "PATCH", body: { name: "X", version: 5 } }),
      ctx,
    );
    expect(res.status).toBe(409);
    const body = await getJson<{ code: string }>(res);
    expect(body.code).toBe("CONCURRENT_EDIT");
  });
});

describe("DELETE /api/customers/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().customer!.findFirst.mockResolvedValue(prismaCustomer());
    mockPrisma().customer!.update.mockResolvedValue(prismaCustomer({ deletedAt: new Date() }));
  });

  it("returns 200 with ok:true on successful soft delete", async () => {
    const res = await DELETE(makeRequest("/api/customers/cust-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 404 when customer not found", async () => {
    mockPrisma().customer!.findFirst.mockResolvedValue(null);
    const res = await DELETE(makeRequest("/api/customers/missing", { method: "DELETE" }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks SALES_MANAGE", async () => {
    setSessionUser(STORE_KEEPER);
    const res = await DELETE(makeRequest("/api/customers/cust-1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(403);
  });
});
