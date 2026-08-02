import { prisma, type RequisitionStatus } from "@nirman/db";
import Decimal from "decimal.js";
import { createPurchaseOrderTx } from "./procurement";
import { logAction } from "./audit";
import { evaluateRequisitionRouting, getCachedRoutingScope } from "./procurement-routing";

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

function generateReqNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `REQ-${ymd}-${rand}`;
}

interface CreateRequisitionInput {
  projectId: string;
  phaseId?: string;
  requestedById?: string;
  neededByDate?: Date;
  notes?: string;
  lines: {
    materialId: string;
    qtyRequested: Decimal | number | string;
    notes?: string;
  }[];
}

export async function createRequisition(input: CreateRequisitionInput) {
  if (input.lines.length === 0) throw new Error("Requisition must have at least one line");

  // Validate project
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, deletedAt: null },
  });
  if (!project) throw new Error("Project not found or deleted");

  // Validate materials
  const materialIds = input.lines.map((l) => l.materialId);
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds }, deletedAt: null },
  });
  if (materials.length !== materialIds.length) {
    throw new Error("One or more materials not found or deleted");
  }
  for (const line of input.lines) {
    if (!new Decimal(line.qtyRequested).gt(0)) throw new Error("Requested qty must be > 0");
  }

  // Validate requesting user exists (prevents FK violation on create)
  if (input.requestedById) {
    const user = await prisma.user.findUnique({ where: { id: input.requestedById }, select: { id: true } });
    if (!user) throw new Error("Requesting user not found — your session may be stale. Please sign out and sign in again.");
  }

  return prisma.$transaction(async (tx) => {
    const req = await tx.materialRequisition.create({
      data: {
        reqNumber: generateReqNumber(),
        projectId: input.projectId,
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
          })),
        },
      },
      include: { lines: true },
    });
    await logAction(tx, {
      userId: input.requestedById,
      action: "REQUISITION_CREATE",
      entityType: "MaterialRequisition",
      entityId: req.id,
      after: { reqNumber: req.reqNumber, status: req.status },
    });
    return req;
  });
}

export async function submitRequisition(reqId: string, userId?: string) {
  const updated = await prisma.$transaction(async (tx) => {
    const req = await tx.materialRequisition.findUnique({ where: { id: reqId } });
    if (!req) throw new Error("Requisition not found");
    if (req.status !== "DRAFT") throw new Error(`Cannot submit requisition in status ${req.status}`);
    const updated = await tx.materialRequisition.update({ where: { id: reqId }, data: { status: "SUBMITTED" } });
    await logAction(tx, {
      userId,
      action: "REQUISITION_SUBMIT",
      entityType: "MaterialRequisition",
      entityId: reqId,
      before: { status: req.status },
      after: { status: "SUBMITTED" },
    });
    return updated;
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

  return updated;
}

export async function approveRequisition(reqId: string, approvedById?: string, approvalNotes?: string) {
  return prisma.$transaction(async (tx) => {
    const req = await tx.materialRequisition.findUnique({ where: { id: reqId } });
    if (!req) throw new Error("Requisition not found");
    if (req.status !== "SUBMITTED") throw new Error(`Cannot approve requisition in status ${req.status}`);
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
      action: "REQUISITION_APPROVE",
      entityType: "MaterialRequisition",
      entityId: reqId,
      before: { status: req.status },
      after: { status: "APPROVED", approvedAt: updated.approvedAt },
    });
    return updated;
  });
}

export async function rejectRequisition(reqId: string, rejectedById?: string, rejectReason?: string) {
  return prisma.$transaction(async (tx) => {
    const req = await tx.materialRequisition.findUnique({ where: { id: reqId } });
    if (!req) throw new Error("Requisition not found");
    if (req.status !== "SUBMITTED") throw new Error(`Cannot reject requisition in status ${req.status}`);
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
      action: "REQUISITION_REJECT",
      entityType: "MaterialRequisition",
      entityId: reqId,
      before: { status: req.status },
      after: { status: "REJECTED", rejectReason },
    });
    return updated;
  });
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

  return prisma.$transaction(async (tx) => {
    const req = await tx.materialRequisition.findUnique({
      where: { id: input.requisitionId },
      include: { lines: true, project: true },
    });
    if (!req) throw new Error("Requisition not found");
    if (req.status !== "APPROVED") {
      throw new Error(`Cannot convert requisition in status ${req.status}. Must be APPROVED.`);
    }

    // Build PO lines from requisition lines
    const poLines = req.lines.map((line) => ({
      materialId: line.materialId,
      qtyOrdered: new Decimal(line.qtyRequested),
      unitCost: input.lineCosts[line.materialId] ?? 0,
    }));

    // Create the PO inside the SAME transaction — if this fails, the
    // requisition status update rolls back too (no stuck CONVERTED state).
    const po = await createPurchaseOrderTx(tx, {
      supplierId: input.supplierId,
      procurementScope,
      companyId: req.project.companyId,
      projectId: procurementScope === "PROJECT" ? req.projectId : undefined,
      destinationLocationId: input.destinationLocationId,
      expectedDate: input.expectedDate,
      notes: input.notes,
      lines: poLines,
    });

    // Mark requisition as CONVERTED + link to the PO — same transaction
    await tx.materialRequisition.update({
      where: { id: input.requisitionId },
      data: { status: "CONVERTED", convertedPoId: po.id },
    });

    return po;
  });
}
