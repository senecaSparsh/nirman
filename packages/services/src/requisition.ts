import { prisma, type Prisma, type RequisitionStatus } from "@nirman/db";
import Decimal from "decimal.js";
import { createPurchaseOrderTx } from "./procurement";
import { logAction } from "./audit";
import { evaluateRequisitionRouting, getCachedRoutingScope } from "./procurement-routing";
import { isQuoteGateSatisfied } from "./quote-comparison";
import { ServiceError } from "./errors";
import { emitNotificationEvent, NotificationEventType } from "./notification-event-bus";

/**
 * Requisition Service — material request → approval → convert to PO.
 *
 * Flow: DRAFT → SUBMITTED → APPROVED → CONVERTED (creates a PO)
 *                   ↓
 *                REJECTED
 *
 * This is the planning layer. Site engineers raise requisitions based on project
 * schedules. Managers approve. Approved requisitions convert to Purchase Orders.
 */

async function generateReqNumber(tx: Prisma.TransactionClient): Promise<string> {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `REQ-${ymd}-`;
  const count = await tx.materialRequisition.count({ where: { reqNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

interface CreateRequisitionInput {
  companyId: string;
  projectId?: string;          // optional — for department-scoped requisitions
  departmentId?: string;       // set when the requisition is for a department (cost center)
  phaseId?: string;
  requestedById?: string;
  neededByDate?: Date;
  notes?: string;
  lines: {
    materialId: string;
    qtyRequested: Decimal | number | string;
    notes?: string;
    preferredSupplierId?: string;
  }[];
}

export async function createRequisition(input: CreateRequisitionInput) {
  if (input.lines.length === 0) throw new ServiceError("Requisition must have at least one line");
  if (!input.projectId && !input.departmentId) {
    throw new ServiceError("Either projectId or departmentId must be set", 400);
  }

  // Validate project (if provided)
  let project: { id: string; companyId: string } | null = null;
  if (input.projectId) {
    project = await prisma.project.findFirst({
      where: { id: input.projectId, companyId: input.companyId, deletedAt: null },
      select: { id: true, companyId: true },
    });
    if (!project) throw new ServiceError("Project not found or deleted", 404);
  }

  // Validate department (if provided)
  if (input.departmentId) {
    const dept = await prisma.department.findFirst({
      where: { id: input.departmentId, companyId: input.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!dept) throw new ServiceError("Department not found or deleted", 404);
  }

  // Use the project's companyId or the input companyId for stock scoping
  const scopeCompanyId = project?.companyId ?? input.companyId;

  // Validate materials
  const materialIds = input.lines.map((l) => l.materialId);
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds }, deletedAt: null },
  });
  if (materials.length !== materialIds.length) {
    throw new ServiceError("One or more materials not found or deleted", 404);
  }
  for (const line of input.lines) {
    if (!new Decimal(line.qtyRequested).gt(0)) throw new ServiceError("Requested qty must be > 0");
  }

  // Validate requesting user exists (prevents FK violation on create)
  if (input.requestedById) {
    const user = await prisma.user.findUnique({ where: { id: input.requestedById }, select: { id: true } });
    if (!user) throw new ServiceError("Requesting user not found — your session may be stale. Please sign out and sign in again.", 404);
  }

  // ── Demand-slip enrichment: snapshot current stock + last purchase rate ──
  // For each material, look up the total stock-on-hand and the most recent
  // goods receipt line (which gives the last rate + date). These snapshots
  // are stored on the requisition line so the approver sees what the requester
  // saw — even if stock or rates change before approval.
  const stockSnapshots = await prisma.stockLocationItem.groupBy({
    by: ["materialId"],
    where: { materialId: { in: materialIds }, location: { companyId: scopeCompanyId, deletedAt: null } },
    _sum: { qty: true },
  });
  const stockMap = new Map(stockSnapshots.map((s) => [s.materialId, s._sum.qty ?? new Decimal(0)]));

  // Last purchase rate: find the most recent GoodsReceiptLine for each material
  // (scoped to this company's stock locations to prevent cross-company leaks)
  const lastReceipts = await prisma.goodsReceiptLine.findMany({
    where: {
      materialId: { in: materialIds },
      goodsReceipt: { location: { companyId: scopeCompanyId } },
    },
    include: { goodsReceipt: { select: { receiptDate: true } } },
    orderBy: { goodsReceipt: { receiptDate: "desc" } },
    distinct: ["materialId"],
  });
  const lastRateMap = new Map(lastReceipts.map((r) => [r.materialId, { rate: r.unitCost, date: r.goodsReceipt.receiptDate }]));

  return prisma.$transaction(async (tx) => {
    const req = await tx.materialRequisition.create({
      data: {
        reqNumber: await generateReqNumber(tx),
        projectId: input.projectId ?? null,
        departmentId: input.departmentId ?? null,
        phaseId: input.phaseId,
        requestedById: input.requestedById,
        neededByDate: input.neededByDate,
        notes: input.notes,
        status: "DRAFT",
        lines: {
          create: input.lines.map((l) => ({
            materialId: l.materialId,
            qtyRequested: new Decimal(l.qtyRequested),
            notes: l.notes,
            preferredSupplierId: l.preferredSupplierId,
            currentStock: stockMap.get(l.materialId) ?? new Decimal(0),
            lastRate: lastRateMap.get(l.materialId)?.rate ?? null,
            lastRateDate: lastRateMap.get(l.materialId)?.date ?? null,
          })),
        },
      },
      include: { lines: { include: { material: true, preferredSupplier: true } } },
    });
    await logAction(tx, {
      userId: input.requestedById,
      companyId: scopeCompanyId,
      action: "REQUISITION_CREATE",
      entityType: "MaterialRequisition",
      entityId: req.id,
      after: { reqNumber: req.reqNumber, status: req.status },
    });
    return req;
  });
}

export async function submitRequisition(reqId: string, userId?: string) {
  const { updated, companyId } = await prisma.$transaction(async (tx) => {
    const req = await tx.materialRequisition.findUnique({
      where: { id: reqId },
      include: {
        project: { select: { companyId: true } },
        department: { select: { companyId: true } },
      },
    });
    if (!req) throw new ServiceError("Requisition not found", 404);
    if (req.status !== "DRAFT") throw new ServiceError(`Cannot submit requisition in status ${req.status}`);
    const reqCompanyId = req.project?.companyId ?? req.department?.companyId;
    if (!reqCompanyId) throw new ServiceError("Requisition has no project or department", 400);
    const updated = await tx.materialRequisition.update({ where: { id: reqId }, data: { status: "SUBMITTED" } });
    await logAction(tx, {
      userId,
      companyId: reqCompanyId,
      action: "REQUISITION_SUBMIT",
      entityType: "MaterialRequisition",
      entityId: reqId,
      before: { status: req.status },
      after: { status: "SUBMITTED" },
    });
    return { updated, companyId: reqCompanyId };
  });

  // Logistics Decision Engine — evaluate routing on submit so the approver sees
  // the recommended procurement scope (COMPANY vs PROJECT). Runs after the status
  // transition commits; a routing failure must not block submission.
  try {
    await evaluateRequisitionRouting(reqId);
  } catch (err) {
    // Non-fatal: routing is a recommendation, not a gate. Log and continue.
    console.error(`[lci] evaluateRequisitionRouting failed for ${reqId}:`, err);
  }

  void emitNotificationEvent({
    eventType: NotificationEventType.REQUISITION_SUBMITTED,
    companyId,
    entityType: "MaterialRequisition",
    entityId: reqId,
    variables: { requisitionId: reqId },
    timestamp: new Date(),
  });

  return updated;
}

export async function approveRequisition(reqId: string, approvedById?: string, approvalNotes?: string) {
  const { updated, companyId } = await prisma.$transaction(async (tx) => {
    const req = await tx.materialRequisition.findUnique({
      where: { id: reqId },
      include: {
        project: { select: { companyId: true } },
        department: { select: { companyId: true } },
      },
    });
    if (!req) throw new ServiceError("Requisition not found", 404);
    if (req.status !== "SUBMITTED") throw new ServiceError(`Cannot approve requisition in status ${req.status}`);
    const reqCompanyId = req.project?.companyId ?? req.department?.companyId;
    if (!reqCompanyId) throw new ServiceError("Requisition has no project or department", 400);
    const updated = await tx.materialRequisition.update({
      where: { id: reqId },
      data: {
        status: "APPROVED",
        approvedById,
        approvedAt: new Date(),
        approvalNotes,
      },
    });
    await logAction(tx, {
      userId: approvedById,
      companyId: reqCompanyId,
      action: "REQUISITION_APPROVE",
      entityType: "MaterialRequisition",
      entityId: reqId,
      before: { status: req.status },
      after: { status: "APPROVED", approvedAt: updated.approvedAt },
    });
    return { updated, companyId: reqCompanyId };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.REQUISITION_APPROVED,
    companyId,
    entityType: "MaterialRequisition",
    entityId: reqId,
    variables: { requisitionId: reqId },
    timestamp: new Date(),
  });

  return updated;
}

export async function rejectRequisition(reqId: string, rejectedById?: string, rejectReason?: string) {
  const { updated, companyId } = await prisma.$transaction(async (tx) => {
    const req = await tx.materialRequisition.findUnique({
      where: { id: reqId },
      include: {
        project: { select: { companyId: true } },
        department: { select: { companyId: true } },
      },
    });
    if (!req) throw new ServiceError("Requisition not found", 404);
    if (req.status !== "SUBMITTED") throw new ServiceError(`Cannot reject requisition in status ${req.status}`);
    const reqCompanyId = req.project?.companyId ?? req.department?.companyId;
    if (!reqCompanyId) throw new ServiceError("Requisition has no project or department", 400);
    const updated = await tx.materialRequisition.update({
      where: { id: reqId },
      data: {
        status: "REJECTED",
        rejectedById,
        rejectedAt: new Date(),
        rejectReason,
      },
    });
    await logAction(tx, {
      userId: rejectedById,
      companyId: reqCompanyId,
      action: "REQUISITION_REJECT",
      entityType: "MaterialRequisition",
      entityId: reqId,
      before: { status: req.status },
      after: { status: "REJECTED", rejectReason },
    });
    return { updated, companyId: reqCompanyId };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.REQUISITION_REJECTED,
    companyId,
    entityType: "MaterialRequisition",
    entityId: reqId,
    variables: { requisitionId: reqId, reason: rejectReason ?? "" },
    timestamp: new Date(),
  });

  return updated;
}

interface ConvertRequisitionInput {
  requisitionId: string;
  supplierId: string;
  /** Procurement scope. If omitted, the Logistics Decision Engine's cached
   *  recommendation (MaterialRequisition.lciDecision.recommendedScope) is used,
   *  falling back to PROJECT. Pass explicitly to override the engine. */
  procurementScope?: "COMPANY" | "PROJECT";
  destinationLocationId: string;
  lineCosts: Record<string, Decimal | number | string>; // materialId → unitCost
  expectedDate?: Date;
  notes?: string;
  /** Distance vendor→site (km). If provided, re-evaluates routing with this input
   *  before deciding scope (refines S_lead/D once a supplier is known). */
  distanceKm?: Decimal | number | string;
  userId?: string;
}

export async function convertRequisitionToPo(input: ConvertRequisitionInput) {
  // Resolve procurement scope BEFORE opening the convert transaction — the
  // Logistics Decision Engine uses the global prisma client, not the tx.
  // Explicit override → re-evaluate now that supplier is known → cached LCI → PROJECT.
  let procurementScope: "COMPANY" | "PROJECT";
  if (input.procurementScope) {
    procurementScope = input.procurementScope;
  } else {
    let resolved: "COMPANY" | "PROJECT" | null = null;
    try {
      const decision = await evaluateRequisitionRouting(input.requisitionId, {
        supplierId: input.supplierId,
        distanceKm: input.distanceKm,
      });
      resolved = decision.recommendedScope;
    } catch (err) {
      console.error(`[lci] re-evaluate failed for ${input.requisitionId}:`, err);
      resolved = await getCachedRoutingScope(input.requisitionId).catch(() => null);
    }
    procurementScope = resolved ?? "PROJECT";
  }

  // ── Comparative Quote Engine gate ──
  // Enforce the min-quotes requirement before allowing conversion. The gate
  // is satisfied if there are ≥ minQuotesRequired non-rejected quotes OR the
  // requirement has been waived by an approver. Also fetch the winning quote
  // (if selected) to auto-fill line costs and link the PO to it.
  const quoteSummary = await prisma.vendorQuote.groupBy({
    by: ["status"],
    where: { requisitionId: input.requisitionId },
    _count: true,
  });
  const nonRejectedCount = quoteSummary
    .filter((q) => q.status !== "REJECTED")
    .reduce((s, q) => s + q._count, 0);
  const reqForGate = await prisma.materialRequisition.findUnique({
    where: { id: input.requisitionId },
    select: { minQuotesRequired: true, quotesWaived: true },
  });
  if (reqForGate && !isQuoteGateSatisfied(nonRejectedCount, reqForGate.minQuotesRequired, reqForGate.quotesWaived)) {
    throw new ServiceError(
      `Quote gate not satisfied: ${nonRejectedCount}/${reqForGate.minQuotesRequired} quotes uploaded. ` +
      `Upload more quotes or waive the requirement (requires approver).`,
    );
  }

  // Fetch the winning quote (if any) to link the PO + auto-fill costs
  const winningQuote = await prisma.vendorQuote.findFirst({
    where: { requisitionId: input.requisitionId, status: "SELECTED" },
    include: { lines: true },
  });

  const { po, companyId } = await prisma.$transaction(async (tx) => {
    const req = await tx.materialRequisition.findUnique({
      where: { id: input.requisitionId },
      include: { lines: true, project: true, department: { select: { companyId: true } } },
    });
    if (!req) throw new ServiceError("Requisition not found", 404);
    if (req.status !== "APPROVED") {
      throw new ServiceError(`Cannot convert requisition in status ${req.status}. Must be APPROVED.`);
    }
    if (req.convertedPoId) {
      throw new ServiceError("Requisition has already been converted to a PO.");
    }
    // Resolve companyId from project or department (one must exist)
    const reqCompanyId = req.project?.companyId ?? req.department?.companyId;
    if (!reqCompanyId) throw new ServiceError("Requisition has no project or department — cannot determine company", 400);

    // Build PO lines from requisition lines. If a winning quote exists, auto-fill
    // costs from it (overriding manual lineCosts). Otherwise use manual lineCosts.
    const winningCostMap = new Map(
      winningQuote ? winningQuote.lines.map((l) => [l.materialId, new Decimal(l.unitPrice)]) : [],
    );
    const poLines = req.lines.map((line) => ({
      materialId: line.materialId,
      qtyOrdered: new Decimal(line.qtyRequested),
      unitCost: winningCostMap.get(line.materialId) ?? new Decimal(input.lineCosts[line.materialId] ?? 0),
    }));

    // Create the PO inside the SAME transaction — if this fails, the
    // requisition status update rolls back too (no stuck CONVERTED state).
    const po = await createPurchaseOrderTx(tx, {
      supplierId: input.supplierId,
      procurementScope,
      companyId: reqCompanyId,
      projectId: procurementScope === "PROJECT" ? req.projectId ?? undefined : undefined,
      destinationLocationId: input.destinationLocationId,
      expectedDate: input.expectedDate,
      notes: input.notes,
      lines: poLines,
    });

    // Link the PO to the winning quote (if any) + mark requisition CONVERTED
    await tx.materialRequisition.update({
      where: { id: input.requisitionId },
      data: {
        status: "CONVERTED",
        convertedPoId: po.id,
        ...(winningQuote ? { } : {}),
      },
    });
    if (winningQuote) {
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { selectedQuoteId: winningQuote.id },
      });
    }

    await logAction(tx, {
      userId: input.userId,
      companyId: reqCompanyId,
      action: "REQUISITION_CONVERT",
      entityType: "MaterialRequisition",
      entityId: input.requisitionId,
      before: { status: "APPROVED" },
      after: { status: "CONVERTED", purchaseOrderId: po.id, winningQuoteId: winningQuote?.id ?? null },
    });

    return { po, companyId: reqCompanyId };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.REQUISITION_CONVERTED_TO_PO,
    companyId,
    entityType: "MaterialRequisition",
    entityId: input.requisitionId,
    variables: { requisitionId: input.requisitionId, poId: po.id, poNumber: po.poNumber ?? po.id },
    timestamp: new Date(),
  });

  return po;
}
