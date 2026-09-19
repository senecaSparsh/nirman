import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, getActingRole, getCompany, getUserPermissions, json, requirePermission } from "@/lib/server";
import { PERM, ALL_ROLES, ROLES, roleTier, ALL_PERMISSIONS, normalizeRole, canAssignRole } from "@/lib/roles";
import { z } from "zod";

/**
 * GET /api/custom-roles — list all custom roles for the current company.
 * Requires USERS_VIEW.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.USERS_VIEW);
  const company = await getCompany();

  const roles = await prisma.customRole.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return json({ roles });
});

/**
 * POST /api/custom-roles — create a new custom role.
 * Requires USERS_MANAGE (OWNER, ADMIN, HR_MANAGER).
 *
 * Body: { key, label, description?, baseRole?, tier?, permissions? }
 * - key: unique role key, auto-prefixed with "CUSTOM_" if not already
 * - label: display label
 * - baseRole: optional. Set → inherit that built-in's tier + permissions
 *   (permissions are additive extras). Omitted → "scratch" mode:
 *   permissions IS the complete set and tier is required.
 * - tier: explicit access level (required in scratch mode)
 * - permissions: additive extras (inherit mode) or the full set (scratch)
 */
const createSchema = z.object({
  key: z.string().min(2).max(50).regex(/^[A-Z_][A-Z0-9_]*$/, "Key must be UPPER_SNAKE_CASE"),
  label: z.string().min(2).max(60),
  description: z.string().max(200).optional().default(""),
  baseRole: z.enum(ALL_ROLES as [string, ...string[]]).nullable().optional(),
  tier: z.number().int().min(1).max(5).optional(),
  hierarchyLevel: z.number().int().min(1).max(6).optional(),
  permissions: z.array(z.string()).optional().default([]),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission(PERM.USERS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { key, label, description, baseRole, tier, hierarchyLevel, permissions } = parsed.data;

  // ── Scratch mode (no baseRole): the permissions list IS the complete ──
  // set and tier is required — there's no base to derive either from.
  const normalizedBase = baseRole ? normalizeRole(baseRole) : null;
  if (baseRole && !ALL_ROLES.includes(normalizedBase as never)) {
    return json({ error: "Invalid base role" }, { status: 400 });
  }
  if (!normalizedBase) {
    if (tier === undefined) {
      return json({ error: "Access level (tier) is required when no base role is set." }, { status: 400 });
    }
    if (permissions.length === 0) {
      return json({ error: "Pick at least one permission — a scratch role with none would sign in to an empty app." }, { status: 400 });
    }
  }

  // ── Tier guard: the actor must be able to assign the base role's tier. ──
  // Without this, an HR_MANAGER (tier 3) could create a custom role based on
  // PROJECT_DIRECTOR (tier 2), inheriting all of PROJECT_DIRECTOR's
  // permissions — which exceed the actor's own authority. Even though the
  // actor can't assign the role themselves, they shouldn't be able to
  // define a role template with permissions beyond their tier.
  if (normalizedBase && !canAssignRole(await getActingRole(), normalizedBase)) {
    return json(
      { error: `You don't have authority to create a role based on ${ROLES[normalizedBase as keyof typeof ROLES]?.label ?? normalizedBase}.` },
      { status: 403 },
    );
  }

  // If a tier override is provided (or required, in scratch mode), it must
  // be strictly below the actor's tier — a custom role can never reach the
  // actor's own level, let alone above it.
  // Scratch mode guarantees tier is set (checked above), so the
  // "SUPERVISOR" fallback never fires — it's just the fail-closed default.
  const resolvedTier = tier ?? roleTier(normalizedBase ?? "SUPERVISOR");
  if (resolvedTier <= roleTier(await getActingRole())) {
    return json(
      { error: `You can't set the access level for this role higher than your own.` },
      { status: 403 },
    );
  }

  // Validate permissions
  const validSet = new Set(ALL_PERMISSIONS);
  const invalid = permissions.filter((p) => !validSet.has(p));
  if (invalid.length > 0) {
    return json({ error: `Unknown permissions: ${invalid.join(", ")}` }, { status: 400 });
  }

  // ── Permission scope guard: the actor can only add permissions they ──
  // themselves have. Without this, an HR_MANAGER could add `finance.manage`
  // or `company.manage` to a custom role — permissions they don't possess.
  // OWNER/ADMIN (permissions = "*") bypass this check.
  const actorPerms = await getUserPermissions();
  if (actorPerms !== ALL_PERMISSIONS) {
    const actorPermSet = new Set(actorPerms);
    const outOfScope = permissions.filter((p) => !actorPermSet.has(p));
    if (outOfScope.length > 0) {
      // Humanize permission keys: "company.manage" → "Company"
      const humanize = (p: string) => (p.split(".")[0] ?? p).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return json(
        { error: `You can't grant permissions you don't have: ${outOfScope.map(humanize).join(", ")}` },
        { status: 403 },
      );
    }
  }

  // Auto-prefix with CUSTOM_ if not already
  const fullKey = key.startsWith("CUSTOM_") ? key : `CUSTOM_${key}`;

  // Check for duplicate key
  const existing = await prisma.customRole.findUnique({
    where: { companyId_key: { companyId: company.id, key: fullKey } },
  }).catch(() => null);
  if (existing) {
    return json({ error: "A role with this key already exists" }, { status: 409 });
  }

  const role = await prisma.customRole.create({
    data: {
      companyId: company.id,
      key: fullKey,
      label,
      description,
      baseRole: normalizedBase,
      tier: resolvedTier,
      hierarchyLevel: hierarchyLevel ?? resolvedTier,
      permissions,
    },
  });

  await logAction(prisma, {
    userId: session.id,
    companyId: company.id,
    action: "CUSTOM_ROLE_CREATED",
    entityType: "CustomRole",
    entityId: role.id,
    after: { key: fullKey, label, baseRole: normalizedBase, tier: resolvedTier, hierarchyLevel: hierarchyLevel ?? resolvedTier, permissions },
  });

  revalidatePath("/hr/employees");
  revalidatePath("/m/hr/employees");
  revalidatePath("/hr");
  revalidatePath("/m/hr");

  return json({ ok: true, role, message: `Custom role "${label}" created` });
});
