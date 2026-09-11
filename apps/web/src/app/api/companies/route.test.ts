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
});
