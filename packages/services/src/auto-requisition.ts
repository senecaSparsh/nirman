import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { lowStockAlerts } from "./alerts";
import { ServiceError } from "./errors";

/**
 * Auto-Requisition Service — operationalize the reorderPoint / EOQ fields.
 *
 * When a material's total stock across all non-deleted locations drops to or below
 * its reorderPoint, the system can automatically raise a DRAFT Material Requisition
 * so a human approver just has to review and submit it. This closes the loop between
 * the analytical lowStockAlerts() and the procurement workflow:
 *
 *     stock ≤ reorderPoint  →  auto-requisition (DRAFT)  →  human submit  →  approve  →  PO
 *
 * De-duplication: a material is skipped if it already appears on an open requisition
 * (DRAFT / SUBMITTED / APPROVED) for the same project, so repeated runs don't pile up
 * duplicate requests. REJECTED requisitions don't count — a re-order after a reject
 * is legitimate.
 *
 * Quantity logic:
 *   - If economicOrderQty is set on the material → use it (the optimal order quantity).
 *   - Else replenish-to-twice-reorder: qty = (2 × reorderPoint) − currentStock, floored at 1.
 *     This restocks to a comfortable buffer above the trigger.
 *
 * The requisition is created in DRAFT status — a human still reviews/submits it.
 * Automation raises the request; humans approve the spend. That's the right boundary.
 */

export interface AutoRequisitionResult {
  requisitionId: string;
  reqNumber: string;
  lineCount: number;
  lines: {
    materialId: string;
    code: string;
    name: string;
    qtyRequested: Decimal;
    reason: "below_reorder" | "below_min";
  }[];
  skipped: { materialId: string; code: string; name: string; reason: string }[];
}

export async function generateAutoRequisition(opts: {
  companyId: string;
  projectId: string;
  createdByById?: string;
  neededByDate?: Date;
}): Promise<AutoRequisitionResult | null> {
  const { companyId, projectId, createdByById, neededByDate } = opts;

  // 1. Validate project belongs to the company and is active-ish (not COMPLETED/ON_HOLD
  //    — you don't replenish a finished project).
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId, deletedAt: null },
  });
  if (!project) throw new ServiceError("Project not found or doesn't belong to this company", 404);
  if (project.status === "COMPLETED" || project.status === "ON_HOLD") {
    throw new ServiceError(`Cannot generate auto-requisitions for a ${project.status} project`);
  }

  // 2. Detect low-stock materials across the company.
  const alerts = await lowStockAlerts(companyId);
  if (alerts.length === 0) return null;

  // 3. Find materials that already have an OPEN requisition for this project — skip them.
  const candidateMaterialIds = alerts.map((a) => a.materialId);
  const openRequisitionLines = await prisma.materialRequisitionLine.findMany({
    where: {
      materialId: { in: candidateMaterialIds },
      requisition: {
        projectId,
        status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] },
      },
    },
    select: { materialId: true },
  });
  const alreadyRequisitioned = new Set(openRequisitionLines.map((l) => l.materialId));

  // 4. Build the line list with EOQ / replenish-to-buffer qty.
  const lines: AutoRequisitionResult["lines"] = [];
  const skipped: AutoRequisitionResult["skipped"] = [];

  for (const alert of alerts) {
    if (alreadyRequisitioned.has(alert.materialId)) {
      skipped.push({
        materialId: alert.materialId,
        code: alert.code,
        name: alert.name,
        reason: "Open requisition already exists for this material",
      });
      continue;
    }

    let qty: Decimal;
    if (alert.suggestedOrderQty && alert.suggestedOrderQty.gt(0)) {
      // EOQ is the optimal order quantity — use it when configured.
      qty = alert.suggestedOrderQty;
    } else {
      // Replenish to 2× reorderPoint (a comfortable buffer above the trigger).
      const target = alert.reorderPoint.times(2);
      qty = target.minus(alert.totalStock);
      if (qty.lte(0)) qty = new Decimal(1); // edge: stock exactly at 2× reorder
    }

    lines.push({
      materialId: alert.materialId,
      code: alert.code,
      name: alert.name,
      qtyRequested: qty,
      reason: alert.isCritical ? "below_min" : "below_reorder",
    });
  }

  if (lines.length === 0) {
    // Everything was already covered by an open requisition.
    return { requisitionId: "", reqNumber: "", lineCount: 0, lines: [], skipped };
  }

  // 5. Create the DRAFT requisition (one per call, batching all due materials).
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  const reqNumber = `AREQ-${ymd}-${rand}`;

  const created = await prisma.$transaction(async (tx) => {
    const req = await tx.materialRequisition.create({
      data: {
        reqNumber,
        projectId,
        requestedById: createdByById,
        neededByDate,
        notes: `Auto-generated from reorder-point breach. ${lines.length} material(s) at or below reorder point.`,
        status: "DRAFT",
        lines: {
          create: lines.map((l) => ({
            materialId: l.materialId,
            qtyRequested: l.qtyRequested,
            notes: l.reason === "below_min" ? "Below minimum stock" : "Below reorder point",
          })),
        },
      },
      include: { lines: true },
    });
    await logAction(tx, {
      userId: createdByById,
      action: "AUTO_REQUISITION_GENERATE",
      entityType: "MaterialRequisition",
      entityId: req.id,
      after: {
        reqNumber: req.reqNumber,
        status: "DRAFT",
        lineCount: lines.length,
        autoGenerated: true,
        materials: lines.map((l) => ({ code: l.code, qty: l.qtyRequested.toString() })),
      },
    });
    return req;
  });

  return {
    requisitionId: created.id,
    reqNumber: created.reqNumber,
    lineCount: lines.length,
    lines,
    skipped,
  };
}
