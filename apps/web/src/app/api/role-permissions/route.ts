import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM, ALL_PERMISSIONS, normalizeRole } from "@/lib/roles";

/**
 * GET /api/role-permissions?role=XXX — list additive permission overrides
 * for a role. Returns { permissions: RolePermRow[] }.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.USERS_VIEW);
  const role = req.nextUrl.searchParams.get("role");
  if (!role) return json({ error: "role query param is required" }, { status: 400 });

  const permissions = await prisma.rolePermission.findMany({
    where: { role },
    orderBy: { permission: "asc" },
  });
  return json({ permissions });
});

/**
 * PUT /api/role-permissions — replace all additive permission overrides
 * for a role. Body: { role: string, permissions: string[] }.
 *
 * Only permissions in ALL_PERMISSIONS are accepted. The actor must have
 * USERS_MANAGE permission. An audit log entry is written.
 */
export const PUT = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission(PERM.USERS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const { role, permissions } = body as { role?: string; permissions?: string[] };

  if (!role) return json({ error: "role is required" }, { status: 400 });
  const normalizedRole = normalizeRole(role);
  if (!Array.isArray(permissions)) return json({ error: "permissions must be an array" }, { status: 400 });

  const validSet = new Set(ALL_PERMISSIONS);
  const invalid = permissions.filter((p) => !validSet.has(p));
  if (invalid.length > 0) return json({ error: `Unknown permissions: ${invalid.join(", ")}` }, { status: 400 });

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.rolePermission.findMany({
      where: { role: normalizedRole },
      select: { permission: true },
    });
    const existingPerms = existing.map((p) => p.permission);
    const newSet = new Set(permissions);

    const toDelete = existingPerms.filter((p) => !newSet.has(p));
    if (toDelete.length > 0) {
      await tx.rolePermission.deleteMany({
        where: { role: normalizedRole, permission: { in: toDelete } },
      });
    }

    const toAdd = permissions.filter((p) => !existingPerms.includes(p));
    if (toAdd.length > 0) {
      await tx.rolePermission.createMany({
        data: toAdd.map((p) => ({ role: normalizedRole, permission: p })),
        skipDuplicates: true,
      });
    }

    await logAction(tx, {
      userId: session.id,
      companyId: company.id,
      action: "ROLE_PERMISSIONS_UPDATE",
      entityType: "RolePermission",
      entityId: normalizedRole,
      before: { permissions: existingPerms },
      after: { permissions },
    });

    return { added: toAdd.length, removed: toDelete.length };
  });

  return json({ ok: true, ...result });
});
