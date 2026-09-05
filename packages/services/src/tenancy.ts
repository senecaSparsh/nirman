import { prisma, type Prisma, type AssetType, type TenancyStatus } from "@nirman/db";
import { withSerializableTransaction } from "./transaction";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { postJournalEntry, postSecurityDepositReceived, postSecurityDepositRefunded, ACCT } from "./gl-posting";
import { emitNotificationEvent, NotificationEventType } from "./notification-event-bus";
import { sendNotification } from "./notifications";
import { ServiceError } from "./errors";

/**
 * Tenancy Service — rent/lease agreements for land parcels and built units.
 *
 * Lifecycle: PENDING → ACTIVE (on start) → EXPIRED (auto on end) | TERMINATED
 * Invariants:
 *  - Asset must exist + belong to the company
 *  - Asset must be AVAILABLE (or already RENTED for re-letting after expiry)
 *  - endDate >= startDate
 *  - monthlyRent > 0
 *  - On activation: asset status → RENTED
 *  - On termination/expiry: asset status → AVAILABLE
 *  - GL: rent payments credit Sales Revenue (rent income) + debit Cash
 */

/**
 * Validate a rent payment and compute net received.
 * Pure function — no DB access.
 *
 * Throws if amount ≤ 0, TDS < 0, or TDS > amount.
 *   netReceived = amount − tdsAmount
 */
export function validateRentPayment(
  amount: Decimal,
  tdsAmount: Decimal,
): { netReceived: Decimal } {
  if (!amount.gt(0)) throw new ServiceError("Amount must be > 0");
  if (tdsAmount.lt(0)) throw new ServiceError("TDS amount cannot be negative");
  if (tdsAmount.gt(amount)) throw new ServiceError("TDS amount cannot exceed rent amount");
  const netReceived = amount.minus(tdsAmount);
  return { netReceived };
}

/**
 * Compute rent GST breakdown.
 * Pure function — no DB access.
 *
 *   gstAmount      = amount × gstRate / 100
 *   revenueAmount  = amount − gstAmount
 */
export function computeRentGst(
  amount: Decimal,
  gstRate: Decimal,
): { gstAmount: Decimal; revenueAmount: Decimal } {
  const gstAmount = amount.mul(gstRate).div(100);
  const revenueAmount = amount.minus(gstAmount);
  return { gstAmount, revenueAmount };
}

/**
 * Apply a rent escalation.
 * Pure function — no DB access.
 *
 *   increase = oldRent × escalationPercent / 100
 *   newRent  = oldRent + increase  (rounded to 2 dp)
 */
export function computeEscalatedRent(
  oldRent: Decimal,
  escalationPercent: Decimal,
): { increase: Decimal; newRent: Decimal } {
  const increase = oldRent.mul(escalationPercent).div(100);
  const newRent = oldRent.plus(increase).toDecimalPlaces(2);
  return { increase, newRent };
}

export interface CreateTenancyInput {
  companyId: string;
  assetType: AssetType;
  landParcelId?: string;
  builtUnitId?: string;
  customerId?: string;
  projectId?: string;
  tenantName: string;
  tenantPhone?: string;
  tenantEmail?: string;
  startDate: string | Date;
  endDate: string | Date;
  monthlyRent: Decimal | number | string;
  securityDeposit?: Decimal | number | string;
  rentAgreementNo?: string;
  rentAgreementDocumentUrl?: string;
  rentAgreementDocumentName?: string;
  sacCode?: string; // SAC code for GST on rental income (default 997313)
  // ── Yearly escalation ──
  escalationPercent?: Decimal | number | string;
  escalationIntervalMonths?: number;
  // ── Rent-free / fit-out period ──
  rentFreeDays?: number;
  // ── Draft / LOI (Letter of Intent) ──
  draftDocumentUrl?: string;
  draftDocumentName?: string;
  draftNotes?: string;
  draftDate?: string | Date;
  notes?: string;
  userId?: string;
}

export async function createTenancy(input: CreateTenancyInput) {
  const tenancy = await withSerializableTransaction(async (tx) => {
    const monthlyRent = new Decimal(input.monthlyRent);
    if (!monthlyRent.gt(0)) throw new ServiceError("Monthly rent must be > 0");

    const startDate = input.startDate instanceof Date ? input.startDate : new Date(input.startDate);
    const endDate = input.endDate instanceof Date ? input.endDate : new Date(input.endDate);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) throw new ServiceError("Invalid dates");
    if (endDate < startDate) throw new ServiceError("End date cannot be before start date");

    // Validate asset + ownership
    let projectId: string | null = input.projectId ?? null;
    if (input.assetType === "LAND") {
      if (!input.landParcelId) throw new ServiceError("Land tenancy requires landParcelId");
      const parcel = await tx.landParcel.findUnique({ where: { id: input.landParcelId } });
      if (!parcel || parcel.deletedAt) throw new ServiceError("Land parcel not found or deleted", 404);
      if (parcel.status !== "AVAILABLE" && parcel.status !== "RENTED") {
        throw new ServiceError(`Cannot rent parcel in status ${parcel.status}. Must be AVAILABLE.`);
      }
      if (!projectId) projectId = parcel.projectId;
    } else {
      if (!input.builtUnitId) throw new ServiceError("Built unit tenancy requires builtUnitId");
      const unit = await tx.builtUnit.findUnique({ where: { id: input.builtUnitId } });
      if (!unit || unit.deletedAt) throw new ServiceError("Built unit not found or deleted", 404);
      if (unit.status !== "AVAILABLE" && unit.status !== "RENTED") {
        throw new ServiceError(`Cannot rent unit in status ${unit.status}. Must be AVAILABLE.`);
      }
      if (!projectId) projectId = unit.projectId;
    }

    // Validate customer if provided
    if (input.customerId) {
      const customer = await tx.customer.findFirst({ where: { id: input.customerId, companyId: input.companyId, deletedAt: null } });
      if (!customer) throw new ServiceError("Customer not found or deleted", 404);
    }

    // Check for overlapping tenancies on the same asset
    const overlapping = await tx.tenancy.findFirst({
      where: {
        status: { in: ["PENDING", "ACTIVE"] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        OR: [
          ...(input.landParcelId ? [{ landParcelId: input.landParcelId }] : []),
          ...(input.builtUnitId ? [{ builtUnitId: input.builtUnitId }] : []),
        ],
      },
    });
    if (overlapping) {
      throw new ServiceError("An overlapping tenancy already exists for this asset and date range", 409);
    }

    const tenancy = await tx.tenancy.create({
      data: {
        companyId: input.companyId,
        assetType: input.assetType,
        landParcelId: input.landParcelId ?? null,
        builtUnitId: input.builtUnitId ?? null,
        customerId: input.customerId ?? null,
        projectId,
        tenantName: input.tenantName,
        tenantPhone: input.tenantPhone ?? null,
        tenantEmail: input.tenantEmail ?? null,
        startDate,
        endDate,
        monthlyRent,
        baseRent: monthlyRent,
        securityDeposit: new Decimal(input.securityDeposit ?? 0),
        rentAgreementNo: input.rentAgreementNo ?? null,
        rentAgreementDocumentUrl: input.rentAgreementDocumentUrl ?? null,
        rentAgreementDocumentName: input.rentAgreementDocumentName ?? null,
        sacCode: input.sacCode ?? "997313", // default: construction equipment rental
        escalationPercent: input.escalationPercent != null ? new Decimal(input.escalationPercent) : null,
        escalationIntervalMonths: input.escalationIntervalMonths ?? 12,
        nextEscalationDate: input.escalationPercent != null
          ? new Date(startDate.getTime() + (input.escalationIntervalMonths ?? 12) * 30 * 86400000)
          : null,
        rentFreeDays: input.rentFreeDays ?? 0,
        draftDocumentUrl: input.draftDocumentUrl ?? null,
        draftDocumentName: input.draftDocumentName ?? null,
        draftNotes: input.draftNotes ?? null,
        draftDate: input.draftDate
          ? (input.draftDate instanceof Date ? input.draftDate : new Date(input.draftDate))
          : null,
        status: "PENDING",
        notes: input.notes ?? null,
        createdById: input.userId ?? null,
      },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "TENANCY_CREATE",
        entityType: "Tenancy",
        entityId: tenancy.id,
        after: { tenantName: tenancy.tenantName, monthlyRent: tenancy.monthlyRent.toString(), status: tenancy.status },
      });
    }

    return tenancy;
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.TENANCY_CREATED,
    companyId: input.companyId,
    entityType: "Tenancy",
    entityId: tenancy.id,
    variables: {
      tenantName: input.tenantName,
      monthlyRent: new Decimal(input.monthlyRent).toString(),
      assetType: input.assetType,
    },
    timestamp: new Date(),
  });

  return tenancy;
}

export interface UpdateTenancyInput {
  companyId: string;
  tenantName?: string;
  tenantPhone?: string | null;
  tenantEmail?: string | null;
  startDate?: string | Date;
  endDate?: string | Date;
  monthlyRent?: Decimal | number | string;
  securityDeposit?: Decimal | number | string;
  rentAgreementNo?: string | null;
  rentAgreementDocumentUrl?: string | null;
  rentAgreementDocumentName?: string | null;
  notes?: string | null;
  customerId?: string | null;
  escalationPercent?: Decimal | number | string | null;
  rentFreeDays?: number;
  draftDocumentUrl?: string | null;
  draftDocumentName?: string | null;
  draftNotes?: string | null;
  draftDate?: string | Date | null;
  userId?: string;
}

export async function updateTenancy(tenancyId: string, input: UpdateTenancyInput) {
  return withSerializableTransaction(async (tx) => {
    const t = await tx.tenancy.findFirst({ where: { id: tenancyId, companyId: input.companyId } });
    if (!t) throw new ServiceError("Tenancy not found", 404);
    if (t.status !== "PENDING") {
      throw new ServiceError(`Cannot edit tenancy in status ${t.status}. Only PENDING tenancies can be edited.`);
    }

    const data: Prisma.TenancyUpdateInput = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    if (input.tenantName !== undefined && input.tenantName !== t.tenantName) {
      if (!input.tenantName.trim()) throw new ServiceError("Tenant name cannot be empty");
      data.tenantName = input.tenantName;
      before.tenantName = t.tenantName;
      after.tenantName = input.tenantName;
    }
    if (input.tenantPhone !== undefined && input.tenantPhone !== t.tenantPhone) {
      data.tenantPhone = input.tenantPhone ?? null;
      before.tenantPhone = t.tenantPhone;
      after.tenantPhone = input.tenantPhone;
    }
    if (input.tenantEmail !== undefined && input.tenantEmail !== t.tenantEmail) {
      data.tenantEmail = input.tenantEmail ?? null;
      before.tenantEmail = t.tenantEmail;
      after.tenantEmail = input.tenantEmail;
    }
    if (input.startDate !== undefined) {
      const startDate = input.startDate instanceof Date ? input.startDate : new Date(input.startDate);
      if (isNaN(startDate.getTime())) throw new ServiceError("Invalid start date");
      if (startDate.getTime() !== t.startDate.getTime()) {
        data.startDate = startDate;
        before.startDate = t.startDate.toISOString();
        after.startDate = startDate.toISOString();
      }
    }
    if (input.endDate !== undefined) {
      const endDate = input.endDate instanceof Date ? input.endDate : new Date(input.endDate);
      if (isNaN(endDate.getTime())) throw new ServiceError("Invalid end date");
      if (endDate.getTime() !== t.endDate.getTime()) {
        data.endDate = endDate;
        before.endDate = t.endDate.toISOString();
        after.endDate = endDate.toISOString();
      }
    }
    if (data.startDate && data.endDate && (data.endDate as Date) < (data.startDate as Date)) {
      throw new ServiceError("End date cannot be before start date");
    }
    if (data.startDate && !data.endDate && t.endDate < (data.startDate as Date)) {
      throw new ServiceError("End date cannot be before start date");
    }
    if (data.endDate && !data.startDate && (data.endDate as Date) < t.startDate) {
      throw new ServiceError("End date cannot be before start date");
    }

    // Overlap check: if dates are changing, verify no conflicting tenancy
    // exists on the same asset for the new date range.
    if (data.startDate || data.endDate) {
      const checkStart = (data.startDate as Date | undefined) ?? t.startDate;
      const checkEnd = (data.endDate as Date | undefined) ?? t.endDate;
      const overlapping = await tx.tenancy.findFirst({
        where: {
          id: { not: tenancyId },
          status: { in: ["PENDING", "ACTIVE"] },
          startDate: { lte: checkEnd },
          endDate: { gte: checkStart },
          OR: [
            ...(t.landParcelId ? [{ landParcelId: t.landParcelId }] : []),
            ...(t.builtUnitId ? [{ builtUnitId: t.builtUnitId }] : []),
          ],
        },
      });
      if (overlapping) {
        throw new ServiceError("An overlapping tenancy already exists for this asset and date range", 409);
      }
    }

    if (input.monthlyRent !== undefined) {
      const monthlyRent = new Decimal(input.monthlyRent);
      if (!monthlyRent.gt(0)) throw new ServiceError("Monthly rent must be > 0");
      if (!monthlyRent.eq(t.monthlyRent)) {
        data.monthlyRent = monthlyRent;
        before.monthlyRent = t.monthlyRent.toString();
        after.monthlyRent = monthlyRent.toString();
      }
    }
    if (input.securityDeposit !== undefined) {
      const securityDeposit = new Decimal(input.securityDeposit);
      if (securityDeposit.lt(0)) throw new ServiceError("Security deposit cannot be negative");
      if (!securityDeposit.eq(t.securityDeposit)) {
        data.securityDeposit = securityDeposit;
        before.securityDeposit = t.securityDeposit.toString();
        after.securityDeposit = securityDeposit.toString();
      }
    }
    if (input.rentAgreementNo !== undefined && input.rentAgreementNo !== t.rentAgreementNo) {
      data.rentAgreementNo = input.rentAgreementNo ?? null;
      before.rentAgreementNo = t.rentAgreementNo;
      after.rentAgreementNo = input.rentAgreementNo;
    }
    if (input.rentAgreementDocumentUrl !== undefined && input.rentAgreementDocumentUrl !== t.rentAgreementDocumentUrl) {
      data.rentAgreementDocumentUrl = input.rentAgreementDocumentUrl ?? null;
      before.rentAgreementDocumentUrl = t.rentAgreementDocumentUrl;
      after.rentAgreementDocumentUrl = input.rentAgreementDocumentUrl;
    }
    if (input.rentAgreementDocumentName !== undefined && input.rentAgreementDocumentName !== t.rentAgreementDocumentName) {
      data.rentAgreementDocumentName = input.rentAgreementDocumentName ?? null;
    }
    if (input.escalationPercent !== undefined) {
      const escPct = input.escalationPercent == null ? null : new Decimal(input.escalationPercent);
      if (escPct && escPct.lt(0)) throw new ServiceError("Escalation percent cannot be negative");
      const currentEsc = t.escalationPercent ? new Decimal(t.escalationPercent) : null;
      if ((escPct && !currentEsc) || (escPct && currentEsc && !escPct.eq(currentEsc)) || (!escPct && currentEsc)) {
        data.escalationPercent = escPct;
        before.escalationPercent = t.escalationPercent?.toString() ?? null;
        after.escalationPercent = escPct?.toString() ?? null;
      }
    }
    if (input.notes !== undefined && input.notes !== t.notes) {
      data.notes = input.notes ?? null;
      before.notes = t.notes;
      after.notes = input.notes;
    }
    if (input.customerId !== undefined && input.customerId !== t.customerId) {
      if (input.customerId) {
        const customer = await tx.customer.findFirst({ where: { id: input.customerId, companyId: input.companyId, deletedAt: null } });
        if (!customer) throw new ServiceError("Customer not found or deleted", 404);
        data.customer = { connect: { id: input.customerId } };
      } else {
        data.customer = { disconnect: true };
      }
      before.customerId = t.customerId;
      after.customerId = input.customerId;
    }

    if (Object.keys(data).length === 0) {
      return t; // no changes
    }

    const updated = await tx.tenancy.update({ where: { id: t.id }, data });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "TENANCY_UPDATE",
        entityType: "Tenancy",
        entityId: t.id,
        before,
        after,
      });
    }
    return updated;
  });
}

export async function activateTenancy(tenancyId: string, companyId: string, userId?: string) {
  return withSerializableTransaction(async (tx) => {
    const t = await tx.tenancy.findFirst({ where: { id: tenancyId, companyId } });
    if (!t) throw new ServiceError("Tenancy not found", 404);
    if (t.status !== "PENDING" && t.status !== "ACTIVE") {
      throw new ServiceError(`Cannot activate tenancy in status ${t.status}`);
    }
    // Mark asset as RENTED
    if (t.assetType === "LAND" && t.landParcelId) {
      await tx.landParcel.update({ where: { id: t.landParcelId }, data: { status: "RENTED" } });
    } else if (t.builtUnitId) {
      await tx.builtUnit.update({ where: { id: t.builtUnitId }, data: { status: "RENTED" } });
    }
    const updated = await tx.tenancy.update({ where: { id: t.id }, data: { status: "ACTIVE" } });

    // Post the security deposit to GL: Dr Cash, Cr Security Deposits Payable.
    if (new Decimal(t.securityDeposit).gt(0)) {
      await postSecurityDepositReceived(tx, {
        companyId: t.companyId,
        tenancyId: t.id,
        amount: t.securityDeposit,
        postedById: userId,
      });
    }

    // Auto-generate the initial rent schedule (12 months or until end date)
    // so the user doesn't have to manually click "Generate Schedule" after
    // activation. Idempotent — skips periods that already have a RentalPayment.
    const rent = new Decimal(t.monthlyRent);
    const start = new Date(t.startDate);
    const end = new Date(t.endDate);
    const now = new Date();
    const monthsAhead = 12;
    let scheduleCreated = 0;

    for (let i = 0; i < monthsAhead; i++) {
      const dueDate = new Date(now.getFullYear(), now.getMonth() + i, start.getDate());
      if (dueDate > end) break;

      const periodStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), 1);
      const periodEnd = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0);

      const existing = await tx.rentalPayment.findFirst({
        where: { tenancyId: t.id, periodStart },
      });
      if (existing) continue;

      await tx.rentalPayment.create({
        data: {
          tenancyId: t.id,
          amount: rent,
          tdsAmount: new Decimal(0),
          netReceived: new Decimal(0),
          paymentDate: dueDate,
          dueDate,
          mode: "PENDING",
          reference: null,
          status: dueDate <= now ? "OVERDUE" : "PENDING",
          periodStart,
          periodEnd,
        },
      });
      scheduleCreated++;
    }

    if (userId) {
      await logAction(tx, {
        userId,
        action: "TENANCY_ACTIVATE",
        entityType: "Tenancy",
        entityId: t.id,
        before: { status: t.status },
        after: { status: "ACTIVE", rentScheduleAutoGenerated: scheduleCreated },
      });
    }
    return updated;
  });
}

export async function terminateTenancy(tenancyId: string, companyId: string, userId?: string) {
  const result = await withSerializableTransaction(async (tx) => {
    const t = await tx.tenancy.findFirst({ where: { id: tenancyId, companyId } });
    if (!t) throw new ServiceError("Tenancy not found", 404);
    if (t.status !== "ACTIVE" && t.status !== "PENDING") {
      throw new ServiceError(`Cannot terminate tenancy in status ${t.status}`);
    }
    // Release the asset back to AVAILABLE
    if (t.assetType === "LAND" && t.landParcelId) {
      await tx.landParcel.update({ where: { id: t.landParcelId }, data: { status: "AVAILABLE" } });
    } else if (t.builtUnitId) {
      await tx.builtUnit.update({ where: { id: t.builtUnitId }, data: { status: "AVAILABLE" } });
    }
    const updated = await tx.tenancy.update({ where: { id: t.id }, data: { status: "TERMINATED" } });

    // Refund the security deposit: Dr Security Deposits Payable, Cr Cash.
    // Only refund if the tenancy was ACTIVE (deposit was posted at activation).
    // PENDING tenancies never had the deposit posted to GL, so there's nothing
    // to refund — refunding would create an orphan Dr Security Deposits / Cr Cash.
    if (t.status === "ACTIVE" && new Decimal(t.securityDeposit).gt(0)) {
      await postSecurityDepositRefunded(tx, {
        companyId: t.companyId,
        tenancyId: t.id,
        amount: t.securityDeposit,
        postedById: userId,
      });
    }

    if (userId) {
      await logAction(tx, {
        userId,
        action: "TENANCY_TERMINATE",
        entityType: "Tenancy",
        entityId: t.id,
        before: { status: t.status },
        after: { status: "TERMINATED" },
      });
    }
    return { updated, tenantName: t.tenantName };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.TENANCY_TERMINATED,
    companyId,
    entityType: "Tenancy",
    entityId: tenancyId,
    variables: {
      tenantName: result.tenantName,
    },
    timestamp: new Date(),
  });

  return result.updated;
}

export interface RecordRentInput {
  tenancyId: string;
  companyId: string;
  amount: Decimal | number | string;
  paymentDate?: string | Date;
  dueDate?: string | Date;
  mode: string;
  reference?: string;
  // ── TDS tracking ──
  tdsAmount?: Decimal | number | string;
  tdsCertificateNo?: string;
  // ── Rent period ──
  periodStart?: string | Date;
  periodEnd?: string | Date;
  userId?: string;
}

export async function recordRentPayment(input: RecordRentInput) {
  const result = await withSerializableTransaction(async (tx) => {
    const t = await tx.tenancy.findFirst({ where: { id: input.tenancyId, companyId: input.companyId } });
    if (!t) throw new ServiceError("Tenancy not found", 404);
    if (t.status !== "ACTIVE" && t.status !== "PENDING") {
      throw new ServiceError(`Cannot record rent payment on a ${t.status} tenancy. Tenancy must be ACTIVE or PENDING.`);
    }
    const amount = new Decimal(input.amount);
    if (!amount.gt(0)) throw new ServiceError("Amount must be > 0");

    const tdsAmount = input.tdsAmount != null ? new Decimal(input.tdsAmount) : new Decimal(0);
    if (tdsAmount.lt(0)) throw new ServiceError("TDS amount cannot be negative");
    if (tdsAmount.gt(amount)) throw new ServiceError("TDS amount cannot exceed rent amount");
    const netReceived = amount.minus(tdsAmount);

    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
    const dueDate = input.dueDate ? new Date(input.dueDate) : paymentDate;
    const periodStart = input.periodStart ? new Date(input.periodStart) : null;
    const periodEnd = input.periodEnd ? new Date(input.periodEnd) : null;

    // Guard against duplicate payments for the same tenancy + payment date
    const existingPayment = await tx.rentalPayment.findFirst({
      where: { tenancyId: t.id, paymentDate },
    });
    if (existingPayment) {
      throw new ServiceError("Payment already recorded for this period", 409);
    }

    // ── Compute output GST from the SAC code ──
    // Renting out equipment/property is a SERVICE supply under GST.
    // The SAC code on the tenancy determines the GST rate.
    // Default: 997313 (construction equipment rental, 18%).
    // Residential property rent (997211) is exempt (0%).
    let gstRate = new Decimal(18); // default
    if (t.sacCode) {
      const sacEntry = await tx.hsnGstRate.findUnique({
        where: { hsnCode: t.sacCode },
        select: { gstRate: true },
      });
      if (sacEntry) {
        gstRate = new Decimal(sacEntry.gstRate);
      }
    }
    const gstAmount = amount.mul(gstRate).div(100);
    const revenueAmount = amount.minus(gstAmount);

    const payment = await tx.rentalPayment.create({
      data: {
        tenancyId: t.id,
        amount,
        tdsAmount,
        tdsCertificateNo: input.tdsCertificateNo ?? null,
        netReceived,
        paymentDate,
        dueDate,
        mode: input.mode,
        reference: input.reference ?? null,
        status: "RECEIVED",
        periodStart,
        periodEnd,
      },
    });

    // GL: Dr Cash (net received), Dr TDS Receivable (TDS deducted), Cr Sales Revenue (rent income), Cr Output GST
    const glLines: { accountCode: string; debit: Decimal | number; credit: Decimal | number; entityType: string; entityId: string; memo: string }[] = [
      { accountCode: ACCT.CASH, debit: netReceived, credit: 0, entityType: "Tenancy", entityId: t.id, memo: "Rent received (net of TDS)" },
      { accountCode: ACCT.SALES_REVENUE, debit: 0, credit: revenueAmount, entityType: "Tenancy", entityId: t.id, memo: "Rental income" },
    ];
    if (tdsAmount.gt(0)) {
      // TDS deducted by tenant — debited to TDS Receivable (will be claimed from IT department)
      glLines.push({
        accountCode: ACCT.TDS_RECEIVABLE,
        debit: tdsAmount,
        credit: 0,
        entityType: "Tenancy",
        entityId: t.id,
        memo: `TDS deducted on rent${input.tdsCertificateNo ? ` (Cert: ${input.tdsCertificateNo})` : ""}`,
      });
    }
    if (gstAmount.gt(0)) {
      glLines.push({
        accountCode: ACCT.OUTPUT_GST,
        debit: 0,
        credit: gstAmount,
        entityType: "Tenancy",
        entityId: t.id,
        memo: `Output GST @ ${gstRate}% on rent (SAC ${t.sacCode ?? "997313"})`,
      });
    }
    await postJournalEntry(tx, {
      companyId: input.companyId,
      sourceType: "RENT_PAYMENT",
      sourceId: payment.id,
      memo: `Rent received from ${t.tenantName}`,
      postedById: input.userId,
      lines: glLines,
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "RENT_PAYMENT_RECORD",
        entityType: "RentalPayment",
        entityId: payment.id,
        after: { tenancyId: t.id, amount: amount.toString(), tdsAmount: tdsAmount.toString(), netReceived: netReceived.toString(), mode: input.mode, gstRate: gstRate.toString(), gstAmount: gstAmount.toString() },
      });
    }

    return payment;
  });

  return result;
}

// ───────────────────────────────────────────────────────────
//  RENT ESCALATION — apply yearly rent increase
// ───────────────────────────────────────────────────────────

export interface ApplyEscalationInput {
  tenancyId: string;
  companyId: string;
  userId?: string;
}

/**
 * Apply the yearly rent escalation for a tenancy.
 * Increases monthlyRent by escalationPercent, updates nextEscalationDate,
 * and logs the change. Returns the updated tenancy.
 */
export async function applyRentEscalation(input: ApplyEscalationInput) {
  const result = await withSerializableTransaction(async (tx) => {
    const t = await tx.tenancy.findFirst({ where: { id: input.tenancyId, companyId: input.companyId } });
    if (!t) throw new ServiceError("Tenancy not found", 404);
    if (t.status !== "ACTIVE") {
      throw new ServiceError(`Cannot escalate rent on a ${t.status} tenancy. Tenancy must be ACTIVE.`);
    }
    if (!t.escalationPercent) {
      throw new ServiceError("This tenancy has no escalation clause configured");
    }

    const oldRent = new Decimal(t.monthlyRent);
    const escPct = new Decimal(t.escalationPercent);
    const increase = oldRent.mul(escPct).div(100);
    const newRent = oldRent.plus(increase).toDecimalPlaces(2);

    // Compute next escalation date
    const intervalMs = t.escalationIntervalMonths * 30 * 86400000;
    const nextDate = new Date(Date.now() + intervalMs);

    const updated = await tx.tenancy.update({
      where: { id: t.id },
      data: {
        monthlyRent: newRent,
        lastEscalatedAt: new Date(),
        nextEscalationDate: nextDate,
      },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "RENT_ESCALATION_APPLIED",
        entityType: "Tenancy",
        entityId: t.id,
        before: { monthlyRent: oldRent.toString() },
        after: { monthlyRent: newRent.toString(), escalationPercent: escPct.toString(), nextEscalationDate: nextDate.toISOString() },
      });
    }

    return { tenancy: updated, oldRent, newRent, increase };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.RENT_ESCALATION_APPLIED,
    companyId: input.companyId,
    entityType: "Tenancy",
    entityId: input.tenancyId,
    variables: {
      tenantName: result.tenancy.tenantName,
      oldRent: result.oldRent.toString(),
      newRent: result.newRent.toString(),
      increase: result.increase.toString(),
    },
    timestamp: new Date(),
  });

  return result;
}

/**
 * Check all active tenancies for due escalations and apply them.
 * Called by a cron job or manual trigger. Returns count of escalated tenancies.
 */
export async function processDueEscalations(companyId?: string) {
  const now = new Date();
  const dueTenancies = await prisma.tenancy.findMany({
    where: {
      status: "ACTIVE",
      escalationPercent: { not: null },
      nextEscalationDate: { lte: now },
      ...(companyId ? { companyId } : {}),
    },
  });

  let count = 0;
  for (const t of dueTenancies) {
    try {
      await applyRentEscalation({ tenancyId: t.id, companyId: t.companyId });
      count++;
    } catch {
      // Skip failures — will retry on next cron run
    }
  }
  return { checked: dueTenancies.length, escalated: count };
}

// ───────────────────────────────────────────────────────────
//  TENANT CHANGE — replace tenant on an active tenancy
// ───────────────────────────────────────────────────────────

export interface ChangeTenantInput {
  tenancyId: string;
  companyId: string;
  newTenantName: string;
  newTenantPhone?: string;
  newTenantEmail?: string;
  newCustomerId?: string;
  newMonthlyRent?: Decimal | number | string;
  newRentAgreementNo?: string;
  newRentAgreementDocumentUrl?: string;
  newRentAgreementDocumentName?: string;
  newStartDate?: string | Date;
  newEndDate?: string | Date;
  newSecurityDeposit?: Decimal | number | string;
  notes?: string;
  userId?: string;
}

/**
 * Change the tenant on a tenancy. This terminates the current tenant
 * and creates a new tenancy record for the same asset with the new tenant.
 * The old tenancy is marked TERMINATED; a new ACTIVE tenancy is created.
 */
export async function changeTenant(input: ChangeTenantInput) {
  return withSerializableTransaction(async (tx) => {
    const t = await tx.tenancy.findFirst({ where: { id: input.tenancyId, companyId: input.companyId } });
    if (!t) throw new ServiceError("Tenancy not found", 404);
    if (t.status !== "ACTIVE" && t.status !== "EXPIRED") {
      throw new ServiceError(`Cannot change tenant on a ${t.status} tenancy. Must be ACTIVE or EXPIRED.`);
    }
    if (!input.newTenantName.trim()) throw new ServiceError("New tenant name is required");

    // Validate new customer if provided
    if (input.newCustomerId) {
      const customer = await tx.customer.findFirst({
        where: { id: input.newCustomerId, companyId: input.companyId, deletedAt: null },
      });
      if (!customer) throw new ServiceError("New customer not found or deleted", 404);
    }

    // Terminate the old tenancy
    if (t.assetType === "LAND" && t.landParcelId) {
      await tx.landParcel.update({ where: { id: t.landParcelId }, data: { status: "AVAILABLE" } });
    } else if (t.builtUnitId) {
      await tx.builtUnit.update({ where: { id: t.builtUnitId }, data: { status: "AVAILABLE" } });
    }
    await tx.tenancy.update({ where: { id: t.id }, data: { status: "TERMINATED" } });

    // Refund old security deposit if was ACTIVE
    if (t.status === "ACTIVE" && new Decimal(t.securityDeposit).gt(0)) {
      await postSecurityDepositRefunded(tx, {
        companyId: t.companyId,
        tenancyId: t.id,
        amount: t.securityDeposit,
        postedById: input.userId,
      });
    }

    // Create new tenancy
    const newRent = input.newMonthlyRent != null ? new Decimal(input.newMonthlyRent) : new Decimal(t.monthlyRent);
    const newDeposit = input.newSecurityDeposit != null ? new Decimal(input.newSecurityDeposit) : new Decimal(t.securityDeposit);
    const newStart = input.newStartDate ? new Date(input.newStartDate) : new Date();
    const newEnd = input.newEndDate ? new Date(input.newEndDate) : new Date(t.endDate);

    // Mark asset as RENTED again
    if (t.assetType === "LAND" && t.landParcelId) {
      await tx.landParcel.update({ where: { id: t.landParcelId }, data: { status: "RENTED" } });
    } else if (t.builtUnitId) {
      await tx.builtUnit.update({ where: { id: t.builtUnitId }, data: { status: "RENTED" } });
    }

    const newTenancy = await tx.tenancy.create({
      data: {
        companyId: t.companyId,
        assetType: t.assetType,
        landParcelId: t.landParcelId,
        builtUnitId: t.builtUnitId,
        customerId: input.newCustomerId ?? null,
        projectId: t.projectId,
        tenantName: input.newTenantName.trim(),
        tenantPhone: input.newTenantPhone ?? null,
        tenantEmail: input.newTenantEmail ?? null,
        startDate: newStart,
        endDate: newEnd,
        monthlyRent: newRent,
        baseRent: newRent,
        securityDeposit: newDeposit,
        rentAgreementNo: input.newRentAgreementNo ?? null,
        rentAgreementDocumentUrl: input.newRentAgreementDocumentUrl ?? null,
        rentAgreementDocumentName: input.newRentAgreementDocumentName ?? null,
        sacCode: t.sacCode,
        escalationPercent: t.escalationPercent,
        escalationIntervalMonths: t.escalationIntervalMonths,
        nextEscalationDate: t.escalationPercent
          ? new Date(newStart.getTime() + t.escalationIntervalMonths * 30 * 86400000)
          : null,
        status: "ACTIVE",
        notes: input.notes ?? `Tenant changed from ${t.tenantName}`,
        createdById: input.userId ?? null,
      },
    });

    // Post new security deposit to GL
    if (newDeposit.gt(0)) {
      await postSecurityDepositReceived(tx, {
        companyId: t.companyId,
        tenancyId: newTenancy.id,
        amount: newDeposit,
        postedById: input.userId,
      });
    }

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "TENANT_CHANGE",
        entityType: "Tenancy",
        entityId: newTenancy.id,
        before: { oldTenancyId: t.id, oldTenantName: t.tenantName },
        after: { newTenantName: input.newTenantName, newMonthlyRent: newRent.toString() },
      });
    }

    return { oldTenancyId: t.id, newTenancy };
  });
}

// ───────────────────────────────────────────────────────────
//  RENT SCHEDULE — generate monthly rent due records
// ───────────────────────────────────────────────────────────

export interface GenerateRentScheduleInput {
  tenancyId: string;
  companyId: string;
  monthsAhead?: number; // default 12
  userId?: string;
}

/**
 * Generate monthly rent due records (RentalPayment with status PENDING)
 * for the next N months. These act as rent invoices — when the tenant
 * pays, the record is updated to RECEIVED via recordRentPayment.
 */
export async function generateRentSchedule(input: GenerateRentScheduleInput) {
  const monthsAhead = input.monthsAhead ?? 12;
  return withSerializableTransaction(async (tx) => {
    const t = await tx.tenancy.findFirst({ where: { id: input.tenancyId, companyId: input.companyId } });
    if (!t) throw new ServiceError("Tenancy not found", 404);
    if (t.status !== "ACTIVE") {
      throw new ServiceError(`Cannot generate rent schedule on a ${t.status} tenancy. Must be ACTIVE.`);
    }

    const rent = new Decimal(t.monthlyRent);
    const start = new Date(t.startDate);
    const end = new Date(t.endDate);
    const now = new Date();

    const created: string[] = [];
    const skipped: string[] = [];

    for (let i = 0; i < monthsAhead; i++) {
      // Due date = same day of month as start, for the next N months from now
      const dueDate = new Date(now.getFullYear(), now.getMonth() + i, start.getDate());
      if (dueDate > end) break;

      const periodStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), 1);
      const periodEnd = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0);

      // Check if a payment already exists for this period
      const existing = await tx.rentalPayment.findFirst({
        where: {
          tenancyId: t.id,
          periodStart,
        },
      });
      if (existing) {
        skipped.push(periodStart.toISOString().slice(0, 10));
        continue;
      }

      const payment = await tx.rentalPayment.create({
        data: {
          tenancyId: t.id,
          amount: rent,
          tdsAmount: new Decimal(0),
          netReceived: new Decimal(0),
          paymentDate: dueDate, // placeholder — updated when payment is received
          dueDate,
          mode: "PENDING",
          reference: null,
          status: dueDate <= now ? "OVERDUE" : "PENDING",
          periodStart,
          periodEnd,
        },
      });
      created.push(payment.id);
    }

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "RENT_SCHEDULE_GENERATE",
        entityType: "Tenancy",
        entityId: t.id,
        after: { monthsAhead, created: created.length, skipped: skipped.length },
      });
    }

    return { created: created.length, skipped: skipped.length, createdIds: created };
  });
}

/**
 * Auto-generate rent due records for the next month for all active tenancies.
 * Called by the cron job so users don't have to manually click "Generate Schedule"
 * every month. Idempotent — skips periods that already have a RentalPayment.
 */
export async function generateDueRentSchedules(): Promise<{ checked: number; created: number }> {
  const activeTenancies = await prisma.tenancy.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, companyId: true, monthlyRent: true, startDate: true, endDate: true },
  });

  let created = 0;
  const now = new Date();

  for (const t of activeTenancies) {
    try {
      const rent = new Decimal(t.monthlyRent);
      const start = new Date(t.startDate);
      const end = new Date(t.endDate);
      // Generate for the current month + next 2 months (covers any gaps)
      for (let i = 0; i < 3; i++) {
        const dueDate = new Date(now.getFullYear(), now.getMonth() + i, start.getDate());
        if (dueDate > end) break;

        const periodStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), 1);
        const periodEnd = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0);

        const existing = await prisma.rentalPayment.findFirst({
          where: { tenancyId: t.id, periodStart },
        });
        if (existing) continue;

        await prisma.rentalPayment.create({
          data: {
            tenancyId: t.id,
            amount: rent,
            tdsAmount: new Decimal(0),
            netReceived: new Decimal(0),
            paymentDate: dueDate,
            dueDate,
            mode: "PENDING",
            reference: null,
            status: dueDate <= now ? "OVERDUE" : "PENDING",
            periodStart,
            periodEnd,
          },
        });
        created++;
      }
    } catch {
      // Skip failed tenancies
    }
  }

  return { checked: activeTenancies.length, created };
}

// ───────────────────────────────────────────────────────────
//  RENT DUE REMINDERS — send notifications for overdue rent
// ───────────────────────────────────────────────────────────

/**
 * Check all active tenancies for overdue rent and send reminders.
 * Called by a cron job or manual trigger.
 */
export async function sendRentDueReminders(companyId?: string) {
  const now = new Date();
  const overduePayments = await prisma.rentalPayment.findMany({
    where: {
      status: "OVERDUE",
      paymentDate: { lte: now },
      tenancy: {
        status: "ACTIVE",
        ...(companyId ? { companyId } : {}),
      },
    },
    include: {
      tenancy: { select: { tenantName: true, tenantPhone: true, tenantEmail: true, monthlyRent: true, companyId: true } },
    },
    take: 100,
  });

  let sent = 0;
  for (const p of overduePayments) {
    try {
      const recipient = p.tenancy.tenantPhone ?? p.tenancy.tenantEmail;
      if (!recipient) continue;

      await sendNotification({
        companyId: p.tenancy.companyId,
        eventType: "RENT_DUE_REMINDER",
        channel: p.tenancy.tenantPhone ? "WHATSAPP" : "EMAIL",
        recipient,
        recipientName: p.tenancy.tenantName,
        message: `Dear ${p.tenancy.tenantName}, your rent of ${p.amount} is overdue (due date: ${p.dueDate.toISOString().slice(0, 10)}). Please make the payment at the earliest. — Nirman Inventory`,
        metadata: { tenancyId: p.tenancyId, paymentId: p.id, amount: p.amount.toString() },
      });

      // Mark as reminded — keep OVERDUE status so the bill still appears overdue.
      // Track last reminder time + count to avoid spamming (cron checks reminderSentAt).
      await prisma.rentalPayment.update({
        where: { id: p.id },
        data: {
          reminderSentAt: new Date(),
          reminderCount: { increment: 1 },
        },
      });
      sent++;
    } catch {
      // Skip failures
    }
  }
  return { checked: overduePayments.length, sent };
}

// ───────────────────────────────────────────────────────────
//  UPLOAD RENT AGREEMENT DOCUMENT
// ───────────────────────────────────────────────────────────

export interface UploadAgreementInput {
  tenancyId: string;
  companyId: string;
  documentUrl: string;
  documentName?: string;
  userId?: string;
}

export async function uploadRentAgreement(input: UploadAgreementInput) {
  return withSerializableTransaction(async (tx) => {
    const t = await tx.tenancy.findFirst({ where: { id: input.tenancyId, companyId: input.companyId } });
    if (!t) throw new ServiceError("Tenancy not found", 404);

    const updated = await tx.tenancy.update({
      where: { id: t.id },
      data: {
        rentAgreementDocumentUrl: input.documentUrl,
        rentAgreementDocumentName: input.documentName ?? null,
      },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "RENT_AGREEMENT_UPLOAD",
        entityType: "Tenancy",
        entityId: t.id,
        after: { documentUrl: input.documentUrl, documentName: input.documentName ?? null },
      });
    }

    return updated;
  });
}

// ───────────────────────────────────────────────────────────
//  UPLOAD DRAFT / LOI DOCUMENT
//  The informal "tera-mera" agreement before the registered one.
//  Printable on company letterhead. No legal validity — just a record.
// ───────────────────────────────────────────────────────────

export interface UploadDraftInput {
  tenancyId: string;
  companyId: string;
  documentUrl?: string;
  documentName?: string;
  draftNotes?: string;
  draftDate?: string | Date;
  userId?: string;
}

export async function uploadDraft(input: UploadDraftInput) {
  return withSerializableTransaction(async (tx) => {
    const t = await tx.tenancy.findFirst({ where: { id: input.tenancyId, companyId: input.companyId } });
    if (!t) throw new ServiceError("Tenancy not found", 404);

    const data: Prisma.TenancyUpdateInput = {};
    if (input.documentUrl !== undefined) {
      data.draftDocumentUrl = input.documentUrl ?? null;
      data.draftDocumentName = input.documentName ?? null;
    }
    if (input.draftNotes !== undefined) {
      data.draftNotes = input.draftNotes ?? null;
    }
    if (input.draftDate !== undefined) {
      data.draftDate = input.draftDate
        ? (input.draftDate instanceof Date ? input.draftDate : new Date(input.draftDate))
        : null;
    }

    const updated = await tx.tenancy.update({ where: { id: t.id }, data });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "TENANCY_DRAFT_UPLOAD",
        entityType: "Tenancy",
        entityId: t.id,
        after: { draftDocumentUrl: input.documentUrl, draftNotes: input.draftNotes },
      });
    }

    return updated;
  });
}
