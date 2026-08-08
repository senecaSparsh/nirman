import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { postProjectCost } from "./gl-posting";
import { reallocateProjectCosts } from "./valuation";
import { ServiceError } from "./errors";

/**
 * Subcontractor Management + RA Bills + TDS Service.
 *
 * The subcontractor billing cycle:
 * 1. Work Order (WO) issued against BOQ items with agreed rates
 * 2. Site work done → MB entries created and approved
 * 3. RA Bill generated from approved MB entries (per BOQ item)
 *    - Deductions: retention %, TDS %, advance recovery %
 * 4. RA Bill approved → Payment Certificate generated
 * 5. Payment recorded → GL entry (Dr Contractor Expense, Cr Cash + Cr TDS Payable + Cr Retention Payable)
 *
 * TDS under Section 194C:
 * - 1% for individual/HUF subcontractor
 * - 2% for partnership/company/other
 *
 * Retention: typically 5-10% held per bill, released on project completion
 * or after defect liability period.
 */

// ── Work Order ─────────────────────────────────────────────

async function generateWorkOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `WO-${ymd}-`;
  const existing = await tx.subcontractorWorkOrder.findMany({
    where: { workOrderNumber: { startsWith: prefix } },
    select: { workOrderNumber: true },
  });
  const maxSeq = existing.reduce((max, e) => {
    const n = parseInt(e.workOrderNumber.slice(prefix.length) ?? "0", 10);
    return n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

export interface CreateWorkOrderInput {
  projectId: string;
  phaseId?: string;
  subcontractorId: string;
  companyId: string;
  workTitle: string;
  description?: string;
  retentionPct?: Decimal | number | string;
  tdsCategory?: "INDIVIDUAL" | "COMPANY" | "OTHER";
  advanceAmount?: Decimal | number | string;
  advanceRecoveryPct?: Decimal | number | string;
  startDate?: Date;
  endDate?: Date;
  defectLiabilityMonths?: number;
  // Lines: which BOQ items are subcontracted, at what agreed rate
  lines: Array<{
    boqItemId: string;
    agreedRate: Decimal | number | string;
  }>;
  userId?: string;
}

export async function createWorkOrder(input: CreateWorkOrderInput) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: input.projectId, companyId: input.companyId, deletedAt: null },
    });
    if (!project) throw new ServiceError("Project not found in this company", 404);

    const sub = await tx.subcontractor.findFirst({
      where: { id: input.subcontractorId, deletedAt: null },
    });
    if (!sub) throw new ServiceError("Subcontractor not found or deleted", 404);

    if (input.lines.length === 0) {
      throw new ServiceError("Work order must have at least one line (BOQ item)", 400);
    }

    // Validate all BOQ items exist and belong to this project (batch query)
    const boqItemIds = input.lines.map((l) => l.boqItemId);
    const boqItems = await tx.boqItem.findMany({
      where: { id: { in: boqItemIds }, projectId: input.projectId, type: "LINE_ITEM" },
      select: { id: true },
    });
    const foundIds = new Set(boqItems.map((b) => b.id));
    for (const line of input.lines) {
      if (!foundIds.has(line.boqItemId)) {
        throw new ServiceError(`BOQ line item ${line.boqItemId} not found`, 404);
      }
    }

    // TDS rate based on category
    const tdsCategory = input.tdsCategory ?? "COMPANY";
    const tdsPct = tdsCategory === "INDIVIDUAL" ? new Decimal(1) : new Decimal(2);

    const workOrderNumber = await generateWorkOrderNumber(tx);

    const wo = await tx.subcontractorWorkOrder.create({
      data: {
        workOrderNumber,
        projectId: input.projectId,
        phaseId: input.phaseId ?? null,
        subcontractorId: input.subcontractorId,
        companyId: input.companyId,
        status: "DRAFT",
        workTitle: input.workTitle,
        description: input.description ?? null,
        retentionPct: new Decimal(input.retentionPct ?? 5).toString(),
        tdsPct: tdsPct.toString(),
        tdsCategory,
        advanceAmount: new Decimal(input.advanceAmount ?? 0).toString(),
        advanceRecoveryPct: new Decimal(input.advanceRecoveryPct ?? 10).toString(),
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        defectLiabilityMonths: input.defectLiabilityMonths ?? 12,
        lines: {
          create: input.lines.map((l) => ({
            boqItemId: l.boqItemId,
            agreedRate: new Decimal(l.agreedRate).toString(),
          })),
        },
      },
      include: { lines: true },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "WORK_ORDER_CREATE",
        entityType: "SubcontractorWorkOrder",
        entityId: wo.id,
        after: { workOrderNumber, subcontractorId: input.subcontractorId, lineCount: input.lines.length },
      });
    }

    return wo;
  });
}

export async function issueWorkOrder(id: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const wo = await tx.subcontractorWorkOrder.findUnique({ where: { id } });
    if (!wo) throw new ServiceError("Work order not found", 404);
    if (wo.status !== "DRAFT") throw new ServiceError(`Cannot issue work order in status ${wo.status}`, 400);

    const updated = await tx.subcontractorWorkOrder.update({
      where: { id },
      data: { status: "ISSUED", startDate: wo.startDate ?? new Date() },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "WORK_ORDER_ISSUE",
        entityType: "SubcontractorWorkOrder",
        entityId: id,
        after: { workOrderNumber: wo.workOrderNumber, status: "ISSUED" },
      });
    }

    return updated;
  });
}

// ── RA Bill ────────────────────────────────────────────────

async function generateRaBillNumber(tx: Prisma.TransactionClient): Promise<string> {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `RA-${ymd}-`;
  const existing = await tx.raBill.findMany({
    where: { raBillNumber: { startsWith: prefix } },
    select: { raBillNumber: true },
  });
  const maxSeq = existing.reduce((max, e) => {
    const n = parseInt(e.raBillNumber.slice(prefix.length) ?? "0", 10);
    return n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

export interface CreateRaBillInput {
  workOrderId: string;
  periodFrom: Date;
  periodTo: Date;
  // Which MB entries to include (must be APPROVED and not yet billed)
  mbEntryIds?: string[];
  otherDeductions?: Decimal | number | string;
  notes?: string;
  userId?: string;
}

/**
 * Generate an RA bill from approved MB entries linked to the work order's BOQ items.
 * Computes per-line: prevQty, thisQty, totalQty, amounts.
 * Computes deductions: retention, TDS, advance recovery.
 */
export async function createRaBill(input: CreateRaBillInput) {
  return prisma.$transaction(async (tx) => {
    const wo = await tx.subcontractorWorkOrder.findUnique({
      where: { id: input.workOrderId },
      include: { lines: { include: { boqItem: true } } },
    });
    if (!wo) throw new ServiceError("Work order not found", 404);
    if (wo.status === "CANCELLED" || wo.status === "CLOSED") {
      throw new ServiceError(`Cannot create RA bill for work order in status ${wo.status}`, 400);
    }

    const raBillNumber = await generateRaBillNumber(tx);

    // Get approved MB entries for this work order's BOQ items that haven't been billed yet
    const boqItemIds = wo.lines.map((l) => l.boqItemId);
    const mbEntries = await tx.measurementBookEntry.findMany({
      where: {
        boqItemId: { in: boqItemIds },
        status: "APPROVED",
        raBillLineId: null,
        ...(input.mbEntryIds ? { id: { in: input.mbEntryIds } } : {}),
      },
      orderBy: { measureDate: "asc" },
    });

    if (mbEntries.length === 0) {
      throw new ServiceError("No approved unbilled MB entries found for this work order", 400);
    }

    // Group MB entries by BOQ item
    const entriesByBoq = new Map<string, typeof mbEntries>();
    for (const entry of mbEntries) {
      const arr = entriesByBoq.get(entry.boqItemId) ?? [];
      arr.push(entry);
      entriesByBoq.set(entry.boqItemId, arr);
    }

    // Build RA bill lines
    const lines: Array<{
      boqItemId: string;
      workOrderLineId: string;
      prevQty: Decimal;
      thisQty: Decimal;
      totalQty: Decimal;
      rate: Decimal;
      prevAmount: Decimal;
      thisAmount: Decimal;
      totalAmount: Decimal;
      mbEntryIds: string[];
    }> = [];

    let grossAmount = new Decimal(0);

    for (const woLine of wo.lines) {
      const entries = entriesByBoq.get(woLine.boqItemId);
      if (!entries || entries.length === 0) continue;

      // Previous cumulative qty = sum of all MB entries already billed for this BOQ item
      const prevBilled = await tx.measurementBookEntry.aggregate({
        where: { boqItemId: woLine.boqItemId, status: "APPROVED", raBillLineId: { not: null } },
        _sum: { measuredQty: true },
      });
      const prevQty = new Decimal(prevBilled._sum.measuredQty ?? 0);

      // This period's qty
      const thisQty = entries.reduce(
        (sum, e) => sum.plus(new Decimal(e.measuredQty)),
        new Decimal(0),
      );
      const totalQty = prevQty.plus(thisQty);
      const rate = new Decimal(woLine.agreedRate);

      const prevAmount = prevQty.times(rate).toDecimalPlaces(2);
      const thisAmount = thisQty.times(rate).toDecimalPlaces(2);
      const totalAmount = totalQty.times(rate).toDecimalPlaces(2);

      lines.push({
        boqItemId: woLine.boqItemId,
        workOrderLineId: woLine.id,
        prevQty,
        thisQty,
        totalQty,
        rate,
        prevAmount,
        thisAmount,
        totalAmount,
        mbEntryIds: entries.map((e) => e.id),
      });

      grossAmount = grossAmount.plus(thisAmount);
    }

    if (lines.length === 0) {
      throw new ServiceError("No billable quantities found in the selected MB entries", 400);
    }

    // Compute cumulative gross (all previous RA bills + this one)
    const prevBills = await tx.raBill.aggregate({
      where: { workOrderId: input.workOrderId, status: { in: ["APPROVED", "PAID"] } },
      _sum: { grossAmount: true },
    });
    const cumulativeGross = new Decimal(prevBills._sum.grossAmount ?? 0).plus(grossAmount);

    // Deductions
    const retentionPct = new Decimal(wo.retentionPct);
    const retentionAmount = grossAmount.times(retentionPct).div(100).toDecimalPlaces(2);

    const tdsPct = new Decimal(wo.tdsPct);
    const tdsAmount = grossAmount.times(tdsPct).div(100).toDecimalPlaces(2);

    // Advance recovery: recover advanceRecoveryPct of grossAmount, but only if there's advance left
    const advanceRecoveryPct = new Decimal(wo.advanceRecoveryPct);
    const advanceRecovery = wo.advanceAmount.gt(0)
      ? Decimal.min(
          grossAmount.times(advanceRecoveryPct).div(100).toDecimalPlaces(2),
          new Decimal(wo.advanceAmount).minus(wo.totalPaid).gt(0)
            ? new Decimal(wo.advanceAmount).minus(wo.totalPaid)
            : new Decimal(0),
        )
      : new Decimal(0);

    const otherDeductions = new Decimal(input.otherDeductions ?? 0);

    const totalDeductions = retentionAmount
      .plus(tdsAmount)
      .plus(advanceRecovery)
      .plus(otherDeductions);

    const netPayable = grossAmount.minus(totalDeductions).toDecimalPlaces(2);

    // Create the RA bill
    const raBill = await tx.raBill.create({
      data: {
        raBillNumber,
        workOrderId: input.workOrderId,
        projectId: wo.projectId,
        companyId: wo.companyId,
        billDate: new Date(),
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        status: "DRAFT",
        grossAmount: grossAmount.toString(),
        cumulativeGross: cumulativeGross.toString(),
        retentionAmount: retentionAmount.toString(),
        tdsAmount: tdsAmount.toString(),
        advanceRecovery: advanceRecovery.toString(),
        otherDeductions: otherDeductions.toString(),
        netPayable: netPayable.toString(),
        notes: input.notes ?? null,
        lines: {
          create: lines.map((l) => ({
            boqItemId: l.boqItemId,
            workOrderLineId: l.workOrderLineId,
            prevQty: l.prevQty.toString(),
            thisQty: l.thisQty.toString(),
            totalQty: l.totalQty.toString(),
            rate: l.rate.toString(),
            prevAmount: l.prevAmount.toString(),
            thisAmount: l.thisAmount.toString(),
            totalAmount: l.totalAmount.toString(),
          })),
        },
      },
      include: { lines: true },
    });

    // Link MB entries to the RA bill lines
    for (const line of lines) {
      const raBillLine = raBill.lines.find((rl) => rl.boqItemId === line.boqItemId);
      if (!raBillLine) continue;
      await tx.measurementBookEntry.updateMany({
        where: { id: { in: line.mbEntryIds } },
        data: { raBillLineId: raBillLine.id },
      });
    }

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "RA_BILL_CREATE",
        entityType: "RaBill",
        entityId: raBill.id,
        after: { raBillNumber, grossAmount: grossAmount.toString(), netPayable: netPayable.toString() },
      });
    }

    return raBill;
  });
}

export async function approveRaBill(id: string, approvedById: string) {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.raBill.findUnique({
      where: { id },
      include: { workOrder: true, lines: true },
    });
    if (!bill) throw new ServiceError("RA bill not found", 404);
    if (bill.status !== "SUBMITTED") {
      throw new ServiceError(`Cannot approve RA bill in status ${bill.status} (must be SUBMITTED)`, 400);
    }

    const updated = await tx.raBill.update({
      where: { id },
      data: { status: "APPROVED", approvedById, approvedAt: new Date() },
    });

    // Update work order cumulative totals
    const wo = bill.workOrder;
    const newTotalWorkDone = new Decimal(wo.totalWorkDone).plus(new Decimal(bill.grossAmount));
    const newTotalDeductions = new Decimal(wo.totalDeductions).plus(
      new Decimal(bill.retentionAmount).plus(new Decimal(bill.tdsAmount)).plus(new Decimal(bill.advanceRecovery)).plus(new Decimal(bill.otherDeductions)),
    );
    const newRetentionBalance = new Decimal(wo.retentionBalance).plus(new Decimal(bill.retentionAmount));

    await tx.subcontractorWorkOrder.update({
      where: { id: wo.id },
      data: {
        totalWorkDone: newTotalWorkDone.toString(),
        totalDeductions: newTotalDeductions.toString(),
        retentionBalance: newRetentionBalance.toString(),
        status: "ACTIVE",
      },
    });

    // Update work order line cumulative tracking
    for (const line of bill.lines) {
      const woLine = await tx.subcontractorWorkOrderLine.findUnique({
        where: { id: line.workOrderLineId },
      });
      if (woLine) {
        await tx.subcontractorWorkOrderLine.update({
          where: { id: woLine.id },
          data: {
            cumulativeQty: new Decimal(line.totalQty).toString(),
            cumulativeAmount: new Decimal(line.totalAmount).toString(),
          },
        });
      }
    }

    // Post to GL: Dr Contractor Expense (project cost), Cr Cash (net), Cr TDS Payable, Cr Retention Payable
    // We use ProjectCost to record the contractor expense, and a GL entry for the payable side
    await tx.projectCost.create({
      data: {
        projectId: wo.projectId,
        costType: "CONTRACTOR",
        amount: new Decimal(bill.grossAmount),
        date: new Date(),
        notes: `RA Bill ${bill.raBillNumber} — ${wo.workTitle}`,
        createdById: approvedById,
      },
    });

    // Trigger cost reallocation
    await reallocateProjectCosts(tx, wo.projectId);

    await logAction(tx, {
      userId: approvedById,
      action: "RA_BILL_APPROVE",
      entityType: "RaBill",
      entityId: id,
      after: { raBillNumber: bill.raBillNumber, status: "APPROVED", netPayable: bill.netPayable.toString() },
    });

    return updated;
  });
}

export async function submitRaBill(id: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.raBill.findUnique({ where: { id } });
    if (!bill) throw new ServiceError("RA bill not found", 404);
    if (bill.status !== "DRAFT") {
      throw new ServiceError(`Cannot submit RA bill in status ${bill.status}`, 400);
    }

    const updated = await tx.raBill.update({
      where: { id },
      data: { status: "SUBMITTED" },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "RA_BILL_SUBMIT",
        entityType: "RaBill",
        entityId: id,
        after: { raBillNumber: bill.raBillNumber, status: "SUBMITTED" },
      });
    }

    return updated;
  });
}

export async function rejectRaBill(id: string, rejectReason: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.raBill.findUnique({ where: { id } });
    if (!bill) throw new ServiceError("RA bill not found", 404);
    if (bill.status === "APPROVED" || bill.status === "PAID") {
      throw new ServiceError(`Cannot reject RA bill in status ${bill.status}`, 400);
    }

    const updated = await tx.raBill.update({
      where: { id },
      data: { status: "REJECTED", rejectReason },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "RA_BILL_REJECT",
        entityType: "RaBill",
        entityId: id,
        after: { raBillNumber: bill.raBillNumber, status: "REJECTED", rejectReason },
      });
    }

    return updated;
  });
}

/** Release retention money after defect liability period. */
export async function releaseRetention(workOrderId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const wo = await tx.subcontractorWorkOrder.findUnique({ where: { id: workOrderId } });
    if (!wo) throw new ServiceError("Work order not found", 404);
    if (wo.status !== "COMPLETED") {
      throw new ServiceError("Retention can only be released for completed work orders", 400);
    }
    if (wo.retentionBalance.lte(0)) {
      throw new ServiceError("No retention balance to release", 400);
    }

    const retentionToRelease = new Decimal(wo.retentionBalance);

    await tx.subcontractorWorkOrder.update({
      where: { id: workOrderId },
      data: {
        retentionBalance: new Decimal(0).toString(),
        totalPaid: new Decimal(wo.totalPaid).plus(retentionToRelease).toString(),
        status: "CLOSED",
      },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "RETENTION_RELEASE",
        entityType: "SubcontractorWorkOrder",
        entityId: workOrderId,
        after: { workOrderNumber: wo.workOrderNumber, releasedAmount: retentionToRelease.toString() },
      });
    }

    return { releasedAmount: retentionToRelease };
  });
}
