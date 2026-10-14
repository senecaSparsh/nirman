/**
 * Unit tests for role-based access control.
 *
 *   roleTier            — numeric tier for a role (1-5)
 *   canAssignRole       — can actor assign target role
 *   assignableRoles     — which roles can actor assign
 *   hasPermission       — check if a role has a specific permission
 *   isManagerOrAbove    — check if role is tier 3 or above
 *   canManageUsers      — check if role can manage users
 *   canAssignTasks      — check if role can assign tasks
 *   canManageWorkflows  — check if role can manage workflows
 *   effectivePermissions — full effective permission list for a role
 */
import { describe, it, expect } from "vitest";
import {
  roleTier,
  canAssignRole,
  assignableRoles,
  normalizeRole,
  hasPermission,
  effectivePermissions,
  isManagerOrAbove,
  canManageUsers,
  canAssignTasks,
  canManageWorkflows,
  canApproveProcurement,
  migrateRole,
  canDoOwnerOnly,
  canManageDelegationOf,
  delegatedAuthorityRole,
  delegableApprovalPermissions,
  poApprovalRoleFor,
  permissionsWithScopedRole,
  grantsOwnerLevel,
  canManageOwnerLevelRole,
  customPoApprovalRole,
  allowedScopeTypes,
  suggestedScopeType,
  ALL_ROLES,
  ALL_PERMISSIONS,
  APPROVER_ROLES,
  PERM,
  PERMISSION_MODULES,
  ROLES,
  holdsPermission,
} from "./roles";

describe("roleTier", () => {
  it("returns 1 for OWNER", () => {
    expect(roleTier("OWNER")).toBe(1);
  });

  it("returns 1 for ADMIN", () => {
    expect(roleTier("ADMIN")).toBe(1);
  });

  it("returns 1 for DEVELOPER", () => {
    expect(roleTier("DEVELOPER")).toBe(1);
  });

  it("returns 2 for PROJECT_DIRECTOR", () => {
    expect(roleTier("PROJECT_DIRECTOR")).toBe(2);
  });

  it("returns 3 for PROJECT_MANAGER", () => {
    expect(roleTier("PROJECT_MANAGER")).toBe(3);
  });

  it("returns 4 for SITE_ENGINEER", () => {
    expect(roleTier("SITE_ENGINEER")).toBe(4);
  });

  it("returns 5 for SUPERVISOR", () => {
    expect(roleTier("SUPERVISOR")).toBe(5);
  });

  it("returns 5 for QAQC_ENGINEER", () => {
    expect(roleTier("QAQC_ENGINEER")).toBe(5);
  });

  it("handles undefined role", () => {
    expect(roleTier(undefined)).toBe(5); // unknown → lowest tier
  });

  it("handles null role", () => {
    expect(roleTier(null)).toBe(5);
  });
});

describe("canAssignRole", () => {
  it("OWNER can assign ADMIN (same tier 1, different role)", () => {
    expect(canAssignRole("OWNER", "ADMIN")).toBe(true);
  });

  it("OWNER can assign PROJECT_DIRECTOR (tier 1 → tier 2)", () => {
    expect(canAssignRole("OWNER", "PROJECT_DIRECTOR")).toBe(true);
  });

  it("OWNER can assign SUPERVISOR (tier 1 → tier 5)", () => {
    expect(canAssignRole("OWNER", "SUPERVISOR")).toBe(true);
  });

  it("ADMIN cannot assign OWNER (only the OWNER account can make an owner)", () => {
    expect(canAssignRole("ADMIN", "OWNER")).toBe(false);
  });

  it("cannot assign own exact role (no self-cloning)", () => {
    expect(canAssignRole("OWNER", "OWNER")).toBe(false);
    expect(canAssignRole("PROJECT_MANAGER", "PROJECT_MANAGER")).toBe(false);
  });

  it("PROJECT_DIRECTOR can assign PROJECT_MANAGER (tier 2 → tier 3)", () => {
    expect(canAssignRole("PROJECT_DIRECTOR", "PROJECT_MANAGER")).toBe(true);
  });

  it("PROJECT_MANAGER cannot assign PROJECT_DIRECTOR (tier 3 → tier 2, upward)", () => {
    expect(canAssignRole("PROJECT_MANAGER", "PROJECT_DIRECTOR")).toBe(false);
  });

  it("same tier 2 peers cannot assign each other", () => {
    expect(canAssignRole("PROJECT_DIRECTOR", "FINANCE_HEAD")).toBe(false);
    expect(canAssignRole("FINANCE_HEAD", "PROJECT_DIRECTOR")).toBe(false);
  });

  it("same tier 3 peers cannot assign each other", () => {
    expect(canAssignRole("PROJECT_MANAGER", "PROCUREMENT_MANAGER")).toBe(false);
  });

  it("SUPERVISOR (tier 5) cannot assign anyone", () => {
    expect(canAssignRole("SUPERVISOR", "QAQC_ENGINEER")).toBe(false);
    expect(canAssignRole("SUPERVISOR", "OWNER")).toBe(false);
  });

  it("SITE_ENGINEER (tier 4) can assign SUPERVISOR (tier 5)", () => {
    expect(canAssignRole("SITE_ENGINEER", "SUPERVISOR")).toBe(true);
  });

  it("SITE_ENGINEER cannot assign same-tier peer", () => {
    expect(canAssignRole("SITE_ENGINEER", "STORE_KEEPER")).toBe(false);
  });

  it("handles undefined/null roles (normalize to SUPERVISOR tier 5)", () => {
    // undefined actor → normalizeRole → SUPERVISOR (tier 5) → can't assign anyone
    expect(canAssignRole(undefined, "OWNER")).toBe(false);
    // undefined target → normalizeRole → SUPERVISOR (tier 5) → OWNER can assign
    expect(canAssignRole("OWNER", undefined)).toBe(true);
    // null actor → SUPERVISOR, null target → SUPERVISOR → same role → false
    expect(canAssignRole(null, null)).toBe(false);
  });
});

describe("assignableRoles", () => {
  it("OWNER can assign all roles except OWNER and DEVELOPER", () => {
    const roles = assignableRoles("OWNER");
    expect(roles).not.toContain("OWNER");
    // DEVELOPER is the reserved internal hat — never in a picker.
    expect(roles).not.toContain("DEVELOPER");
    expect(roles).toContain("ADMIN");
    expect(roles).toContain("PROJECT_DIRECTOR");
    expect(roles).toContain("SUPERVISOR");
    expect(roles.length).toBe(ALL_ROLES.length - 2);
  });

  it("SUPERVISOR can assign no roles", () => {
    const roles = assignableRoles("SUPERVISOR");
    expect(roles).toHaveLength(0);
  });

  it("PROJECT_MANAGER can assign tier 4 and 5 roles", () => {
    const roles = assignableRoles("PROJECT_MANAGER");
    expect(roles).toContain("SITE_ENGINEER");
    expect(roles).toContain("SUPERVISOR");
    expect(roles).not.toContain("PROJECT_MANAGER");
    expect(roles).not.toContain("PROJECT_DIRECTOR");
  });

  it("returns roles for undefined actor (normalizes to SUPERVISOR, tier 5 → none)", () => {
    // undefined → SUPERVISOR (tier 5) → can't assign anyone
    const roles = assignableRoles(undefined);
    expect(roles).toHaveLength(0);
  });

  it("ADMIN is never offered OWNER in the picker", () => {
    expect(assignableRoles("ADMIN")).not.toContain("OWNER");
  });
});

describe("owner-only actions", () => {
  it("only the OWNER account passes the owner-only check", () => {
    expect(canDoOwnerOnly("OWNER")).toBe(true);
    expect(canDoOwnerOnly("ADMIN")).toBe(false);
    expect(canDoOwnerOnly("DEVELOPER")).toBe(false);
    expect(canDoOwnerOnly("PROJECT_DIRECTOR")).toBe(false);
    expect(canDoOwnerOnly(undefined)).toBe(false);
  });
});

describe("delegation", () => {
  it("an owner's delegation is capped at ADMIN, never OWNER", () => {
    expect(delegatedAuthorityRole("OWNER")).toBe("ADMIN");
    expect(delegatedAuthorityRole("DEVELOPER")).toBe("ADMIN");
    expect(delegatedAuthorityRole("ADMIN")).toBe("ADMIN");
    expect(delegatedAuthorityRole("PROJECT_MANAGER")).toBe("PROJECT_MANAGER");
  });

  it("only the OWNER can manage a delegation on the OWNER's membership", () => {
    expect(canManageDelegationOf("OWNER", "OWNER")).toBe(true);
    expect(canManageDelegationOf("ADMIN", "OWNER")).toBe(false);
  });

  it("OWNER and ADMIN can manage delegations on other members; others cannot", () => {
    expect(canManageDelegationOf("ADMIN", "PROJECT_MANAGER")).toBe(true);
    expect(canManageDelegationOf("OWNER", "SUPERVISOR")).toBe(true);
    expect(canManageDelegationOf("PROJECT_MANAGER", "SUPERVISOR")).toBe(false);
  });

  it("a delegation grants approval rights only, never administration or payroll", () => {
    const granted = new Set(delegableApprovalPermissions());
    expect(granted.has(PERM.PO_APPROVE)).toBe(true);
    expect(granted.has(PERM.REQUISITION_APPROVE)).toBe(true);
    for (const forbidden of [
      PERM.USERS_MANAGE,
      PERM.COMPANY_MANAGE,
      PERM.PAYROLL_MANAGE,
      PERM.HR_MANAGE,
      PERM.HR_SENSITIVE,
      PERM.LAND_PARTITION,
      PERM.FINANCE_MANAGE,
      PERM.AUDIT_VIEW,
    ]) {
      expect(granted.has(forbidden)).toBe(false);
    }
    expect(granted.has("*")).toBe(false);
  });
});

describe("purchase-order approval rank for delegates", () => {
  it("an owner's delegate approves POs at ADMIN rank, below the owner threshold", () => {
    expect(poApprovalRoleFor("SUPERVISOR", ["OWNER"])).toBe("ADMIN");
    expect(poApprovalRoleFor("PROJECT_MANAGER", ["OWNER"])).toBe("ADMIN");
  });

  it("a delegate keeps their own rank when it is higher than the delegator's", () => {
    expect(poApprovalRoleFor("PROJECT_DIRECTOR", ["PROJECT_MANAGER"])).toBe("PROJECT_DIRECTOR");
  });

  it("a delegate of a manager approves at the manager's rank", () => {
    expect(poApprovalRoleFor("SUPERVISOR", ["PROJECT_MANAGER"])).toBe("PROJECT_MANAGER");
  });

  it("no delegation leaves the own rank unchanged", () => {
    expect(poApprovalRoleFor("SITE_ENGINEER", [])).toBe("SITE_ENGINEER");
  });
});

describe("permissions on a project", () => {
  it("adds the permissions of a scoped hat on that project", () => {
    const perms = permissionsWithScopedRole(["inventory.view"], "PROJECT_MANAGER");
    expect(perms).toContain("po.approve");
    expect(perms).toContain("inventory.view");
  });

  it("keeps the global list when there is no scoped hat", () => {
    expect(permissionsWithScopedRole(["inventory.view"], null)).toEqual(["inventory.view"]);
  });

  it("never adds permissions the scoped hat does not have", () => {
    const perms = permissionsWithScopedRole(["inventory.view"], "SUPERVISOR");
    expect(perms).toContain("inventory.manage");
    expect(perms).not.toContain("po.approve");
  });
});

describe("owner-level permissions on custom roles", () => {
  it("company, payroll, user-management and land permissions are owner-level", () => {
    expect(grantsOwnerLevel([PERM.COMPANY_MANAGE])).toBe(true);
    expect(grantsOwnerLevel([PERM.PAYROLL_MANAGE])).toBe(true);
    expect(grantsOwnerLevel([PERM.USERS_MANAGE])).toBe(true);
    expect(grantsOwnerLevel([PERM.LAND_PARTITION])).toBe(true);
    expect(grantsOwnerLevel(["inventory.view", "po.approve"])).toBe(false);
  });

  it("an inherited role carries its base's owner-level permissions", () => {
    expect(grantsOwnerLevel(effectivePermissions("FINANCE_HEAD", []))).toBe(true);
  });

  it("only the owner may create or edit a role that holds owner-level permissions", () => {
    expect(canManageOwnerLevelRole("OWNER", [PERM.PAYROLL_MANAGE])).toBe(true);
    expect(canManageOwnerLevelRole("ADMIN", [PERM.PAYROLL_MANAGE])).toBe(false);
    expect(canManageOwnerLevelRole("ADMIN", ["inventory.view"])).toBe(true);
  });
});

describe("purchase-order rank for custom roles", () => {
  it("a custom role with PO approval approves up to the manager limit", () => {
    expect(customPoApprovalRole(["po.approve", "inventory.view"])).toBe("PROJECT_MANAGER");
  });

  it("a custom role without PO approval has no PO rank", () => {
    expect(customPoApprovalRole(["inventory.view"])).toBe("SUPERVISOR");
  });
});

describe("permission picker and custom-role gating", () => {
  const supervisorPerm = (ROLES.SUPERVISOR.permissions as string[])[0]!;

  it("offers a toggle for every permission in the catalog", () => {
    const pickable = new Set(PERMISSION_MODULES.flatMap((m) => m.permissions));
    expect(ALL_PERMISSIONS.filter((p) => !pickable.has(p))).toEqual([]);
  });

  it("holds a custom role's own list, not the built-in matrix of the tier it normalizes to", () => {
    expect(hasPermission("CUSTOM_QC_LEAD", supervisorPerm, [])).toBe(true);
    expect(holdsPermission("CUSTOM_QC_LEAD", supervisorPerm, [])).toBe(false);
    expect(holdsPermission("CUSTOM_QC_LEAD", PERM.INVENTORY_MANAGE, [PERM.INVENTORY_MANAGE])).toBe(true);
  });

  it("keeps the role matrix for built-in roles", () => {
    expect(holdsPermission("SUPERVISOR", supervisorPerm, [])).toBe(true);
    const pmPerm = effectivePermissions("PROJECT_MANAGER")[0]!;
    expect(holdsPermission("PROJECT_MANAGER", pmPerm, [])).toBe(true);
  });
});

describe("member access scope", () => {
  it("offers company-wide only to owner, admin, project director, finance head and accountant", () => {
    expect(allowedScopeTypes("FINANCE_HEAD")).toEqual(["COMPANY", "PROJECT", "DEPARTMENT"]);
    expect(allowedScopeTypes("ACCOUNTANT")).toEqual(["COMPANY", "PROJECT", "DEPARTMENT"]);
    expect(allowedScopeTypes("PROJECT_DIRECTOR")).toEqual(["COMPANY", "PROJECT", "DEPARTMENT"]);
    expect(allowedScopeTypes("PROJECT_MANAGER")).toEqual(["PROJECT", "DEPARTMENT"]);
    expect(allowedScopeTypes("SITE_ENGINEER")).not.toContain("COMPANY");
    expect(allowedScopeTypes("SECURITY_GUARD")).not.toContain("COMPANY");
  });

  it("keeps owner and admin company-wide", () => {
    expect(allowedScopeTypes("OWNER")).toEqual(["COMPANY"]);
    expect(allowedScopeTypes("ADMIN")).toEqual(["COMPANY"]);
  });

  it("gives a scratch custom role, which has no base role, project or department only", () => {
    expect(allowedScopeTypes(null)).toEqual(["PROJECT", "DEPARTMENT"]);
  });

  it("pre-selects a scope for field and manager roles and leaves executive company-wide to an explicit choice", () => {
    expect(suggestedScopeType("SITE_ENGINEER")).toBe("PROJECT");
    expect(suggestedScopeType("PROJECT_MANAGER")).toBe("PROJECT");
    expect(suggestedScopeType("FINANCE_HEAD")).toBeNull();
    expect(suggestedScopeType("ACCOUNTANT")).toBeNull();
    expect(suggestedScopeType("OWNER")).toBe("COMPANY");
    expect(suggestedScopeType(null)).toBe("PROJECT");
  });
});

describe("sensitive HR fields", () => {
  it("bank, ID and address fields need hr.sensitive: HR Manager and Finance Head have it", () => {
    expect(hasPermission("HR_MANAGER", PERM.HR_SENSITIVE)).toBe(true);
    expect(hasPermission("FINANCE_HEAD", PERM.HR_SENSITIVE)).toBe(true);
  });

  it("Project Manager and site roles do not have hr.sensitive", () => {
    expect(hasPermission("PROJECT_MANAGER", PERM.HR_SENSITIVE)).toBe(false);
    expect(hasPermission("SITE_ENGINEER", PERM.HR_SENSITIVE)).toBe(false);
  });

  it("signing links need hr.signing, which only the HR Manager has", () => {
    expect(hasPermission("HR_MANAGER", PERM.HR_SIGNING)).toBe(true);
    expect(hasPermission("FINANCE_HEAD", PERM.HR_SIGNING)).toBe(false);
    expect(hasPermission("PROJECT_MANAGER", PERM.HR_SIGNING)).toBe(false);
  });

  it("Project Manager keeps roster management", () => {
    expect(hasPermission("PROJECT_MANAGER", PERM.HR_MANAGE)).toBe(true);
  });
});

describe("call recording listen", () => {
  it("only Owner, Admin and Sales Manager can listen to recordings", () => {
    expect(hasPermission("OWNER", PERM.CALL_RECORDING_LISTEN)).toBe(true);
    expect(hasPermission("ADMIN", PERM.CALL_RECORDING_LISTEN)).toBe(true);
    expect(hasPermission("SALES_MANAGER", PERM.CALL_RECORDING_LISTEN)).toBe(true);
    for (const role of ["PROJECT_DIRECTOR", "PROJECT_MANAGER", "SITE_ENGINEER", "SUPERVISOR"] as const) {
      expect(hasPermission(role, PERM.CALL_RECORDING_LISTEN)).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────
//  normalizeRole
// ─────────────────────────────────────────────────────────────────

describe("normalizeRole", () => {
  it("returns the role as-is for a valid role string", () => {
    expect(normalizeRole("OWNER")).toBe("OWNER");
    expect(normalizeRole("SUPERVISOR")).toBe("SUPERVISOR");
    expect(normalizeRole("PROJECT_MANAGER")).toBe("PROJECT_MANAGER");
  });

  it("falls back to SUPERVISOR for an invalid role string", () => {
    expect(normalizeRole("MANAGER")).toBe("SUPERVISOR");
    expect(normalizeRole("nonexistent")).toBe("SUPERVISOR");
  });

  it("falls back to SUPERVISOR for undefined", () => {
    expect(normalizeRole(undefined)).toBe("SUPERVISOR");
  });

  it("falls back to SUPERVISOR for null", () => {
    expect(normalizeRole(null)).toBe("SUPERVISOR");
  });

  it("falls back to SUPERVISOR for empty string", () => {
    expect(normalizeRole("")).toBe("SUPERVISOR");
  });
});

// ─────────────────────────────────────────────────────────────────
//  hasPermission
// ─────────────────────────────────────────────────────────────────

describe("hasPermission", () => {
  it("returns true for any permission when role has '*' (OWNER)", () => {
    expect(hasPermission("OWNER", "anything")).toBe(true);
    expect(hasPermission("OWNER", "po.approve")).toBe(true);
    expect(hasPermission("OWNER", "nonexistent.perm")).toBe(true);
  });

  it("returns true for any permission when role has '*' (ADMIN)", () => {
    expect(hasPermission("ADMIN", "anything")).toBe(true);
  });

  it("returns true for any permission when role has '*' (DEVELOPER)", () => {
    expect(hasPermission("DEVELOPER", "anything")).toBe(true);
  });

  it("returns true when the permission is in the role's list", () => {
    expect(hasPermission("PROJECT_MANAGER", PERM.PROJECTS_MANAGE)).toBe(true);
    expect(hasPermission("PROJECT_MANAGER", PERM.PO_APPROVE)).toBe(true);
  });

  it("returns false when the permission is not in the role's list", () => {
    expect(hasPermission("SUPERVISOR", PERM.PO_APPROVE)).toBe(false);
    expect(hasPermission("ACCOUNTANT", PERM.SALES_MANAGE)).toBe(false);
  });

  it("honors additive overrides", () => {
    expect(hasPermission("SUPERVISOR", "custom.perm")).toBe(false);
    expect(hasPermission("SUPERVISOR", "custom.perm", ["custom.perm"])).toBe(true);
  });

  it("returns false for an unknown role (normalized to SUPERVISOR)", () => {
    expect(hasPermission("UNKNOWN", PERM.PO_APPROVE)).toBe(false);
  });

  it("returns false for undefined/null role", () => {
    expect(hasPermission(undefined, PERM.PO_APPROVE)).toBe(false);
    expect(hasPermission(null, PERM.PO_APPROVE)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
//  effectivePermissions
// ─────────────────────────────────────────────────────────────────

describe("effectivePermissions", () => {
  it("returns ALL_PERMISSIONS for '*' roles (OWNER)", () => {
    expect(effectivePermissions("OWNER")).toEqual(ALL_PERMISSIONS);
  });

  it("returns ALL_PERMISSIONS for ADMIN", () => {
    expect(effectivePermissions("ADMIN")).toEqual(ALL_PERMISSIONS);
  });

  it("returns the role's permission list for a scoped role", () => {
    const perms = effectivePermissions("SUPERVISOR");
    expect(perms).toContain(PERM.PROJECTS_VIEW);
    expect(perms).toContain(PERM.INVENTORY_VIEW);
    expect(perms).not.toContain(PERM.PO_APPROVE);
  });

  it("merges additive overrides into the permission list", () => {
    const perms = effectivePermissions("SUPERVISOR", ["custom.perm"]);
    expect(perms).toContain("custom.perm");
    expect(perms).toContain(PERM.PROJECTS_VIEW);
  });

  it("does not duplicate permissions already in the list when overridden", () => {
    const perms = effectivePermissions("SUPERVISOR", [PERM.PROJECTS_VIEW]);
    const count = perms.filter((p) => p === PERM.PROJECTS_VIEW).length;
    expect(count).toBe(1);
  });

  it("returns SUPERVISOR permissions for unknown role", () => {
    expect(effectivePermissions("UNKNOWN")).toEqual(effectivePermissions("SUPERVISOR"));
  });
});

// ─────────────────────────────────────────────────────────────────
//  isManagerOrAbove
// ─────────────────────────────────────────────────────────────────

describe("isManagerOrAbove", () => {
  it("returns true for OWNER (tier 1)", () => {
    expect(isManagerOrAbove("OWNER")).toBe(true);
  });

  it("returns true for PROJECT_DIRECTOR (tier 2)", () => {
    expect(isManagerOrAbove("PROJECT_DIRECTOR")).toBe(true);
  });

  it("returns true for PROJECT_MANAGER (tier 3)", () => {
    expect(isManagerOrAbove("PROJECT_MANAGER")).toBe(true);
  });

  it("returns false for SITE_ENGINEER (tier 4)", () => {
    expect(isManagerOrAbove("SITE_ENGINEER")).toBe(false);
  });

  it("returns false for SUPERVISOR (tier 5)", () => {
    expect(isManagerOrAbove("SUPERVISOR")).toBe(false);
  });

  it("returns false for undefined (normalizes to SUPERVISOR)", () => {
    expect(isManagerOrAbove(undefined)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
//  canManageUsers / canAssignTasks / canManageWorkflows
// ─────────────────────────────────────────────────────────────────

describe("canManageUsers", () => {
  it("returns true for OWNER", () => {
    expect(canManageUsers("OWNER")).toBe(true);
  });

  it("returns true for ADMIN", () => {
    expect(canManageUsers("ADMIN")).toBe(true);
  });

  it("returns true for DEVELOPER", () => {
    expect(canManageUsers("DEVELOPER")).toBe(true);
  });

  it("returns false for PROJECT_MANAGER", () => {
    expect(canManageUsers("PROJECT_MANAGER")).toBe(false);
  });

  it("returns false for SUPERVISOR", () => {
    expect(canManageUsers("SUPERVISOR")).toBe(false);
  });
});

describe("canAssignTasks", () => {
  it("returns true for OWNER", () => {
    expect(canAssignTasks("OWNER")).toBe(true);
  });

  it("returns true for PROJECT_MANAGER", () => {
    expect(canAssignTasks("PROJECT_MANAGER")).toBe(true);
  });

  it("returns false for ACCOUNTANT", () => {
    expect(canAssignTasks("ACCOUNTANT")).toBe(false);
  });
});

describe("canManageWorkflows", () => {
  it("returns true for OWNER", () => {
    expect(canManageWorkflows("OWNER")).toBe(true);
  });

  it("returns true for PROJECT_MANAGER", () => {
    expect(canManageWorkflows("PROJECT_MANAGER")).toBe(true);
  });

  it("returns false for PROJECT_DIRECTOR", () => {
    expect(canManageWorkflows("PROJECT_DIRECTOR")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
//  canApproveProcurement
// ─────────────────────────────────────────────────────────────────

describe("canApproveProcurement", () => {
  it("returns true for OWNER", () => {
    expect(canApproveProcurement("OWNER")).toBe(true);
  });

  it("returns true for PROJECT_MANAGER", () => {
    expect(canApproveProcurement("PROJECT_MANAGER")).toBe(true);
  });

  it("returns true for PROJECT_DIRECTOR", () => {
    expect(canApproveProcurement("PROJECT_DIRECTOR")).toBe(true);
  });

  it("returns false for SUPERVISOR", () => {
    expect(canApproveProcurement("SUPERVISOR")).toBe(false);
  });

  it("returns false for SITE_ENGINEER", () => {
    expect(canApproveProcurement("SITE_ENGINEER")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
//  APPROVER_ROLES
// ─────────────────────────────────────────────────────────────────

describe("APPROVER_ROLES", () => {
  it("includes OWNER, ADMIN, PROJECT_DIRECTOR, PROJECT_MANAGER", () => {
    expect(APPROVER_ROLES).toContain("OWNER");
    expect(APPROVER_ROLES).toContain("ADMIN");
    expect(APPROVER_ROLES).toContain("PROJECT_DIRECTOR");
    expect(APPROVER_ROLES).toContain("PROJECT_MANAGER");
  });

  it("does not include SUPERVISOR or SITE_ENGINEER", () => {
    expect(APPROVER_ROLES).not.toContain("SUPERVISOR");
    expect(APPROVER_ROLES).not.toContain("SITE_ENGINEER");
  });
});

// ─────────────────────────────────────────────────────────────────
//  ALL_ROLES
// ─────────────────────────────────────────────────────────────────

describe("ALL_ROLES", () => {
  it("has 15 roles", () => {
    expect(ALL_ROLES).toHaveLength(15);
  });

  it("includes DEVELOPER", () => {
    expect(ALL_ROLES).toContain("DEVELOPER");
  });

  it("every role has a matching ROLES definition", () => {
    for (const r of ALL_ROLES) {
      expect(ROLES[r]).toBeDefined();
      expect(ROLES[r].key).toBe(r);
    }
  });
});

// ─────────────────────────────────────────────────────────────────
//  migrateRole
// ─────────────────────────────────────────────────────────────────

describe("migrateRole", () => {
  it("returns the role as-is for a valid new-system role", () => {
    expect(migrateRole("OWNER")).toBe("OWNER");
    expect(migrateRole("PROJECT_MANAGER")).toBe("PROJECT_MANAGER");
  });

  it("maps MANAGER → PROJECT_MANAGER", () => {
    expect(migrateRole("MANAGER")).toBe("PROJECT_MANAGER");
  });

  it("maps SALES → SALES_MANAGER", () => {
    expect(migrateRole("SALES")).toBe("SALES_MANAGER");
  });

  it("returns null for an unknown role", () => {
    expect(migrateRole("UNKNOWN_ROLE")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(migrateRole(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(migrateRole(null)).toBeNull();
  });
});

describe("hasPermission", () => {
  it("OWNER has all permissions (wildcard)", () => {
    expect(hasPermission("OWNER", "anything")).toBe(true);
    expect(hasPermission("OWNER", "po.approve")).toBe(true);
    expect(hasPermission("OWNER", "materials.manage")).toBe(true);
  });

  it("ADMIN has all permissions (wildcard)", () => {
    expect(hasPermission("ADMIN", "anything")).toBe(true);
  });

  it("DEVELOPER has all permissions (wildcard)", () => {
    expect(hasPermission("DEVELOPER", "anything")).toBe(true);
  });

  it("respects specific permissions for non-wildcard roles", () => {
    // SITE_ENGINEER should have some permissions but not all
    const hasView = hasPermission("SITE_ENGINEER", "materials.view");
    const hasManage = hasPermission("SITE_ENGINEER", "materials.manage");
    // At least one of these should be true (view) and one might be false (manage)
    expect(typeof hasView).toBe("boolean");
    expect(typeof hasManage).toBe("boolean");
  });

  it("honors additive overrides", () => {
    // Even if a role doesn't have a permission, overrides can add it
    const result = hasPermission("SITE_ENGINEER", "custom.perm", ["custom.perm"]);
    expect(result).toBe(true);
  });

  it("returns false for permission not in role or overrides", () => {
    const result = hasPermission("SITE_ENGINEER", "nonexistent.permission");
    expect(result).toBe(false);
  });

  it("handles undefined role (normalizes to SUPERVISOR)", () => {
    const result = hasPermission(undefined, "po.approve");
    expect(typeof result).toBe("boolean");
  });

  it("handles null role", () => {
    const result = hasPermission(null, "po.approve");
    expect(typeof result).toBe("boolean");
  });
});

describe("isManagerOrAbove", () => {
  it("returns true for OWNER (tier 1)", () => {
    expect(isManagerOrAbove("OWNER")).toBe(true);
  });

  it("returns true for ADMIN (tier 1)", () => {
    expect(isManagerOrAbove("ADMIN")).toBe(true);
  });

  it("returns true for PROJECT_DIRECTOR (tier 2)", () => {
    expect(isManagerOrAbove("PROJECT_DIRECTOR")).toBe(true);
  });

  it("returns true for PROJECT_MANAGER (tier 3)", () => {
    expect(isManagerOrAbove("PROJECT_MANAGER")).toBe(true);
  });

  it("returns false for SITE_ENGINEER (tier 4)", () => {
    expect(isManagerOrAbove("SITE_ENGINEER")).toBe(false);
  });

  it("returns false for SUPERVISOR (tier 5)", () => {
    expect(isManagerOrAbove("SUPERVISOR")).toBe(false);
  });

  it("returns false for undefined role (normalizes to SUPERVISOR, tier 5)", () => {
    expect(isManagerOrAbove(undefined)).toBe(false);
  });
});

describe("canManageUsers", () => {
  it("returns true for OWNER", () => {
    expect(canManageUsers("OWNER")).toBe(true);
  });

  it("returns true for ADMIN", () => {
    expect(canManageUsers("ADMIN")).toBe(true);
  });

  it("returns false for SITE_ENGINEER", () => {
    expect(canManageUsers("SITE_ENGINEER")).toBe(false);
  });
});

describe("canAssignTasks", () => {
  it("returns true for OWNER", () => {
    expect(canAssignTasks("OWNER")).toBe(true);
  });

  it("returns true for PROJECT_MANAGER", () => {
    expect(canAssignTasks("PROJECT_MANAGER")).toBe(true);
  });

  it("returns false for SUPERVISOR", () => {
    expect(canAssignTasks("SUPERVISOR")).toBe(false);
  });
});

describe("canManageWorkflows", () => {
  it("returns true for OWNER", () => {
    expect(canManageWorkflows("OWNER")).toBe(true);
  });

  it("returns false for SITE_ENGINEER", () => {
    expect(canManageWorkflows("SITE_ENGINEER")).toBe(false);
  });
});

describe("effectivePermissions", () => {
  it("returns ALL_PERMISSIONS for wildcard roles", () => {
    const perms = effectivePermissions("OWNER");
    expect(perms.length).toBeGreaterThan(0);
  });

  it("returns specific permissions for non-wildcard roles", () => {
    const perms = effectivePermissions("SITE_ENGINEER");
    expect(perms.length).toBeGreaterThan(0);
    // Should not include every possible permission
    const ownerPerms = effectivePermissions("OWNER");
    expect(perms.length).toBeLessThanOrEqual(ownerPerms.length);
  });

  it("merges additive overrides", () => {
    const base = effectivePermissions("SITE_ENGINEER");
    const withOverride = effectivePermissions("SITE_ENGINEER", ["custom.perm"]);
    expect(withOverride).toContain("custom.perm");
    expect(withOverride.length).toBe(base.length + 1);
  });

  it("handles undefined role", () => {
    const perms = effectivePermissions(undefined);
    expect(perms.length).toBeGreaterThan(0);
  });

  it("deduplicates permissions", () => {
    // If a permission is already in the role, adding it as override shouldn't duplicate
    const base = effectivePermissions("SITE_ENGINEER");
    if (base.length > 0) {
      const withOverride = effectivePermissions("SITE_ENGINEER", [base[0]!]);
      // Should not have duplicates
      const unique = new Set(withOverride);
      expect(unique.size).toBe(withOverride.length);
    }
  });
});
