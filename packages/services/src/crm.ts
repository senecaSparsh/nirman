import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { postPaymentReceived } from "./gl-posting";
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
  interestedUnitId?: string;
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
  nextFollowUpAt?: Date;
  userId?: string;
}

export interface LeadScoreInput {
  source: LeadSource;
  priority: LeadPriority;
  hasBudget: boolean;
  hasProject: boolean;
  hasInterestedUnit: boolean;
  activityCount: number;
  hasSiteVisit: boolean;
}

const LEAD_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  NEW: ["CONTACTED", "LOST"],
  CONTACTED: ["SITE_VISIT", "NEGOTIATION", "LOST"],
  SITE_VISIT: ["NEGOTIATION", "BOOKED", "LOST"],
  NEGOTIATION: ["SITE_VISIT", "BOOKED", "LOST"],
  BOOKED: [],
  LOST: ["CONTACTED"],
};

export function computeLeadScore(input: LeadScoreInput): number {
  const sourceScore: Record<LeadSource, number> = {
    WALK_IN: 20,
    REFERRAL: 18,
    BROKER: 15,
    PORTAL: 12,
    DIGITAL_AD: 8,
    OTHER: 5,
  };
  const priorityScore: Record<LeadPriority, number> = {
    LOW: 0,
    MEDIUM: 8,
    HIGH: 16,
    HOT: 25,
  };
  const score = sourceScore[input.source]
    + priorityScore[input.priority]
    + (input.hasBudget ? 10 : 0)
    + (input.hasProject ? 8 : 0)
    + (input.hasInterestedUnit ? 10 : 0)
    + Math.min(20, input.activityCount * 4)
    + (input.hasSiteVisit ? 15 : 0);
  return Math.min(100, score);
}

export function isLeadStageTransitionAllowed(from: LeadStage, to: LeadStage): boolean {
  return from === to || LEAD_TRANSITIONS[from].includes(to);
}

/**
 * Create a new lead. Leads are stored as Customer records with a `leadStage`
 * field — a lead becomes a customer when they book a unit.
 */
export async function createLead(input: CreateLeadInput) {
  return prisma.$transaction(async (tx) => {
    const phone = input.phone.trim();
    if (!phone) throw new ServiceError("Phone number is required", 400);

    const duplicate = await tx.lead.findFirst({
      where: {
        companyId: input.companyId,
        phone,
        deletedAt: null,
        stage: { notIn: ["BOOKED", "LOST"] },
      },
    });
    if (duplicate) throw new ServiceError("An open lead with this phone number already exists", 409);

    if (input.projectId) {
      const project = await tx.project.findFirst({
        where: { id: input.projectId, companyId: input.companyId, deletedAt: null },
        select: { id: true },
      });
      if (!project) throw new ServiceError("Project not found", 404);
    }

    if (input.interestedUnitId) {
      const unit = await tx.builtUnit.findFirst({
        where: {
          id: input.interestedUnitId,
          deletedAt: null,
          project: { companyId: input.companyId, deletedAt: null },
        },
        select: { id: true, projectId: true },
      });
      if (!unit) throw new ServiceError("Interested unit not found", 404);
      if (input.projectId && unit.projectId !== input.projectId) {
        throw new ServiceError("Interested unit does not belong to the selected project", 400);
      }
    }

    if (input.assignedToId) {
      const membership = await tx.userCompany.findFirst({
        where: { userId: input.assignedToId, companyId: input.companyId },
        select: { id: true },
      });
      if (!membership) throw new ServiceError("Assignee is not a member of this company", 400);
    }

    const priority = input.priority ?? "MEDIUM";
    const score = computeLeadScore({
      source: input.source,
      priority,
      hasBudget: input.budgetMin != null || input.budgetMax != null,
      hasProject: Boolean(input.projectId),
      hasInterestedUnit: Boolean(input.interestedUnitId),
      activityCount: 0,
      hasSiteVisit: false,
    });

    const lead = await tx.lead.create({
      data: {
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        interestedUnitId: input.interestedUnitId ?? null,
        assignedToId: input.assignedToId ?? null,
        name: input.name.trim(),
        phone,
        email: input.email?.trim() || null,
        source: input.source,
        stage: input.stage ?? "NEW",
        priority,
        score,
        budgetMin: input.budgetMin != null ? new Decimal(input.budgetMin) : null,
        budgetMax: input.budgetMax != null ? new Decimal(input.budgetMax) : null,
        interestedUnitType: input.interestedUnitType?.trim() || null,
        notes: input.notes?.trim() || null,
        nextFollowUpAt: input.nextFollowUpAt ?? null,
      },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        companyId: input.companyId,
        action: "LEAD_CREATE",
        entityType: "Lead",
        entityId: lead.id,
        after: { name: lead.name, phone: lead.phone, source: lead.source, stage: lead.stage, score },
      });
    }

    return lead;
  });
}

export type LeadActivityType = "CALL" | "EMAIL" | "WHATSAPP" | "MEETING" | "SITE_VISIT" | "NOTE" | "STAGE_CHANGE";

export interface RecordLeadActivityInput {
  leadId: string;
  companyId: string;
  type: LeadActivityType;
  note?: string;
  outcome?: string;
  occurredAt?: Date;
  nextFollowUpAt?: Date;
  userId?: string;
}

export async function recordLeadActivity(input: RecordLeadActivityInput) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({
      where: { id: input.leadId, companyId: input.companyId, deletedAt: null },
      include: { activities: { select: { type: true } } },
    });
    if (!lead) throw new ServiceError("Lead not found", 404);
    if (lead.stage === "BOOKED") throw new ServiceError("Booked leads cannot receive new pre-sales activities", 409);

    const activity = await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        type: input.type,
        note: input.note?.trim() || null,
        outcome: input.outcome?.trim() || null,
        occurredAt: input.occurredAt ?? new Date(),
        nextFollowUpAt: input.nextFollowUpAt ?? null,
        createdById: input.userId ?? null,
      },
    });

    const activityCount = lead.activities.length + 1;
    const hasSiteVisit = input.type === "SITE_VISIT" || lead.activities.some((item) => item.type === "SITE_VISIT");
    const score = computeLeadScore({
      source: lead.source,
      priority: lead.priority,
      hasBudget: lead.budgetMin != null || lead.budgetMax != null,
      hasProject: Boolean(lead.projectId),
      hasInterestedUnit: Boolean(lead.interestedUnitId),
      activityCount,
      hasSiteVisit,
    });

    await tx.lead.update({
      where: { id: lead.id },
      data: {
        score,
        lastContactAt: input.type === "NOTE" ? lead.lastContactAt : activity.occurredAt,
        nextFollowUpAt: input.nextFollowUpAt ?? lead.nextFollowUpAt,
      },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        companyId: input.companyId,
        action: "LEAD_ACTIVITY_CREATE",
        entityType: "Lead",
        entityId: lead.id,
        after: { type: input.type, outcome: activity.outcome, nextFollowUpAt: activity.nextFollowUpAt, score },
      });
    }

    return { activity, score };
  });
}

export interface UpdateLeadStageInput {
  leadId: string;
  companyId: string;
  stage: LeadStage;
  lostReason?: string;
  nextFollowUpAt?: Date;
  userId?: string;
}

export async function updateLeadStage(input: UpdateLeadStageInput) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({
      where: { id: input.leadId, companyId: input.companyId, deletedAt: null },
    });
    if (!lead) throw new ServiceError("Lead not found", 404);
    if (input.stage === "BOOKED") throw new ServiceError("Use Convert & book to complete this lead", 400);
    if (!isLeadStageTransitionAllowed(lead.stage, input.stage)) {
      throw new ServiceError(`Cannot move lead from ${lead.stage} to ${input.stage}`, 409);
    }
    if (input.stage === "LOST" && !input.lostReason?.trim()) {
      throw new ServiceError("A reason is required when marking a lead lost", 400);
    }

    const updated = await tx.lead.update({
      where: { id: lead.id },
      data: {
        stage: input.stage,
        lostReason: input.stage === "LOST" ? input.lostReason!.trim() : null,
        nextFollowUpAt: input.stage === "LOST" ? null : input.nextFollowUpAt ?? lead.nextFollowUpAt,
      },
    });

    if (lead.stage !== input.stage) {
      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          type: "STAGE_CHANGE",
          note: `${lead.stage} → ${input.stage}`,
          nextFollowUpAt: input.nextFollowUpAt ?? null,
          createdById: input.userId ?? null,
        },
      });
    }

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        companyId: input.companyId,
        action: "LEAD_STAGE_CHANGE",
        entityType: "Lead",
        entityId: lead.id,
        before: { stage: lead.stage },
        after: { stage: updated.stage, lostReason: updated.lostReason },
      });
    }

    return updated;
  });
}

export interface ConvertLeadInput {
  leadId: string;
  companyId: string;
  userId?: string;
}

export async function convertLeadToCustomer(input: ConvertLeadInput) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({
      where: { id: input.leadId, companyId: input.companyId, deletedAt: null },
    });
    if (!lead) throw new ServiceError("Lead not found", 404);
    if (lead.stage === "BOOKED" && lead.convertedCustomerId) {
      const customer = await tx.customer.findUnique({ where: { id: lead.convertedCustomerId } });
      if (!customer) throw new ServiceError("Converted customer not found", 404);
      return { lead, customer };
    }
    if (!isLeadStageTransitionAllowed(lead.stage, "BOOKED")) {
      throw new ServiceError("Complete a site visit or move the lead into negotiation before booking", 409);
    }

    const existingCustomer = await tx.customer.findFirst({
      where: { companyId: input.companyId, phone: lead.phone },
    });
    const customer = existingCustomer
      ? await tx.customer.update({
          where: { id: existingCustomer.id },
          data: {
            name: lead.name,
            email: lead.email ?? existingCustomer.email,
            deletedAt: null,
            version: { increment: 1 },
          },
        })
      : await tx.customer.create({
          data: {
            companyId: input.companyId,
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
          },
        });

    const updatedLead = await tx.lead.update({
      where: { id: lead.id },
      data: {
        stage: "BOOKED",
        convertedCustomerId: customer.id,
        convertedAt: new Date(),
        nextFollowUpAt: null,
      },
    });

    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        type: "STAGE_CHANGE",
        note: `${lead.stage} → BOOKED`,
        outcome: `Converted to customer ${customer.name}`,
        createdById: input.userId ?? null,
      },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        companyId: input.companyId,
        action: "LEAD_CONVERT",
        entityType: "Lead",
        entityId: lead.id,
        before: { stage: lead.stage },
        after: { stage: "BOOKED", customerId: customer.id },
      });
    }

    return { lead: updatedLead, customer };
  });
}

export async function deleteLead(input: { leadId: string; companyId: string; userId?: string }) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({
      where: { id: input.leadId, companyId: input.companyId, deletedAt: null },
    });
    if (!lead) throw new ServiceError("Lead not found", 404);
    if (lead.convertedCustomerId) {
      throw new ServiceError("Cannot delete a converted lead — archive the linked customer instead", 409);
    }
    const updated = await tx.lead.update({
      where: { id: lead.id },
      data: { deletedAt: new Date() },
    });
    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        companyId: input.companyId,
        action: "LEAD_DELETE",
        entityType: "Lead",
        entityId: lead.id,
        before: { name: lead.name, stage: lead.stage },
      });
    }
    return updated;
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
    // Standalone land sales (no project) default to commercial-rate GST.
    const project = sale.projectId
      ? await tx.project.findUnique({
          where: { id: sale.projectId },
          select: { type: true },
        })
      : null;
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
    const payment = await tx.assetSalePayment.create({
      data: {
        assetSaleId: sale.id,
        amount: payAmount.toString(),
        paymentDate: new Date(),
        mode: paymentMode ?? "BANK_TRANSFER",
        reference: `Installment ${item.installmentNo}: ${item.description}`,
      },
    });

    // Post GL entry: Dr Cash, Cr AR (reduces the receivable created by postAssetSale)
    await postPaymentReceived(tx, {
      companyId: sale.companyId,
      assetSaleId: sale.id,
      paymentId: payment.id,
      amount: payAmount,
      postedById: userId,
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
