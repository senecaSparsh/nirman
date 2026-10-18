import { prisma } from "@nirman/db";
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

/** Gate passes the caller can approve — the rule the sidebar badge counts. null = caller has no gate-pass approval. */
export async function actionableGatePassWhere(companyId: string) {
  const user = await getCurrentUser();
  const [perms, scopedPerms] = await Promise.all([getUserPermissions(), getScopedRolePermissions()]);
  if (!user || !(perms.includes(PERM.GATE_PASS_APPROVE) || scopedPerms.includes(PERM.GATE_PASS_APPROVE))) return null;
  const gpSelf = canAutoApprove(await getActingRole()) ? {} : notCreatedBy(user.id);
  return { companyId, status: "PENDING" as const, ...gpSelf, ...(await scopeWhere("GatePass")) };
}
