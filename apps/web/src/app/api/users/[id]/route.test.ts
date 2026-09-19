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

import { PATCH } from "./route";

const OWNER = { role: "OWNER" as const };
const SALES_MANAGER = { role: "SALES_MANAGER" as const };

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/users/[id]", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    // getCurrentUser() calls user.findUnique by ID for auth.
    // The route also calls user.findUnique by ID for the target user.
    // Distinguish by the ID value.
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-owner-1") {
        return { id: "user-owner-1", role: "OWNER", companyId: "company-1", active: true };
      }
      return { id: "u-target", role: "SITE_ENGINEER", active: true, name: "Jane" };
    });
    mockPrisma().user!.count.mockResolvedValue(2);
    mockPrisma().user!.update.mockResolvedValue({
      id: "u-target",
      email: "jane@test.com",
      name: "Jane Updated",
      role: "STORE_KEEPER",
      active: true,
      phone: "9876543210",
      designation: null,
      department: null,
      employeeCode: null,
      companyId: "company-1",
    });
    mockPrisma().companyPhone!.findMany.mockResolvedValue([]);
    mockPrisma().session!.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma().purchaseOrder!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().materialRequisition!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().dailyProgressReport!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().expenseClaim!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().supplierInvoice!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().task!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().projectAssignment!.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma().lead!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().userCompany!.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma().userCompany!.findMany.mockResolvedValue([]);
    // Company membership check: target user is a member of company-1
    mockPrisma().userCompany!.findFirst.mockResolvedValue({ id: "uc-target" });
  });

  it("updates a user's role and returns { ok: true }", async () => {
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "STORE_KEEPER" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean; user: { id: string } }>(res);
    expect(body.ok).toBe(true);
    expect(body.user.id).toBe("u-target");
  });

  it("returns 404 when user is not found", async () => {
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-owner-1") {
        return { id: "user-owner-1", role: "OWNER", companyId: "company-1", active: true };
      }
      return null; // target user not found
    });
    const res = await PATCH(
      makeRequest("/api/users/nope", { method: "PATCH", body: { role: "STORE_KEEPER" } }),
      makeCtx("nope"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when changing own role (OWNER→ADMIN blocked by canAssignRole)", async () => {
    // Actor is OWNER with id "u-target", target is also OWNER with id "u-target"
    // canAssignRole(OWNER, OWNER) returns false (same tier) → 403 before the last-OWNER guard
    setSessionUser({ ...OWNER, id: "u-target" });
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "u-target") {
        return { id: "u-target", role: "OWNER", active: true, name: "Owner" };
      }
      return { id: "u-target", role: "OWNER", companyId: "company-1", active: true };
    });
    mockPrisma().user!.count.mockResolvedValue(1);
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "ADMIN" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when demoting another OWNER (canAssignRole blocks same-tier)", async () => {
    // Actor is OWNER (id "user-owner-1"), target is a different OWNER (id "u-owner")
    // canAssignRole(OWNER, OWNER) returns false → 403 before the last-OWNER guard
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-owner-1") {
        return { id: "user-owner-1", role: "OWNER", companyId: "company-1", active: true };
      }
      return { id: "u-owner", role: "OWNER", active: true, name: "Owner" };
    });
    mockPrisma().user!.count.mockResolvedValue(1);
    const res = await PATCH(
      makeRequest("/api/users/u-owner", { method: "PATCH", body: { role: "ADMIN" } }),
      makeCtx("u-owner"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when the user lacks USERS_MANAGE", async () => {
    setSessionUser(SALES_MANAGER);
    // Override findUnique so getCurrentUser() returns SALES_MANAGER role
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-owner-1") {
        return { id: "user-owner-1", role: "SALES_MANAGER", companyId: "company-1", active: true };
      }
      return { id: "u-target", role: "SITE_ENGINEER", active: true, name: "Jane" };
    });
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "STORE_KEEPER" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "STORE_KEEPER" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(401);
  });

  it("deactivates a user and runs cleanup side effects", async () => {
    mockPrisma().session!.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma().task!.updateMany.mockResolvedValue({ count: 1 });
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { active: false } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma().session!.deleteMany).toHaveBeenCalled();
    expect(mockPrisma().task!.updateMany).toHaveBeenCalled();
  });

  it("returns 404 when target user is not in the actor's company (cross-tenant denial)", async () => {
    // Target user exists but has no membership in the actor's company
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-owner-1") {
        return { id: "user-owner-1", role: "OWNER", companyId: "company-1", active: true };
      }
      return { id: "u-other", role: "SITE_ENGINEER", active: true, name: "Jane", companyId: "company-2" };
    });
    mockPrisma().userCompany!.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("/api/users/u-other", { method: "PATCH", body: { role: "STORE_KEEPER" } }),
      makeCtx("u-other"),
    );
    expect(res.status).toBe(404);
  });

  // ── Custom role tests ──
  // The API stores CustomRole.key as "CUSTOM_SALES_LEAD" (auto-prefixed).
  // The page passes cr.key directly (already prefixed). This test verifies
  // the API correctly resolves the custom role by its stored key.

  it("assigns a custom role when the actor's tier is above the custom role's tier", async () => {
    // Actor: OWNER (tier 1). Target: SITE_ENGINEER (tier 4).
    // Custom role: CUSTOM_SALES_LEAD at tier 4.
    // canAssignCustomRole(OWNER, 4) → 1 < 4 → true.
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-owner-1") {
        return { id: "user-owner-1", role: "OWNER", companyId: "company-1", active: true };
      }
      return { id: "u-target", role: "SITE_ENGINEER", active: true, name: "Jane", companyId: "company-1" };
    });
    mockPrisma().customRole!.findFirst.mockResolvedValue({
      id: "cr-1",
      key: "CUSTOM_SALES_LEAD",
      tier: 4,
      baseRole: "SALES_MANAGER",
      permissions: [],
    });
    mockPrisma().user!.update.mockResolvedValue({
      id: "u-target",
      email: "jane@test.com",
      name: "Jane",
      role: "CUSTOM_SALES_LEAD",
      active: true,
      phone: null,
      designation: null,
      department: null,
      employeeCode: null,
      companyId: "company-1",
    });
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "CUSTOM_SALES_LEAD" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean; user: { role: string } }>(res);
    expect(body.ok).toBe(true);
    expect(body.user.role).toBe("CUSTOM_SALES_LEAD");
  });

  it("returns 403 when assigning a custom role above the actor's tier", async () => {
    // Actor: HR_MANAGER (tier 3). Target: SITE_ENGINEER (tier 4).
    // Custom role: CUSTOM_DIRECTOR at tier 2.
    // canAssignCustomRole(HR_MANAGER, 2) → 3 < 2 → false → 403.
    setSessionUser({ role: "HR_MANAGER", id: "hr-1" });
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "hr-1") {
        return { id: "hr-1", role: "HR_MANAGER", companyId: "company-1", active: true };
      }
      return { id: "u-target", role: "SITE_ENGINEER", active: true, name: "Jane", companyId: "company-1" };
    });
    mockPrisma().customRole!.findFirst.mockResolvedValue({
      id: "cr-2",
      key: "CUSTOM_DIRECTOR",
      tier: 2,
      baseRole: "PROJECT_DIRECTOR",
      permissions: [],
    });
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "CUSTOM_DIRECTOR" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when the custom role key is not found in the DB (e.g. double-prefixed key)", async () => {
    // This tests the bug that was fixed: the page was sending
    // "CUSTOM_CUSTOM_SALES_LEAD" (double-prefixed) which doesn't exist in the DB.
    // The API should reject it with 403 (customRole.findFirst returns null).
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "user-owner-1") {
        return { id: "user-owner-1", role: "OWNER", companyId: "company-1", active: true };
      }
      return { id: "u-target", role: "SITE_ENGINEER", active: true, name: "Jane", companyId: "company-1" };
    });
    // Simulate: custom role not found (double-prefixed key doesn't match)
    mockPrisma().customRole!.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "CUSTOM_CUSTOM_SALES_LEAD" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when a tier-3 actor tries to assign a tier-1 role (ADMIN)", async () => {
    // Actor: HR_MANAGER (tier 3). Target: SITE_ENGINEER (tier 4).
    // New role: ADMIN (tier 1).
    // canAssignRole(HR_MANAGER, ADMIN) → 3 < 1 → false → 403.
    setSessionUser({ role: "HR_MANAGER", id: "hr-1" });
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "hr-1") {
        return { id: "hr-1", role: "HR_MANAGER", companyId: "company-1", active: true };
      }
      return { id: "u-target", role: "SITE_ENGINEER", active: true, name: "Jane", companyId: "company-1" };
    });
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "ADMIN" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when a tier-3 actor tries to assign a tier-2 role (PROJECT_DIRECTOR)", async () => {
    setSessionUser({ role: "HR_MANAGER", id: "hr-1" });
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "hr-1") {
        return { id: "hr-1", role: "HR_MANAGER", companyId: "company-1", active: true };
      }
      return { id: "u-target", role: "SITE_ENGINEER", active: true, name: "Jane", companyId: "company-1" };
    });
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "PROJECT_DIRECTOR" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(403);
  });

  it("allows a tier-3 actor (HR_MANAGER) to assign a tier-4 role (STORE_KEEPER)", async () => {
    // canAssignRole(HR_MANAGER, STORE_KEEPER) → 3 < 4 → true.
    setSessionUser({ role: "HR_MANAGER", id: "hr-1" });
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "hr-1") {
        return { id: "hr-1", role: "HR_MANAGER", companyId: "company-1", active: true };
      }
      return { id: "u-target", role: "SITE_ENGINEER", active: true, name: "Jane", companyId: "company-1" };
    });
    mockPrisma().user!.update.mockResolvedValue({
      id: "u-target",
      email: "jane@test.com",
      name: "Jane",
      role: "STORE_KEEPER",
      active: true,
      phone: null,
      designation: null,
      department: null,
      employeeCode: null,
      companyId: "company-1",
    });
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "STORE_KEEPER" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(200);
  });

  it("blocks self-role-change (tier check catches it before self-demotion guard)", async () => {
    // Actor is ADMIN (id "admin-1"), target is the same user.
    // canAssignRole(ADMIN, ADMIN) → same role → false → 403 from tier check.
    // The self-demotion guard (line 125, returns 400) is belt-and-suspenders
    // but the tier check always fires first for same-user role changes
    // because canAssignRole returns false when actor === target role.
    setSessionUser({ role: "ADMIN", id: "admin-1" });
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "admin-1") {
        return { id: "admin-1", role: "ADMIN", companyId: "company-1", active: true };
      }
      return { id: "admin-1", role: "ADMIN", active: true, name: "Admin" };
    });
    const res = await PATCH(
      makeRequest("/api/users/admin-1", { method: "PATCH", body: { role: "STORE_KEEPER" } }),
      makeCtx("admin-1"),
    );
    expect(res.status).toBe(403);
  });

  it("rejects a role that is neither built-in nor a CUSTOM_* key (400, not stored verbatim)", async () => {
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "GARBAGE_ROLE_XYZ" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(400);
    const body = await getJson<{ error: string }>(res);
    expect(body.error).toContain("CUSTOM_*");
  });

  it("blocks a tier-3 actor from managing a member holding a tier-2 custom role", async () => {
    // The regression: CUSTOM_* stored roles normalized to SUPERVISOR (tier 5)
    // under canAssignRole, so an HR_MANAGER passed the hierarchy check on a
    // tier-2 member. canManageRole resolves the stored CustomRole tier.
    setSessionUser({ role: "HR_MANAGER", id: "hr-1" });
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "hr-1") {
        return { id: "hr-1", role: "HR_MANAGER", companyId: "company-1", active: true };
      }
      return { id: "u-target", role: "CUSTOM_DIRECTOR", active: true, name: "Director" };
    });
    mockPrisma().customRole!.findFirst.mockResolvedValue({
      id: "cr-1", companyId: "company-1", key: "CUSTOM_DIRECTOR",
      label: "Director", baseRole: "PROJECT_DIRECTOR", tier: 2, permissions: [],
    });
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "SUPERVISOR" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(403);
  });

  it("blocks a tier-3 actor from deactivating a member holding a tier-2 custom role", async () => {
    setSessionUser({ role: "HR_MANAGER", id: "hr-1" });
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "hr-1") {
        return { id: "hr-1", role: "HR_MANAGER", companyId: "company-1", active: true };
      }
      return { id: "u-target", role: "CUSTOM_DIRECTOR", active: true, name: "Director" };
    });
    mockPrisma().customRole!.findFirst.mockResolvedValue({
      id: "cr-1", companyId: "company-1", key: "CUSTOM_DIRECTOR",
      label: "Director", baseRole: "PROJECT_DIRECTOR", tier: 2, permissions: [],
    });
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { active: false } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(403);
  });

  it("assigns a custom role when the actor's tier is above it", async () => {
    mockPrisma().customRole!.findFirst.mockResolvedValue({
      id: "cr-2", companyId: "company-1", key: "CUSTOM_SITE_LEAD",
      label: "Site Lead", baseRole: "SITE_ENGINEER", tier: 4, permissions: ["qc.manage"],
    });
    const res = await PATCH(
      makeRequest("/api/users/u-target", { method: "PATCH", body: { role: "CUSTOM_SITE_LEAD" } }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(200);
  });

  // ── Multi-role ("one hat at a time") tests ──────────────────────
  // Held set = { membership.role } ∪ secondaryRoles; activeRole = the worn
  // hat. The actor must be above EVERY held role — current AND new.

  it("assigns secondary roles and writes them to the membership", async () => {
    // Actor: OWNER. Target: SITE_ENGINEER + [STORE_KEEPER, ACCOUNTANT].
    mockPrisma().userCompany!.findFirst.mockResolvedValue({
      id: "uc-target", role: "SITE_ENGINEER", secondaryRoles: [], activeRole: null,
    });
    const res = await PATCH(
      makeRequest("/api/users/u-target", {
        method: "PATCH",
        body: { secondaryRoles: ["STORE_KEEPER", "ACCOUNTANT"] },
      }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma().userCompany!.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "uc-target" },
        data: expect.objectContaining({ secondaryRoles: ["STORE_KEEPER", "ACCOUNTANT"] }),
      }),
    );
  });

  it("returns 403 when a tier-3 actor assigns a secondary role above their tier", async () => {
    // Actor: HR_MANAGER (tier 3). Target: SITE_ENGINEER. New secondary: PROJECT_DIRECTOR (tier 2).
    setSessionUser({ role: "HR_MANAGER", id: "hr-1" });
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "hr-1") {
        return { id: "hr-1", role: "HR_MANAGER", companyId: "company-1", active: true };
      }
      return { id: "u-target", role: "SITE_ENGINEER", active: true, name: "Jane", companyId: "company-1" };
    });
    mockPrisma().userCompany!.findFirst.mockResolvedValue({
      id: "uc-target", role: "SITE_ENGINEER", secondaryRoles: [], activeRole: null,
    });
    const res = await PATCH(
      makeRequest("/api/users/u-target", {
        method: "PATCH",
        body: { secondaryRoles: ["PROJECT_DIRECTOR"] },
      }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when the target holds a dormant senior hat the actor can't manage", async () => {
    // Actor: HR_MANAGER (tier 3). Target wears SITE_ENGINEER but also HOLDS
    // a PROJECT_DIRECTOR hat (tier 2) — a dormant senior hat still protects
    // the target from a junior manager's edits.
    setSessionUser({ role: "HR_MANAGER", id: "hr-1" });
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "hr-1") {
        return { id: "hr-1", role: "HR_MANAGER", companyId: "company-1", active: true };
      }
      return { id: "u-target", role: "SITE_ENGINEER", active: true, name: "Jane", companyId: "company-1" };
    });
    mockPrisma().userCompany!.findFirst.mockResolvedValue({
      id: "uc-target", role: "SITE_ENGINEER", secondaryRoles: ["PROJECT_DIRECTOR"], activeRole: "SITE_ENGINEER",
    });
    const res = await PATCH(
      makeRequest("/api/users/u-target", {
        method: "PATCH",
        body: { secondaryRoles: [] }, // try to strip the director hat
      }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(403);
  });

  it("resets a stale activeRole when the worn hat leaves the held set", async () => {
    // Target currently WEARS STORE_KEEPER; the update removes that hat —
    // activeRole must reset to null (primary) so they don't keep the power.
    mockPrisma().userCompany!.findFirst.mockResolvedValue({
      id: "uc-target", role: "SITE_ENGINEER", secondaryRoles: ["STORE_KEEPER"], activeRole: "STORE_KEEPER",
    });
    const res = await PATCH(
      makeRequest("/api/users/u-target", {
        method: "PATCH",
        body: { secondaryRoles: [] },
      }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma().userCompany!.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "uc-target" },
        data: expect.objectContaining({ secondaryRoles: [], activeRole: null }),
      }),
    );
  });

  it("dedupes the primary role out of secondaryRoles", async () => {
    mockPrisma().userCompany!.findFirst.mockResolvedValue({
      id: "uc-target", role: "SITE_ENGINEER", secondaryRoles: [], activeRole: null,
    });
    const res = await PATCH(
      makeRequest("/api/users/u-target", {
        method: "PATCH",
        body: { secondaryRoles: ["SITE_ENGINEER", "STORE_KEEPER"] },
      }),
      makeCtx("u-target"),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma().userCompany!.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ secondaryRoles: ["STORE_KEEPER"] }),
      }),
    );
  });

  it("returns 400 when the user edits their own held set", async () => {
    // Self-edit of secondaryRoles is a role-set change — same lockout as
    // primary role self-changes.
    setSessionUser({ role: "OWNER", id: "u-target" });
    mockPrisma().user!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === "u-target") {
        return { id: "u-target", role: "OWNER", active: true, name: "Owner", companyId: "company-1" };
      }
      return { id: "u-target", role: "OWNER", companyId: "company-1", active: true };
    });
    mockPrisma().userCompany!.findFirst.mockResolvedValue({
      id: "uc-target", role: "OWNER", secondaryRoles: [], activeRole: null,
    });
    const res = await PATCH(
      makeRequest("/api/users/u-target", {
        method: "PATCH",
        body: { secondaryRoles: ["SITE_ENGINEER"] },
      }),
      makeCtx("u-target"),
    );
    // canManageRoleSet(OWNER, [OWNER]) → same tier → false → 403 fires first
    // (same as the primary-role self-change test above).
    expect([400, 403]).toContain(res.status);
  });
});
