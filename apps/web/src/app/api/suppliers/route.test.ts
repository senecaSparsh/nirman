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

import { GET, POST, PUT } from "./route";

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
    _count: { purchaseOrders: 3 },
    ...overrides,
  };
}

describe("GET /api/suppliers", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().supplier!.findMany.mockResolvedValue([prismaSupplier()]);
  });

  it("returns 200 with rows mapped to the API shape", async () => {
    const res = await GET(makeRequest("/api/suppliers"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: "sup-1", name: "Steel Co", openPOs: 3, balanceOwed: 50000 });
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/suppliers"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user's role lacks PROCUREMENT_VIEW", async () => {
    setSessionUser(SALES_MANAGER);
    const res = await GET(makeRequest("/api/suppliers"), {});
    expect(res.status).toBe(403);
  });
});

describe("POST /api/suppliers", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().supplier!.create.mockResolvedValue(prismaSupplier());
  });

  it("returns 400 on invalid input (missing required name)", async () => {
    const res = await POST(makeRequest("/api/suppliers", { method: "POST", body: { phone: "123" } }), {});
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks PROCUREMENT_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(makeRequest("/api/suppliers", { method: "POST", body: { name: "X" } }), {});
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(makeRequest("/api/suppliers", { method: "POST", body: { name: "X" } }), {});
    expect(res.status).toBe(401);
  });

  it("creates a supplier and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/suppliers", { method: "POST", body: { name: "Steel Co", phone: "9876543210" } }),
      {},
    );
    expect(res.status).toBe(201);
    expect(mockPrisma().supplier!.create).toHaveBeenCalled();
  });
});

describe("PUT /api/suppliers (bulk import)", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().supplier!.findFirst.mockResolvedValue(null);
    mockPrisma().supplier!.create.mockResolvedValue(prismaSupplier());
  });

  it("returns 400 when items is not an array", async () => {
    const res = await PUT(makeRequest("/api/suppliers", { method: "PUT", body: {} }), {});
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks PROCUREMENT_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await PUT(makeRequest("/api/suppliers", { method: "PUT", body: { items: [] } }), {});
    expect(res.status).toBe(403);
  });

  it("creates valid items and skips duplicates", async () => {
    mockPrisma().supplier!.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "dup-1" });
    const res = await PUT(
      makeRequest("/api/suppliers", {
        method: "PUT",
        body: {
          items: [
            { name: "New Supplier", phone: "111" },
            { name: "Dup Supplier", phone: "222" },
          ],
        },
      }),
      {},
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ created: number; skipped: number; errors: unknown[] }>(res);
    expect(body.created).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.errors).toHaveLength(0);
  });
});
