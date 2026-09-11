import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, clearSession, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    withSerializableTransaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma())),
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});
vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";
import { PUT, DELETE } from "./[id]/route";

const OWNER = { role: "OWNER" as const };
const HR_MANAGER = { role: "HR_MANAGER" as const };

// Custom-roles route has no dynamic params, so ctx is empty.
const EMPTY_CTX = {} as never;

// Dynamic route ctx for /api/custom-roles/[id]
const DYN_CTX = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

const MOCK_ROLE = {
  id: "cr-1",
  companyId: "company-1",
  key: "CUSTOM_SITE_LEAD",
  label: "Site Lead",
  description: "",
  baseRole: "SITE_ENGINEER",
  tier: 4,
  permissions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("POST /api/custom-roles", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().customRole!.findUnique.mockResolvedValue(null);
    mockPrisma().customRole!.create.mockImplementation(async (args: any) => ({
      id: "cr-new",
      companyId: "company-1",
      key: args.data.key,
      label: args.data.label,
      description: args.data.description,
      baseRole: args.data.baseRole,
      tier: args.data.tier,
      permissions: args.data.permissions,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  it("creates a custom role when OWNER creates a tier-4 role based on SITE_ENGINEER", async () => {
    const res = await POST(
      makeRequest("/api/custom-roles", {
        method: "POST",
        body: { key: "SITE_LEAD", label: "Site Lead", baseRole: "SITE_ENGINEER", permissions: [] },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean; role: { key: string; tier: number } }>(res);
    expect(body.ok).toBe(true);
    expect(body.role.key).toBe("CUSTOM_SITE_LEAD");
    expect(body.role.tier).toBe(4);
  });

  it("returns 403 when HR_MANAGER creates a role based on PROJECT_DIRECTOR (tier 2 > tier 3)", async () => {
    setSessionUser(HR_MANAGER);
    const res = await POST(
      makeRequest("/api/custom-roles", {
        method: "POST",
        body: { key: "DIRECTOR_ASSIST", label: "Director Assist", baseRole: "PROJECT_DIRECTOR", permissions: [] },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(403);
    const body = await getJson<{ error: string }>(res);
    expect(body.error).toMatch(/don.t have authority to create a role based on/i);
  });

  it("returns 403 when HR_MANAGER creates a role based on ADMIN (tier 1)", async () => {
    setSessionUser(HR_MANAGER);
    const res = await POST(
      makeRequest("/api/custom-roles", {
        method: "POST",
        body: { key: "ADMIN_ASSIST", label: "Admin Assist", baseRole: "ADMIN", permissions: [] },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when HR_MANAGER creates a role based on FINANCE_HEAD (tier 2)", async () => {
    setSessionUser(HR_MANAGER);
    const res = await POST(
      makeRequest("/api/custom-roles", {
        method: "POST",
        body: { key: "FINANCE_ASSIST", label: "Finance Assist", baseRole: "FINANCE_HEAD", permissions: [] },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(403);
  });

  it("allows HR_MANAGER to create a role based on STORE_KEEPER (tier 4 < tier 3)", async () => {
    setSessionUser(HR_MANAGER);
    const res = await POST(
      makeRequest("/api/custom-roles", {
        method: "POST",
        body: { key: "JUNIOR_KEEPER", label: "Junior Keeper", baseRole: "STORE_KEEPER", permissions: [] },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(200);
  });

  it("returns 403 when HR_MANAGER grants a permission they don't have (company.manage)", async () => {
    setSessionUser(HR_MANAGER);
    const res = await POST(
      makeRequest("/api/custom-roles", {
        method: "POST",
        body: { key: "JUNIOR_KEEPER", label: "Junior Keeper", baseRole: "STORE_KEEPER", permissions: ["company.manage"] },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(403);
    const body = await getJson<{ error: string }>(res);
    expect(body.error).toMatch(/can.t grant permissions you don.t have/i);
  });

  it("returns 403 when a tier override is at or above the actor's tier", async () => {
    // HR_MANAGER is tier 3. Trying to set tier=2 (even with a tier-4 base role)
    // should be blocked — the override would grant tier-2 authority.
    setSessionUser(HR_MANAGER);
    const res = await POST(
      makeRequest("/api/custom-roles", {
        method: "POST",
        body: { key: "JUNIOR_KEEPER", label: "Junior Keeper", baseRole: "STORE_KEEPER", tier: 2, permissions: [] },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(403);
    const body = await getJson<{ error: string }>(res);
    expect(body.error).toMatch(/can.t set the access level/i);
  });

  it("returns 409 when the key already exists", async () => {
    mockPrisma().customRole!.findUnique.mockResolvedValue({
      id: "cr-existing",
      key: "CUSTOM_SITE_LEAD",
      label: "Existing Role",
    });
    const res = await POST(
      makeRequest("/api/custom-roles", {
        method: "POST",
        body: { key: "SITE_LEAD", label: "Site Lead", baseRole: "SITE_ENGINEER", permissions: [] },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(409);
  });

  it("returns 400 when the key is not UPPER_SNAKE_CASE", async () => {
    const res = await POST(
      makeRequest("/api/custom-roles", {
        method: "POST",
        body: { key: "site-lead", label: "Site Lead", baseRole: "SITE_ENGINEER", permissions: [] },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when the base role is invalid", async () => {
    const res = await POST(
      makeRequest("/api/custom-roles", {
        method: "POST",
        body: { key: "SITE_LEAD", label: "Site Lead", baseRole: "SUPER_ADMIN", permissions: [] },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(
      makeRequest("/api/custom-roles", {
        method: "POST",
        body: { key: "SITE_LEAD", label: "Site Lead", baseRole: "SITE_ENGINEER", permissions: [] },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when the actor lacks USERS_MANAGE", async () => {
    setSessionUser({ role: "SITE_ENGINEER" });
    const res = await POST(
      makeRequest("/api/custom-roles", {
        method: "POST",
        body: { key: "SITE_LEAD", label: "Site Lead", baseRole: "SITE_ENGINEER", permissions: [] },
      }),
      EMPTY_CTX,
    );
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/custom-roles/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().customRole!.findFirst.mockResolvedValue(MOCK_ROLE);
    mockPrisma().customRole!.update.mockImplementation(async (args: any) => ({
      ...MOCK_ROLE,
      ...args.data,
    }));
  });

  it("updates label when OWNER updates a tier-4 role", async () => {
    const res = await PUT(
      makeRequest("/api/custom-roles/cr-1", {
        method: "PUT",
        body: { label: "Senior Site Lead" },
      }),
      DYN_CTX("cr-1"),
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean; role: { label: string } }>(res);
    expect(body.ok).toBe(true);
    expect(body.role.label).toBe("Senior Site Lead");
  });

  it("returns 403 when HR_MANAGER updates a role based on PROJECT_DIRECTOR (tier 2 > tier 3)", async () => {
    setSessionUser(HR_MANAGER);
    mockPrisma().customRole!.findFirst.mockResolvedValue({ ...MOCK_ROLE, baseRole: "PROJECT_DIRECTOR", tier: 2 });
    const res = await PUT(
      makeRequest("/api/custom-roles/cr-1", {
        method: "PUT",
        body: { label: "Updated" },
      }),
      DYN_CTX("cr-1"),
    );
    expect(res.status).toBe(403);
    const body = await getJson<{ error: string }>(res);
    expect(body.error).toMatch(/don.t have authority/i);
  });

  it("returns 403 when HR_MANAGER escalates tier to their own level (tier 3)", async () => {
    setSessionUser(HR_MANAGER);
    const res = await PUT(
      makeRequest("/api/custom-roles/cr-1", {
        method: "PUT",
        body: { tier: 3 },
      }),
      DYN_CTX("cr-1"),
    );
    expect(res.status).toBe(403);
    const body = await getJson<{ error: string }>(res);
    expect(body.error).toMatch(/can.t set the access level/i);
  });

  it("returns 403 when HR_MANAGER grants a permission they don't have", async () => {
    setSessionUser(HR_MANAGER);
    const res = await PUT(
      makeRequest("/api/custom-roles/cr-1", {
        method: "PUT",
        body: { permissions: ["company.manage"] },
      }),
      DYN_CTX("cr-1"),
    );
    expect(res.status).toBe(403);
    const body = await getJson<{ error: string }>(res);
    expect(body.error).toMatch(/can.t grant permissions you don.t have/i);
  });

  it("allows HR_MANAGER to update a role based on STORE_KEEPER (tier 4 < tier 3)", async () => {
    setSessionUser(HR_MANAGER);
    const res = await PUT(
      makeRequest("/api/custom-roles/cr-1", {
        method: "PUT",
        body: { label: "Updated Label" },
      }),
      DYN_CTX("cr-1"),
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when the role is not found", async () => {
    mockPrisma().customRole!.findFirst.mockResolvedValue(null);
    const res = await PUT(
      makeRequest("/api/custom-roles/missing", {
        method: "PUT",
        body: { label: "Updated" },
      }),
      DYN_CTX("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when permissions contain an invalid key", async () => {
    const res = await PUT(
      makeRequest("/api/custom-roles/cr-1", {
        method: "PUT",
        body: { permissions: ["invalid.permission"] },
      }),
      DYN_CTX("cr-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await PUT(
      makeRequest("/api/custom-roles/cr-1", {
        method: "PUT",
        body: { label: "Updated" },
      }),
      DYN_CTX("cr-1"),
    );
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/custom-roles/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().customRole!.findFirst.mockResolvedValue(MOCK_ROLE);
    mockPrisma().userCompany!.count.mockResolvedValue(0);
    mockPrisma().customRole!.delete.mockResolvedValue(MOCK_ROLE);
  });

  it("deletes a custom role when no users are assigned", async () => {
    const res = await DELETE(
      makeRequest("/api/custom-roles/cr-1", { method: "DELETE" }),
      DYN_CTX("cr-1"),
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
  });

  it("returns 409 when users are still assigned to the role", async () => {
    mockPrisma().userCompany!.count.mockResolvedValue(3);
    const res = await DELETE(
      makeRequest("/api/custom-roles/cr-1", { method: "DELETE" }),
      DYN_CTX("cr-1"),
    );
    expect(res.status).toBe(409);
    const body = await getJson<{ error: string }>(res);
    expect(body.error).toMatch(/3 user/i);
  });

  it("returns 404 when the role is not found", async () => {
    mockPrisma().customRole!.findFirst.mockResolvedValue(null);
    const res = await DELETE(
      makeRequest("/api/custom-roles/missing", { method: "DELETE" }),
      DYN_CTX("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await DELETE(
      makeRequest("/api/custom-roles/cr-1", { method: "DELETE" }),
      DYN_CTX("cr-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when the actor lacks USERS_MANAGE", async () => {
    setSessionUser({ role: "SITE_ENGINEER" });
    const res = await DELETE(
      makeRequest("/api/custom-roles/cr-1", { method: "DELETE" }),
      DYN_CTX("cr-1"),
    );
    expect(res.status).toBe(403);
  });
});
