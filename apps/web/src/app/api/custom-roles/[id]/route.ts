import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, getActingRole, getCompany, getUserPermissions, json, requirePermission } from "@/lib/server";
import { PERM, ALL_PERMISSIONS, ALL_ROLES, ROLES, roleTier, canAssignRole } from "@/lib/roles";
import { z } from "zod";

/**
 * DELETE /api/custom-roles/[id] — delete a custom role.
 * Requires USERS_MANAGE. Fails if any users are still assigned to it.
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.USERS_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const role = await prisma.customRole.findFirst({
    where: { id, companyId: company.id },
  });
  if (!role) {
    return json({ error: "Custom role not found" }, { status: 404 });
  }

  // ── Tier gate: only actors strictly above the role's tier can delete ──
  // it — same rule as managing a member. Without this an HR_MANAGER (t3)
  // could delete a tier-2 role.
  if (role.tier <= roleTier(await getActingRole())) {
    return json({ error: "You don't have authority to delete a role at or above your own level." }, { status: 403 });
  }

  // Check if any users are assigned to this role (primary or secondary hat)
  const usersWithRole = await prisma.userCompany.count({
    where: {
      companyId: company.id,
      OR: [{ role: role.key }, { secondaryRoles: { has: role.key } }],
    },
  });
  if (usersWithRole > 0) {
    return json({ error: `Cannot delete: ${usersWithRole} user(s) are still assigned to this role. Reassign them first.` }, { status: 409 });
  }

  // RolePermission is a global table (no companyId) — deleting by role key
  // would wipe overrides for every company that shares the same custom role
  // key (the unique constraint is (companyId, key), so keys can collide
  // across companies). Since we've verified no users are assigned to this
  // role, the RolePermission rows are inert orphans — no user will ever
  // resolve them. Leaving them is safe; deleting them is not.
  await prisma.customRole.delete({ where: { id } });

  await logAction(prisma, {
    userId: session.id,
    companyId: company.id,
    action: "CUSTOM_ROLE_DELETED",
    entityType: "CustomRole",
    entityId: id,
    before: { key: role.key, label: role.label },
  });

  revalidatePath("/hr/employees");
  revalidatePath("/m/hr/employees");

  return json({ ok: true, message: `Custom role "${role.label}" deleted` });
});

/**
 * PUT /api/custom-roles/[id] — update a custom role.
 * Requires USERS_MANAGE.
 */
const updateSchema = z.object({
  label: z.string().min(2).max(60).optional(),
  description: z.string().max(200).optional(),
  baseRole: z.enum(ALL_ROLES as [string, ...string[]]).nullable().optional(),
  tier: z.number().int().min(1).max(5).optional(),
  permissions: z.array(z.string()).optional(),
});

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.USERS_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const role = await prisma.customRole.findFirst({
    where: { id, companyId: company.id },
  });
  if (!role) {
    return json({ error: "Custom role not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) updates.label = parsed.data.label;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.tier !== undefined) updates.tier = parsed.data.tier;
  if (parsed.data.permissions !== undefined) {
    const validSet = new Set(ALL_PERMISSIONS);
    const invalid = parsed.data.permissions.filter((p) => !validSet.has(p));
    if (invalid.length > 0) {
      return json({ error: `Unknown permissions: ${invalid.join(", ")}` }, { status: 400 });
    }
    updates.permissions = parsed.data.permissions;
  }

  // ── Tier guard: if tier is being changed, the new tier must be below ──
  // the actor's own tier. Prevents escalating a role to a higher tier.
  const actingTier = roleTier(await getActingRole());
  if (parsed.data.tier !== undefined) {
    if (parsed.data.tier <= actingTier) {
      return json(
        { error: `You can't set the access level for this role higher than your own.` },
        { status: 403 },
      );
    }
  }

  // ── Edit gate: the role's own tier must be below the actor's — same ──
  // rule as managing a member. Applies to both inherit and scratch roles;
  // without it a mid-tier editor could rewrite a senior role's permissions.
  if (role.tier <= actingTier) {
    return json({ error: "You don't have authority to modify a role at or above your own level." }, { status: 403 });
  }

  // ── Mode switch: baseRole null → scratch (permissions = complete set), ──
  // a built-in → inherit (permissions = additive extras). The new base must
  // be assignable by the actor.
  if (parsed.data.baseRole !== undefined) {
    if (parsed.data.baseRole !== null && !canAssignRole(await getActingRole(), parsed.data.baseRole)) {
      return json(
        { error: `You don't have authority to base a role on ${ROLES[parsed.data.baseRole as keyof typeof ROLES]?.label ?? parsed.data.baseRole}.` },
        { status: 403 },
      );
    }
    updates.baseRole = parsed.data.baseRole;
  }

  // ── Base role guard (inherit mode): the actor must be able to assign ──
  // the role's base. Scratch roles (baseRole null) are covered by the tier
  // gate above — they have no base to inherit authority from.
  const effectiveBase = parsed.data.baseRole !== undefined ? parsed.data.baseRole : role.baseRole;
  if (effectiveBase && !canAssignRole(await getActingRole(), effectiveBase)) {
    return json(
      { error: `You don't have authority to modify a role based on ${ROLES[effectiveBase as keyof typeof ROLES]?.label ?? effectiveBase}.` },
      { status: 403 },
    );
  }

  // ── Permission scope guard: the actor can only grant permissions they ──
  // themselves have. OWNER/ADMIN (permissions = "*") bypass this check.
  if (parsed.data.permissions !== undefined) {
    const actorPerms = await getUserPermissions();
    if (actorPerms !== ALL_PERMISSIONS) {
      const actorPermSet = new Set(actorPerms);
      const outOfScope = parsed.data.permissions.filter((p) => !actorPermSet.has(p));
      if (outOfScope.length > 0) {
        const humanize = (p: string) => (p.split(".")[0] ?? p).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        return json(
          { error: `You can't grant permissions you don't have: ${outOfScope.map(humanize).join(", ")}` },
          { status: 403 },
        );
      }
    }
  }

  const updated = await prisma.customRole.update({
    where: { id },
    data: updates,
  });

  await logAction(prisma, {
    userId: session.id,
    companyId: company.id,
    action: "CUSTOM_ROLE_UPDATED",
    entityType: "CustomRole",
    entityId: id,
    before: { label: role.label, tier: role.tier, permissions: role.permissions },
    after: updates,
  });

  revalidatePath("/hr/employees");
  revalidatePath("/m/hr/employees");

  return json({ ok: true, role: updated, message: `Custom role updated` });
});
