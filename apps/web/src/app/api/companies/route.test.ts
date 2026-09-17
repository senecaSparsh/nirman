import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.spyOn(console, "error").mockImplementation(() => {});

import { GET, POST } from "./route";

const OWNER = { role: "OWNER" as const };
const ACCOUNTANT = { role: "ACCOUNTANT" as const };

function prismaCompany(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "co-1",
    name: "Test Co",
    gstin: null,
    pan: null,
    address: null,
    currency: "INR",
    businessType: "CONSTRUCTION",
    parentCompanyId: null,
    parent: null,
    _count: { userMemberships: 5, children: 0 },
    ...overrides,
  };
}

describe("GET /api/companies", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().company!.findMany.mockResolvedValue([prismaCompany()]);
  });

  it("returns 200 with a list of companies", async () => {
    const res = await GET(makeRequest("/api/companies"), {});
    expect(res.status).toBe(200);
    const body = await getJson<unknown[]>(res);
    expect(body).toHaveLength(1);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await GET(makeRequest("/api/companies"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks COMPANY_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await GET(makeRequest("/api/companies"), {});
    expect(res.status).toBe(403);
  });

  it("scopes the list to memberships + descendants, never all tenants", async () => {
    // Keyed on where.userId so getActingDelegations' findMany (which needs
    // .user) still gets its default [] — the membership lookup is the only
    // caller that filters by userId.
    mockPrisma().userCompany!.findMany.mockImplementation(async (args?: { where?: Record<string, unknown> }) =>
      args?.where?.userId ? [{ companyId: "company-1" }] : []);
    mockPrisma().company!.findMany.mockImplementation(async (args?: { where?: Record<string, unknown> }) => {
      if (args?.where?.parentCompanyId) return []; // descendant lookups → none
      return [prismaCompany()];
    });
    const res = await GET(makeRequest("/api/companies"), {});
    expect(res.status).toBe(200);
    const lastCall = mockPrisma().company!.findMany.mock.calls.at(-1)?.[0] as
      | { where?: { id?: { in?: string[] } } }
      | undefined;
    expect(lastCall?.where?.id?.in).toEqual(["company-1"]);
  });
});

describe("POST /api/companies", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    // getCompany() calls company.findFirst to resolve the current company.
    // Return the default company for that, but null for parent company checks
    // (which pass a where clause with a specific parentCompanyId).
    mockPrisma().company!.findFirst.mockImplementation(async (args?: { where?: { id?: string } }) => {
      // Parent company check passes { id: parentCompanyId, deletedAt: null }
      // getCompany passes { id: companyId, deletedAt: null, userMemberships: {...} }
      // Distinguish by checking if the where clause has userMemberships.
      const where = args?.where as Record<string, unknown> | undefined;
      if (where && where.userMemberships) return { id: "company-1", name: "Test Co", currency: "INR", parentCompanyId: null, deletedAt: null };
      return null;
    });
    mockPrisma().company!.create.mockResolvedValue({ id: "co-new", name: "New Co" });
  });

  it("creates a company and returns 201", async () => {
    const res = await POST(
      makeRequest("/api/companies", { method: "POST", body: { name: "New Co" } }),
      {},
    );
    expect(res.status).toBe(201);
    const body = await getJson<{ id: string; name: string }>(res);
    expect(body.id).toBe("co-new");
    expect(mockPrisma().company!.create).toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    const res = await POST(
      makeRequest("/api/companies", { method: "POST", body: {} }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when parent company is not found", async () => {
    // Keep the conditional mock from beforeEach — parent check returns null
    // (non-userMemberships call), getCompany() returns the company.
    const res = await POST(
      makeRequest("/api/companies", {
        method: "POST",
        body: { name: "Child Co", parentCompanyId: "nonexistent" },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user lacks COMPANY_MANAGE", async () => {
    setSessionUser(ACCOUNTANT);
    const res = await POST(
      makeRequest("/api/companies", { method: "POST", body: { name: "New Co" } }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when the parent is outside the caller's tree (cross-tenant graft)", async () => {
    // The parent exists but the caller holds no membership in it —
    // group-scoped reads would leak the victim tenant's data to this child.
    mockPrisma().company!.findFirst.mockImplementation(async (args?: { where?: Record<string, unknown> }) => {
      const where = args?.where;
      if (where?.userMemberships) return { id: "company-1", name: "Test Co", currency: "INR", parentCompanyId: null, deletedAt: null };
      if (where?.id === "co-victim") return { id: "co-victim" };
      return null;
    });
    // userCompany.findMany + company.findMany (descendants) default to []
    // → the manageable set is empty, so the graft must be refused.
    const res = await POST(
      makeRequest("/api/companies", {
        method: "POST",
        body: { name: "Graft Co", parentCompanyId: "co-victim" },
      }),
      {},
    );
    expect(res.status).toBe(403);
  });

  it("creates a child when the parent is a membership company", async () => {
    mockPrisma().company!.findFirst.mockImplementation(async (args?: { where?: Record<string, unknown> }) => {
      const where = args?.where;
      if (where?.userMemberships) return { id: "company-1", name: "Test Co", currency: "INR", parentCompanyId: null, deletedAt: null };
      if (where?.id === "company-1") return { id: "company-1" };
      return null;
    });
    mockPrisma().userCompany!.findMany.mockImplementation(async (args?: { where?: Record<string, unknown> }) =>
      args?.where?.userId ? [{ companyId: "company-1" }] : []);
    const res = await POST(
      makeRequest("/api/companies", {
        method: "POST",
        body: { name: "Child Co", parentCompanyId: "company-1" },
      }),
      {},
    );
    expect(res.status).toBe(201);
  });
});
