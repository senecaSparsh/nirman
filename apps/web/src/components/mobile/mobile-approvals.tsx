import { connection } from "next/server";
import { prisma, type DprApprovalStatus } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobilePageHeader, MobileRefreshButton } from "@/components/mobile/mobile-primitives";
import { MobileApprovalsQueue } from "@/components/mobile/mobile-approvals-queue";

/**
 * Shared approvals queue — used by the Executive and Ops personas.
 * Surfaces draft POs (need po.approve) + submitted requisitions
 * (need requisition.approve) + pending gate passes (need gate_pass.approve)
 * + pending DPRs. The server fetches the queue with line details; the client
 * component handles inline approve/reject without jumping to the desktop
 * approvals desk.
 */
export async function MobileApprovals({ title }: { title: string }) {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  const canApprovePo = hasPermission(role, PERM.PO_APPROVE);
  const canApproveReq = hasPermission(role, PERM.REQUISITION_APPROVE);
  const canApproveGatePass = hasPermission(role, PERM.GATE_PASS_APPROVE);
  const canApproveDprSubAdmin = hasPermission(role, PERM.DPR_APPROVE_SUB_ADMIN);
  const canApproveDprAdmin = hasPermission(role, PERM.DPR_APPROVE_ADMIN);

  // If the user can't approve anything, don't surface the queue.
  if (!canApprovePo && !canApproveReq && !canApproveGatePass && !canApproveDprSubAdmin && !canApproveDprAdmin) {
    return (
      <div>
        <MobilePageHeader title={title} subtitle="No access" right={<MobileRefreshButton />} />
        <div className="px-4 py-10 text-center text-body text-muted-foreground">
          You don&apos;t have permission to approve purchase orders, requisitions, gate passes, or DPRs.
        </div>
      </div>
    );
  }

  // DPRs pending sub-admin approval (SUBMITTED) or admin approval (SUB_ADMIN_APPROVED)
  const dprApprovalStatuses: DprApprovalStatus[] = [];
  if (canApproveDprSubAdmin) dprApprovalStatuses.push("SUBMITTED");
  if (canApproveDprAdmin) dprApprovalStatuses.push("SUB_ADMIN_APPROVED");

  const [draftPOs, pendingReqs, pendingGatePasses, pendingDprs] = await Promise.all([
    canApprovePo
      ? prisma.purchaseOrder.findMany({
          where: { companyId: company.id, status: "DRAFT" },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            supplier: { select: { name: true } },
            lines: {
              select: {
                qtyOrdered: true,
                unitCost: true,
                material: { select: { name: true, code: true, unit: true } },
              },
              orderBy: { material: { name: "asc" } },
            },
          },
        })
      : [],
    canApproveReq
      ? prisma.materialRequisition.findMany({
          where: { project: { companyId: company.id }, status: "SUBMITTED" },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            project: { select: { name: true } },
            lines: {
              select: {
                qtyRequested: true,
                notes: true,
                material: { select: { name: true, code: true, unit: true } },
              },
              orderBy: { material: { name: "asc" } },
            },
          },
        })
      : [],
    canApproveGatePass
      ? prisma.gatePass.findMany({
          where: { companyId: company.id, status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            lines: { select: { qty: true, materialName: true, materialCode: true, unit: true, description: true } },
            location: { select: { name: true } },
            createdBy: { select: { name: true } },
          },
        })
      : [],
    dprApprovalStatuses.length > 0
      ? prisma.dailyProgressReport.findMany({
          where: { companyId: company.id, approvalStatus: { in: dprApprovalStatuses } },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            project: { select: { name: true } },
            submittedBy: { select: { name: true } },
          },
        })
      : [],
  ]);

  const poRows = draftPOs.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    supplierName: po.supplier.name,
    createdAt: po.createdAt.toISOString(),
    total: po.lines.reduce((s, l) => s + toNum(l.qtyOrdered) * toNum(l.unitCost), 0),
    lines: po.lines.map((l) => ({
      materialName: l.material.name,
      materialCode: l.material.code,
      unit: l.material.unit,
      qtyOrdered: toNum(l.qtyOrdered),
      unitCost: toNum(l.unitCost),
    })),
  }));

  const reqRows = pendingReqs.map((r) => ({
    id: r.id,
    requisitionNumber: r.reqNumber,
    projectName: r.project?.name ?? null,
    createdAt: r.createdAt.toISOString(),
    lines: r.lines.map((l) => ({
      materialName: l.material.name,
      materialCode: l.material.code,
      unit: l.material.unit,
      qtyRequested: toNum(l.qtyRequested),
      notes: l.notes,
    })),
  }));

  const dprRows = pendingDprs.map((d) => ({
    id: d.id,
    projectName: d.project?.name ?? null,
    submittedByName: d.submittedBy?.name ?? null,
    createdAt: d.createdAt.toISOString(),
    date: d.date.toISOString(),
    approvalStatus: String(d.approvalStatus),
    workSummary: d.workSummary,
    progressPct: toNum(d.progressPct),
    canApproveSubAdmin: canApproveDprSubAdmin,
    canApproveAdmin: canApproveDprAdmin,
  }));

  const gatePassRows = pendingGatePasses.map((gp) => ({
    id: gp.id,
    gatePassNumber: gp.gatePassNumber,
    category: gp.category,
    locationName: gp.location.name,
    destination: gp.destination,
    vehicleNumber: gp.vehicleNumber,
    driverName: gp.driverName,
    createdByName: gp.createdBy?.name ?? null,
    createdAt: gp.createdAt.toISOString(),
    lineCount: gp.lines.length,
    lines: gp.lines.map((l) => ({
      materialName: l.materialName,
      materialCode: l.materialCode,
      unit: l.unit,
      qty: toNum(l.qty),
      description: l.description,
    })),
  }));

  return (
    <div>
      <MobilePageHeader title={title} subtitle={`${poRows.length + reqRows.length + gatePassRows.length + dprRows.length} awaiting approval`} right={<MobileRefreshButton />} />
      <MobileApprovalsQueue purchaseOrders={poRows} requisitions={reqRows} gatePasses={gatePassRows} dprs={dprRows} />
    </div>
  );
}
