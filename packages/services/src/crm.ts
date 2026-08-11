import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Real Estate CRM + Sales Workflow Service.
 *
 * The customer journey:
 * 1. Lead — sourced from portal, walk-in, referral, etc.
 * 2. Site Visit — scheduled and tracked
 * 3. Booking — token amount received, unit held
 * 4. Allotment — unit allotted, sale price fixed
 * 5. Agreement — sale agreement registered
 * 6. Payment Schedule — generated (CLP/TLP/DPP)
 * 7. Registration — property registered with buyer
 * 8. Possession — keys handed over
 *
 * GST on Real Estate (India):
 * - Residential (affordable < ₹45L): 1% GST
 * - Residential (non-affordable): 5% GST
 * - Commercial: 18% GST
 * - Land portion (1/3 of total consideration for residential) is exempt
 * - So effective GST on residential non-affordable = 5% × (2/3 of price)
 */

// ── Lead Pipeline ──────────────────────────────────────────

export type LeadSource = "PORTAL" | "WALK_IN" | "REFERRAL" | "BROKER" | "DIGITAL_AD" | "OTHER";
export type LeadStage = "NEW" | "CONTACTED" | "SITE_VISIT" | "NEGOTIATION" | "BOOKED" | "LOST";
export type LeadPriority = "LOW" | "MEDIUM" | "HIGH" | "HOT";

export interface CreateLeadInput {
  companyId: string;
  projectId?: string;
  name: string;
  phone: string;
  email?: string;
  source: LeadSource;
  stage?: LeadStage;
  priority?: LeadPriority;
  budgetMin?: Decimal | number | string;
  budgetMax?: Decimal | number | string;
  interestedUnitType?: string;
  notes?: string;
  assignedToId?: string;
  userId?: string;
}

/**
 * Create a new lead. Leads are stored as Customer records with a `leadStage`
 * field — a lead becomes a customer when they book a unit.
 */
export async function createLead(input: CreateLeadInput) {
  return prisma.$transaction(async (tx) => {
    // Check if a customer with this phone already exists in this company
    const existing = await tx.customer.findFirst({
      where: { phone: input.phone, companyId: input.companyId, deletedAt: null },
    });
    if (existing) {
      throw new ServiceError("A customer with this phone number already exists", 409);
    }

    const customer = await tx.customer.create({
      data: {
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        address: null,
        companyId: input.companyId,
      },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "LEAD_CREATE",
        entityType: "Customer",
        entityId: customer.id,
        after: { name: input.name, phone: input.phone, source: input.source },
      });
    }

    return customer;
  });
}

// ── Payment Schedule Generation ────────────────────────────

export type ScheduleType = "CLP" | "TLP" | "DPP";

export interface GeneratePaymentScheduleInput {
  assetSaleId: string;
  type: ScheduleType;
  // For CLP: list of { wbsNodeId, percentage, description } — payments tied to milestones
  // For TLP: list of { dueDate, percentage, description } — fixed installments
  // For DPP: { upfrontPercentage, installments: [{ dueDate, percentage }] }
  milestones?: Array<{
    wbsNodeId?: string;
    dueDate?: Date;
    percentage: Decimal | number | string;
    description: string;
  }>;
  userId?: string;
}

/**
 * Generate a payment schedule for an asset sale.
 *
 * CLP (Construction-Linked Plan):
 *   Payments tied to WBS milestone completion. Each installment has a
 *   `wbsNodeId` — when that milestone's progress reaches 100%, the
 *   installment becomes "DUE".
 *
 * TLP (Time-Linked Plan):
 *   Fixed installments on specific dates. No milestone dependency.
 *
 * DPP (Down Payment Plan):
 *   Large upfront payment (typically 30-50%) + small installments.
 */
export async function generatePaymentSchedule(input: GeneratePaymentScheduleInput) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.assetSale.findUnique({
      where: { id: input.assetSaleId },
      include: { paymentSchedule: true },
    });
    if (!sale) throw new ServiceError("Asset sale not found", 404);
    if (sale.paymentSchedule) {
      throw new ServiceError("Payment schedule already exists for this sale", 409);
    }

    if (!input.milestones || input.milestones.length === 0) {
      throw new ServiceError("At least one payment milestone is required", 400);
    }

    // Validate percentages sum to 100
    const totalPct = input.milestones.reduce(
      (sum, m) => sum.plus(new Decimal(m.percentage)),
      new Decimal(0),
    );
    if (!totalPct.eq(100)) {
      throw new ServiceError(`Payment percentages must sum to 100, got ${totalPct}%`, 400);
    }

    // Compute GST split for real estate
    // For residential: 1/3 of price is land (exempt), 2/3 is construction (taxable)
    // For commercial: full price is taxable at 18%
    const project = await tx.project.findUnique({
      where: { id: sale.projectId },
      select: { type: true },
    });
    const isResidential = project?.type === "RESIDENTIAL";
    const gstRate = isResidential ? new Decimal(5) : new Decimal(18);
    const taxablePortion = isResidential ? new Decimal(2).div(3) : new Decimal(1);
    const effectiveGstRate = gstRate.times(taxablePortion);

    const baseAmount = new Decimal(sale.salePrice);
    const gstAmount = baseAmount.times(effectiveGstRate).div(100).toDecimalPlaces(2);
    const grandTotal = baseAmount.plus(gstAmount);

    // Create the schedule
    const schedule = await tx.paymentSchedule.create({
      data: {
        assetSaleId: sale.id,
        type: input.type,
        totalAmount: baseAmount.toString(),
        gstAmount: gstAmount.toString(),
        grandTotal: grandTotal.toString(),
      },
    });

    // Create schedule items
    for (let i = 0; i < input.milestones.length; i++) {
      const m = input.milestones[i]!;
      const pct = new Decimal(m.percentage);
      const amount = baseAmount.times(pct).div(100).toDecimalPlaces(2);
      const itemGst = gstAmount.times(pct).div(100).toDecimalPlaces(2);
      const itemTotal = amount.plus(itemGst).toDecimalPlaces(2);

      await tx.paymentScheduleItem.create({
        data: {
          paymentScheduleId: schedule.id,
          wbsNodeId: m.wbsNodeId ?? null,
          installmentNo: i + 1,
          description: m.description,
          percentage: pct.toDecimalPlaces(2).toString(),
          amount: amount.toString(),
          gstPercentage: effectiveGstRate.toDecimalPlaces(2).toString(),
          gstAmount: itemGst.toString(),
          totalAmount: itemTotal.toString(),
          dueDate: m.dueDate ?? null,
          status: m.dueDate && m.dueDate <= new Date() ? "DUE" : "PENDING",
        },
      });
    }

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "PAYMENT_SCHEDULE_GENERATE",
        entityType: "PaymentSchedule",
        entityId: schedule.id,
        after: { assetSaleId: sale.id, type: input.type, grandTotal: grandTotal.toString(), installmentCount: input.milestones.length },
      });
    }

    return tx.paymentSchedule.findUnique({
      where: { id: schedule.id },
      include: { items: { orderBy: { installmentNo: "asc" } } },
    });
  });
}

/**
 * Check CLP payment schedule items for milestone completion.
 * When a WBS node linked to a payment item reaches 100% progress,
 * mark the item as DUE.
 */
export async function checkMilestonePayments(projectId: string) {
  return prisma.$transaction(async (tx) => {
    // Find all CLP payment schedule items linked to WBS nodes in this project
    const items = await tx.paymentScheduleItem.findMany({
      where: {
        wbsNodeId: { not: null },
        status: "PENDING",
        paymentSchedule: { type: "CLP" },
      },
      include: {
        wbsNode: { select: { id: true, progressPct: true, projectId: true } },
        paymentSchedule: { select: { assetSaleId: true } },
      },
    });

    const projectItems = items.filter(
      (item) => item.wbsNode?.projectId === projectId,
    );

    const newlyDue: string[] = [];
    for (const item of projectItems) {
      if (item.wbsNode && new Decimal(item.wbsNode.progressPct).gte(100)) {
        await tx.paymentScheduleItem.update({
          where: { id: item.id },
          data: { status: "DUE" },
        });
        newlyDue.push(item.id);
      }
    }

    return { checked: projectItems.length, newlyDue: newlyDue.length, newlyDueIds: newlyDue };
  });
}

/**
 * Record a payment against a schedule item.
 * Updates the item's paidAmount and status, and creates an AssetSalePayment.
 */
export async function recordSchedulePayment(
  scheduleItemId: string,
  amount: Decimal | number | string,
  paymentMode?: string,
  userId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.paymentScheduleItem.findUnique({
      where: { id: scheduleItemId },
      include: {
        paymentSchedule: {
          include: { assetSale: true },
        },
      },
    });
    if (!item) throw new ServiceError("Payment schedule item not found", 404);

    const payAmount = new Decimal(amount);
    if (!payAmount.gt(0)) throw new ServiceError("Payment amount must be > 0", 400);

    const newPaidAmount = new Decimal(item.paidAmount).plus(payAmount);
    const itemTotal = new Decimal(item.totalAmount);
    if (newPaidAmount.gt(itemTotal)) {
      throw new ServiceError(`Payment exceeds installment amount. Outstanding: ${itemTotal.minus(new Decimal(item.paidAmount))}`);
    }
    const newStatus = newPaidAmount.gte(itemTotal) ? "PAID" : "PARTIAL";

    const updated = await tx.paymentScheduleItem.update({
      where: { id: scheduleItemId },
      data: {
        paidAmount: newPaidAmount.toString(),
        status: newStatus,
        paidAt: newStatus === "PAID" ? new Date() : item.paidAt,
      },
    });

    // Create AssetSalePayment
    const sale = item.paymentSchedule.assetSale;
    await tx.assetSalePayment.create({
      data: {
        assetSaleId: sale.id,
        amount: payAmount.toString(),
        paymentDate: new Date(),
        mode: paymentMode ?? "BANK_TRANSFER",
        reference: `Installment ${item.installmentNo}: ${item.description}`,
      },
    });

    // Update sale payment status
    const allItems = await tx.paymentScheduleItem.findMany({
      where: { paymentScheduleId: item.paymentScheduleId },
      select: { status: true, totalAmount: true, paidAmount: true },
    });
    const grandTotal = allItems.reduce(
      (sum, i) => sum.plus(new Decimal(i.totalAmount)),
      new Decimal(0),
    );
    const totalPaid = allItems.reduce(
      (sum, i) => sum.plus(new Decimal(i.paidAmount)),
      new Decimal(0),
    );
    const salePaymentStatus = totalPaid.gte(grandTotal) ? "PAID" : totalPaid.gt(0) ? "PARTIAL" : "PENDING";

    await tx.assetSale.update({
      where: { id: sale.id },
      data: { paymentStatus: salePaymentStatus },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "SCHEDULE_PAYMENT_RECORD",
        entityType: "PaymentScheduleItem",
        entityId: scheduleItemId,
        after: { amount: payAmount.toString(), status: newStatus, salePaymentStatus },
      });
    }

    return updated;
  });
}

// ── GST Calculation Helper ─────────────────────────────────

/**
 * Compute GST for a real estate sale based on project type.
 *
 * Residential (affordable, < ₹45L): 1% GST on full price
 * Residential (non-affordable): 5% GST on 2/3 of price (land 1/3 exempt)
 * Commercial: 18% GST on full price
 *
 * Note: "affordable" is determined by carpet area ≤ 60 sqm (metro) or ≤ 90 sqm (non-metro)
 * and price ≤ ₹45L. This is a simplification — the actual rule has more nuance.
 */
export function computeRealEstateGst(
  salePrice: Decimal | number | string,
  projectType: string,
  isAffordable = false,
): { gstRate: Decimal; taxablePortion: Decimal; effectiveGstRate: Decimal; gstAmount: Decimal } {
  const price = new Decimal(salePrice);
  const isResidential = projectType === "RESIDENTIAL";

  let gstRate: Decimal;
  let taxablePortion: Decimal;

  if (isResidential && isAffordable) {
    gstRate = new Decimal(1);
    taxablePortion = new Decimal(1);
  } else if (isResidential) {
    gstRate = new Decimal(5);
    taxablePortion = new Decimal(2).div(3); // 2/3 construction, 1/3 land exempt
  } else {
    gstRate = new Decimal(18);
    taxablePortion = new Decimal(1);
  }

  const effectiveGstRate = gstRate.times(taxablePortion);
  const gstAmount = price.times(effectiveGstRate).div(100).toDecimalPlaces(2);

  return {
    gstRate: gstRate.toDecimalPlaces(2),
    taxablePortion: taxablePortion.toDecimalPlaces(4),
    effectiveGstRate: effectiveGstRate.toDecimalPlaces(2),
    gstAmount,
  };
}
