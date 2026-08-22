import { prisma, type Prisma, type AssetType, type TenancyStatus } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { postJournalEntry, postSecurityDepositReceived, postSecurityDepositRefunded, ACCT } from "./gl-posting";
import { emitNotificationEvent, NotificationEventType } from "./notification-event-bus";
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
  sacCode?: string; // SAC code for GST on rental income (default 997313)
  notes?: string;
  userId?: string;
}

export async function createTenancy(input: CreateTenancyInput) {
  const tenancy = await prisma.$transaction(async (tx) => {
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
        securityDeposit: new Decimal(input.securityDeposit ?? 0),
        rentAgreementNo: input.rentAgreementNo ?? null,
        sacCode: input.sacCode ?? "997313", // default: construction equipment rental
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
  }, { isolationLevel: "Serializable" });

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
  notes?: string | null;
  customerId?: string | null;
  userId?: string;
}

export async function updateTenancy(tenancyId: string, input: UpdateTenancyInput) {
  return prisma.$transaction(async (tx) => {
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
  }, { isolationLevel: "Serializable" });
}

export async function activateTenancy(tenancyId: string, companyId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
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

    if (userId) {
      await logAction(tx, {
        userId,
        action: "TENANCY_ACTIVATE",
        entityType: "Tenancy",
        entityId: t.id,
        before: { status: t.status },
        after: { status: "ACTIVE" },
      });
    }
    return updated;
  }, { isolationLevel: "Serializable" });
}

export async function terminateTenancy(tenancyId: string, companyId: string, userId?: string) {
  const result = await prisma.$transaction(async (tx) => {
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
    if (new Decimal(t.securityDeposit).gt(0)) {
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
  }, { isolationLevel: "Serializable" });

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
  userId?: string;
}

export async function recordRentPayment(input: RecordRentInput) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.tenancy.findFirst({ where: { id: input.tenancyId, companyId: input.companyId } });
    if (!t) throw new ServiceError("Tenancy not found", 404);
    const amount = new Decimal(input.amount);
    if (!amount.gt(0)) throw new ServiceError("Amount must be > 0");

    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
    const dueDate = input.dueDate ? new Date(input.dueDate) : paymentDate;

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
        paymentDate,
        dueDate,
        mode: input.mode,
        reference: input.reference ?? null,
        status: "RECEIVED",
      },
    });

    // GL: Dr Cash, Cr Sales Revenue (rent income), Cr Output GST
    const glLines: { accountCode: string; debit: Decimal | number; credit: Decimal | number; entityType: string; entityId: string; memo: string }[] = [
      { accountCode: ACCT.CASH, debit: amount, credit: 0, entityType: "Tenancy", entityId: t.id, memo: "Rent received" },
      { accountCode: ACCT.SALES_REVENUE, debit: 0, credit: revenueAmount, entityType: "Tenancy", entityId: t.id, memo: "Rental income" },
    ];
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
        after: { tenancyId: t.id, amount: amount.toString(), mode: input.mode, gstRate: gstRate.toString(), gstAmount: gstAmount.toString() },
      });
    }

    return payment;
  }, { isolationLevel: "Serializable" });
}
