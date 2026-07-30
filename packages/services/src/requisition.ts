import { prisma, type RequisitionStatus } from "@nirman/db";
import Decimal from "decimal.js";
import { createPurchaseOrder } from "./procurement";

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

  return prisma.materialRequisition.create({
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
}

export async function submitRequisition(reqId: string) {
  return prisma.$transaction(async (tx) => {
    const req = await tx.materialRequisition.findUnique({ where: { id: reqId } });
    if (!req) throw new Error("Requisition not found");
    if (req.status !== "DRAFT") throw new Error(`Cannot submit requisition in status ${req.status}`);
    return tx.materialRequisition.update({ where: { id: reqId }, data: { status: "SUBMITTED" } });
  });
}

export async function approveRequisition(reqId: string) {
  return prisma.$transaction(async (tx) => {
    const req = await tx.materialRequisition.findUnique({ where: { id: reqId } });
    if (!req) throw new Error("Requisition not found");
    if (req.status !== "SUBMITTED") throw new Error(`Cannot approve requisition in status ${req.status}`);
    return tx.materialRequisition.update({ where: { id: reqId }, data: { status: "APPROVED" } });
  });
}

export async function rejectRequisition(reqId: string) {
  return prisma.$transaction(async (tx) => {
    const req = await tx.materialRequisition.findUnique({ where: { id: reqId } });
    if (!req) throw new Error("Requisition not found");
    if (req.status !== "SUBMITTED") throw new Error(`Cannot reject requisition in status ${req.status}`);
    return tx.materialRequisition.update({ where: { id: reqId }, data: { status: "REJECTED" } });
  });
}

interface ConvertRequisitionInput {
  requisitionId: string;
  supplierId: string;
  procurementScope: "COMPANY" | "PROJECT";
  destinationLocationId: string;
  lineCosts: Record<string, Decimal | number | string>; // materialId → unitCost
  expectedDate?: Date;
  notes?: string;
}

export async function convertRequisitionToPo(input: ConvertRequisitionInput) {
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

    // Create the PO (outside this tx — createPurchaseOrder opens its own tx)
    // We need to do this carefully. Let's mark the requisition as CONVERTED first,
    // then create the PO in a separate call.
    await tx.materialRequisition.update({
      where: { id: input.requisitionId },
      data: { status: "CONVERTED" },
    });

    return {
      requisitionId: input.requisitionId,
      poLines,
      supplierId: input.supplierId,
      procurementScope: input.procurementScope,
      destinationLocationId: input.destinationLocationId,
      companyId: req.project.companyId,
      projectId: input.procurementScope === "PROJECT" ? req.projectId : undefined,
      expectedDate: input.expectedDate,
      notes: input.notes,
    };
  }).then(async (result) => {
    // Create the PO using the procurement service
    const po = await createPurchaseOrder({
      supplierId: result.supplierId,
      procurementScope: result.procurementScope,
      companyId: result.companyId,
      projectId: result.projectId,
      destinationLocationId: result.destinationLocationId,
      expectedDate: result.expectedDate,
      notes: result.notes,
      lines: result.poLines.map((l) => ({
        materialId: l.materialId,
        qtyOrdered: l.qtyOrdered,
        unitCost: l.unitCost,
      })),
    });

    // Link the requisition to the PO
    await prisma.materialRequisition.update({
      where: { id: result.requisitionId },
      data: { convertedPoId: po.id },
    });

    return po;
  });
}
