import { prisma, type Prisma } from "@nirman/db";
import { resolveUserScope } from "@nirman/services";
import { resolveCustomAuthorityRole, resolveRolePermissions } from "@/lib/server";
import {
  PERM,
  customPoApprovalRole,
  delegableApprovalPermissions,
  effectivePermissions,
  isCustomRole,
  normalizeRole,
  type Role,
} from "@/lib/roles";
import { assignedProjectIdsFor, type DigestItem, type DigestMember, type Thresholds } from "@/lib/approval-digest";
import { companyRequisitionFilter, poValueThresholds } from "@/lib/approval-queue";

const APPROVAL_PERMISSIONS: string[] = [
  PERM.PO_APPROVE,
  PERM.REQUISITION_APPROVE,
  PERM.DPR_APPROVE_SUB_ADMIN,
  PERM.DPR_APPROVE_ADMIN,
  PERM.EXPENSE_APPROVE,
  PERM.PROCUREMENT_MANAGE,
];

export type ApprovalDigestInputs = {
  members: DigestMember[];
  items: DigestItem[];
  thresholds: Thresholds;
  missingSites: { id: string; name: string }[];
};

const present = (ids: (string | null)[]): string[] => ids.filter((id): id is string => !!id);

export async function loadApprovalDigestInputs(input: {
  companyId: string;
  now: Date;
  cutoff: Date;
  startOfToday: Date;
  managerThreshold: Prisma.Decimal | null;
  adminThreshold: Prisma.Decimal | null;
}): Promise<ApprovalDigestInputs> {
  const { companyId, now, cutoff } = input;
  const indentScope = companyRequisitionFilter(companyId);
  const [memberRows, delegatorRows, hatRows, activeProjects, pos, submittedIndents, approvedIndents, dprSubmitted, dprSubAdmin, claims] =
    await Promise.all([
      prisma.userCompany.findMany({
        where: { companyId, active: true, user: { active: true } },
        select: {
          id: true,
          userId: true,
          role: true,
          activeRole: true,
          secondaryRoles: true,
          scopeType: true,
          userPermissions: { select: { permission: true } },
        },
      }),
      prisma.userCompany.findMany({
        where: { companyId, active: true, approvalsDelegatedToId: { not: null }, delegationEndsAt: { gt: now } },
        select: { role: true, approvalsDelegatedToId: true },
      }),
      prisma.projectAssignment.findMany({
        where: { project: { companyId } },
        select: { userId: true, projectId: true, scopedRole: true },
      }),
      prisma.project.findMany({
        where: { companyId, deletedAt: null, status: "ACTIVE" },
        select: { id: true, name: true },
      }),
      prisma.purchaseOrder.findMany({
        where: { companyId, status: "DRAFT", createdAt: { lt: cutoff } },
        select: { projectId: true, createdById: true, total: true, createdAt: true },
      }),
      prisma.materialRequisition.findMany({
        where: { ...indentScope, status: "SUBMITTED", createdAt: { lt: cutoff } },
        select: { projectId: true, departmentId: true, requestedById: true, submittedById: true, createdAt: true },
      }),
      prisma.materialRequisition.findMany({
        where: { ...indentScope, status: "APPROVED", updatedAt: { lt: cutoff } },
        select: { projectId: true, departmentId: true, updatedAt: true },
      }),
      prisma.dailyProgressReport.findMany({
        where: { companyId, approvalStatus: "SUBMITTED", createdAt: { lt: cutoff } },
        select: { projectId: true, submittedById: true, createdAt: true },
      }),
      prisma.dailyProgressReport.findMany({
        where: { companyId, approvalStatus: "SUB_ADMIN_APPROVED", createdAt: { lt: cutoff } },
        select: { projectId: true, submittedById: true, createdAt: true },
      }),
      prisma.expenseClaim.findMany({
        where: { companyId, status: "SUBMITTED", submittedAt: { lt: cutoff } },
        select: { projectId: true, claimantId: true, submittedAt: true, createdAt: true },
      }),
    ]);

  const items: DigestItem[] = [
    ...pos.map((p) => ({ queue: "po" as const, projectId: p.projectId, departmentId: null, submitterIds: present([p.createdById]), amount: p.total.toString(), at: p.createdAt })),
    ...submittedIndents.map((r) => ({ queue: "indent" as const, projectId: r.projectId, departmentId: r.departmentId, submitterIds: present([r.requestedById, r.submittedById]), at: r.createdAt })),
    ...approvedIndents.map((r) => ({ queue: "unordered" as const, projectId: r.projectId, departmentId: r.departmentId, submitterIds: [], at: r.updatedAt })),
    ...dprSubmitted.map((d) => ({ queue: "dprSub" as const, projectId: d.projectId, departmentId: null, submitterIds: present([d.submittedById]), at: d.createdAt })),
    ...dprSubAdmin.map((d) => ({ queue: "dprAdmin" as const, projectId: d.projectId, departmentId: null, submitterIds: present([d.submittedById]), at: d.createdAt })),
    ...claims.map((c) => ({ queue: "claim" as const, projectId: c.projectId, departmentId: null, submitterIds: [c.claimantId], at: c.submittedAt ?? c.createdAt })),
  ];

  const delegatedBy = new Map<string, string[]>();
  for (const d of delegatorRows) {
    if (d.approvalsDelegatedToId) delegatedBy.set(d.approvalsDelegatedToId, [...(delegatedBy.get(d.approvalsDelegatedToId) ?? []), d.role]);
  }
  const hatsByUser = new Map<string, Record<string, Role>>();
  for (const h of hatRows) {
    hatsByUser.set(h.userId, { ...(hatsByUser.get(h.userId) ?? {}), [h.projectId]: normalizeRole(h.scopedRole) });
  }

  const candidates = [];
  for (const row of memberRows) {
    const worn = row.activeRole && [row.role, ...row.secondaryRoles].includes(row.activeRole) ? row.activeRole : row.role;
    const delegators = delegatedBy.get(row.id) ?? [];
    const hats = hatsByUser.get(row.userId) ?? {};
    const permissions = [
      ...new Set([
        ...(await resolveRolePermissions(worn, companyId, row.userPermissions.map((p) => p.permission))),
        ...(delegators.length > 0 ? delegableApprovalPermissions() : []),
      ]),
    ];
    const hatPermissions = Object.values(hats).flatMap((h) => effectivePermissions(h, []));
    if (![...permissions, ...hatPermissions].some((p) => APPROVAL_PERMISSIONS.includes(p))) continue;
    const ownRole = isCustomRole(worn)
      ? ((await resolveCustomAuthorityRole(companyId, worn)) ?? normalizeRole(worn))
      : normalizeRole(worn);
    const poBaseRole = isCustomRole(worn) ? customPoApprovalRole(await resolveRolePermissions(worn, companyId, [])) : ownRole;
    const delegatorRoles = await Promise.all(
      delegators.map(async (r) => (isCustomRole(r) ? customPoApprovalRole(await resolveRolePermissions(r, companyId, [])) : r)),
    );
    // A member whose scope no longer resolves (deactivated mid-run) is dropped,
    // never widened to company scope.
    const scope = await resolveUserScope(row.userId, companyId);
    if (!scope) continue;
    candidates.push({ row, ownRole, poBaseRole, delegatorRoles, permissions, hats, scope });
  }

  const deptIds = [...new Set(candidates.filter((c) => c.scope.scopeType === "DEPARTMENT").flatMap((c) => c.scope.departmentIds))];
  const employees = deptIds.length
    ? await prisma.employee.findMany({
        where: { companyId, deletedAt: null, departmentId: { in: deptIds }, activeProjectId: { not: null } },
        select: { departmentId: true, activeProjectId: true },
      })
    : [];
  const deptProjects = new Map<string, string[]>();
  for (const e of employees) {
    if (e.departmentId && e.activeProjectId) {
      deptProjects.set(e.departmentId, [...new Set([...(deptProjects.get(e.departmentId) ?? []), e.activeProjectId])]);
    }
  }

  const members: DigestMember[] = candidates.map((c) => ({
    userId: c.row.userId,
    ownRole: c.ownRole,
    poBaseRole: c.poBaseRole,
    delegatorRoles: c.delegatorRoles,
    permissions: c.permissions,
    scopeType: c.scope.scopeType,
    visibleProjectIds:
      c.scope.scopeType === "COMPANY"
        ? []
        : assignedProjectIdsFor({
            scopeType: c.scope.scopeType,
            projectIds: c.scope.projectIds,
            departmentIds: c.scope.departmentIds,
            explicit: c.row.scopeType != null,
            ownRole: c.ownRole,
            hatProjectIds: Object.keys(c.hats),
            deptProjects,
          }),
    visibleDepartmentIds: c.scope.departmentIds,
    hats: c.hats,
  }));

  const reported = new Set(
    (
      await prisma.dailyProgressReport.findMany({
        where: { projectId: { in: activeProjects.map((p) => p.id) }, date: { gte: input.startOfToday } },
        select: { projectId: true },
      })
    ).map((d) => d.projectId),
  );

  return {
    members,
    items,
    thresholds: poValueThresholds({ poApprovalThresholdManager: input.managerThreshold, poApprovalThresholdAdmin: input.adminThreshold }),
    missingSites: activeProjects.filter((p) => !reported.has(p.id)),
  };
}
