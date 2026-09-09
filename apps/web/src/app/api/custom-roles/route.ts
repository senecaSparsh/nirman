import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM, ALL_ROLES, roleTier, ALL_PERMISSIONS, normalizeRole } from "@/lib/roles";
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
  });

  return json({ roles });
});

/**
 * POST /api/custom-roles — create a new custom role.
 * Requires USERS_MANAGE (OWNER, ADMIN, HR_MANAGER).
 *
 * Body: { key, label, description?, baseRole, tier?, permissions? }
 * - key: unique role key, auto-prefixed with "CUSTOM_" if not already
 * - label: display label
 * - baseRole: a built-in role to inherit tier + base permissions from
 * - tier: optional override (defaults to baseRole's tier)
 * - permissions: additive permissions on top of baseRole
 */
const createSchema = z.object({
  key: z.string().min(2).max(50).regex(/^[A-Z_][A-Z0-9_]*$/, "Key must be UPPER_SNAKE_CASE"),
  label: z.string().min(2).max(60),
  description: z.string().max(200).optional().default(""),
  baseRole: z.enum(ALL_ROLES as [string, ...string[]]),
  tier: z.number().int().min(1).max(5).optional(),
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

  const { key, label, description, baseRole, tier, permissions } = parsed.data;

  // Validate baseRole is a known built-in role
  const normalizedBase = normalizeRole(baseRole);
  if (!ALL_ROLES.includes(normalizedBase as never)) {
    return json({ error: "Invalid base role" }, { status: 400 });
  }

  // Validate permissions
  const validSet = new Set(ALL_PERMISSIONS);
  const invalid = permissions.filter((p) => !validSet.has(p));
  if (invalid.length > 0) {
    return json({ error: `Unknown permissions: ${invalid.join(", ")}` }, { status: 400 });
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

  const resolvedTier = tier ?? roleTier(normalizedBase);

  const role = await prisma.customRole.create({
    data: {
      companyId: company.id,
      key: fullKey,
      label,
      description,
      baseRole: normalizedBase,
      tier: resolvedTier,
      permissions,
    },
  });

  await logAction(prisma, {
    userId: session.id,
    companyId: company.id,
    action: "CUSTOM_ROLE_CREATED",
    entityType: "CustomRole",
    entityId: role.id,
    after: { key: fullKey, label, baseRole: normalizedBase, tier: resolvedTier, permissions },
  });

  revalidatePath("/hr/employees");
  revalidatePath("/m/hr/employees");

  return json({ ok: true, role, message: `Custom role "${label}" created` });
});
