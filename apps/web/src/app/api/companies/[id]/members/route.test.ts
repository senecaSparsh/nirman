import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, setCompany, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return { ...actual, logAction: vi.fn().mockResolvedValue(undefined) };
});

import { logAction } from "@nirman/services";
import { GET, POST } from "./route";

const OWNER = { role: "OWNER" as const, id: "user-owner-1" };
const ctx = { params: Promise.resolve({ id: "co-1" }) };
const OWNER_MEMBERSHIP = { id: "uc-owner", role: "OWNER", secondaryRoles: [], activeRole: null, scopeType: null, scopes: [], userPermissions: [] };

/** The actor's own membership (getActingRole, scope ceiling) and the target's membership, if any. */
function mockMemberships(target: { userId: string; membership: Record<string, unknown> | null }) {
  mockPrisma().userCompany!.findUnique.mockImplementation(async (args: any) => {
    const uid = args?.where?.userId_companyId?.userId;
    if (uid === OWNER.id) return OWNER_MEMBERSHIP;
    if (uid === target.userId) return target.membership;
    return null;
  });
}

/** getCurrentUser() reads the session by id; the email lookup finds `existing` or nobody. */
function mockUsers(existing: Record<string, unknown> | null) {
  mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
    if (args?.where?.id) return { id: OWNER.id, role: "OWNER", companyId: "co-1", active: true };
    if (existing && args?.where?.email === existing.email) return existing;
    return null;
  });
}

function post(body: Record<string, unknown>) {
  return POST(makeRequest("/api/companies/co-1/members", { method: "POST", body }), ctx);
}

describe("POST /api/companies/[id]/members — access scope on add", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSessionUser(OWNER);
    setCompany({ id: "co-1" });
    mockMemberships({ userId: "u-new", membership: null });
    mockUsers(null);
    mockPrisma().user!.create.mockResolvedValue({ id: "u-new", email: "new@test.com", name: "new", role: "SUPERVISOR" });
    mockPrisma().userCompany!.upsert.mockResolvedValue({ id: "uc-new", userId: "u-new", role: "SUPERVISOR", secondaryRoles: [] });
    mockPrisma().project!.count.mockResolvedValue(1);
    mockPrisma().department!.count.mockResolvedValue(1);
  });

  it("refuses a new member added without a scope, and creates nothing", async () => {
    const res = await post({ email: "new@test.com", role: "SUPERVISOR" });
    expect(res.status).toBe(400);
    expect((await getJson<{ error: string }>(res)).error).toMatch(/scope/i);
    expect(mockPrisma().user!.create).not.toHaveBeenCalled();
    expect(mockPrisma().userCompany!.upsert).not.toHaveBeenCalled();
  });

  it("refuses company-wide scope for a project manager", async () => {
    const res = await post({ email: "new@test.com", role: "PROJECT_MANAGER", scopeType: "COMPANY" });
    expect(res.status).toBe(400);
    expect((await getJson<{ error: string }>(res)).error).toMatch(/company-wide/i);
    expect(mockPrisma().userCompany!.upsert).not.toHaveBeenCalled();
  });

  it("adds a field member on the projects they were given, and audits it", async () => {
    const res = await post({
      email: "new@test.com",
      role: "SUPERVISOR",
      scopeType: "PROJECT",
      scopeEntries: [{ projectId: "p-1" }, { projectId: "p-1" }],
    });
    expect(res.status).toBe(201);
    expect(mockPrisma().userCompany!.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          scopeType: "PROJECT",
          scopes: { create: [{ scopeKind: "PROJECT", projectId: "p-1" }] },
        }),
      }),
    );
    expect(logAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "MEMBERSHIP_ADD", companyId: "co-1", entityType: "UserCompany" }),
    );
  });

  it("refuses a project that belongs to another company", async () => {
    mockPrisma().project!.count.mockResolvedValue(0);
    const res = await post({ email: "new@test.com", role: "SUPERVISOR", scopeType: "PROJECT", scopeEntries: [{ projectId: "p-other" }] });
    expect(res.status).toBe(404);
    expect((await getJson<{ error: string }>(res)).error).toMatch(/not found in this company/i);
    expect(mockPrisma().userCompany!.upsert).not.toHaveBeenCalled();
  });

  it("keeps an existing member's scope when they are added again, and asks for none", async () => {
    mockMemberships({
      userId: "u-existing",
      membership: { id: "uc-t", userId: "u-existing", role: "SUPERVISOR", secondaryRoles: [], activeRole: null, scopeType: "PROJECT", scopes: [], userPermissions: [] },
    });
    mockUsers({ id: "u-existing", email: "existing@test.com", name: "Existing", role: "SUPERVISOR", active: true, isHidden: false });
    const res = await post({ email: "existing@test.com", role: "SITE_ENGINEER" });
    expect(res.status).toBe(201);
    const body = await getJson<{ updated: boolean; scopeKept: boolean }>(res);
    expect(body.updated).toBe(true);
    expect(body.scopeKept).toBe(true);
    expect(mockPrisma().project!.count).not.toHaveBeenCalled();
    expect(mockPrisma().userCompany!.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ role: "SITE_ENGINEER" }) }),
    );
  });

  it("refuses to re-add a terminated member — a role edit must not look like a rehire", async () => {
    mockMemberships({
      userId: "u-gone",
      membership: { id: "uc-gone", userId: "u-gone", role: "SUPERVISOR", secondaryRoles: [], activeRole: null, active: false, scopeType: null, scopes: [], userPermissions: [] },
    });
    mockUsers({ id: "u-gone", email: "gone@test.com", name: "Gone", role: "SUPERVISOR", active: true, isHidden: false });
    const res = await post({ email: "gone@test.com", role: "SITE_ENGINEER", scopeType: "PROJECT", scopeEntries: [{ projectId: "p-1" }] });
    expect(res.status).toBe(409);
    expect((await getJson<{ error: string }>(res)).error).toMatch(/deactivated|restore/i);
    expect(mockPrisma().userCompany!.upsert).not.toHaveBeenCalled();
  });
});

describe("GET /api/companies/[id]/members — member status", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    setCompany({ id: "co-1" });
    mockPrisma().userCompany!.findUnique.mockImplementation(async () => OWNER_MEMBERSHIP);
    mockPrisma().userCompany!.findMany.mockResolvedValue([
      {
        id: "m-1", userId: "u-1", role: "SUPERVISOR", secondaryRoles: [], activeRole: null,
        scopeType: null, active: true, reportsToUserCompanyId: null, scopes: [],
        user: { id: "u-1", name: "Active Member", email: "a@x.in", active: true },
      },
      {
        id: "m-2", userId: "u-2", role: "SUPERVISOR", secondaryRoles: [], activeRole: null,
        scopeType: null, active: false, reportsToUserCompanyId: null, scopes: [],
        user: { id: "u-2", name: "Terminated Member", email: "t@x.in", active: true },
      },
    ]);
  });

  it("reports a deactivated membership as inactive even when the user account is still active", async () => {
    const res = await GET(makeRequest("/api/companies/co-1/members"), ctx);
    expect(res.status).toBe(200);
    const members = await getJson<{ userId: string; active: boolean }[]>(res);
    // u-2 was terminated from this company but stays active elsewhere —
    // the member list must not show them as an active member here.
    expect(members.find((m) => m.userId === "u-1")?.active).toBe(true);
    expect(members.find((m) => m.userId === "u-2")?.active).toBe(false);
  });
});
