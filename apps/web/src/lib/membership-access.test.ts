import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());

import {
  getActingRoleForProject,
  getHeldRoles,
  getOwnRole,
  getPermissionsForProject,
  getPoApprovalRole,
  getScopedRolePermissions,
  getUserPermissions,
  getUserRole,
  getUserScope,
} from "@/lib/server";

function setMembership(active: boolean) {
  mockPrisma().userCompany!.findUnique.mockResolvedValue({
    id: "uc-1",
    role: "PROJECT_MANAGER",
    activeRole: null,
    secondaryRoles: [],
    active,
    userPermissions: [{ permission: "finance.view" }],
    scopes: [],
  });
}

describe("permissions for a membership that has been deactivated", () => {
  beforeEach(() => {
    setSessionUser({ role: "PROJECT_MANAGER" });
  });

  it("keeps the role's permissions while the membership is active", async () => {
    setMembership(true);
    expect((await getUserPermissions()).length).toBeGreaterThan(0);
  });

  it("resolves no company permissions once the membership is deactivated", async () => {
    setMembership(false);
    expect(await getUserPermissions()).toEqual([]);
  });

  it("resolves no project-role permissions once the membership is deactivated", async () => {
    setMembership(false);
    mockPrisma().projectAssignment!.findMany.mockResolvedValue([{ scopedRole: "PROJECT_MANAGER" }]);
    expect(await getScopedRolePermissions()).toEqual([]);
  });

  it("gives nothing on a project through a project role once the membership is deactivated", async () => {
    setMembership(false);
    mockPrisma().projectAssignment!.findFirst.mockResolvedValue({ scopedRole: "PROJECT_MANAGER" });
    expect(await getPermissionsForProject("project-1")).toEqual([]);
  });
});

describe("role helpers for a membership that has been deactivated", () => {
  beforeEach(() => {
    setSessionUser({ role: "PROJECT_MANAGER" });
    // Restore the harness default — a test below points this at null.
    mockPrisma().company!.findFirst.mockImplementation(async () => ({
      id: "company-1",
      name: "Test Company",
      currency: "INR",
      parentCompanyId: null,
      deletedAt: null,
    }));
  });

  it("reports the held role set while the membership is active", async () => {
    setMembership(true);
    expect(await getHeldRoles("user-owner-1", "company-1")).toEqual({
      primaryRole: "PROJECT_MANAGER",
      activeRole: "PROJECT_MANAGER",
      heldRoles: ["PROJECT_MANAGER"],
    });
  });

  it("reports no held roles once the membership is deactivated", async () => {
    setMembership(false);
    expect(await getHeldRoles("user-owner-1", "company-1")).toBeNull();
  });

  it("does not act as the deactivated membership's role", async () => {
    setSessionUser({ role: "SUPERVISOR" });
    setMembership(false); // held role is PROJECT_MANAGER
    expect(await getUserRole()).toBe("SUPERVISOR");
    expect(await getOwnRole()).toBe("SUPERVISOR");
  });

  it("does not resurrect the stored global role once the account is deactivated", async () => {
    setSessionUser({ role: "ADMIN", active: false });
    // No active membership anywhere → no company resolves for this user.
    mockPrisma().company!.findFirst.mockResolvedValue(null);
    mockPrisma().userCompany!.findUnique.mockResolvedValue(null);
    expect(await getUserRole()).toBe("SUPERVISOR");
    expect(await getOwnRole()).toBe("SUPERVISOR");
  });
});

describe("permissions for an account that has been deactivated", () => {
  beforeEach(() => {
    // User-level deactivation (PATCH /api/users/[id]) leaves memberships
    // active — suspend semantics. Authority must still be zero.
    setSessionUser({ role: "PROJECT_MANAGER", active: false });
    setMembership(true);
    mockPrisma().company!.findFirst.mockImplementation(async () => ({
      id: "company-1",
      name: "Test Company",
      currency: "INR",
      parentCompanyId: null,
      deletedAt: null,
    }));
  });

  it("resolves no company permissions", async () => {
    expect(await getUserPermissions()).toEqual([]);
  });

  it("resolves no project-role permissions", async () => {
    mockPrisma().projectAssignment!.findMany.mockResolvedValue([{ scopedRole: "PROJECT_MANAGER" }]);
    expect(await getScopedRolePermissions()).toEqual([]);
  });

  it("gives nothing on a project", async () => {
    mockPrisma().projectAssignment!.findFirst.mockResolvedValue({ scopedRole: "PROJECT_MANAGER" });
    expect(await getPermissionsForProject("project-1")).toEqual([]);
  });
});

describe("project hats that outlived their membership", () => {
  beforeEach(() => {
    mockPrisma().company!.findFirst.mockImplementation(async () => ({
      id: "company-1",
      name: "Test Company",
      currency: "INR",
      parentCompanyId: null,
      deletedAt: null,
    }));
  });

  it("ignores a hat in a company where the membership was deactivated — even while another membership stays live", async () => {
    // Live member of company-1 as a plain SUPERVISOR; the leftover hat is in
    // co-2, where they were terminated.
    setSessionUser({ role: "SUPERVISOR" });
    mockPrisma().userCompany!.findUnique.mockImplementation(async (args: any) => {
      const { userId, companyId } = args?.where?.userId_companyId ?? {};
      if (companyId === "co-2") return { active: false };
      if (userId === "user-owner-1") {
        return { id: "uc-1", role: "SUPERVISOR", activeRole: null, secondaryRoles: [], active: true, userPermissions: [], scopes: [] };
      }
      return null;
    });
    mockPrisma().projectAssignment!.findFirst.mockResolvedValue({
      scopedRole: "PROJECT_MANAGER",
      project: { companyId: "co-2" },
    });
    expect(await getActingRoleForProject("project-1")).toBeNull();
    expect(await getPoApprovalRole("project-1")).toBe("SUPERVISOR");
  });

  it("ignores a leftover hat once the account itself is deactivated", async () => {
    setSessionUser({ role: "PROJECT_MANAGER", active: false });
    mockPrisma().userCompany!.findUnique.mockImplementation(async (args: any) => {
      const { userId } = args?.where?.userId_companyId ?? {};
      if (userId === "user-owner-1") {
        return { id: "uc-1", role: "SUPERVISOR", activeRole: null, secondaryRoles: [], active: true, userPermissions: [], scopes: [] };
      }
      return null;
    });
    mockPrisma().projectAssignment!.findFirst.mockResolvedValue({
      scopedRole: "PROJECT_MANAGER",
      project: { companyId: "company-1" },
    });
    expect(await getActingRoleForProject("project-1")).toBeNull();
    expect(await getPoApprovalRole("project-1")).toBe("SUPERVISOR");
  });
});

describe("read scope for a deactivated membership", () => {
  beforeEach(() => {
    mockPrisma().company!.findFirst.mockImplementation(async () => ({
      id: "company-1",
      name: "Test Company",
      currency: "INR",
      parentCompanyId: null,
      deletedAt: null,
    }));
  });

  it("an active, unscoped member still resolves COMPANY scope", async () => {
    setSessionUser({ role: "OWNER" });
    mockPrisma().userCompany!.findUnique.mockResolvedValue({
      id: "uc-1", role: "OWNER", activeRole: null, secondaryRoles: [],
      active: true, scopeType: "COMPANY", userPermissions: [], scopes: [],
    });
    expect((await getUserScope()).scopeType).toBe("COMPANY");
  });

  it("a deactivated membership narrows to nothing — not a widened COMPANY view", async () => {
    // resolveUserScope returns null for the dead row; the old fallback then
    // widened the member to full-company read for the rest of the request.
    setSessionUser({ role: "SITE_ENGINEER" });
    setMembership(false);
    const scope = await getUserScope();
    expect(scope.scopeType).not.toBe("COMPANY");
    expect(scope.projectIds).toEqual([]);
    expect(scope.departmentIds).toEqual([]);
  });

  it("a deactivated account narrows to nothing even with a live membership row", async () => {
    // The membership resolves to full COMPANY scope — the account flag must
    // still win, or the widened-fallback leak just moved one level up.
    setSessionUser({ role: "OWNER", active: false });
    mockPrisma().userCompany!.findUnique.mockResolvedValue({
      id: "uc-1", role: "OWNER", activeRole: null, secondaryRoles: [],
      active: true, scopeType: "COMPANY", userPermissions: [], scopes: [],
    });
    const scope = await getUserScope();
    expect(scope.scopeType).not.toBe("COMPANY");
    expect(scope.projectIds).toEqual([]);
  });
});
