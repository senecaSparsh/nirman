import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM, ALL_PERMISSIONS } from "@/lib/roles";

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

  // Role-level overrides
  const roleOverrides = await prisma.rolePermission.findMany({
    where: { role: membership.role },
    select: { permission: true },
  });

  const userOverrides = membership.userPermissions.map((p) => p.permission);
  const roleOverridePerms = roleOverrides.map((r) => r.permission);

  // Compute the role's base permissions (without overrides)
  // We import effectivePermissions dynamically to avoid circular deps
  const { effectivePermissions } = await import("@/lib/roles");
  const effective = effectivePermissions(membership.role, [...roleOverridePerms, ...userOverrides]);

  // Base role permissions (without any overrides) — for UI display
  const { ROLES, normalizeRole } = await import("@/lib/roles");
  const roleDef = ROLES[normalizeRole(membership.role)];
  const baseRolePerms = roleDef.permissions === "*" ? ALL_PERMISSIONS : roleDef.permissions;

  return json({
    membershipId: membership.id,
    role: membership.role,
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
