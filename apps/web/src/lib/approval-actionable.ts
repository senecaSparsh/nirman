import { prisma, type DprApprovalStatus } from "@nirman/db";
import { canAutoApprove, canSelfApprovePurchaseOrder, canWaiveSelfApproval } from "@nirman/services";
import {
  getActingRole,
  getCurrentUser,
  getPermissionsForProject,
  getPoApprovalRole,
  getScopedRolePermissions,
  getUserPermissions,
  scopeWhere,
} from "@/lib/server";
import { PERM } from "@/lib/roles";
import {
  canApproveIndentRow,
  canApprovePoRow,
  companyRequisitionFilter,
  notCreatedBy,
  notSubmittedBy,
  poValueThresholds,
  type ApprovalGate,
} from "@/lib/approval-queue";

export async function gatesFor(projectIds: (string | null)[]): Promise<Map<string, ApprovalGate>> {
  const gates = new Map<string, ApprovalGate>();
  for (const pid of new Set(projectIds)) {
    gates.set(pid ?? "", { perms: await getPermissionsForProject(pid), rank: await getPoApprovalRole(pid) });
  }
  return gates;
}

export async function poThresholds(companyId: string) {
  return poValueThresholds(
    await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { poApprovalThresholdManager: true, poApprovalThresholdAdmin: true },
    }),
  );
}

export async function actionableApprovals(companyId: string) {
  const user = await getCurrentUser();
  const [perms, scopedPerms] = await Promise.all([getUserPermissions(), getScopedRolePermissions()]);
  const canPo = perms.includes(PERM.PO_APPROVE) || scopedPerms.includes(PERM.PO_APPROVE);
  const canReq = perms.includes(PERM.REQUISITION_APPROVE) || scopedPerms.includes(PERM.REQUISITION_APPROVE);
  if (!user || (!canPo && !canReq)) return { pos: [], reqs: [] };

  const selfActing = await getActingRole();
  const poSelf = canSelfApprovePurchaseOrder(selfActing) ? {} : notCreatedBy(user.id);
  const reqSelf = canWaiveSelfApproval(selfActing) ? {} : notSubmittedBy(user.id);
  const [poScope, reqScope, thresholds] = await Promise.all([
    scopeWhere("PurchaseOrder"),
    scopeWhere("MaterialRequisition"),
    poThresholds(companyId),
  ]);
  const [pos, reqs] = await Promise.all([
    canPo
      ? prisma.purchaseOrder.findMany({
          where: { ...poScope, companyId, status: "DRAFT", ...poSelf },
          select: {
            id: true,
            poNumber: true,
            projectId: true,
            total: true,
            createdAt: true,
            supplier: { select: { name: true } },
            _count: { select: { lines: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : [],
    canReq
      ? prisma.materialRequisition.findMany({
          where: { ...companyRequisitionFilter(companyId), status: "SUBMITTED", ...reqSelf, ...reqScope },
          select: {
            id: true,
            reqNumber: true,
            projectId: true,
            createdAt: true,
            project: { select: { name: true } },
            _count: { select: { lines: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : [],
  ]);

  const gates = await gatesFor([...pos, ...reqs].map((r) => r.projectId));
  return {
    pos: pos.filter((po) => canApprovePoRow(gates.get(po.projectId ?? ""), po.total.toString(), thresholds)),
    reqs: reqs.filter((r) => canApproveIndentRow(gates.get(r.projectId ?? ""))),
  };
}

export type ApprovalCounts = {
  po: number;
  req: number;
  gatePass: number;
  dpr: number;
  expense: number;
  claim: number;
  raBill: number;
  leave: number;
  advanceRequest: number;
  correctionRequest: number;
  total: number;
};

/**
 * Everything waiting on THIS user — the single number the nav badge, the
 * mobile briefing and /approvals all show.
 *
 * Before this, three surfaces derived the count independently: the nav badge
 * counted only PO + indent + gate pass, the desktop queue also listed
 * expenses/claims/RA bills/DPRs, and the briefing added leave requests. An
 * OWNER could see "2" on the badge while five items sat in the queue — the
 * three approvals that never showed on the badge (expenses, RA bills, DPRs)
 * are exactly the ones that rot because nobody notices them.
 *
 * Each type keeps its own rule: permission (global ∪ scoped hat), scope,
 * self-approval, and — for POs — the value-tier rank check. A type the caller
 * cannot approve is 0, never "pending but untouchable".
 */
export async function actionableApprovalCounts(companyId: string): Promise<ApprovalCounts> {
  const user = await getCurrentUser();
  const [perms, scopedPerms] = await Promise.all([getUserPermissions(), getScopedRolePermissions()]);
  const all = new Set([...perms, ...scopedPerms]);
  const empty: ApprovalCounts = { po: 0, req: 0, gatePass: 0, dpr: 0, expense: 0, claim: 0, raBill: 0, leave: 0, advanceRequest: 0, correctionRequest: 0, total: 0 };
  if (!user) return empty;

  // One acting role for every type — a delegate approving on someone's behalf
  // gets the same self-approval treatment as the delegator.
  const acting = await getActingRole();
  const canSelfApproveAny = canAutoApprove(acting);
  const selfNotSubmitted = canWaiveSelfApproval(acting) ? {} : notSubmittedBy(user.id);
  const selfNotCreated = canSelfApproveAny ? {} : notCreatedBy(user.id);

  const dprStatuses: DprApprovalStatus[] = [];
  if (all.has(PERM.DPR_APPROVE_SUB_ADMIN)) dprStatuses.push("SUBMITTED");
  if (all.has(PERM.DPR_APPROVE_ADMIN)) dprStatuses.push("SUB_ADMIN_APPROVED");

  const [approvals, gpWhere, dprCount, expenseCount, claimCount, raBillCount, leaveCount, advanceRequestCount, correctionRequestCount] = await Promise.all([
    actionableApprovals(companyId),
    actionableGatePassWhere(companyId),
    dprStatuses.length > 0
      ? prisma.dailyProgressReport.count({
          where: {
            ...(await scopeWhere("DailyProgressReport")),
            companyId,
            approvalStatus: { in: dprStatuses },
            ...selfNotSubmitted,
          },
        })
      : 0,
    all.has(PERM.EXPENSE_APPROVE)
      ? prisma.expense.count({
          where: { ...(await scopeWhere("Expense")), companyId, status: "PENDING", ...selfNotSubmitted },
        })
      : 0,
    all.has(PERM.EXPENSE_APPROVE)
      ? prisma.expenseClaim.count({
          where: { ...(await scopeWhere("ExpenseClaim", {})), companyId, status: "SUBMITTED", ...selfNotSubmitted },
        })
      : 0,
    all.has(PERM.RA_APPROVE)
      ? prisma.raBill.count({
          where: { ...(await scopeWhere("RaBill")), companyId, status: "SUBMITTED", ...selfNotSubmitted, ...selfNotCreated },
        })
      : 0,
    all.has(PERM.HR_MANAGE)
      ? prisma.leaveRequest.count({
          where: { ...(await scopeWhere("LeaveRequest")), companyId, status: "PENDING" },
        })
      : 0,
    // Self-service asks — the worker's advance + punch-fix requests are
    // decidables too; a badge that skips them lies about the queue.
    all.has(PERM.HR_MANAGE)
      ? prisma.employeeAdvance.count({
          where: { ...(await scopeWhere("EmployeeAdvance")), companyId, status: "REQUESTED" },
        })
      : 0,
    all.has(PERM.HR_MANAGE)
      ? prisma.attendanceCorrectionRequest.count({
          where: { ...(await scopeWhere("AttendanceCorrectionRequest")), companyId, status: "REQUESTED" },
        })
      : 0,
  ]);

  const gatePass = gpWhere ? await prisma.gatePass.count({ where: gpWhere }) : 0;

  const counts = {
    po: approvals.pos.length,
    req: approvals.reqs.length,
    gatePass,
    dpr: dprCount,
    expense: expenseCount,
    claim: claimCount,
    raBill: raBillCount,
    leave: leaveCount,
    advanceRequest: advanceRequestCount,
    correctionRequest: correctionRequestCount,
  };
  return { ...counts, total: Object.values(counts).reduce((s, n) => s + n, 0) };
}

/** Gate passes the caller can approve — the rule the sidebar badge counts. null = caller has no gate-pass approval. */
export async function actionableGatePassWhere(companyId: string) {
  const user = await getCurrentUser();
  const [perms, scopedPerms] = await Promise.all([getUserPermissions(), getScopedRolePermissions()]);
  if (!user || !(perms.includes(PERM.GATE_PASS_APPROVE) || scopedPerms.includes(PERM.GATE_PASS_APPROVE))) return null;
  const gpSelf = canAutoApprove(await getActingRole()) ? {} : notCreatedBy(user.id);
  return { companyId, status: "PENDING" as const, ...gpSelf, ...(await scopeWhere("GatePass")) };
}
