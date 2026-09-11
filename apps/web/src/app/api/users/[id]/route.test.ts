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
});
