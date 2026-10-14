import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { assertMemberScopeGrant, logAction, resolveScopeType, withSerializableTransaction } from "@nirman/services";
import { apiHandler, assertCompanyAccess, canManageRole, canManageRoleSet, getActingRole, json, requirePermission, userRoleSchema } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";
import { isCustomRole } from "@/lib/roles";

/**
 * GET /api/companies/[id]/members — list the users that are members of
 * a company, with their per-membership role.
 */
export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.COMPANY_MANAGE);
  const { id } = await ctx.params;
  const denied = await assertCompanyAccess(user, id);
  if (denied) return denied;

  const members = await prisma.userCompany.findMany({
    where: { companyId: id, user: { isHidden: { not: true } } },
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
      // Multi-role: the member's held set + the hat currently worn.
      secondaryRoles: m.secondaryRoles,
      activeRole:
        m.activeRole && [m.role, ...m.secondaryRoles].includes(m.activeRole)
          ? m.activeRole
          : m.role,
      // Resolved (not raw) scopeType — a SITE_ENGINEER with scopeType NULL is
      // still PROJECT-scoped via role default; showing "Company-wide" here
      // would mislead admins verifying who can see what.
      scopeType: resolveScopeType(m),
      reportsToUserCompanyId: m.reportsToUserCompanyId,
      name: m.user.name,
      email: m.user.email,
      // "Can this member act here" — both the account AND this company's
      // membership must be live; a terminated member whose account stays
      // active in another company must not list as active here.
      active: m.user.active && m.active,
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
  // Multi-role: additional hats the member can switch into.
  secondaryRoles: z.array(z.string()).max(8).optional(),
  // Required when the person is new to this company. Existing members keep their scope.
  scopeType: z.enum(["COMPANY", "DEPARTMENT", "PROJECT"]).optional(),
  scopeEntries: z.array(z.object({ projectId: z.string().min(1).optional(), departmentId: z.string().min(1).optional() })).max(100).optional(),
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
  const actorUser = await requirePermission(PERM.COMPANY_MANAGE);
  const { id } = await ctx.params;
  const denied = await assertCompanyAccess(actorUser, id);
  if (denied) return denied;
  const body = await req.json();
  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Role must be a built-in key or a CUSTOM_* key — normalizeRole() would
  // otherwise store garbage/custom strings as SUPERVISOR silently.
  const roleCheck = userRoleSchema.shape.role.safeParse(parsed.data.role ?? "SUPERVISOR");
  if (!roleCheck.success) {
    return json({ error: "Role must be a built-in role or a CUSTOM_* role key" }, { status: 400 });
  }
  const role = roleCheck.data!;
  // Multi-role: dedupe against the primary and validate each key.
  const secondaryRoles = [...new Set(parsed.data.secondaryRoles ?? [])].filter((r) => r !== role);
  // DEVELOPER is an internal/system role — it's the builder's own hat, not
  // a membership anyone can grant. Hidden from pickers and rejected here so
  // a crafted request can't mint it either.
  if ([role, ...secondaryRoles].includes("DEVELOPER")) {
    return json({ error: "The Developer role is reserved and cannot be assigned." }, { status: 400 });
  }
  for (const sr of secondaryRoles) {
    if (!userRoleSchema.shape.role.safeParse(sr).success) {
      return json({ error: "Secondary roles must be built-in or CUSTOM_* role keys" }, { status: 400 });
    }
  }

  const company = await prisma.company.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!company) return json({ error: "Company not found" }, { status: 404 });

  // Every CUSTOM_* key must resolve to a real role in this company.
  for (const r of [role, ...secondaryRoles]) {
    if (isCustomRole(r)) {
      const cr = await prisma.customRole.findFirst({
        where: { companyId: id, key: r },
        select: { id: true },
      });
      if (!cr) return json({ error: `Custom role ${r} not found` }, { status: 400 });
    }
  }

  // Hierarchy: actor must be able to assign EVERY role in the held set —
  // canManageRole resolves custom-role tiers from the DB (canAssignRole
  // can't see them). Actor authority is the hat currently worn.
  const actorRole = await getActingRole();
  for (const r of [role, ...secondaryRoles]) {
    if (!(await canManageRole(actorRole, r, id))) {
      return json(
        { error: `Your role (${actorRole}) cannot assign the ${r} role. You can only assign roles below your tier.` },
        { status: 403 },
      );
    }
  }

  // Find or create the user by email. A person new to this company must be
  // given an access scope; a member already here keeps theirs.
  let user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const existingMembership = user
    ? await prisma.userCompany.findUnique({
        where: { userId_companyId: { userId: user.id, companyId: id } },
        select: { id: true, role: true, secondaryRoles: true, active: true },
      })
    : null;
  // A terminated member's row is dormant, not resurrectable by a role upsert —
  // updating it silently would report ok while the member stays deactivated.
  // Reactivation goes through the restore flow, which audits the rehire.
  if (existingMembership?.active === false) {
    return json(
      { error: "This membership is deactivated — restore the member through the employee flow instead of re-adding them." },
      { status: 409 },
    );
  }
  // An existing member: the actor must be above EVERY hat they hold — a dormant
  // senior hat still protects them from a peer/superior reassignment.
  if (existingMembership && !(await canManageRoleSet(actorRole, [existingMembership.role, ...existingMembership.secondaryRoles], id))) {
    return json(
      { error: `This user is already a ${existingMembership.role} — you cannot reassign a role at or above your tier.` },
      { status: 403 },
    );
  }
  let scope: Awaited<ReturnType<typeof assertMemberScopeGrant>> = [];
  if (!existingMembership) {
    if (!parsed.data.scopeType) {
      return json({ error: "Choose an access scope for this member — the whole company, projects or departments." }, { status: 400 });
    }
    try {
      scope = await assertMemberScopeGrant({
        actorUserId: actorUser.id,
        companyId: id,
        role,
        secondaryRoles,
        scopeType: parsed.data.scopeType,
        entries: parsed.data.scopeEntries ?? [],
      });
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : "Invalid access scope" }, { status: (err as { status?: number }).status ?? 400 });
    }
  }
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.email.split("@")[0] ?? parsed.data.email,
        role,
        emailVerified: false,
      },
    });
  }

  // Idempotent membership upsert. A stale worn hat (not in the new held
  // set) resets to the primary role on next resolution — and is cleared
  // here so reads stay consistent. The User.role mirror follows the
  // membership's primary role — list views and the held-set union read it.
  // `existingMembership` distinguishes "added" from "role silently overwritten" —
  // the UI should say which happened, since an Add verb mutating an existing
  // member's role is otherwise invisible to the actor. The access scope is
  // written once, when the person joins; a re-add only moves the role.
  const newHeldSet = new Set([role, ...secondaryRoles]);
  const membership = await withSerializableTransaction(async (tx) => {
    const saved = await tx.userCompany.upsert({
      where: { userId_companyId: { userId: user.id, companyId: id } },
      update: { role, secondaryRoles },
      create: { userId: user.id, companyId: id, role, secondaryRoles, scopeType: parsed.data.scopeType ?? null, scopes: { create: scope } },
      select: { id: true, userId: true, role: true, secondaryRoles: true },
    });
    if (!existingMembership) {
      await logAction(tx, {
        userId: actorUser.id,
        companyId: id,
        action: "MEMBERSHIP_ADD",
        entityType: "UserCompany",
        entityId: saved.id,
        after: { role, secondaryRoles, scopeType: parsed.data.scopeType, scopes: scope },
      });
    }
    return saved;
  });
  if (user.role !== role) {
    await prisma.user.update({ where: { id: user.id }, data: { role } });
  }
  await prisma.userCompany.updateMany({
    where: { id: membership.id, activeRole: { notIn: [...newHeldSet] } },
    data: { activeRole: null },
  });

  return json({ ok: true, membership, updated: !!existingMembership, scopeKept: !!existingMembership }, { status: 201 });
});
