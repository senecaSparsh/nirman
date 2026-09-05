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
    _count: { assetSales: 2 },
    ...overrides,
  };
}

describe("GET /api/customers", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().customer!.findMany.mockResolvedValue([prismaCustomer()]);
  });

  it("returns 200 with rows mapped to the API shape", async () => {
    const res = await GET(makeRequest("/api/customers"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: "cust-1", name: "Acme Corp", activeSales: 2 });
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/customers"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user's role lacks SALES_VIEW", async () => {
    setSessionUser(STORE_KEEPER);
    const res = await GET(makeRequest("/api/customers"), {});
    expect(res.status).toBe(403);
  });
});

describe("POST /api/customers", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().customer!.create.mockResolvedValue(prismaCustomer());
  });

  it("returns 400 on invalid input (missing required name)", async () => {
    const res = await POST(makeRequest("/api/customers", { method: "POST", body: { phone: "123" } }), {});
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks SALES_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(makeRequest("/api/customers", { method: "POST", body: { name: "X" } }), {});
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(makeRequest("/api/customers", { method: "POST", body: { name: "X" } }), {});
    expect(res.status).toBe(401);
  });

  it("creates a customer and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/customers", { method: "POST", body: { name: "Acme Corp", phone: "9876543210" } }),
      {},
    );
    expect(res.status).toBe(201);
    expect(mockPrisma().customer!.create).toHaveBeenCalled();
  });
});

describe("PUT /api/customers (bulk import)", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().customer!.findFirst.mockResolvedValue(null);
    mockPrisma().customer!.create.mockResolvedValue(prismaCustomer());
  });

  it("returns 400 when items is not an array", async () => {
    const res = await PUT(makeRequest("/api/customers", { method: "PUT", body: {} }), {});
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks SALES_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await PUT(makeRequest("/api/customers", { method: "PUT", body: { items: [] } }), {});
    expect(res.status).toBe(403);
  });

  it("creates valid items and skips duplicates", async () => {
    mockPrisma().customer!.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "dup-1" });
    const res = await PUT(
      makeRequest("/api/customers", {
        method: "PUT",
        body: {
          items: [
            { name: "New Customer", phone: "111" },
            { name: "Dup Customer", phone: "222" },
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
