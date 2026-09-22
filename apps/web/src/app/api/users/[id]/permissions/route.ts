import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, canManageRoleSet, getActingRole, getCompany, getUserPermissions, json, requirePermission, resolveRolePermissions } from "@/lib/server";
import { PERM, ALL_PERMISSIONS, isCustomRole } from "@/lib/roles";

/**
 * GET /api/users/[id]/permissions — fetch the user's effective permissions
 * for the active company. Returns:
 *   - rolePermissions: permissions from the role matrix (computed)
 *   - userOverrides: per-user additive overrides from UserPermission table
 *   - effective: the merged set used for authorization
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.USERS_VIEW);
  const company = await getCompany();
  const { id: userId } = await params;

  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId: company.id } },
    include: { userPermissions: { select: { id: true, permission: true } } },
  });

  if (!membership) {
    return json({ error: "User is not a member of this company" }, { status: 404 });
  }

  // Multi-role: the console shows what the member can do NOW — resolve
  // against the worn hat (activeRole), validated against the held set so
  // a stale hat falls back to the primary role.
  const heldRoles = [membership.role, ...(membership.secondaryRoles ?? [])];
  const wornRole =
    membership.activeRole && heldRoles.includes(membership.activeRole)
      ? membership.activeRole
      : membership.role;

  // Role-level overrides
  const roleOverrides = await prisma.rolePermission.findMany({
    where: { role: wornRole },
    select: { permission: true },
  });

  const userOverrides = membership.userPermissions.map((p) => p.permission);
  const roleOverridePerms = roleOverrides.map((r) => r.permission);

  // Effective set — resolveRolePermissions handles custom roles
  // (CUSTOM_* → baseRole matrix + the role's own permissions).
  const effective = await resolveRolePermissions(wornRole, company.id, [...roleOverridePerms, ...userOverrides]);

  // Base role permissions (without any overrides) — for UI display.
  // For custom roles this is the baseRole's matrix + the role's own list.
  const { ROLES, normalizeRole } = await import("@/lib/roles");
  let displayRole = normalizeRole(wornRole);
  let customPerms: string[] = [];
  let customLabel: string | null = null;
  // Scratch-mode roles (baseRole null) have no base matrix — the role's own
  // permissions ARE the complete set; don't imply a SUPERVISOR floor.
  let scratchMode = false;
  if (isCustomRole(wornRole)) {
    const customRole = await prisma.customRole
      .findFirst({ where: { companyId: company.id, key: wornRole }, select: { baseRole: true, permissions: true, label: true } })
      .catch(() => null);
    if (customRole) {
      scratchMode = !customRole.baseRole;
      displayRole = normalizeRole(customRole.baseRole);
      customPerms = customRole.permissions;
      customLabel = customRole.label;
    }
  }
  const roleDef = ROLES[displayRole];
  const baseRolePerms = scratchMode
    ? [...new Set(customPerms)]
    : roleDef.permissions === "*" ? ALL_PERMISSIONS : [...new Set([...roleDef.permissions, ...customPerms])];

  return json({
    membershipId: membership.id,
    role: membership.role,
    // Multi-role: the worn hat this "effective" view was computed under,
    // plus the full held set for the editor's context.
    activeRole: wornRole,
    secondaryRoles: membership.secondaryRoles,
    roleLabel: customLabel ?? roleDef.label,
    baseRolePermissions: baseRolePerms,
    roleOverrides: roleOverridePerms,
    userOverrides,
    userOverrideRows: membership.userPermissions,
    effective,
  });
});

/**
 * PATCH /api/users/[id]/permissions — set the per-user permission overrides.
 * Body: { permissions: string[] } — the full set of per-user additive
 * permissions. Replaces all existing UserPermission rows for this membership.
 *
 * Only permissions that exist in ALL_PERMISSIONS are accepted. Duplicate
 * permissions already granted by the role matrix are still stored (harmless
 * — they're additive). The actor must have USERS_MANAGE permission.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.USERS_MANAGE);
  const company = await getCompany();
  const { id: userId } = await params;

  const body = await req.json();
  const { permissions } = body as { permissions?: string[] };

  if (!Array.isArray(permissions)) {
    return json({ error: "permissions must be an array of strings" }, { status: 400 });
  }

  // Validate all permissions exist
  const validSet = new Set(ALL_PERMISSIONS);
  const invalid = permissions.filter((p) => !validSet.has(p));
  if (invalid.length > 0) {
    return json({ error: `Unknown permissions: ${invalid.join(", ")}` }, { status: 400 });
  }

  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId: company.id } },
  });
  if (!membership) {
    return json({ error: "User is not a member of this company" }, { status: 404 });
  }

  // Same guards as the role-change route: no self-override (a user with
  // users.manage could otherwise grant themselves any permission), and the
  // actor must sit above the target's role tier — custom roles resolve
  // through their DB tier via canManageRole.
  if (userId === session.id) {
    return json({ error: "You cannot change your own permissions" }, { status: 400 });
  }
  const actorRole = await getActingRole();
  // The actor must sit above EVERY hat the target holds — a dormant senior
  // hat still protects the target from a junior manager adding overrides.
  if (!(await canManageRoleSet(actorRole, [membership.role, ...(membership.secondaryRoles ?? [])], company.id))) {
    return json(
      { error: "You don't have authority to manage this user's permissions." },
      { status: 403 },
    );
  }

  // ── Grant-scope guard: the actor can only grant permissions they ──
  // themselves hold. Without this, an HR_MANAGER could mint an account
  // stronger than themselves (e.g. finance.manage on a junior). OWNER/ADMIN
  // bypass — their set is ALL_PERMISSIONS. Same rule as custom-role create.
  const actorPerms = await getUserPermissions();
  if (actorPerms !== ALL_PERMISSIONS) {
    const actorPermSet = new Set(actorPerms);
    const outOfScope = permissions.filter((p) => !actorPermSet.has(p));
    if (outOfScope.length > 0) {
      const humanize = (p: string) => (p.split(".")[0] ?? p).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return json(
        { error: `You can't grant permissions you don't have: ${outOfScope.map(humanize).join(", ")}` },
        { status: 403 },
      );
    }
  }

  // Replace all user permission rows atomically
  const result = await prisma.$transaction(async (tx) => {
    // Fetch existing for audit diff
    const existing = await tx.userPermission.findMany({
      where: { userCompanyId: membership.id },
      select: { permission: true },
    });
    const existingPerms = existing.map((p) => p.permission);
    const newSet = new Set(permissions);

    // Delete removed permissions
    const toDelete = existingPerms.filter((p) => !newSet.has(p));
    if (toDelete.length > 0) {
      await tx.userPermission.deleteMany({
        where: { userCompanyId: membership.id, permission: { in: toDelete } },
      });
    }

    // Add new permissions (skip existing)
    const toAdd = permissions.filter((p) => !existingPerms.includes(p));
    if (toAdd.length > 0) {
      await tx.userPermission.createMany({
        data: toAdd.map((p) => ({ userCompanyId: membership.id, permission: p })),
        skipDuplicates: true,
      });
    }

    // Audit log
    await logAction(tx, {
      userId: session.id,
      companyId: company.id,
      action: "USER_PERMISSIONS_UPDATE",
      entityType: "UserCompany",
      entityId: membership.id,
      before: { permissions: existingPerms },
      after: { permissions },
    });

    return { added: toAdd.length, removed: toDelete.length };
  });

  return json({ ok: true, ...result });
});
