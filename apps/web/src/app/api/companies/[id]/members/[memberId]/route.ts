import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM, normalizeRole, canAssignRole } from "@/lib/roles";
import { assignScopedMembership, getDirectReports, getReportingChain } from "@nirman/services";
import { z } from "zod";

const updateMemberSchema = z.object({
  role: z.string(),
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
  const role = normalizeRole(parsed.data.role);

  // Resolve the target membership → userId for assignScopedMembership.
  const membership = await prisma.userCompany.findUnique({
    where: { id: memberId, companyId: id },
    select: { userId: true, role: true },
  });
  if (!membership) return json({ error: "Member not found" }, { status: 404 });

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
        scopeType: parsed.data.scopeType ?? null,
        reportsToUserCompanyId: parsed.data.reportsToUserCompanyId ?? null,
        scopeEntries: (parsed.data.scopeEntries ?? []).map((e) => ({
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

  // Simple role-only update (backwards compatible).
  // Enforce hierarchy: actor must be above both the current and new role.
  if (!canAssignRole(actor.role, membership.role)) {
    return json(
      { error: `You cannot manage a ${membership.role} — they are at or above your tier.` },
      { status: 403 },
    );
  }
  if (!canAssignRole(actor.role, role)) {
    return json(
      { error: `Your role (${actor.role}) cannot assign the ${role} role.` },
      { status: 403 },
    );
  }
  const updated = await prisma.userCompany.update({
    where: { id: memberId, companyId: id },
    data: { role },
    select: { id: true, role: true },
  });
  return json(updated);
});

/**
 * GET /api/companies/[id]/members/[memberId]?reports=1 — either the member's
 * reporting chain (upward) or their direct reports (downward), for the org
 * chart. ?reports=1 → direct reports; otherwise → upward chain.
 */
export const GET = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string; memberId: string }> }) => {
  await requirePermission(PERM.COMPANY_MANAGE);
  const { memberId } = await ctx.params;
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
  await requirePermission(PERM.COMPANY_MANAGE);
  const { id, memberId } = await ctx.params;
  await prisma.userCompany.delete({ where: { id: memberId, companyId: id } });
  return json({ ok: true });
});
