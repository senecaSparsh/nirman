import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, canManageRole, canManageRoleSet, getActingRole, json, requirePermission, userRoleSchema } from "@/lib/server";
import { PERM, isCustomRole } from "@/lib/roles";
import { assignScopedMembership, getDirectReports, getReportingChain } from "@nirman/services";
import { z } from "zod";

const updateMemberSchema = z.object({
  role: z.string(),
  // Multi-role: additional hats the member can switch into. Optional —
  // omitted leaves the held set's secondary roles unchanged.
  secondaryRoles: z.array(z.string()).optional(),
  // Hierarchical RBAC fields (all optional — omitted = unchanged/role-default).
  scopeType: z.enum(["COMPANY", "DEPARTMENT", "PROJECT"]).nullable().optional(),
  reportsToUserCompanyId: z.string().nullable().optional(),
  scopeEntries: z
    .array(
      z.object({
        departmentId: z.string().optional().nullable(),
        projectId: z.string().optional().nullable(),
      }),
    )
    .optional(),
});

/**
 * PATCH /api/companies/[id]/members/[memberId] — change a member's per-company
 * role and, when hierarchical RBAC fields are present, their scope + reporting
 * line. A simple { role } body still works (backwards compatible) and only
 * updates the role. Including scopeType/reportsToUserCompanyId/scopeEntries
 * routes through assignScopedMembership (validates + atomically replaces scope
 * entries + cycle-checks the reporting line).
 */
export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string; memberId: string }> }) => {
  const actor = await requirePermission(PERM.COMPANY_MANAGE);
  const { id, memberId } = await ctx.params;
  const body = await req.json();
  const parsed = updateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Role must be a built-in key or a CUSTOM_* key — normalizeRole() would
  // otherwise store garbage/custom strings as SUPERVISOR silently.
  const roleCheck = userRoleSchema.shape.role.safeParse(parsed.data.role);
  if (!roleCheck.success) {
    return json({ error: "Role must be a built-in role or a CUSTOM_* role key" }, { status: 400 });
  }
  const role = roleCheck.data!;
  // DEVELOPER is an internal/system role — not assignable to members.
  if (role === "DEVELOPER" || (parsed.data.secondaryRoles ?? []).includes("DEVELOPER")) {
    return json({ error: "The Developer role is reserved and cannot be assigned." }, { status: 400 });
  }
  // Every secondary role must also be a built-in or CUSTOM_* key.
  for (const sr of parsed.data.secondaryRoles ?? []) {
    if (!userRoleSchema.shape.role.safeParse(sr).success) {
      return json({ error: "Secondary roles must be built-in or CUSTOM_* role keys" }, { status: 400 });
    }
  }

  // Resolve the target membership → userId for assignScopedMembership.
  const membership = await prisma.userCompany.findUnique({
    where: { id: memberId, companyId: id },
    select: { userId: true, role: true, secondaryRoles: true, activeRole: true },
  });
  if (!membership) return json({ error: "Member not found" }, { status: 404 });

  // Every role key in the request — primary + secondary — must be a
  // built-in or CUSTOM_* key, and every CUSTOM_* must exist in this company.
  const requestedRoles = [role, ...(parsed.data.secondaryRoles ?? [])];
  for (const r of requestedRoles) {
    if (isCustomRole(r)) {
      const cr = await prisma.customRole.findFirst({
        where: { companyId: id, key: r },
        select: { id: true },
      });
      if (!cr) return json({ error: `Custom role ${r} not found` }, { status: 400 });
    }
  }

  const hasScopeFields =
    parsed.data.scopeType !== undefined ||
    parsed.data.reportsToUserCompanyId !== undefined ||
    parsed.data.scopeEntries !== undefined;

  if (hasScopeFields) {
    try {
      const updated = await assignScopedMembership({
        actorUserId: actor.id,
        userId: membership.userId,
        companyId: id,
        role,
        secondaryRoles: parsed.data.secondaryRoles,
        // `undefined` = preserve, `null` = explicit clear/reset — collapse
        // nothing here or a reportsTo-only PATCH wipes scope + entries.
        scopeType: parsed.data.scopeType,
        reportsToUserCompanyId: parsed.data.reportsToUserCompanyId,
        scopeEntries: parsed.data.scopeEntries === undefined ? undefined : parsed.data.scopeEntries.map((e) => ({
          departmentId: e.departmentId ?? undefined,
          projectId: e.projectId ?? undefined,
        })),
      });
      return json(updated);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status ?? 400;
      return json({ error: err instanceof Error ? err.message : "Assignment failed" }, { status });
    }
  }

  // Multi-role: the new secondary list (when sent) replaces the held set's
  // extras; the primary role is dropped from it if duplicated.
  const newSecondary = parsed.data.secondaryRoles !== undefined
    ? [...new Set(parsed.data.secondaryRoles)].filter((r) => r !== role)
    : (membership.secondaryRoles ?? []);
  const newHeld = new Set([role, ...newSecondary].filter(Boolean));

  // Simple role update (backwards compatible + secondaryRoles).
  // Enforce hierarchy: actor must be above EVERY held role (current AND
  // new) — a dormant senior hat still protects the member. The actor's
  // own authority is the hat they currently wear (getActingRole).
  const actorRole = await getActingRole();
  const currentHeld = [...new Set([membership.role, ...(membership.secondaryRoles ?? [])].filter(Boolean))];
  if (!(await canManageRoleSet(actorRole, currentHeld, id))) {
    return json(
      { error: `You cannot manage a ${membership.role} — they are at or above your tier.` },
      { status: 403 },
    );
  }
  for (const r of newHeld) {
    if (!(await canManageRole(actorRole, r, id))) {
      return json(
        { error: `Your role (${actorRole}) cannot assign the ${r} role.` },
        { status: 403 },
      );
    }
  }
  const updated = await prisma.userCompany.update({
    where: { id: memberId, companyId: id },
    data: {
      role,
      secondaryRoles: newSecondary,
      // The worn hat left the held set → fall back to the primary role.
      ...(membership.activeRole && !newHeld.has(membership.activeRole) ? { activeRole: null } : {}),
    },
    select: { id: true, role: true, secondaryRoles: true, activeRole: true },
  });
  // Mirror the primary role onto User.role — the same contract
  // assignScopedMembership and users/[id] PATCH keep: membership is
  // authoritative, the mirror feeds list views and the held-set union.
  if (membership.role !== role) {
    await prisma.user.update({ where: { id: membership.userId }, data: { role } });
  }
  return json(updated);
});

/**
 * GET /api/companies/[id]/members/[memberId]?reports=1 — either the member's
 * reporting chain (upward) or their direct reports (downward), for the org
 * chart. ?reports=1 → direct reports; otherwise → upward chain.
 */
export const GET = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string; memberId: string }> }) => {
  await requirePermission(PERM.COMPANY_MANAGE);
  const { id, memberId } = await ctx.params;

  // The membership must belong to THIS company — otherwise the reporting
  // chain / direct reports of another tenant's member leak their names,
  // emails and roles through this company's URL.
  const member = await prisma.userCompany.findFirst({
    where: { id: memberId, companyId: id },
    select: { id: true },
  });
  if (!member) return json({ error: "Member not found" }, { status: 404 });

  const url = new URL(req.url);
  const wantReports = url.searchParams.get("reports") === "1";

  if (wantReports) {
    const reports = await getDirectReports(memberId);
    return json(
      reports.map((r) => ({
        id: r.id,
        userId: r.userId,
        role: r.role,
        scopeType: r.scopeType,
        reportsToUserCompanyId: r.reportsToUserCompanyId,
        name: r.user.name,
        email: r.user.email,
        scopes: r.scopes.map((s) => ({
          scopeKind: s.scopeKind,
          departmentId: s.departmentId,
          projectId: s.projectId,
          departmentName: s.department?.name ?? null,
          departmentCode: s.department?.code ?? null,
          projectName: s.project?.name ?? null,
        })),
      })),
    );
  }

  const chain = await getReportingChain(memberId);
  const chainMembers = await prisma.userCompany.findMany({
    where: { id: { in: chain } },
    include: { user: { select: { name: true, email: true } } },
  });
  // Preserve chain order (self first, up to the top).
  const byId = new Map(chainMembers.map((m) => [m.id, m]));
  return json(
    chain.map((cid) => {
      const m = byId.get(cid);
      return {
        id: cid,
        userId: m?.userId ?? null,
        role: m?.role ?? null,
        name: m?.user.name ?? null,
        email: m?.user.email ?? null,
      };
    }),
  );
});

/**
 * DELETE /api/companies/[id]/members/[memberId] — remove a user from
 * this company. They lose access to it but their user account is kept.
 */
export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string; memberId: string }> }) => {
  const session = await requirePermission(PERM.COMPANY_MANAGE);
  const { id, memberId } = await ctx.params;

  // Membership must belong to THIS company — a foreign or missing id must
  // 404, not hit a Prisma P2025 or touch another tenant's data.
  const membership = await prisma.userCompany.findUnique({
    where: { id: memberId, companyId: id },
    select: { userId: true, companyId: true, role: true, secondaryRoles: true },
  });
  if (!membership) return json({ error: "Member not found" }, { status: 404 });

  // Self-removal locks the actor out of the company — leaving is a
  // deliberate separate action, not a member-management operation.
  if (membership.userId === session.id) {
    return json({ error: "You cannot remove yourself from the company" }, { status: 400 });
  }

  // Actor must sit above EVERY hat the member holds — same rule as role
  // changes; a dormant senior hat still protects the member.
  const actorRole = await getActingRole();
  if (!(await canManageRoleSet(actorRole, [membership.role, ...(membership.secondaryRoles ?? [])], id))) {
    return json({ error: "You don't have authority to remove this member." }, { status: 403 });
  }

  // Never let a company lose its last OWNER/ADMIN — it would be orphaned.
  // Multi-role: a held OWNER/ADMIN hat counts whether primary or secondary.
  const heldTopTier = [membership.role, ...(membership.secondaryRoles ?? [])].some(
    (r) => r === "OWNER" || r === "ADMIN",
  );
  if (heldTopTier) {
    const remaining = await prisma.userCompany.count({
      where: {
        companyId: id,
        id: { not: memberId },
        OR: [
          { role: { in: ["OWNER", "ADMIN"] } },
          { secondaryRoles: { hasSome: ["OWNER", "ADMIN"] } },
        ],
      },
    });
    if (remaining === 0) {
      return json({ error: "Cannot remove the last owner of the company" }, { status: 400 });
    }
  }

  // Clean up user preferences for this company before removing the membership
  // (UserPreference has no FK to UserCompany, so orphans would otherwise remain).
  await prisma.userPreference.deleteMany({
    where: { userId: membership.userId, companyId: membership.companyId },
  }).catch(() => {});

  // Return their company phone to the pool — a removed member must not keep
  // a company-owned number assigned (the nightly auditor flags leftovers,
  // but releasing here keeps the pool honest immediately).
  const assignedPhone = await prisma.companyPhone.findFirst({
    where: { assignedToUserId: membership.userId, companyId: id, deletedAt: null },
    select: { id: true },
  });
  if (assignedPhone) {
    await prisma.phoneAssignment.updateMany({
      where: { companyPhoneId: assignedPhone.id, returnedAt: null },
      data: { returnedAt: new Date(), reason: "Member removed from company" },
    });
    await prisma.companyPhone.update({
      where: { id: assignedPhone.id },
      data: { assignedToUserId: null, assignedAt: null, status: "RECYCLED" },
    });
  }

  await prisma.userCompany.delete({ where: { id: memberId, companyId: id } });
  return json({ ok: true });
});
