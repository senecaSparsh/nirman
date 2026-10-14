import type { Prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import { poRankClears, requiredPoApprover } from "@nirman/services";
import type { Thresholds } from "@/lib/approval-digest";

export type ApprovalGate = { perms: string[]; rank: string };

export function companyRequisitionFilter(companyId: string) {
  return { OR: [{ project: { companyId } }, { department: { companyId } }] };
}

export function notSubmittedBy(userId: string) {
  return {
    AND: [
      { OR: [{ requestedById: { not: userId } }, { requestedById: null }] },
      { OR: [{ submittedById: { not: userId } }, { submittedById: null }] },
    ],
  };
}

export function notCreatedBy(userId: string) {
  return { AND: [{ OR: [{ createdById: { not: userId } }, { createdById: null }] }] };
}

export function poValueThresholds(company: {
  poApprovalThresholdManager: Prisma.Decimal | null;
  poApprovalThresholdAdmin: Prisma.Decimal | null;
}): Thresholds {
  return {
    managerThreshold: company.poApprovalThresholdManager ? company.poApprovalThresholdManager.toString() : "50000",
    adminThreshold: company.poApprovalThresholdAdmin ? company.poApprovalThresholdAdmin.toString() : "500000",
  };
}

export function canApprovePoRow(gate: ApprovalGate | undefined, total: string, t: Thresholds): boolean {
  return (
    !!gate &&
    gate.perms.includes(PERM.PO_APPROVE) &&
    poRankClears(gate.rank, requiredPoApprover(total, t.managerThreshold, t.adminThreshold))
  );
}

export function canApproveIndentRow(gate: ApprovalGate | undefined): boolean {
  return !!gate && gate.perms.includes(PERM.REQUISITION_APPROVE);
}
