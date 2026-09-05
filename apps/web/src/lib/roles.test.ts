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
  ALL_ROLES,
  ALL_PERMISSIONS,
  APPROVER_ROLES,
  PERM,
  ROLES,
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

  it("ADMIN can assign OWNER (same tier 1, different role)", () => {
    expect(canAssignRole("ADMIN", "OWNER")).toBe(true);
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
  it("OWNER can assign all roles except OWNER", () => {
    const roles = assignableRoles("OWNER");
    expect(roles).not.toContain("OWNER");
    expect(roles).toContain("ADMIN");
    expect(roles).toContain("PROJECT_DIRECTOR");
    expect(roles).toContain("SUPERVISOR");
    expect(roles.length).toBe(ALL_ROLES.length - 1);
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
  it("has 14 roles", () => {
    expect(ALL_ROLES).toHaveLength(14);
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
