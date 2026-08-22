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
  postSaleExpense,
  postBrokerCommission,
  postBrokerCommissionPaid,
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
  projectId?: string; // required for PROJECT asset type
  customerId: string;
  companyId: string;
  salePrice: Decimal | number | string;
  gstRate?: Decimal | number | string; // GST % applied on sale (e.g. 1, 5, 18). Default 0.
  paymentMode?: string;
  notes?: string;
  initialPayment?: Decimal | number | string;
  initialPaymentMode?: string;
  userId?: string;
  // Sale deed / registry tracking
  saleDeedNo?: string;          // sale deed / registry number (if registry is done at creation)
  expectedRegistryDate?: string; // ISO date — when registry is expected (if ATS / deferred)
  // Sale compliance documents
  allotmentLetterNo?: string;
  allotmentDate?: string;       // ISO date
  bbaNo?: string;
  bbaDate?: string;             // ISO date
  // TDS tracking
  tdsAmount?: Decimal | number | string;
  tdsCertificateNo?: string;
  // Home loan tracking
  homeLoanBank?: string;
  homeLoanAmount?: Decimal | number | string;
  homeLoanSanctionNo?: string;
  homeLoanSanctionDate?: string; // ISO date
  // ── Deal terms ──
  dealMaturityMonths?: number;       // how many months until the deal matures
  paymentCycle?: string;             // free-text: "25% every month", "Quarterly", etc.
  // ── Sale expenses (registry, stamp duty, transfer, lease rent, GST, other) ──
  expenses?: SaleExpenseInput[];
  // ── Custom terms & conditions ──
  terms?: SaleTermInput[];
  // ── Broker / deal source ──
  dealSource?: "SELF" | "BROKER";
  brokerId?: string;
  brokerName?: string;
  brokerPhone?: string;
  commissionAmount?: Decimal | number | string;
  commissionIsPartOfDeal?: boolean;
  // ── Payment schedule (optional at creation) ──
  paymentSchedule?: PaymentScheduleInput;
}

export interface SaleExpenseInput {
  head: "REGISTRY" | "STAMP_DUTY" | "TRANSFER" | "LEASE_RENT" | "GST" | "OTHER";
  label?: string | null;
  amount: Decimal | number | string;
  borneBy: "CLIENT" | "SELLER" | "NA";
  isIncluded?: boolean;
}

export interface SaleTermInput {
  description: string;
  extraAmount?: Decimal | number | string | null;
  isIncluded?: boolean;
}

export interface PaymentScheduleInput {
  type: "CLP" | "TLP" | "DPP";
  items: PaymentScheduleItemInput[];
}

export interface PaymentScheduleItemInput {
  installmentNo: number;
  description: string;
  percentage: Decimal | number | string;
  amount: Decimal | number | string;
  dueDate?: string | null; // ISO date (for TLP/DPP)
  wbsNodeId?: string | null; // for CLP
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

    let projectId: string | null;
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

      // Determine project + company.
      // Standalone land (no project on parcel or landPurchase) is now supported —
      // the sale posts to company-level GL accounts (LAND_ASSET, SALES_REVENUE, COGS).
      const projectIdRaw = parcel.projectId;
      let resolvedProjectId: string | null = null;
      if (projectIdRaw) {
        resolvedProjectId = projectIdRaw;
      } else {
        // Fall back to landPurchase's project
        const landPurchase = await tx.landPurchase.findUnique({
          where: { id: parcel.landPurchaseId },
        });
        if (landPurchase?.projectId) {
          resolvedProjectId = landPurchase.projectId;
        }
        // If still null → standalone land sale (no project). This is valid.
      }

      if (resolvedProjectId) {
        projectId = resolvedProjectId;
        const project = await tx.project.findUnique({ where: { id: projectId } });
        if (!project) throw new ServiceError("Project not found", 404);
        companyId = project.companyId;
      } else {
        // Standalone land — get companyId from the landPurchase
        projectId = ""; // placeholder, will be set to null on AssetSale
        const landPurchase = await tx.landPurchase.findUnique({
          where: { id: parcel.landPurchaseId },
          select: { companyId: true },
        });
        if (!landPurchase) throw new ServiceError("Land purchase not found", 404);
        companyId = landPurchase.companyId;
      }
      costBasis = new Decimal(parcel.acquisitionCost);
      // NOTE: asset status is NOT changed here — it stays AVAILABLE until a
      // deposit is recorded (→ RESERVED) or the sale completes (→ SOLD).
    } else if (input.assetType === "BUILT_UNIT") {
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
      const project = await tx.project.findUnique({ where: { id: projectId! } });
      if (!project) throw new ServiceError("Project not found", 404);
      companyId = project.companyId;
      costBasis = new Decimal(unit.productionCost);
      // NOTE: asset status is NOT changed here — see above.
    } else if (input.assetType === "PROJECT") {
      // ── Project-level sale: sell the entire project (all units) to one buyer ──
      if (!input.projectId) throw new ServiceError("Project sale requires projectId");
      if (input.builtUnitId || input.landParcelId) throw new ServiceError("Project sale must not have builtUnitId or landParcelId");

      const project = await tx.project.findUnique({ where: { id: input.projectId } });
      if (!project) throw new ServiceError("Project not found", 404);
      if (project.deletedAt) throw new ServiceError("Project is deleted");

      projectId = project.id;
      companyId = project.companyId;

      // Check all units are sellable (AVAILABLE or HOLD, not already sold)
      const units = await tx.builtUnit.findMany({
        where: { projectId: project.id, deletedAt: null },
      });
      if (units.length === 0) throw new ServiceError("Project has no units to sell");
      const unsellable = units.filter((u) => u.status !== "AVAILABLE" && u.status !== "HOLD");
      if (unsellable.length > 0) {
        throw new ServiceError(
          `Cannot sell project: ${unsellable.length} unit(s) are not in AVAILABLE/HOLD status (e.g. SOLD/RESERVED). Only fully available projects can be sold as a whole.`,
        );
      }
      const alreadySold = units.filter((u) => u.saleId !== null);
      if (alreadySold.length > 0) {
        throw new ServiceError(`Cannot sell project: ${alreadySold.length} unit(s) are already locked to a sale`);
      }

      // Cost basis = sum of all units' production cost
      costBasis = units.reduce((sum, u) => sum.plus(new Decimal(u.productionCost)), new Decimal(0));
      // NOTE: individual unit statuses are NOT changed here — they stay AVAILABLE
      // until a deposit is recorded (→ RESERVED) or the sale completes (→ SOLD).
    } else {
      throw new ServiceError(`Unsupported asset type: ${input.assetType}`);
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

    // Compute deal maturity date if months provided
    let dealMaturityDate: Date | null = null;
    if (input.dealMaturityMonths && input.dealMaturityMonths > 0) {
      dealMaturityDate = new Date();
      dealMaturityDate.setMonth(dealMaturityDate.getMonth() + input.dealMaturityMonths);
    }

    const sale = await tx.assetSale.create({
      data: {
        saleNumber: await generateSaleNumber(tx),
        assetType: input.assetType,
        landParcelId,
        builtUnitId,
        customerId: input.customerId,
        projectId: projectId || null,
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
        saleDeedNo: input.saleDeedNo ?? null,
        expectedRegistryDate: input.expectedRegistryDate ? new Date(input.expectedRegistryDate) : null,
        // Sale compliance documents
        allotmentLetterNo: input.allotmentLetterNo ?? null,
        allotmentDate: input.allotmentDate ? new Date(input.allotmentDate) : null,
        bbaNo: input.bbaNo ?? null,
        bbaDate: input.bbaDate ? new Date(input.bbaDate) : null,
        // TDS tracking
        tdsAmount: input.tdsAmount ? new Decimal(input.tdsAmount) : null,
        tdsCertificateNo: input.tdsCertificateNo ?? null,
        // Home loan tracking
        homeLoanBank: input.homeLoanBank ?? null,
        homeLoanAmount: input.homeLoanAmount ? new Decimal(input.homeLoanAmount) : null,
        homeLoanSanctionNo: input.homeLoanSanctionNo ?? null,
        homeLoanSanctionDate: input.homeLoanSanctionDate ? new Date(input.homeLoanSanctionDate) : null,
        // Deal terms
        dealMaturityMonths: input.dealMaturityMonths ?? null,
        dealMaturityDate,
        paymentCycle: input.paymentCycle ?? null,
        // Broker / deal source
        dealSource: input.dealSource ?? "SELF",
        brokerId: input.brokerId ?? null,
        brokerName: input.brokerName ?? null,
        brokerPhone: input.brokerPhone ?? null,
        commissionAmount: input.commissionAmount ? new Decimal(input.commissionAmount) : null,
        commissionIsPartOfDeal: input.commissionIsPartOfDeal ?? false,
      },
    });

    // Lock the asset by setting saleId (prevents double-sell regardless of status)
    if (input.assetType === "LAND" && landParcelId) {
      await tx.landParcel.update({ where: { id: landParcelId }, data: { saleId: sale.id } });
    } else if (input.assetType === "BUILT_UNIT" && builtUnitId) {
      await tx.builtUnit.update({ where: { id: builtUnitId }, data: { saleId: sale.id } });
    } else if (input.assetType === "PROJECT" && projectId) {
      // Lock ALL units in the project
      await tx.builtUnit.updateMany({
        where: { projectId, deletedAt: null },
        data: { saleId: sale.id },
      });
    }

    // ── Create sale expenses (registry, stamp duty, transfer, etc.) ──
    if (input.expenses && input.expenses.length > 0) {
      for (const [i, exp] of input.expenses.entries()) {
        const amount = new Decimal(exp.amount);
        if (amount.lt(0)) throw new ServiceError(`Expense amount cannot be negative for head ${exp.head}`);
        const saleExpense = await tx.saleExpense.create({
          data: {
            assetSaleId: sale.id,
            head: exp.head,
            label: exp.label ?? null,
            amount,
            borneBy: exp.borneBy,
            isIncluded: exp.isIncluded ?? false,
            sortOrder: i,
          },
        });
        // GL post for seller-borne expenses (client-borne = collected via payment, NA = no posting)
        if (exp.borneBy === "SELLER" && amount.gt(0)) {
          await postSaleExpense(tx, {
            companyId,
            assetSaleId: sale.id,
            saleExpenseId: saleExpense.id,
            amount,
            postedById: input.userId,
          });
        }
      }
    }

    // ── Create sale terms & conditions ──
    if (input.terms && input.terms.length > 0) {
      for (const [i, term] of input.terms.entries()) {
        await tx.saleTerm.create({
          data: {
            assetSaleId: sale.id,
            description: term.description,
            extraAmount: term.extraAmount ? new Decimal(term.extraAmount) : null,
            isIncluded: term.isIncluded ?? true,
            sortOrder: i,
          },
        });
      }
    }

    // ── Accrue broker commission (if broker deal with commission) ──
    if (input.dealSource === "BROKER" && input.commissionAmount) {
      const commission = new Decimal(input.commissionAmount);
      if (commission.gt(0)) {
        await postBrokerCommission(tx, {
          companyId,
          assetSaleId: sale.id,
          amount: commission,
          postedById: input.userId,
        });
      }
    }

    // ── Create payment schedule (if provided) ──
    if (input.paymentSchedule && input.paymentSchedule.items.length > 0) {
      const schedule = input.paymentSchedule;
      const scheduleTotal = schedule.items.reduce(
        (sum, item) => sum.plus(new Decimal(item.amount)),
        new Decimal(0),
      );
      const scheduleGst = new Decimal(0); // GST is tracked at sale level, not per-installment
      await tx.paymentSchedule.create({
        data: {
          assetSaleId: sale.id,
          type: schedule.type,
          totalAmount: scheduleTotal,
          gstAmount: scheduleGst,
          grandTotal: scheduleTotal.plus(scheduleGst),
          items: {
            create: schedule.items.map((item) => ({
              installmentNo: item.installmentNo,
              description: item.description,
              percentage: new Decimal(item.percentage),
              amount: new Decimal(item.amount),
              gstPercentage: new Decimal(0),
              gstAmount: new Decimal(0),
              totalAmount: new Decimal(item.amount),
              dueDate: item.dueDate ? new Date(item.dueDate) : null,
              wbsNodeId: item.wbsNodeId ?? null,
            })),
          },
        },
      });
    }

    if (isImmediateFullPayment) {
      // ── Immediate full payment: recognise revenue + COGS now (existing behaviour) ──
      await markAssetStatus(tx, input.assetType, landParcelId, builtUnitId, "SOLD", projectId || null);
      await delistPortalListings(tx, builtUnitId, projectId || null);

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
      await markAssetStatus(tx, input.assetType, landParcelId, builtUnitId, "RESERVED", projectId || null);

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
    await markAssetStatus(tx, sale.assetType, sale.landParcelId, sale.builtUnitId, "RESERVED", sale.projectId);

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
  saleDeedNo?: string; // sale deed / registry number — captured at completion
  // Compliance fields that can be captured at completion
  allotmentLetterNo?: string;
  allotmentDate?: string;
  bbaNo?: string;
  bbaDate?: string;
  tdsAmount?: Decimal | number | string;
  tdsCertificateNo?: string;
  // Home loan details — often finalized at completion, not at booking
  homeLoanBank?: string;
  homeLoanAmount?: Decimal | number | string;
  homeLoanSanctionNo?: string;
  homeLoanSanctionDate?: string;
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
    await markAssetStatus(tx, sale.assetType, sale.landParcelId, sale.builtUnitId, "SOLD", sale.projectId);
    await delistPortalListings(tx, sale.builtUnitId, sale.projectId);

    // Update sale stage
    await tx.assetSale.update({
      where: { id: input.saleId },
      data: {
        saleStage: "COMPLETED",
        finalSaleDate: new Date(),
        paymentStatus: "PAID",
        ...(input.saleDeedNo ? { saleDeedNo: input.saleDeedNo } : {}),
        // Compliance fields captured at completion
        ...(input.allotmentLetterNo ? { allotmentLetterNo: input.allotmentLetterNo } : {}),
        ...(input.allotmentDate ? { allotmentDate: new Date(input.allotmentDate) } : {}),
        ...(input.bbaNo ? { bbaNo: input.bbaNo } : {}),
        ...(input.bbaDate ? { bbaDate: new Date(input.bbaDate) } : {}),
        ...(input.tdsAmount ? { tdsAmount: new Decimal(input.tdsAmount) } : {}),
        ...(input.tdsCertificateNo ? { tdsCertificateNo: input.tdsCertificateNo } : {}),
        // Home loan details — often finalized at completion
        ...(input.homeLoanBank !== undefined ? { homeLoanBank: input.homeLoanBank || null } : {}),
        ...(input.homeLoanAmount !== undefined ? { homeLoanAmount: input.homeLoanAmount ? new Decimal(input.homeLoanAmount) : null } : {}),
        ...(input.homeLoanSanctionNo !== undefined ? { homeLoanSanctionNo: input.homeLoanSanctionNo || null } : {}),
        ...(input.homeLoanSanctionDate !== undefined ? { homeLoanSanctionDate: input.homeLoanSanctionDate ? new Date(input.homeLoanSanctionDate) : null } : {}),
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
//  Update sale — edit mutable fields after creation
// ───────────────────────────────────────────────────────────

export interface UpdateSaleInput {
  saleId: string;
  userId?: string;
  // Price (only editable pre-completion with no payments)
  salePrice?: Decimal | number | string;
  gstRate?: Decimal | number | string;
  // Always-editable metadata
  notes?: string | null;
  // Compliance documents
  saleDeedNo?: string | null;
  allotmentLetterNo?: string | null;
  allotmentDate?: string | null;
  bbaNo?: string | null;
  bbaDate?: string | null;
  tdsAmount?: Decimal | number | string | null;
  tdsCertificateNo?: string | null;
  // Home loan
  homeLoanBank?: string | null;
  homeLoanAmount?: Decimal | number | string | null;
  homeLoanSanctionNo?: string | null;
  homeLoanSanctionDate?: string | null;
  // Broker
  brokerName?: string | null;
  brokerPhone?: string | null;
  brokerAgency?: string | null;
  commissionAmount?: Decimal | number | string | null;
  // Deal terms
  expectedRegistryDate?: string | null;
  dealMaturityMonths?: number | null;
  paymentCycle?: string | null;
}

/**
 * Update mutable fields on an existing sale.
 *
 * - Price/gstRate: only editable when sale is PENDING or DEPOSIT_RECEIVED
 *   AND no payments have been recorded. Changing the price re-posts the
 *   sale GL entry if revenue was recognised (COMPLETED stage is blocked).
 * - Notes, compliance, broker, home loan, deal terms: always editable
 *   (regardless of stage) — these are metadata, not financial primitives.
 * - Cancelled sales cannot be edited.
 */
export async function updateSale(input: UpdateSaleInput) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.assetSale.findUnique({
      where: { id: input.saleId },
      include: { payments: true },
    });
    if (!sale) throw new ServiceError("Sale not found", 404);
    if (sale.status === "CANCELLED") {
      throw new ServiceError("Cannot edit a cancelled sale");
    }

    const data: Prisma.AssetSaleUpdateInput = {};
    const priceChanged =
      input.salePrice !== undefined &&
      new Decimal(input.salePrice).toNumber() !== sale.salePrice.toNumber();

    // ── Price change: only pre-completion with no payments ──
    if (priceChanged) {
      if (sale.saleStage === "COMPLETED") {
        throw new ServiceError("Cannot change price on a completed sale — cancel and re-create instead");
      }
      if (sale.payments.length > 0) {
        throw new ServiceError("Cannot change price after payments have been recorded");
      }
      const newPrice = new Decimal(input.salePrice!);
      if (!newPrice.gt(0)) throw new ServiceError("Sale price must be > 0");
      data.salePrice = newPrice;

      // Recompute GST amount if gstRate is also being updated
      const rate = input.gstRate !== undefined ? Number(input.gstRate) : sale.gstRate?.toNumber() ?? 0;
      data.gstAmount = newPrice.mul(rate).div(100);
      // Recompute profit (cost basis doesn't change)
      data.profit = newPrice.minus(sale.costBasis);
    }

    if (input.gstRate !== undefined) {
      data.gstRate = new Decimal(input.gstRate);
      if (!priceChanged) {
        // Recompute GST amount with the new rate on the existing price
        data.gstAmount = sale.salePrice.mul(Number(input.gstRate)).div(100);
      }
    }

    // ── Always-editable metadata ──
    if (input.notes !== undefined) data.notes = input.notes ?? null;
    if (input.saleDeedNo !== undefined) data.saleDeedNo = input.saleDeedNo ?? null;
    if (input.allotmentLetterNo !== undefined) data.allotmentLetterNo = input.allotmentLetterNo ?? null;
    if (input.allotmentDate !== undefined) data.allotmentDate = input.allotmentDate ? new Date(input.allotmentDate) : null;
    if (input.bbaNo !== undefined) data.bbaNo = input.bbaNo ?? null;
    if (input.bbaDate !== undefined) data.bbaDate = input.bbaDate ? new Date(input.bbaDate) : null;
    if (input.tdsAmount !== undefined) data.tdsAmount = input.tdsAmount != null ? new Decimal(input.tdsAmount) : null;
    if (input.tdsCertificateNo !== undefined) data.tdsCertificateNo = input.tdsCertificateNo ?? null;
    if (input.homeLoanBank !== undefined) data.homeLoanBank = input.homeLoanBank ?? null;
    if (input.homeLoanAmount !== undefined) data.homeLoanAmount = input.homeLoanAmount != null ? new Decimal(input.homeLoanAmount) : null;
    if (input.homeLoanSanctionNo !== undefined) data.homeLoanSanctionNo = input.homeLoanSanctionNo ?? null;
    if (input.homeLoanSanctionDate !== undefined) data.homeLoanSanctionDate = input.homeLoanSanctionDate ? new Date(input.homeLoanSanctionDate) : null;
    if (input.brokerName !== undefined) data.brokerName = input.brokerName ?? null;
    if (input.brokerPhone !== undefined) data.brokerPhone = input.brokerPhone ?? null;
    // brokerAgency is derived from the Broker master record (s.broker.agency),
    // not a direct field on AssetSale — not editable here.
    if (input.commissionAmount !== undefined) data.commissionAmount = input.commissionAmount != null ? new Decimal(input.commissionAmount) : null;
    if (input.expectedRegistryDate !== undefined) data.expectedRegistryDate = input.expectedRegistryDate ? new Date(input.expectedRegistryDate) : null;
    if (input.dealMaturityMonths !== undefined) data.dealMaturityMonths = input.dealMaturityMonths;
    if (input.paymentCycle !== undefined) data.paymentCycle = input.paymentCycle ?? null;

    const updated = await tx.assetSale.update({
      where: { id: input.saleId },
      data,
    });

    await logAction(tx, {
      userId: input.userId,
      action: "SALE_UPDATE",
      entityType: "AssetSale",
      entityId: input.saleId,
      after: { updatedFields: Object.keys(data) },
    });

    return updated;
  });
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
    await markAssetStatus(tx, sale.assetType, sale.landParcelId, sale.builtUnitId, "AVAILABLE", sale.projectId);
    if (sale.assetType === "LAND" && sale.landParcelId) {
      await tx.landParcel.update({ where: { id: sale.landParcelId }, data: { saleId: null } });
    } else if (sale.assetType === "BUILT_UNIT" && sale.builtUnitId) {
      await tx.builtUnit.update({ where: { id: sale.builtUnitId }, data: { saleId: null } });
    } else if (sale.assetType === "PROJECT" && sale.projectId) {
      // Unlock ALL units in the project
      await tx.builtUnit.updateMany({
        where: { projectId: sale.projectId, deletedAt: null },
        data: { saleId: null },
      });
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

    // Reverse sale expense GL entries (seller-borne expenses were posted at sale creation)
    const saleExpenses = await tx.saleExpense.findMany({
      where: { assetSaleId: saleId, borneBy: "SELLER" },
      select: { id: true },
    });
    for (const exp of saleExpenses) {
      const je = await tx.journalEntry.findFirst({
        where: { sourceType: "SALE_EXPENSE", sourceId: exp.id, status: "POSTED" },
        select: { id: true },
      });
      if (je) {
        await reverseJournalEntry(tx, je.id, { postedById: userId, memo: "Sale cancelled — expense reversal" });
      }
    }

    // Reverse broker commission accrual (if not already paid — paid commissions are settled, not reversed)
    if (sale.dealSource === "BROKER" && sale.commissionAmount && !sale.commissionPaid) {
      const brokerJe = await tx.journalEntry.findFirst({
        where: { sourceType: "BROKER_COMMISSION", sourceId: saleId, status: "POSTED" },
        select: { id: true },
      });
      if (brokerJe) {
        await reverseJournalEntry(tx, brokerJe.id, { postedById: userId, memo: "Sale cancelled — broker commission reversal" });
      }
    }

    // Re-run cost allocation — a reserved/sold unit's production cost was cached;
    // cancellation makes it sellable again, so allocation must be refreshed.
    // Standalone land sales (no project) have nothing to reallocate.
    if (sale.projectId) {
      await reallocateProjectCosts(tx, sale.projectId);
    }

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

/** Update the asset (land parcel, built unit, or all units in a project) status. */
async function markAssetStatus(
  tx: Prisma.TransactionClient,
  assetType: AssetType,
  landParcelId: string | null,
  builtUnitId: string | null,
  status: "AVAILABLE" | "RESERVED" | "SOLD",
  projectId?: string | null,
) {
  if (assetType === "LAND" && landParcelId) {
    await tx.landParcel.update({ where: { id: landParcelId }, data: { status } });
  } else if (assetType === "BUILT_UNIT" && builtUnitId) {
    await tx.builtUnit.update({ where: { id: builtUnitId }, data: { status } });
  } else if (assetType === "PROJECT" && projectId) {
    // Update ALL units in the project
    await tx.builtUnit.updateMany({
      where: { projectId, deletedAt: null },
      data: { status },
    });
  }
}

/** Auto-delist any active portal listings for a built unit or all units in a project (on sale completion). */
async function delistPortalListings(tx: Prisma.TransactionClient, builtUnitId: string | null, projectId?: string | null) {
  if (!builtUnitId && !projectId) return;
  const activeListings = await tx.portalListing.findMany({
    where: projectId
      ? { builtUnit: { projectId, deletedAt: null }, status: { in: ["DRAFT", "LISTED"] } }
      : { builtUnitId: builtUnitId!, status: { in: ["DRAFT", "LISTED"] } },
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

// ───────────────────────────────────────────────────────────
//  Payment Schedule — generate / update a payment plan for a sale
// ───────────────────────────────────────────────────────────

/**
 * Generate (or replace) a payment schedule for an existing sale.
 * Validates that installment percentages sum to 100% and amounts sum
 * to the sale's total collectible (salePrice + gstAmount).
 */
export async function createSalePaymentSchedule(
  saleId: string,
  schedule: PaymentScheduleInput,
  userId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.assetSale.findUnique({ where: { id: saleId } });
    if (!sale) throw new ServiceError("Sale not found", 404);
    if (sale.status === "CANCELLED") throw new ServiceError("Cannot create schedule for a cancelled sale");

    if (schedule.items.length === 0) {
      throw new ServiceError("Payment schedule must have at least one installment");
    }

    // Validate percentages sum to 100
    const totalPct = schedule.items.reduce(
      (sum, item) => sum.plus(new Decimal(item.percentage)),
      new Decimal(0),
    );
    if (!totalPct.eq(100)) {
      throw new ServiceError(`Installment percentages must sum to 100%, got ${totalPct}%`);
    }

    // Validate amounts sum to sale price + GST
    const totalCollectible = new Decimal(sale.salePrice).plus(new Decimal(sale.gstAmount));
    const totalAmt = schedule.items.reduce(
      (sum, item) => sum.plus(new Decimal(item.amount)),
      new Decimal(0),
    );
    if (!totalAmt.eq(totalCollectible)) {
      throw new ServiceError(
        `Installment amounts must sum to ${totalCollectible} (sale price + GST), got ${totalAmt}`,
      );
    }

    // Delete existing schedule (if any) and create new one
    await tx.paymentSchedule.deleteMany({ where: { assetSaleId: saleId } });

    const created = await tx.paymentSchedule.create({
      data: {
        assetSaleId: saleId,
        type: schedule.type,
        totalAmount: totalAmt,
        gstAmount: new Decimal(0),
        grandTotal: totalAmt,
        items: {
          create: schedule.items.map((item) => ({
            installmentNo: item.installmentNo,
            description: item.description,
            percentage: new Decimal(item.percentage),
            amount: new Decimal(item.amount),
            gstPercentage: new Decimal(0),
            gstAmount: new Decimal(0),
            totalAmount: new Decimal(item.amount),
            dueDate: item.dueDate ? new Date(item.dueDate) : null,
            wbsNodeId: item.wbsNodeId ?? null,
          })),
        },
      },
      include: { items: true },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        companyId: sale.companyId,
        action: "SALE_SCHEDULE_CREATE",
        entityType: "AssetSale",
        entityId: saleId,
        after: { type: schedule.type, installmentCount: schedule.items.length },
      });
    }

    return created;
  }, { isolationLevel: "Serializable" });
}

// ───────────────────────────────────────────────────────────
//  Auto-generate payment schedule from deal terms
// ───────────────────────────────────────────────────────────

/**
 * Auto-generate a TLP (Time-Linked Plan) from deal maturity months + payment cycle.
 * E.g., dealMaturityMonths = 4, advance = 10% → 4 equal monthly installments of 22.5% each.
 * The advance (initialPayment) is NOT part of the schedule — it's already recorded.
 */
export function autoGenerateScheduleItems(
  salePrice: Decimal | number | string,
  gstAmount: Decimal | number | string,
  advanceAmount: Decimal | number | string,
  dealMaturityMonths: number,
): PaymentScheduleItemInput[] {
  const total = new Decimal(salePrice).plus(new Decimal(gstAmount));
  const advance = new Decimal(advanceAmount);
  const balance = total.minus(advance);
  if (balance.lte(0)) return []; // fully paid, no schedule needed
  if (dealMaturityMonths <= 0) return [];

  const perInstallmentAmount = balance.div(dealMaturityMonths);
  const perInstallmentPct = perInstallmentAmount.div(total).mul(100).toDecimalPlaces(2);
  const advancePct = advance.div(total).mul(100).toDecimalPlaces(2);

  const items: PaymentScheduleItemInput[] = [];

  // First installment = advance (already paid, shown for reference)
  if (advance.gt(0)) {
    items.push({
      installmentNo: 1,
      description: "Booking Advance",
      percentage: advancePct,
      amount: advance,
    });
  }

  // Remaining installments spread over dealMaturityMonths
  const startInstallment = advance.gt(0) ? 2 : 1;
  for (let i = 0; i < dealMaturityMonths; i++) {
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + i + 1);
    items.push({
      installmentNo: startInstallment + i,
      description: `Installment ${startInstallment + i} (Month ${i + 1})`,
      percentage: perInstallmentPct,
      amount: perInstallmentAmount,
      dueDate: dueDate.toISOString(),
    });
  }

  // Fix rounding: adjust last installment so percentages sum to exactly 100
  const totalPct = items.reduce((s, item) => s.plus(new Decimal(item.percentage)), new Decimal(0));
  const diff = new Decimal(100).minus(totalPct);
  if (!diff.isZero() && items.length > 0) {
    const last = items[items.length - 1]!;
    last.percentage = new Decimal(last.percentage).plus(diff).toDecimalPlaces(2);
  }

  return items;
}

// ───────────────────────────────────────────────────────────
//  Pay broker commission — settle the accrued payable
// ───────────────────────────────────────────────────────────

export async function payBrokerCommission(saleId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.assetSale.findUnique({ where: { id: saleId } });
    if (!sale) throw new ServiceError("Sale not found", 404);
    if (sale.dealSource !== "BROKER") throw new ServiceError("Sale is not a broker deal");
    if (sale.commissionPaid) throw new ServiceError("Commission already paid");
    if (!sale.commissionAmount || new Decimal(sale.commissionAmount).lte(0)) {
      throw new ServiceError("No commission amount to pay");
    }

    const amount = new Decimal(sale.commissionAmount);

    await postBrokerCommissionPaid(tx, {
      companyId: sale.companyId,
      assetSaleId: saleId,
      amount,
      postedById: userId,
    });

    const updated = await tx.assetSale.update({
      where: { id: saleId },
      data: { commissionPaid: true, commissionPaidDate: new Date() },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        companyId: sale.companyId,
        action: "BROKER_COMMISSION_PAID",
        entityType: "AssetSale",
        entityId: saleId,
        after: { amount: amount.toString(), paidAt: new Date().toISOString() },
      });
    }

    return updated;
  }, { isolationLevel: "Serializable" });
}

// ───────────────────────────────────────────────────────────
//  Printable sale form data — fetch all data needed for the printable receipt
// ───────────────────────────────────────────────────────────

export async function getPrintableSaleData(saleId: string, companyId?: string) {
  const sale = await prisma.assetSale.findFirst({
    where: { id: saleId, ...(companyId ? { companyId } : {}) },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true, address: true } },
      project: { select: { id: true, name: true, address: true, reraNumber: true } },
      company: { select: { id: true, name: true, phone: true, email: true, address: true, gstin: true } },
      builtUnit: { select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true, floor: true, wing: true } },
      landParcel: { select: { id: true, number: true, area: true, areaUnit: true } },
      payments: { orderBy: { paymentDate: "asc" } },
      expenses: { orderBy: { sortOrder: "asc" } },
      terms: { orderBy: { sortOrder: "asc" } },
      paymentSchedule: { include: { items: { orderBy: { installmentNo: "asc" } } } },
      broker: { select: { id: true, name: true, phone: true, agency: true } },
    },
  });
  if (!sale) throw new ServiceError("Sale not found", 404);

  // landParcel is now eagerly loaded via the AssetSale.landParcel relation
  const landParcel = sale.landParcel;

  // For PROJECT sales, fetch all units
  let projectUnits: { id: string; unitNumber: string; unitType: string; area: Decimal; areaUnit: string }[] = [];
  if (sale.assetType === "PROJECT" && sale.projectId) {
    projectUnits = await prisma.builtUnit.findMany({
      where: { projectId: sale.projectId, deletedAt: null },
      select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true },
      orderBy: { unitNumber: "asc" },
    });
  }

  return { sale, landParcel, projectUnits };
}
