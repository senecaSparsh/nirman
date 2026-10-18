import { connection } from "next/server";
import { prisma, type DprApprovalStatus } from "@nirman/db";
import { getActingRole, getCompany, getUserRole, getUserPermissions, getCurrentUser, toNum, scopeWhere, getScopedRolePermissions  } from "@/lib/server";
import { canAutoApprove, canSelfApprovePurchaseOrder, canWaiveSelfApproval } from "@nirman/services";
import { PERM, holdsPermission } from "@/lib/roles";
import { MobilePageHeader } from "@/components/mobile/v2/primitives";
import { MobileRefreshButton } from "@/components/mobile/v2/scaffold";
import { MobileApprovalsQueue } from "@/components/mobile/mobile-approvals-queue";

/**
 * Shared approvals queue — used by the Executive and Ops personas.
 * Surfaces draft POs (need po.approve) + submitted requisitions
 * (need requisition.approve) + pending gate passes (need gate_pass.approve)
 * + pending DPRs. The server fetches the queue with line details; the client
 * component handles inline approve/reject without jumping to the desktop
 * approvals desk.
 *
 * Self-created items are excluded — a user cannot approve their own submission.
 */
export async function MobileApprovals() {
  await connection();
  const role = await getUserRole();
  const actingRole = await getActingRole();
  const company = await getCompany();
  // Effective permissions = role matrix + RolePermission overrides + per-user
  // UserPermission grants. Passing as `overrides` to hasPermission means a
  // permission granted to one individual is honored here, matching the API.
  const overrides = await getUserPermissions();
  // Scoped-role lift — a SITE_ENGINEER wearing PROJECT_MANAGER on a project
  // gains that hat's approve perms within the project's rows (queue items are
  // already scope-filtered, so the lift only lands where it belongs).
  const scopedRolePerms = await getScopedRolePermissions();
  const hasScopedOrGlobal = (p: string) => overrides.includes(p) || scopedRolePerms.includes(p);
  const currentUser = await getCurrentUser();
  const userId = currentUser?.id ?? "";
  // Tier-1 approvers (OWNER/ADMIN) may approve their own creations — no higher
  // approver exists — so their own pending items still appear in the queue.
  // Everyone else's own items are hidden (they can't self-approve anyway).
  const hideSelf = !canAutoApprove(actingRole);
  const hideSelfPo = !canSelfApprovePurchaseOrder(actingRole);
  const hideSelfWaiver = !canWaiveSelfApproval(actingRole);

  const canApprovePo = holdsPermission(role, PERM.PO_APPROVE, overrides) || hasScopedOrGlobal(PERM.PO_APPROVE);
  const canApproveReq = holdsPermission(role, PERM.REQUISITION_APPROVE, overrides) || hasScopedOrGlobal(PERM.REQUISITION_APPROVE);
  const canApproveGatePass = holdsPermission(role, PERM.GATE_PASS_APPROVE, overrides) || hasScopedOrGlobal(PERM.GATE_PASS_APPROVE);
  const canApproveDprSubAdmin = holdsPermission(role, PERM.DPR_APPROVE_SUB_ADMIN, overrides) || hasScopedOrGlobal(PERM.DPR_APPROVE_SUB_ADMIN);
  const canApproveDprAdmin = holdsPermission(role, PERM.DPR_APPROVE_ADMIN, overrides) || hasScopedOrGlobal(PERM.DPR_APPROVE_ADMIN);
 const canApproveExpense = holdsPermission(role, PERM.EXPENSE_APPROVE, overrides) || hasScopedOrGlobal(PERM.EXPENSE_APPROVE);
  const canApproveRaBill = holdsPermission(role, PERM.RA_APPROVE, overrides) || hasScopedOrGlobal(PERM.RA_APPROVE);
  const canManageHr = holdsPermission(role, PERM.HR_MANAGE, overrides) || hasScopedOrGlobal(PERM.HR_MANAGE);

  // If the user can't approve anything, don't surface the queue.
  if (!canApprovePo && !canApproveReq && !canApproveGatePass && !canApproveDprSubAdmin && !canApproveDprAdmin && !canApproveExpense && !canApproveRaBill && !canManageHr) {
    return (
      <div>
        {/* shell renders "Approvals" — the header carries the access state */}
        <MobilePageHeader subtitle="No access" right={<MobileRefreshButton />} />
        <div className="px-4 py-10 text-center text-m-body" style={{ color: "var(--color-ink-500)" }}>
          You do not have permission to approve any items (POs, requisitions, gate passes, DPRs, expenses, RA bills, or leave requests).
        </div>
      </div>
    );
  }

  // DPRs pending sub-admin approval (SUBMITTED) or admin approval (SUB_ADMIN_APPROVED)
  const dprApprovalStatuses: DprApprovalStatus[] = [];
  if (canApproveDprSubAdmin) dprApprovalStatuses.push("SUBMITTED");
  if (canApproveDprAdmin) dprApprovalStatuses.push("SUB_ADMIN_APPROVED");

  const [draftPOs, pendingReqs, pendingGatePasses, pendingDprs, pendingExpenses, pendingRaBills, pendingClaims, pendingLeaves, pendingOffsite] = await Promise.all([
    canApprovePo
      ? prisma.purchaseOrder.findMany({
          where: { companyId: company.id, status: "DRAFT", createdById: hideSelfPo ? { not: userId } : undefined, ...await scopeWhere("PurchaseOrder") },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            supplier: { select: { name: true } },
            lines: {
              select: {
                qtyOrdered: true,
                unitCost: true,
                gstRate: true,
                material: { select: { name: true, code: true, unit: true } },
              },
              orderBy: { material: { name: "asc" } },
            },
          },
        })
      : [],
    canApproveReq
      ? prisma.materialRequisition.findMany({
          where: { project: { companyId: company.id }, status: "SUBMITTED", requestedById: hideSelfWaiver ? { not: userId } : undefined, ...await scopeWhere("MaterialRequisition") },
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
          where: { companyId: company.id, status: "PENDING", createdById: hideSelf ? { not: userId } : undefined, ...await scopeWhere("GatePass") },
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
          where: { companyId: company.id, approvalStatus: { in: dprApprovalStatuses }, submittedById: hideSelfWaiver ? { not: userId } : undefined, ...await scopeWhere("DailyProgressReport") },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            project: { select: { name: true } },
            submittedBy: { select: { name: true } },
            laborLines: {
              select: { taskDescription: true, hoursWorked: true, employee: { select: { name: true } }, crew: { select: { name: true } } },
            },
            materialLines: {
              select: { qty: true, material: { select: { name: true } } },
            },
          },
        })
      : [],
    canApproveExpense
      ? prisma.expense.findMany({
          where: { companyId: company.id, status: "PENDING", submittedById: hideSelfWaiver ? { not: userId } : undefined, ...await scopeWhere("Expense") },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            project: { select: { name: true } },
            createdBy: { select: { name: true } },
          },
        })
      : [],
    canApproveRaBill
      ? prisma.raBill.findMany({
          where: { companyId: company.id, status: "SUBMITTED", createdById: hideSelfWaiver ? { not: userId } : undefined, submittedById: hideSelfWaiver ? { not: userId } : undefined, ...await scopeWhere("RaBill") },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            project: { select: { name: true } },
            workOrder: { select: { workOrderNumber: true } },
            submittedBy: { select: { name: true } },
            lines: {
              select: { thisQty: true, totalQty: true, rate: true, thisAmount: true, boqItem: { select: { description: true, unit: true } } },
            },
          },
        })
      : [],
    canApproveExpense
      ? prisma.expenseClaim.findMany({
          where: { companyId: company.id, status: "SUBMITTED", claimantId: hideSelfWaiver ? { not: userId } : undefined, ...await scopeWhere("ExpenseClaim", {}) },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            claimant: { select: { name: true } },
            project: { select: { name: true } },
            lines: {
              select: {
                category: true,
                amount: true,
                date: true,
                notes: true,
              },
              orderBy: { date: "asc" },
            },
          },
        })
      : [],
    canManageHr
      ? prisma.leaveRequest.findMany({
          where: { companyId: company.id, status: "PENDING", ...await scopeWhere("LeaveRequest") },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { employee: { select: { name: true } } },
        })
      : [],
    // Off-site check-ins are approvals too — a worker outside the geofence
    // sits as provisional PRESENT until HR reviews. Surface them here so
    // the unified queue doesn't hide them on a separate page.
    canManageHr
      ? prisma.workerAttendance.findMany({
          where: {
            companyId: company.id,
            offSiteReview: "PENDING",
            employee: { deletedAt: null, userId: hideSelf ? { not: userId } : undefined, ...await scopeWhere("Employee") },
          },
          orderBy: { date: "desc" },
          take: 20,
          include: { employee: { select: { name: true } } },
        })
      : [],
  ]);

  const poRows = draftPOs.map((po) => {
    const subtotal = po.lines.reduce((s, l) => s + toNum(l.qtyOrdered) * toNum(l.unitCost), 0);
    const gstTotal = po.lines.reduce((s, l) => {
      const rate = toNum(l.gstRate);
      return s + toNum(l.qtyOrdered) * toNum(l.unitCost) * rate / 100;
    }, 0);
    return {
      id: po.id,
      poNumber: po.poNumber,
      supplierName: po.supplier.name,
      createdAt: po.createdAt.toISOString(),
      subtotal,
      gstTotal,
      total: subtotal + gstTotal,
      lines: po.lines.map((l) => ({
        materialName: l.material.name,
        materialCode: l.material.code,
        unit: l.material.unit,
        qtyOrdered: toNum(l.qtyOrdered),
        unitCost: toNum(l.unitCost),
        gstRate: toNum(l.gstRate),
      })),
    };
  });

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
    laborLines: d.laborLines.map((l) => ({
      who: l.employee?.name ?? l.crew?.name ?? "Unassigned",
      hours: toNum(l.hoursWorked),
      task: l.taskDescription ?? "",
    })),
    materialLines: d.materialLines.map((l) => ({
      material: l.material?.name ?? "—",
      qty: toNum(l.qty),
    })),
    photoCount: d.photoUrls.length,
  }));

  const expenseRows = pendingExpenses.map((e) => ({
    id: e.id,
    description: e.notes ?? "",
    amount: toNum(e.amount),
    category: e.category,
    projectName: e.project?.name ?? null,
    createdByName: e.createdBy?.name ?? null,
    createdAt: e.createdAt.toISOString(),
    date: e.date.toISOString(),
    cgst: toNum(e.cgst),
    sgst: toNum(e.sgst),
    igst: toNum(e.igst),
    tdsAmount: toNum(e.tdsAmount),
    receiptUrl: e.receiptUrl,
    paymentMode: e.paymentMode,
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

  const claimRows = pendingClaims.map((c) => ({
    id: c.id,
    claimantName: c.claimant?.name ?? "—",
    projectName: c.project?.name ?? null,
    totalAmount: toNum(c.totalAmount),
    description: c.description,
    submittedAt: c.submittedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    lines: c.lines.map((l) => ({
      category: l.category,
      amount: toNum(l.amount),
      date: l.date.toISOString(),
      notes: l.notes,
    })),
  }));

  const raBillRows = pendingRaBills.map((b) => ({
    id: b.id,
    raBillNumber: b.raBillNumber,
    workOrderNumber: b.workOrder?.workOrderNumber ?? null,
    projectName: b.project?.name ?? null,
    grossAmount: toNum(b.grossAmount),
    netPayable: toNum(b.netPayable),
    retentionAmount: toNum(b.retentionAmount),
    tdsAmount: toNum(b.tdsAmount),
    advanceRecovery: toNum(b.advanceRecovery),
    otherDeductions: toNum(b.otherDeductions),
    periodFrom: b.periodFrom.toISOString(),
    periodTo: b.periodTo.toISOString(),
    submittedByName: b.submittedBy?.name ?? null,
    createdAt: b.createdAt.toISOString(),
    lines: b.lines.map((l) => ({
      item: l.boqItem?.description ?? "—",
      unit: l.boqItem?.unit ?? null,
      thisQty: toNum(l.thisQty),
      totalQty: toNum(l.totalQty),
      rate: toNum(l.rate),
      thisAmount: toNum(l.thisAmount),
    })),
  }));

  const leaveRows = pendingLeaves.map((l) => ({
    id: l.id,
    employeeName: l.employee?.name ?? "Worker",
    type: l.type,
    days: toNum(l.days),
    startDate: l.startDate.toISOString(),
    endDate: l.endDate.toISOString(),
    reason: l.reason,
    createdAt: l.createdAt.toISOString(),
  }));

  const offsiteCount = pendingOffsite.length;
  const offsiteNames = pendingOffsite.slice(0, 3).map((r) => r.employee?.name ?? "Worker");

  return (
    <div>
      {/* shell renders "Approvals" — the header carries the queue count */}
      <MobilePageHeader subtitle={`${poRows.length + reqRows.length + gatePassRows.length + dprRows.length + expenseRows.length + raBillRows.length + claimRows.length + leaveRows.length + offsiteCount} awaiting approval`} right={<MobileRefreshButton />} />
      <MobileApprovalsQueue purchaseOrders={poRows} requisitions={reqRows} gatePasses={gatePassRows} dprs={dprRows} expenses={expenseRows} raBills={raBillRows} expenseClaims={claimRows} leaves={leaveRows} offsiteCount={offsiteCount} offsiteNames={offsiteNames} />
    </div>
  );
}
