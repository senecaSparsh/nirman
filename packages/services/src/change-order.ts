import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";
import { withSerializableTransaction } from "./transaction";
import { nextSequenceNumber, companyScopedPrefix } from "./sequence";
import { canAutoApprove } from "./rbac";
import { emitNotificationEvent, NotificationEventType } from "./notification-event-bus";

/**
 * Change Order Service — formal modifications to project scope, BOQ, budget, or schedule.
 *
 * Lifecycle:
 *   DRAFT → SUBMITTED → APPROVED → IMPLEMENTED
 *                       ↘ REJECTED → (revise) → SUBMITTED
 *   DRAFT → CANCELLED
 *
 * A Change Order captures:
 * - WHAT changed (type: ADDITION, DELETION, MODIFICATION, etc.)
 * - WHY it changed (reason: CLIENT_REQUEST, SITE_CONDITION, etc.)
 * - Cost impact (per-line original vs revised qty × rate → cost delta)
 * - Schedule impact (days added/removed)
 * - Client + internal approval workflow
 *
 * On IMPLEMENTED, the change order can optionally:
 * - Update linked BoqItem qty/rate (for MODIFICATION type)
 * - Add new BoqItems (for ADDITION type)
 * - Update Project.totalBudget with the cost delta
 */

// ── Types ──────────────────────────────────────────────────

export type ChangeOrderType =
  | "ADDITION"
  | "DELETION"
  | "MODIFICATION"
  | "ACCELERATION"
  | "DECELERATION"
  | "VARIATION";

export type ChangeOrderReason =
  | "CLIENT_REQUEST"
  | "SITE_CONDITION"
  | "DESIGN_CHANGE"
  | "ERROR_OMISSION"
  | "REGULATORY"
  | "VALUE_ENGINEERING"
  | "OTHER";

export type ChangeOrderStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "IMPLEMENTED"
  | "CANCELLED";

export interface ChangeOrderLineInput {
  boqItemId?: string | null;
  description: string;
  originalQty?: Decimal | number | string;
  revisedQty?: Decimal | number | string;
  unit: string;
  rate: Decimal | number | string;
  notes?: string | null;
  sortOrder?: number;
}

export interface CreateChangeOrderInput {
  projectId: string;
  phaseId?: string | null;
  title: string;
  description: string;
  type?: ChangeOrderType;
  reason?: ChangeOrderReason;
  scheduleDeltaDays?: number;
  clientApprovalRequired?: boolean;
  initiatedBy?: string | null;
  notes?: string | null;
  lines: ChangeOrderLineInput[];
  userId?: string;
  /** Caller's company — when provided, the target project must belong to it. */
  companyId?: string;
}

export interface UpdateChangeOrderInput {
  title?: string;
  description?: string;
  type?: ChangeOrderType;
  reason?: ChangeOrderReason;
  scheduleDeltaDays?: number;
  clientApprovalRequired?: boolean;
  initiatedBy?: string | null;
  notes?: string | null;
  lines?: ChangeOrderLineInput[];
  userId?: string;
}

// ── Number generation ──────────────────────────────────────

async function generateChangeOrderNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
): Promise<string> {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = await companyScopedPrefix(tx, companyId, `CO-${ymd}-`);
  return nextSequenceNumber(tx, prefix, 4);
}

// ── Line computation ───────────────────────────────────────

interface ComputedLine {
  originalAmount: Decimal;
  revisedAmount: Decimal;
  amountDelta: Decimal;
}

export function computeLine(
  originalQty: Decimal,
  revisedQty: Decimal,
  rate: Decimal,
): ComputedLine {
  const originalAmount = originalQty.times(rate).toDecimalPlaces(2);
  const revisedAmount = revisedQty.times(rate).toDecimalPlaces(2);
  const amountDelta = revisedAmount.minus(originalAmount).toDecimalPlaces(2);
  return { originalAmount, revisedAmount, amountDelta };
}

export function computeTotals(lines: ChangeOrderLineInput[]) {
  let originalAmount = new Decimal(0);
  let revisedAmount = new Decimal(0);
  let costDelta = new Decimal(0);
  for (const line of lines) {
    const oq = new Decimal(line.originalQty ?? 0);
    const rq = new Decimal(line.revisedQty ?? 0);
    const rate = new Decimal(line.rate);
    const c = computeLine(oq, rq, rate);
    originalAmount = originalAmount.plus(c.originalAmount);
    revisedAmount = revisedAmount.plus(c.revisedAmount);
    costDelta = costDelta.plus(c.amountDelta);
  }
  return {
    originalAmount: originalAmount.toDecimalPlaces(2),
    revisedAmount: revisedAmount.toDecimalPlaces(2),
    costDelta: costDelta.toDecimalPlaces(2),
  };
}

// ── Validation ─────────────────────────────────────────────

export function validateLines(lines: ChangeOrderLineInput[]) {
  if (!lines || lines.length === 0) {
    throw new ServiceError("At least one change order line is required", 400);
  }
  for (const line of lines) {
    if (!line.description?.trim()) {
      throw new ServiceError("Each change order line requires a description", 400);
    }
    if (!line.unit?.trim()) {
      throw new ServiceError(`Line "${line.description}": unit is required`, 400);
    }
    const rate = new Decimal(line.rate);
    if (rate.lt(0)) {
      throw new ServiceError(`Line "${line.description}": rate cannot be negative`, 400);
    }
    const oq = new Decimal(line.originalQty ?? 0);
    const rq = new Decimal(line.revisedQty ?? 0);
    if (oq.lt(0) || rq.lt(0)) {
      throw new ServiceError(`Line "${line.description}": quantities cannot be negative`, 400);
    }
  }
}

/**
 * Every line's boqItemId must resolve to a BOQ item inside the change
 * order's own project. Without this check a caller can pin a foreign
 * project's BOQ item onto the line — implementChangeOrder would then
 * rewrite the other tenant's estimatedQty/rate, and getChangeOrder's
 * `boqItem` include would leak its details back to the caller.
 */
async function assertLineBoqItems(
  tx: Prisma.TransactionClient,
  lines: ChangeOrderLineInput[],
  projectId: string,
) {
  const ids = [...new Set(lines.map((l) => l.boqItemId).filter((x): x is string => !!x))];
  if (ids.length === 0) return;
  const found = await tx.boqItem.findMany({
    where: { id: { in: ids }, projectId },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    throw new ServiceError("BOQ item not found in this project", 404);
  }
}

// ── CRUD ───────────────────────────────────────────────────

export async function createChangeOrder(input: CreateChangeOrderInput) {
  return withSerializableTransaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
      include: { company: { select: { id: true } } },
    });
    if (!project) throw new ServiceError("Project not found", 404);
    // Tenant seal: the change order is written under the project's company —
    // it must be the caller's company, otherwise the record lands in another
    // tenant's books (same class as the asset-sale seal).
    if (input.companyId && project.company.id !== input.companyId) {
      throw new ServiceError("Project not found in this company", 404);
    }

    validateLines(input.lines);
    // Decoy-id guard: every line's boqItemId must belong to THIS project —
    // otherwise implementChangeOrder would rewrite a foreign project's BOQ
    // and getChangeOrder would leak its details.
    await assertLineBoqItems(tx, input.lines, input.projectId);
    const totals = computeTotals(input.lines);
    const changeOrderNo = await generateChangeOrderNumber(tx, project.company.id);

    const co = await tx.changeOrder.create({
      data: {
        companyId: project.company.id,
        projectId: input.projectId,
        phaseId: input.phaseId ?? null,
        changeOrderNo,
        title: input.title,
        description: input.description,
        type: input.type ?? "MODIFICATION",
        reason: input.reason ?? "OTHER",
        status: "DRAFT",
        originalAmount: totals.originalAmount.toString(),
        revisedAmount: totals.revisedAmount.toString(),
        costDelta: totals.costDelta.toString(),
        scheduleDeltaDays: input.scheduleDeltaDays ?? 0,
        clientApprovalRequired: input.clientApprovalRequired ?? true,
        initiatedBy: input.initiatedBy ?? null,
        notes: input.notes ?? null,
        lines: {
          create: input.lines.map((line, i) => {
            const oq = new Decimal(line.originalQty ?? 0);
            const rq = new Decimal(line.revisedQty ?? 0);
            const rate = new Decimal(line.rate);
            const c = computeLine(oq, rq, rate);
            return {
              boqItemId: line.boqItemId ?? null,
              description: line.description,
              originalQty: oq.toDecimalPlaces(3).toString(),
              revisedQty: rq.toDecimalPlaces(3).toString(),
              unit: line.unit,
              rate: rate.toDecimalPlaces(2).toString(),
              originalAmount: c.originalAmount.toString(),
              revisedAmount: c.revisedAmount.toString(),
              amountDelta: c.amountDelta.toString(),
              notes: line.notes ?? null,
              sortOrder: line.sortOrder ?? i,
            };
          }),
        },
      },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "CHANGE_ORDER_CREATE",
        entityType: "ChangeOrder",
        entityId: co.id,
        after: { changeOrderNo, projectId: input.projectId, costDelta: totals.costDelta.toString(), lineCount: input.lines.length },
      });
    }

    return co;
  });
}

export async function getChangeOrders(projectId?: string, status?: ChangeOrderStatus) {
  const where: Prisma.ChangeOrderWhereInput = {};
  if (projectId) where.projectId = projectId;
  if (status) where.status = status;
  return prisma.changeOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
    take: 100,
  });
}

export async function getChangeOrder(id: string) {
  const co = await prisma.changeOrder.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true, totalBudget: true } },
      phase: { select: { id: true, name: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        include: {
          boqItem: { select: { id: true, serialNo: true, description: true, unit: true, estimatedQty: true, rate: true } },
        },
      },
      submittedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      implementedBy: { select: { id: true, name: true } },
    },
  });
  return co;
}

export async function updateChangeOrder(id: string, input: UpdateChangeOrderInput) {
  return withSerializableTransaction(async (tx) => {
    const existing = await tx.changeOrder.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("Change order not found", 404);
    if (existing.status !== "DRAFT" && existing.status !== "REJECTED") {
      throw new ServiceError(`Cannot edit change order in ${existing.status} status`, 400);
    }

    const data: Prisma.ChangeOrderUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.type !== undefined) data.type = input.type;
    if (input.reason !== undefined) data.reason = input.reason;
    if (input.scheduleDeltaDays !== undefined) data.scheduleDeltaDays = input.scheduleDeltaDays;
    if (input.clientApprovalRequired !== undefined) data.clientApprovalRequired = input.clientApprovalRequired;
    if (input.initiatedBy !== undefined) data.initiatedBy = input.initiatedBy ?? null;
    if (input.notes !== undefined) data.notes = input.notes ?? null;

    if (input.lines !== undefined) {
      validateLines(input.lines);
      await assertLineBoqItems(tx, input.lines, existing.projectId);
      const totals = computeTotals(input.lines);
      data.originalAmount = totals.originalAmount.toString();
      data.revisedAmount = totals.revisedAmount.toString();
      data.costDelta = totals.costDelta.toString();

      await tx.changeOrderLine.deleteMany({ where: { changeOrderId: id } });
      data.lines = {
        create: input.lines.map((line, i) => {
          const oq = new Decimal(line.originalQty ?? 0);
          const rq = new Decimal(line.revisedQty ?? 0);
          const rate = new Decimal(line.rate);
          const c = computeLine(oq, rq, rate);
          return {
            boqItemId: line.boqItemId ?? null,
            description: line.description,
            originalQty: oq.toDecimalPlaces(3).toString(),
            revisedQty: rq.toDecimalPlaces(3).toString(),
            unit: line.unit,
            rate: rate.toDecimalPlaces(2).toString(),
            originalAmount: c.originalAmount.toString(),
            revisedAmount: c.revisedAmount.toString(),
            amountDelta: c.amountDelta.toString(),
            notes: line.notes ?? null,
            sortOrder: line.sortOrder ?? i,
          };
        }),
      };
    }

    const updated = await tx.changeOrder.update({
      where: { id },
      data,
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "CHANGE_ORDER_UPDATE",
        entityType: "ChangeOrder",
        entityId: id,
        after: { title: updated.title, costDelta: updated.costDelta.toString() },
      });
    }

    return updated;
  });
}

// ── Workflow actions ───────────────────────────────────────

export async function submitChangeOrder(id: string, userId: string) {
  const submitVars = { changeOrderNo: "", title: "", costDelta: "", companyId: "" };
  const updated = await withSerializableTransaction(async (tx) => {
    const co = await tx.changeOrder.findUnique({ where: { id } });
    if (!co) throw new ServiceError("Change order not found", 404);
    if (co.status !== "DRAFT" && co.status !== "REJECTED") {
      throw new ServiceError(`Cannot submit change order in ${co.status} status`, 400);
    }

    const updated = await tx.changeOrder.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        submittedById: userId,
        submittedAt: new Date(),
        rejectReason: null,
      },
    });

    await logAction(tx, {
      userId,
      action: "CHANGE_ORDER_SUBMIT",
      entityType: "ChangeOrder",
      entityId: id,
      after: { changeOrderNo: co.changeOrderNo, status: "SUBMITTED" },
    });

    submitVars.changeOrderNo = co.changeOrderNo;
    submitVars.title = co.title;
    submitVars.costDelta = co.costDelta?.toString() ?? "";
    submitVars.companyId = co.companyId;
    return updated;
  });

  // Tell the approvers — tier-2+ gets CO_SUBMITTED. Submitter excluded.
  if (submitVars.companyId) {
    void emitNotificationEvent({
      eventType: NotificationEventType.CO_SUBMITTED,
      companyId: submitVars.companyId,
      excludeIds: [userId],
      entityType: "ChangeOrder",
      entityId: id,
      variables: submitVars,
      timestamp: new Date(),
    });
  }
  return updated;
}

export async function approveChangeOrder(
  id: string,
  userId: string,
  clientApprovedBy?: string,
  actorRole?: string,
) {
  const approveVars = { submittedById: null as string | null, changeOrderNo: "", companyId: "" };
  const updated = await withSerializableTransaction(async (tx) => {
    const co = await tx.changeOrder.findUnique({ where: { id } });
    if (!co) throw new ServiceError("Change order not found", 404);
    if (co.status !== "SUBMITTED") {
      throw new ServiceError(`Cannot approve change order in ${co.status} status`, 400);
    }

    // Prevent self-approval — the submitter cannot approve their own change
    // order — unless a tier-1 role (OWNER/ADMIN), where no higher approver exists.
    if (co.submittedById && co.submittedById === userId && !canAutoApprove(actorRole)) {
      throw new ServiceError("You cannot approve a change order you submitted. Ask another approver to review it.", 403);
    }

    // If client approval is required, clientApprovedBy must be provided
    if (co.clientApprovalRequired && !clientApprovedBy?.trim()) {
      throw new ServiceError("Client approval name is required for this change order", 400);
    }

    const updated = await tx.changeOrder.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById: userId,
        approvedAt: new Date(),
        clientApprovedBy: clientApprovedBy ?? null,
        clientApprovedAt: clientApprovedBy ? new Date() : null,
      },
    });

    await logAction(tx, {
      userId,
      action: "CHANGE_ORDER_APPROVE",
      entityType: "ChangeOrder",
      entityId: id,
      after: { changeOrderNo: co.changeOrderNo, status: "APPROVED", clientApprovedBy: clientApprovedBy ?? null },
    });

    approveVars.submittedById = co.submittedById;
    approveVars.changeOrderNo = co.changeOrderNo;
    approveVars.companyId = co.companyId;
    return updated;
  });

  // Auto-implement: the approval IS the decision to change scope/budget.
  // Apply the changes to the BOQ and project budget automatically — no
  // separate "Implement" click needed. Best-effort: if implementation fails,
  // the change order is still approved and can be manually implemented.
  try {
    await implementChangeOrder(id, userId);
  } catch (err) {
    console.error(`[change-order] Auto-implement failed for ${id}:`, err);
  }

  // Tell the submitter — the CO auto-implements on approval, so the
  // message notes scope updated automatically.
  if (approveVars.submittedById) {
    void emitNotificationEvent({
      eventType: NotificationEventType.CO_APPROVED,
      companyId: approveVars.companyId,
      recipientIds: [approveVars.submittedById],
      excludeIds: [userId],
      entityType: "ChangeOrder",
      entityId: id,
      variables: { changeOrderNo: approveVars.changeOrderNo, approverName: "" },
      timestamp: new Date(),
    });
  }
  return updated;
}

export async function rejectChangeOrder(id: string, userId: string, reason: string) {
  const rejectVars = { submittedById: null as string | null, changeOrderNo: "", companyId: "" };
  const updated = await withSerializableTransaction(async (tx) => {
    const co = await tx.changeOrder.findUnique({ where: { id } });
    if (!co) throw new ServiceError("Change order not found", 404);
    if (co.status !== "SUBMITTED") {
      throw new ServiceError(`Cannot reject change order in ${co.status} status`, 400);
    }
    if (!reason?.trim()) {
      throw new ServiceError("Rejection reason is required", 400);
    }

    const updated = await tx.changeOrder.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectReason: reason,
      },
    });

    await logAction(tx, {
      userId,
      action: "CHANGE_ORDER_REJECT",
      entityType: "ChangeOrder",
      entityId: id,
      after: { changeOrderNo: co.changeOrderNo, status: "REJECTED", reason },
    });

    rejectVars.submittedById = co.submittedById;
    rejectVars.changeOrderNo = co.changeOrderNo;
    rejectVars.companyId = co.companyId;
    return updated;
  });

  // Tell the submitter — targeted, never broadcast.
  if (rejectVars.submittedById) {
    void emitNotificationEvent({
      eventType: NotificationEventType.CO_REJECTED,
      companyId: rejectVars.companyId,
      recipientIds: [rejectVars.submittedById],
      excludeIds: [userId],
      entityType: "ChangeOrder",
      entityId: id,
      variables: { changeOrderNo: rejectVars.changeOrderNo, reason },
      timestamp: new Date(),
    });
  }
  return updated;
}

export async function cancelChangeOrder(id: string, userId: string) {
  return withSerializableTransaction(async (tx) => {
    const co = await tx.changeOrder.findUnique({ where: { id } });
    if (!co) throw new ServiceError("Change order not found", 404);
    if (co.status === "IMPLEMENTED" || co.status === "APPROVED") {
      throw new ServiceError(`Cannot cancel change order in ${co.status} status`, 400);
    }

    const updated = await tx.changeOrder.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    await logAction(tx, {
      userId,
      action: "CHANGE_ORDER_CANCEL",
      entityType: "ChangeOrder",
      entityId: id,
      after: { changeOrderNo: co.changeOrderNo, status: "CANCELLED" },
    });

    return updated;
  });
}

/**
 * Implement an approved change order — apply the changes to the BOQ and project budget.
 *
 * For each line:
 * - ADDITION: if boqItemId is null, create a new BoqItem under the project root
 * - DELETION: set the linked BoqItem's estimatedQty to 0
 * - MODIFICATION: update the linked BoqItem's estimatedQty and rate
 *
 * Then update Project.totalBudget with the cost delta.
 */
export async function implementChangeOrder(id: string, userId: string) {
  return withSerializableTransaction(async (tx) => {
    const co = await tx.changeOrder.findUnique({
      where: { id },
      include: { lines: true, project: true },
    });
    if (!co) throw new ServiceError("Change order not found", 404);
    if (co.status !== "APPROVED") {
      throw new ServiceError(`Cannot implement change order in ${co.status} status — must be APPROVED`, 400);
    }

    // Apply each line to the BOQ
    for (const line of co.lines) {
      const revisedQty = new Decimal(line.revisedQty);
      const rate = new Decimal(line.rate);

      if (line.boqItemId) {
        // Update existing BOQ item — but ONLY if it belongs to this change
        // order's own project. A line pointing at a foreign project's BOQ
        // item (decoy id) must never rewrite another tenant's budget.
        const boqItem = await tx.boqItem.findFirst({ where: { id: line.boqItemId, projectId: co.projectId } });
        if (boqItem) {
          const newEstimatedAmount = revisedQty.times(rate).toDecimalPlaces(2);
          await tx.boqItem.update({
            where: { id: line.boqItemId },
            data: {
              estimatedQty: revisedQty.toDecimalPlaces(3).toString(),
              rate: rate.toDecimalPlaces(2).toString(),
              estimatedAmount: newEstimatedAmount.toString(),
            },
          });
        }
      } else if (revisedQty.gt(0)) {
        // Create a new BOQ line item (ADDITION)
        // Find the next serial number at the root level
        const rootItems = await tx.boqItem.findMany({
          where: { projectId: co.projectId, parentId: null },
          select: { serialNo: true },
        });
        let maxSerial = 0;
        for (const r of rootItems) {
          const n = parseInt(r.serialNo, 10);
          if (!isNaN(n) && n > maxSerial) maxSerial = n;
        }
        // Find or create a "Change Orders" section
        let coSection = await tx.boqItem.findFirst({
          where: { projectId: co.projectId, parentId: null, description: { contains: "Change Order" } },
        });
        if (!coSection) {
          coSection = await tx.boqItem.create({
            data: {
              projectId: co.projectId,
              serialNo: String(maxSerial + 1),
              description: `Change Orders`,
              type: "SECTION",
              sortOrder: maxSerial + 1,
            },
          });
        }

        // Find next serial under the CO section
        const sectionChildren = await tx.boqItem.findMany({
          where: { parentId: coSection.id },
          select: { serialNo: true },
        });
        let maxChildSerial = 0;
        const prefix = coSection.serialNo + ".";
        for (const c of sectionChildren) {
          if (c.serialNo.startsWith(prefix)) {
            const n = parseInt(c.serialNo.slice(prefix.length), 10);
            if (!isNaN(n) && n > maxChildSerial) maxChildSerial = n;
          }
        }

        await tx.boqItem.create({
          data: {
            projectId: co.projectId,
            parentId: coSection.id,
            serialNo: `${coSection.serialNo}.${maxChildSerial + 1}`,
            description: line.description,
            type: "LINE_ITEM",
            unit: line.unit,
            estimatedQty: revisedQty.toDecimalPlaces(3).toString(),
            rate: rate.toDecimalPlaces(2).toString(),
            estimatedAmount: revisedQty.times(rate).toDecimalPlaces(2).toString(),
            notes: `From Change Order ${co.changeOrderNo}`,
            sortOrder: maxChildSerial + 1,
          },
        });
      }
    }

    // Update project budget
    const costDelta = new Decimal(co.costDelta);
    if (!costDelta.eq(0) && co.project.totalBudget) {
      const newBudget = new Decimal(co.project.totalBudget).plus(costDelta).toDecimalPlaces(2);
      await tx.project.update({
        where: { id: co.projectId },
        data: { totalBudget: newBudget.toString() },
      });
    }

    const updated = await tx.changeOrder.update({
      where: { id },
      data: {
        status: "IMPLEMENTED",
        implementedById: userId,
        implementedAt: new Date(),
      },
    });

    await logAction(tx, {
      userId,
      action: "CHANGE_ORDER_IMPLEMENT",
      entityType: "ChangeOrder",
      entityId: id,
      after: {
        changeOrderNo: co.changeOrderNo,
        status: "IMPLEMENTED",
        costDelta: costDelta.toString(),
        budgetUpdated: !costDelta.eq(0),
      },
    });

    return updated;
  });
}

export async function deleteChangeOrder(id: string, userId?: string) {
  return withSerializableTransaction(async (tx) => {
    const existing = await tx.changeOrder.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("Change order not found", 404);
    if (existing.status === "IMPLEMENTED") {
      throw new ServiceError("Cannot delete an implemented change order", 400);
    }

    await tx.changeOrder.delete({ where: { id } });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "CHANGE_ORDER_DELETE",
        entityType: "ChangeOrder",
        entityId: id,
        before: { changeOrderNo: existing.changeOrderNo, status: existing.status },
      });
    }

    return { ok: true };
  });
}
