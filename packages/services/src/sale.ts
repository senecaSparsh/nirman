import { prisma, type Prisma, type AssetType } from "@nirman/db";
import Decimal from "decimal.js";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";
import {
  postAssetSale,
  postPaymentReceived,
  postDepositReceived,
  postDepositRefund,
  postJournalEntry,
  reverseJournalEntry,
  ACCT,
} from "./gl-posting";
import { ServiceError } from "./errors";
import { emitNotificationEvent, NotificationEventType } from "./notification-event-bus";
import { autoSyncEntryToTally } from "./auto-sync";

/**
 * Sale Service — sell land parcels or built units to customers.
 *
 * Staged deposit flow (real estate):
 *   PENDING → DEPOSIT_RECEIVED → COMPLETED
 *                              ↘ CANCELLED
 *
 * - Asset must be AVAILABLE or HOLD (sellable states)
 * - Asset.saleId must be null (no double-sell)
 * - A deposit is recorded as a LIABILITY (Customer Deposits account) —
 *   revenue + COGS are NOT recognised until the sale completes.
 * - On completion: deposit liability is reversed into revenue, remaining
 *   balance is posted, COGS relieves the asset at cost, asset → SOLD.
 * - Immediate full payment at creation time bypasses the deposit stage
 *   (saleStage = COMPLETED, existing behaviour preserved).
 * - Cancellation refunds the deposit and releases the asset back to AVAILABLE.
 */

async function generateSaleNumber(tx: Prisma.TransactionClient): Promise<string> {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `SAL-${ymd}-`;
  const count = await tx.assetSale.count({ where: { saleNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export interface SellAssetInput {
  assetType: AssetType;
  landParcelId?: string;
  builtUnitId?: string;
  customerId: string;
  companyId: string;
  salePrice: Decimal | number | string;
  gstRate?: Decimal | number | string; // GST % applied on sale (e.g. 1, 5, 18). Default 0.
  paymentMode?: string;
  notes?: string;
  initialPayment?: Decimal | number | string;
  initialPaymentMode?: string;
  userId?: string;
}

export async function sellAsset(input: SellAssetInput) {
  const sale = await prisma.$transaction(async (tx) => {
    // Validate customer
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, companyId: input.companyId, deletedAt: null },
    });
    if (!customer) throw new ServiceError("Customer not found or deleted", 404);

    const salePrice = new Decimal(input.salePrice);
    if (!salePrice.gt(0)) throw new ServiceError("Sale price must be > 0");

    let projectId: string;
    let companyId: string;
    let costBasis: Decimal;
    let landParcelId: string | null = null;
    let builtUnitId: string | null = null;

    if (input.assetType === "LAND") {
      if (!input.landParcelId) throw new ServiceError("Land sale requires landParcelId");
      if (input.builtUnitId) throw new ServiceError("Land sale must not have builtUnitId");
      landParcelId = input.landParcelId;

      // Lock the parcel
      const parcel = await tx.landParcel.findUnique({
        where: { id: input.landParcelId },
      });
      if (!parcel) throw new ServiceError("Land parcel not found", 404);
      if (parcel.deletedAt) throw new ServiceError("Land parcel is deleted");
      if (parcel.status !== "AVAILABLE" && parcel.status !== "HOLD") {
        throw new ServiceError(`Cannot sell parcel in status ${parcel.status}. Must be AVAILABLE or HOLD.`);
      }
      if (parcel.saleId) throw new ServiceError("Parcel is already sold (double-sell guard)");

      // Determine project + company
      const projectIdRaw = parcel.projectId;
      if (!projectIdRaw) {
        // Fall back to landPurchase's project
        const landPurchase = await tx.landPurchase.findUnique({
          where: { id: parcel.landPurchaseId },
        });
        if (!landPurchase?.projectId) {
          throw new ServiceError("Land parcel must be linked to a project before selling (for accounting)");
        }
        projectId = landPurchase.projectId;
      } else {
        projectId = projectIdRaw;
      }

      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project) throw new ServiceError("Project not found", 404);
      companyId = project.companyId;
      costBasis = new Decimal(parcel.acquisitionCost);
      // NOTE: asset status is NOT changed here — it stays AVAILABLE until a
      // deposit is recorded (→ RESERVED) or the sale completes (→ SOLD).
    } else {
      if (!input.builtUnitId) throw new ServiceError("Built unit sale requires builtUnitId");
      if (input.landParcelId) throw new ServiceError("Built unit sale must not have landParcelId");
      builtUnitId = input.builtUnitId;

      const unit = await tx.builtUnit.findUnique({
        where: { id: input.builtUnitId },
      });
      if (!unit) throw new ServiceError("Built unit not found", 404);
      if (unit.deletedAt) throw new ServiceError("Built unit is deleted");
      if (unit.status !== "AVAILABLE" && unit.status !== "HOLD") {
        throw new ServiceError(`Cannot sell unit in status ${unit.status}. Must be AVAILABLE or HOLD.`);
      }
      if (unit.saleId) throw new ServiceError("Unit is already sold (double-sell guard)");

      projectId = unit.projectId;
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project) throw new ServiceError("Project not found", 404);
      companyId = project.companyId;
      costBasis = new Decimal(unit.productionCost);
      // NOTE: asset status is NOT changed here — see above.
    }

    // Compute GST on the sale (Output GST liability)
    const gstRate = input.gstRate ? new Decimal(input.gstRate) : new Decimal(0);
    if (gstRate.lt(0) || gstRate.gt(100)) throw new ServiceError("gstRate must be between 0 and 100");
    const gstAmount = salePrice.mul(gstRate).div(100).toDecimalPlaces(2);

    // Determine whether this is an immediate full-payment sale or a staged sale.
    // Total collectible = salePrice + gstAmount (GST is charged on top of sale price).
    const totalCollectible = salePrice.plus(gstAmount);
    const initAmount = input.initialPayment ? new Decimal(input.initialPayment) : new Decimal(0);
    if (initAmount.gt(0) && initAmount.gt(totalCollectible)) {
      throw new ServiceError(`Initial payment ${initAmount} exceeds total ${totalCollectible} (sale price + GST)`);
    }
    const isImmediateFullPayment = initAmount.gt(0) && initAmount.gte(totalCollectible);

    // Create the sale (always starts as PENDING; upgraded below if immediate)
    const profit = salePrice.minus(costBasis);
    const sale = await tx.assetSale.create({
      data: {
        saleNumber: await generateSaleNumber(tx),
        assetType: input.assetType,
        landParcelId,
        builtUnitId,
        customerId: input.customerId,
        projectId,
        companyId,
        salePrice,
        gstRate,
        gstAmount,
        costBasis,
        profit,
        paymentStatus: "PENDING",
        paymentMode: input.paymentMode,
        notes: input.notes,
        saleStage: "PENDING",
      },
    });

    // Lock the asset by setting saleId (prevents double-sell regardless of status)
    if (input.assetType === "LAND" && landParcelId) {
      await tx.landParcel.update({ where: { id: landParcelId }, data: { saleId: sale.id } });
    } else if (builtUnitId) {
      await tx.builtUnit.update({ where: { id: builtUnitId }, data: { saleId: sale.id } });
    }

    if (isImmediateFullPayment) {
      // ── Immediate full payment: recognise revenue + COGS now (existing behaviour) ──
      await markAssetStatus(tx, input.assetType, landParcelId, builtUnitId, "SOLD");
      await delistPortalListings(tx, builtUnitId);

      await tx.assetSalePayment.create({
        data: {
          assetSaleId: sale.id,
          amount: initAmount,
          mode: input.initialPaymentMode ?? "BANK_TRANSFER",
        },
      });

      await tx.assetSale.update({
        where: { id: sale.id },
        data: { paymentStatus: "PAID", saleStage: "COMPLETED", finalSaleDate: new Date() },
      });

      // Post revenue + COGS
      await postAssetSale(tx, {
        companyId,
        assetSaleId: sale.id,
        assetType: input.assetType,
        salePrice,
        costBasis,
        gstAmount,
        postedById: input.userId,
      });

      // Post the cash payment (settles the receivable)
      const payment = await tx.assetSalePayment.findFirst({
        where: { assetSaleId: sale.id },
        orderBy: { paymentDate: "desc" },
      });
      if (payment) {
        await postPaymentReceived(tx, {
          companyId,
          assetSaleId: sale.id,
          paymentId: payment.id,
          amount: initAmount,
          postedById: input.userId,
        });
      }
    } else if (initAmount.gt(0)) {
      // ── Partial initial payment: treat as a deposit (liability, no revenue yet) ──
      await markAssetStatus(tx, input.assetType, landParcelId, builtUnitId, "RESERVED");

      await tx.assetSalePayment.create({
        data: {
          assetSaleId: sale.id,
          amount: initAmount,
          mode: input.initialPaymentMode ?? "BANK_TRANSFER",
        },
      });

      await tx.assetSale.update({
        where: { id: sale.id },
        data: {
          paymentStatus: "PARTIAL",
          saleStage: "DEPOSIT_RECEIVED",
          depositAmount: initAmount,
          depositDate: new Date(),
        },
      });

      // Post deposit as a liability (Dr Cash, Cr Customer Deposits)
      await postDepositReceived(tx, {
        companyId,
        assetSaleId: sale.id,
        amount: initAmount,
        postedById: input.userId,
      });
    }
    // else: no payment → sale stays PENDING, asset stays AVAILABLE (but saleId-locked)

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        companyId,
        action: "ASSET_SALE_CREATE",
        entityType: "AssetSale",
        entityId: sale.id,
        after: {
          saleNumber: sale.saleNumber,
          assetType: sale.assetType,
          salePrice: sale.salePrice,
          saleStage: isImmediateFullPayment ? "COMPLETED" : initAmount.gt(0) ? "DEPOSIT_RECEIVED" : "PENDING",
        },
      });
    }

    return sale;
  }, { isolationLevel: "Serializable" });

  void emitNotificationEvent({
    eventType: NotificationEventType.SALE_CREATED,
    companyId: input.companyId,
    entityType: "AssetSale",
    entityId: sale.id,
    variables: {
      saleNumber: sale.saleNumber,
      salePrice: new Decimal(sale.salePrice).toFixed(2),
      assetType: sale.assetType,
    },
    timestamp: new Date(),
  });

  // Auto-sync to Tally (best-effort)
  void (async () => {
    try {
      const je = await prisma.journalEntry.findFirst({
        where: { sourceId: sale.id, sourceType: "ASSET_SALE" },
        select: { id: true },
      });
      if (je) await autoSyncEntryToTally(input.companyId, je.id);
    } catch { /* best-effort */ }
  })();

  return sale;
}

// ───────────────────────────────────────────────────────────
//  Deposit stage — record a customer deposit on a pending sale
// ───────────────────────────────────────────────────────────

export interface RecordDepositInput {
  saleId: string;
  depositAmount: Decimal | number | string;
  paymentMode?: string;
  reference?: string;
  userId?: string;
}

export async function recordDeposit(input: RecordDepositInput) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.assetSale.findUnique({
      where: { id: input.saleId },
      include: { payments: true },
    });
    if (!sale) throw new ServiceError("Sale not found", 404);
    if (sale.status === "CANCELLED") throw new ServiceError("Cannot record deposit on a cancelled sale");
    if (sale.saleStage === "COMPLETED") throw new ServiceError("Sale is already completed");

    const depositAmount = new Decimal(input.depositAmount);
    if (!depositAmount.gt(0)) throw new ServiceError("Deposit amount must be > 0");

    const salePrice = new Decimal(sale.salePrice);
    const gstAmount = new Decimal(sale.gstAmount);
    const totalCollectible = salePrice.plus(gstAmount);
    const existingDeposit = sale.depositAmount ? new Decimal(sale.depositAmount) : new Decimal(0);
    const cumulativeDeposit = existingDeposit.plus(depositAmount);
    if (cumulativeDeposit.gt(totalCollectible)) {
      throw new ServiceError(
        `Deposit ${cumulativeDeposit} would exceed total ${totalCollectible} (sale price + GST)`,
      );
    }

    // Record the deposit as a payment row (for audit trail / receipts)
    const payment = await tx.assetSalePayment.create({
      data: {
        assetSaleId: input.saleId,
        amount: depositAmount,
        mode: input.paymentMode ?? "BANK_TRANSFER",
        reference: input.reference,
      },
    });

    // Update sale stage + deposit fields
    const paymentStatus = cumulativeDeposit.gte(totalCollectible) ? "PAID" : "PARTIAL";
    await tx.assetSale.update({
      where: { id: input.saleId },
      data: {
        saleStage: "DEPOSIT_RECEIVED",
        depositAmount: cumulativeDeposit,
        depositDate: sale.depositDate ?? new Date(),
        paymentStatus,
      },
    });

    // Set asset to RESERVED
    await markAssetStatus(tx, sale.assetType, sale.landParcelId, sale.builtUnitId, "RESERVED");

    // Post deposit liability: Dr Cash, Cr Customer Deposits
    await postDepositReceived(tx, {
      companyId: sale.companyId,
      assetSaleId: input.saleId,
      amount: depositAmount,
      postedById: input.userId,
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        companyId: sale.companyId,
        action: "ASSET_SALE_DEPOSIT",
        entityType: "AssetSale",
        entityId: input.saleId,
        after: { depositAmount: depositAmount.toString(), paymentMode: input.paymentMode, saleStage: "DEPOSIT_RECEIVED" },
      });
    }

    return { payment, saleStage: "DEPOSIT_RECEIVED" as const, paymentStatus };
  }, { isolationLevel: "Serializable" });
}

// ───────────────────────────────────────────────────────────
//  Complete sale — final payment + title transfer + revenue recognition
// ───────────────────────────────────────────────────────────

export interface CompleteSaleInput {
  saleId: string;
  finalPaymentAmount?: Decimal | number | string; // remaining balance (default: salePrice - deposit)
  paymentMode?: string;
  reference?: string;
  userId?: string;
}

export async function completeSale(input: CompleteSaleInput) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.assetSale.findUnique({
      where: { id: input.saleId },
      include: { payments: true },
    });
    if (!sale) throw new ServiceError("Sale not found", 404);
    if (sale.status === "CANCELLED") throw new ServiceError("Cannot complete a cancelled sale");
    if (sale.saleStage === "COMPLETED") throw new ServiceError("Sale is already completed");

    const salePrice = new Decimal(sale.salePrice);
    const gstAmount = new Decimal(sale.gstAmount);
    const costBasis = new Decimal(sale.costBasis);
    const depositAmount = sale.depositAmount ? new Decimal(sale.depositAmount) : new Decimal(0);
    const totalPaidSoFar = sale.payments.reduce(
      (sum, p) => sum.plus(new Decimal(p.amount)),
      new Decimal(0),
    );

    // Determine the final payment (remaining balance)
    const remainingBalance = salePrice.plus(gstAmount).minus(totalPaidSoFar);
    const finalPayment = input.finalPaymentAmount
      ? new Decimal(input.finalPaymentAmount)
      : remainingBalance;
    if (finalPayment.lt(0)) throw new ServiceError("Final payment cannot be negative");
    if (finalPayment.gt(remainingBalance)) {
      throw new ServiceError(`Final payment (${finalPayment}) exceeds remaining balance (${remainingBalance})`);
    }
    if (finalPayment.gt(0)) {
      // Record the final payment
      await tx.assetSalePayment.create({
        data: {
          assetSaleId: input.saleId,
          amount: finalPayment,
          mode: input.paymentMode ?? "BANK_TRANSFER",
          reference: input.reference,
        },
      });
    }

    // Mark asset SOLD + delist portal listings
    await markAssetStatus(tx, sale.assetType, sale.landParcelId, sale.builtUnitId, "SOLD");
    await delistPortalListings(tx, sale.builtUnitId);

    // Update sale stage
    await tx.assetSale.update({
      where: { id: input.saleId },
      data: {
        saleStage: "COMPLETED",
        finalSaleDate: new Date(),
        paymentStatus: "PAID",
      },
    });

    // ── GL postings ──
    // 1. Post full revenue + COGS (as if the sale happened now)
    await postAssetSale(tx, {
      companyId: sale.companyId,
      assetSaleId: input.saleId,
      assetType: sale.assetType,
      salePrice,
      costBasis,
      gstAmount,
      postedById: input.userId,
    });

    // 2. Reverse the deposit liability into the receivable (the deposit was
    //    Dr Cash / Cr Customer_Deposit; now we Dr Customer_Deposit / Cr AR to
    //    settle the receivable that was just created by postAssetSale).
    if (depositAmount.gt(0)) {
      await postJournalEntry(tx, {
        companyId: sale.companyId,
        sourceType: "ASSET_SALE_DEPOSIT_SETTLE",
        sourceId: input.saleId,
        memo: "Settle customer deposit against receivable on sale completion",
        postedById: input.userId,
        lines: [
          { accountCode: ACCT.CUSTOMER_DEPOSIT, debit: depositAmount, credit: 0, entityType: "AssetSale", entityId: input.saleId, memo: "Reverse deposit liability" },
          { accountCode: ACCT.AR, debit: 0, credit: depositAmount, entityType: "AssetSale", entityId: input.saleId, memo: "Settle receivable with deposit" },
        ],
      });
    }

    // 3. Post the final cash payment (Dr Cash, Cr AR)
    if (finalPayment.gt(0)) {
      const finalPaymentRow = await tx.assetSalePayment.findFirst({
        where: { assetSaleId: input.saleId },
        orderBy: { paymentDate: "desc" },
      });
      if (finalPaymentRow) {
        await postPaymentReceived(tx, {
          companyId: sale.companyId,
          assetSaleId: input.saleId,
          paymentId: finalPaymentRow.id,
          amount: finalPayment,
          postedById: input.userId,
        });
      }
    }

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        companyId: sale.companyId,
        action: "ASSET_SALE_COMPLETE",
        entityType: "AssetSale",
        entityId: input.saleId,
        before: { saleStage: sale.saleStage },
        after: { saleStage: "COMPLETED", finalSaleDate: new Date().toISOString() },
      });
    }

    return { saleStage: "COMPLETED" as const, paymentStatus: "PAID" as const };
  }, { isolationLevel: "Serializable" });
}

// ───────────────────────────────────────────────────────────
//  Record additional payment (against a completed sale's receivable)
// ───────────────────────────────────────────────────────────

export interface RecordPaymentInput {
  assetSaleId: string;
  amount: Decimal | number | string;
  mode: string;
  reference?: string;
  userId?: string;
}

export async function recordPayment(input: RecordPaymentInput) {
  const result = await prisma.$transaction(async (tx) => {
    const sale = await tx.assetSale.findUnique({
      where: { id: input.assetSaleId },
      include: { payments: true },
    });
    if (!sale) throw new ServiceError("Sale not found", 404);
    if (sale.status === "CANCELLED") throw new ServiceError("Cannot record payment against a cancelled sale");
    if (sale.saleStage === "COMPLETED") throw new ServiceError("Cannot record payment on a completed sale");

    const amount = new Decimal(input.amount);
    if (!amount.gt(0)) throw new ServiceError("Payment amount must be > 0");

    const totalCollectible = new Decimal(sale.salePrice).plus(new Decimal(sale.gstAmount));
    const existingTotal = sale.payments.reduce(
      (sum, p) => sum.plus(new Decimal(p.amount)),
      new Decimal(0),
    );
    const cumulative = existingTotal.plus(amount);
    if (cumulative.gt(totalCollectible)) {
      throw new ServiceError(
        `Overpayment: cumulative ${cumulative} > total ${totalCollectible} (sale price + GST)`,
      );
    }

    const payment = await tx.assetSalePayment.create({
      data: {
        assetSaleId: input.assetSaleId,
        amount,
        mode: input.mode,
        reference: input.reference,
      },
    });

    // Recompute payment status (against total collectible = salePrice + GST)
    let paymentStatus: "PENDING" | "PARTIAL" | "PAID";
    if (cumulative.isZero()) {
      paymentStatus = "PENDING";
    } else if (cumulative.lt(totalCollectible)) {
      paymentStatus = "PARTIAL";
    } else {
      paymentStatus = "PAID";
    }

    await tx.assetSale.update({
      where: { id: input.assetSaleId },
      data: { paymentStatus },
    });

    // Post the payment to the General Ledger: cash settles the receivable.
    await postPaymentReceived(tx, {
      companyId: sale.companyId,
      assetSaleId: input.assetSaleId,
      paymentId: payment.id,
      amount,
      postedById: input.userId,
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        companyId: sale.companyId,
        action: "ASSET_SALE_PAYMENT",
        entityType: "AssetSale",
        entityId: input.assetSaleId,
        after: { amount, mode: input.mode, paymentStatus },
      });
    }

    return { payment, paymentStatus, companyId: sale.companyId };
  }, { isolationLevel: "Serializable" });

  void emitNotificationEvent({
    eventType: NotificationEventType.SALE_PAYMENT_RECEIVED,
    companyId: result.companyId,
    entityType: "AssetSale",
    entityId: input.assetSaleId,
    variables: {
      amount: new Decimal(input.amount).toFixed(2),
      mode: input.mode,
      paymentStatus: result.paymentStatus,
    },
    timestamp: new Date(),
  });

  return { payment: result.payment, paymentStatus: result.paymentStatus };
}

// ───────────────────────────────────────────────────────────
//  Cancel sale — release asset + refund deposit if applicable
// ───────────────────────────────────────────────────────────

export async function cancelSale(saleId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.assetSale.findUnique({
      where: { id: saleId },
      include: { payments: true },
    });
    if (!sale) throw new ServiceError("Sale not found", 404);
    if (sale.status === "CANCELLED") throw new ServiceError("Sale already cancelled");
    if (sale.saleStage === "COMPLETED") {
      throw new ServiceError("Cannot cancel a completed sale — process a refund instead");
    }

    const depositAmount = sale.depositAmount ? new Decimal(sale.depositAmount) : new Decimal(0);

    // Revert asset status to AVAILABLE + unlock
    await markAssetStatus(tx, sale.assetType, sale.landParcelId, sale.builtUnitId, "AVAILABLE");
    if (sale.assetType === "LAND" && sale.landParcelId) {
      await tx.landParcel.update({ where: { id: sale.landParcelId }, data: { saleId: null } });
    } else if (sale.builtUnitId) {
      await tx.builtUnit.update({ where: { id: sale.builtUnitId }, data: { saleId: null } });
    }

    // Reverse GL entries based on the sale stage
    if (sale.saleStage === "DEPOSIT_RECEIVED" && depositAmount.gt(0)) {
      // Refund the deposit: Dr Customer_Deposit, Cr Cash
      await postDepositRefund(tx, {
        companyId: sale.companyId,
        assetSaleId: saleId,
        amount: depositAmount,
        postedById: userId,
      });
    } else if (sale.saleStage === "PENDING") {
      // No deposit, no revenue posted — nothing to reverse in GL.
      // (PENDING sales never posted revenue/COGS or deposit liability.)
    }

    // Re-run cost allocation — a reserved/sold unit's production cost was cached;
    // cancellation makes it sellable again, so allocation must be refreshed.
    await reallocateProjectCosts(tx, sale.projectId);

    const updated = await tx.assetSale.update({
      where: { id: saleId },
      data: { status: "CANCELLED", saleStage: "CANCELLED" },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        companyId: sale.companyId,
        action: "ASSET_SALE_CANCEL",
        entityType: "AssetSale",
        entityId: saleId,
        before: { status: sale.status, saleStage: sale.saleStage },
        after: { status: "CANCELLED", saleStage: "CANCELLED" },
      });
    }

    return updated;
  }, { isolationLevel: "Serializable" });
}

// ───────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────

/** Update the asset (land parcel or built unit) status. */
async function markAssetStatus(
  tx: Prisma.TransactionClient,
  assetType: AssetType,
  landParcelId: string | null,
  builtUnitId: string | null,
  status: "AVAILABLE" | "RESERVED" | "SOLD",
) {
  if (assetType === "LAND" && landParcelId) {
    await tx.landParcel.update({ where: { id: landParcelId }, data: { status } });
  } else if (builtUnitId) {
    await tx.builtUnit.update({ where: { id: builtUnitId }, data: { status } });
  }
}

/** Auto-delist any active portal listings for a built unit (on sale completion). */
async function delistPortalListings(tx: Prisma.TransactionClient, builtUnitId: string | null) {
  if (!builtUnitId) return;
  const activeListings = await tx.portalListing.findMany({
    where: { builtUnitId, status: { in: ["DRAFT", "LISTED"] } },
    select: { id: true },
  });
  for (const listing of activeListings) {
    await tx.portalListing.update({
      where: { id: listing.id },
      data: { status: "DELISTED", delistedAt: new Date(), lastSyncedAt: new Date() },
    });
  }
}

/**
 * Pure function: compute profit from a sale.
 */
export function computeSaleProfit(salePrice: Decimal, costBasis: Decimal): Decimal {
  return new Decimal(salePrice).minus(new Decimal(costBasis));
}

/**
 * Pure function: compute payment status from total paid vs sale price.
 */
export function computePaymentStatus(
  totalPaid: Decimal,
  salePrice: Decimal,
): "PENDING" | "PARTIAL" | "PAID" {
  const paid = new Decimal(totalPaid);
  const price = new Decimal(salePrice);
  if (paid.isZero()) return "PENDING";
  if (paid.lt(price)) return "PARTIAL";
  return "PAID";
}
