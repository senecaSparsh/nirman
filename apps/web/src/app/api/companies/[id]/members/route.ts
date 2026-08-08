import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";
import { normalizeRole, canAssignRole } from "@/lib/roles";

/**
 * GET /api/companies/[id]/members — list the users that are members of
 * a company, with their per-membership role.
 */
export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.COMPANY_MANAGE);
  const { id } = await ctx.params;

  const members = await prisma.userCompany.findMany({
    where: { companyId: id },
    orderBy: { user: { name: "asc" } },
    include: {
      user: { select: { id: true, name: true, email: true, active: true } },
      scopes: {
        include: {
          department: { select: { code: true, name: true } },
          project: { select: { name: true } },
        },
      },
    },
  });

  return json(
    members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      scopeType: m.scopeType,
      reportsToUserCompanyId: m.reportsToUserCompanyId,
      name: m.user.name,
      email: m.user.email,
      active: m.user.active,
      scopes: m.scopes.map((s) => ({
        scopeKind: s.scopeKind,
        departmentId: s.departmentId,
        projectId: s.projectId,
        departmentName: s.department?.name ?? null,
        departmentCode: s.department?.code ?? null,
        projectName: s.project?.name ?? null,
      })),
    })),
  );
});

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.string().optional(),
});

/**
 * POST /api/companies/[id]/members — add a user to a company by email.
 * If the user doesn't exist yet, they are created (invited) with the
 * given role as their default role. The membership role takes precedence
 * when operating within this company.
 *
 * Hierarchical RBAC: the actor can only assign roles STRICTLY below their
 * own tier. OWNER/ADMIN (tier 1) can assign any role. MANAGER (tier 2,
 * Sub-Admin) can only assign SUPERVISOR/SALES/ACCOUNTANT (tier 3). Tier 3
 * roles cannot create accounts at all (blocked by the permission check +
 * the hierarchy check).
 */
export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requirePermission(PERM.COMPANY_MANAGE);
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const role = normalizeRole(parsed.data.role);

  // Hierarchy: actor must be able to assign the target role.
  if (!canAssignRole(actor.role, role)) {
    return json(
      { error: `Your role (${actor.role}) cannot assign the ${role} role. You can only assign roles below your tier.` },
      { status: 403 },
    );
  }

  const company = await prisma.company.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!company) return json({ error: "Company not found" }, { status: 404 });

  // Find or create the user by email.
  let user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.email.split("@")[0] ?? parsed.data.email,
        role,
        emailVerified: false,
      },
    });
  } else {
    // Existing user: if they already have a membership with a role at or
    // above the actor's tier, the actor cannot re-assign them (can't demote
    // a peer or superior).
    const existingMembership = await prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: user.id, companyId: id } },
      select: { role: true },
    });
    if (existingMembership && !canAssignRole(actor.role, existingMembership.role)) {
      return json(
        { error: `This user is already a ${existingMembership.role} — you cannot reassign a role at or above your tier.` },
        { status: 403 },
      );
    }
  }

  // Idempotent membership upsert.
  const membership = await prisma.userCompany.upsert({
    where: { userId_companyId: { userId: user.id, companyId: id } },
    update: { role },
    create: { userId: user.id, companyId: id, role },
    select: { id: true, userId: true, role: true },
  });

  return json({ ok: true, membership }, { status: 201 });
});
