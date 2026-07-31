import { prisma, type Prisma, type AssetType } from "@nirman/db";
import Decimal from "decimal.js";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";

/**
 * Sale Service — sell land parcels or built units to customers.
 *
 * Invariants enforced:
 * - Asset must be AVAILABLE or HOLD (sellable states)
 * - Asset.saleId must be null (no double-sell)
 * - Sale is atomic: create AssetSale + mark asset SOLD + lock saleId
 * - Profit = salePrice - costBasis (acquisitionCost for land, productionCost for unit)
 * - Payments can't exceed salePrice
 * - Cancellation only if no payments received (PENDING)
 */

function generateSaleNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `SAL-${ymd}-${rand}`;
}

interface SellAssetInput {
  assetType: AssetType;
  landParcelId?: string;
  builtUnitId?: string;
  customerId: string;
  salePrice: Decimal | number | string;
  paymentMode?: string;
  notes?: string;
  initialPayment?: Decimal | number | string;
  initialPaymentMode?: string;
  userId?: string;
}

export async function sellAsset(input: SellAssetInput) {
  return prisma.$transaction(async (tx) => {
    // Validate customer
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, deletedAt: null },
    });
    if (!customer) throw new Error("Customer not found or deleted");

    const salePrice = new Decimal(input.salePrice);
    if (!salePrice.gt(0)) throw new Error("Sale price must be > 0");

    let projectId: string;
    let companyId: string;
    let costBasis: Decimal;
    let landParcelId: string | null = null;
    let builtUnitId: string | null = null;

    if (input.assetType === "LAND") {
      if (!input.landParcelId) throw new Error("Land sale requires landParcelId");
      if (input.builtUnitId) throw new Error("Land sale must not have builtUnitId");
      landParcelId = input.landParcelId;

      // Lock the parcel
      const parcel = await tx.landParcel.findUnique({
        where: { id: input.landParcelId },
      });
      if (!parcel) throw new Error("Land parcel not found");
      if (parcel.deletedAt) throw new Error("Land parcel is deleted");
      if (parcel.status !== "AVAILABLE" && parcel.status !== "HOLD") {
        throw new Error(`Cannot sell parcel in status ${parcel.status}. Must be AVAILABLE or HOLD.`);
      }
      if (parcel.saleId) throw new Error("Parcel is already sold (double-sell guard)");

      // Determine project + company
      const projectIdRaw = parcel.projectId;
      if (!projectIdRaw) {
        // Fall back to landPurchase's project
        const landPurchase = await tx.landPurchase.findUnique({
          where: { id: parcel.landPurchaseId },
        });
        if (!landPurchase?.projectId) {
          throw new Error("Land parcel must be linked to a project before selling (for accounting)");
        }
        projectId = landPurchase.projectId;
      } else {
        projectId = projectIdRaw;
      }

      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project) throw new Error("Project not found");
      companyId = project.companyId;
      costBasis = new Decimal(parcel.acquisitionCost);

      // Mark parcel SOLD + lock
      await tx.landParcel.update({
        where: { id: parcel.id },
        data: { status: "SOLD", saleId: undefined }, // saleId set after sale create
      });
    } else {
      if (!input.builtUnitId) throw new Error("Built unit sale requires builtUnitId");
      if (input.landParcelId) throw new Error("Built unit sale must not have landParcelId");
      builtUnitId = input.builtUnitId;

      const unit = await tx.builtUnit.findUnique({
        where: { id: input.builtUnitId },
      });
      if (!unit) throw new Error("Built unit not found");
      if (unit.deletedAt) throw new Error("Built unit is deleted");
      if (unit.status !== "AVAILABLE" && unit.status !== "HOLD") {
        throw new Error(`Cannot sell unit in status ${unit.status}. Must be AVAILABLE or HOLD.`);
      }
      if (unit.saleId) throw new Error("Unit is already sold (double-sell guard)");

      projectId = unit.projectId;
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project) throw new Error("Project not found");
      companyId = project.companyId;
      costBasis = new Decimal(unit.productionCost);

      // Mark unit SOLD + lock
      await tx.builtUnit.update({
        where: { id: unit.id },
        data: { status: "SOLD", saleId: undefined },
      });
    }

    // Create the sale
    const profit = salePrice.minus(costBasis);
    const sale = await tx.assetSale.create({
      data: {
        saleNumber: generateSaleNumber(),
        assetType: input.assetType,
        landParcelId,
        builtUnitId,
        customerId: input.customerId,
        projectId,
        companyId,
        salePrice,
        costBasis,
        profit,
        paymentStatus: "PENDING",
        paymentMode: input.paymentMode,
        notes: input.notes,
      },
    });

    // Now set saleId on the asset
    if (input.assetType === "LAND" && landParcelId) {
      await tx.landParcel.update({ where: { id: landParcelId }, data: { saleId: sale.id } });
    } else if (builtUnitId) {
      await tx.builtUnit.update({ where: { id: builtUnitId }, data: { saleId: sale.id } });
    }

    // Record initial payment atomically if provided (same tx — no orphan sale if payment fails)
    let paymentStatus: "PENDING" | "PARTIAL" | "PAID" = "PENDING";
    if (input.initialPayment) {
      const initAmount = new Decimal(input.initialPayment);
      if (initAmount.gt(0)) {
        if (initAmount.gt(salePrice)) {
          throw new Error(`Initial payment ${initAmount} exceeds sale price ${salePrice}`);
        }
        await tx.assetSalePayment.create({
          data: {
            assetSaleId: sale.id,
            amount: initAmount,
            mode: input.initialPaymentMode ?? "BANK_TRANSFER",
          },
        });
        paymentStatus = initAmount.lt(salePrice) ? "PARTIAL" : "PAID";
      }
    }
    if (paymentStatus !== "PENDING") {
      await tx.assetSale.update({ where: { id: sale.id }, data: { paymentStatus } });
    }

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "ASSET_SALE_CREATE",
        entityType: "AssetSale",
        entityId: sale.id,
        after: { saleNumber: sale.saleNumber, assetType: sale.assetType, salePrice: sale.salePrice, paymentStatus },
      });
    }

    return sale;
  });
}

interface RecordPaymentInput {
  assetSaleId: string;
  amount: Decimal | number | string;
  mode: string;
  reference?: string;
  userId?: string;
}

export async function recordPayment(input: RecordPaymentInput) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.assetSale.findUnique({
      where: { id: input.assetSaleId },
      include: { payments: true },
    });
    if (!sale) throw new Error("Sale not found");
    if (sale.status === "CANCELLED") throw new Error("Cannot record payment against a cancelled sale");

    const amount = new Decimal(input.amount);
    if (!amount.gt(0)) throw new Error("Payment amount must be > 0");

    const existingTotal = sale.payments.reduce(
      (sum, p) => sum.plus(new Decimal(p.amount)),
      new Decimal(0),
    );
    const cumulative = existingTotal.plus(amount);
    if (cumulative.gt(new Decimal(sale.salePrice))) {
      throw new Error(
        `Overpayment: cumulative ${cumulative} > sale price ${sale.salePrice}`,
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

    // Recompute payment status
    let paymentStatus: "PENDING" | "PARTIAL" | "PAID";
    if (cumulative.isZero()) {
      paymentStatus = "PENDING";
    } else if (cumulative.lt(new Decimal(sale.salePrice))) {
      paymentStatus = "PARTIAL";
    } else {
      paymentStatus = "PAID";
    }

    await tx.assetSale.update({
      where: { id: input.assetSaleId },
      data: { paymentStatus },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "ASSET_SALE_PAYMENT",
        entityType: "AssetSale",
        entityId: input.assetSaleId,
        after: { amount, mode: input.mode, paymentStatus },
      });
    }

    return { payment, paymentStatus };
  });
}

export async function cancelSale(saleId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.assetSale.findUnique({
      where: { id: saleId },
      include: { payments: true },
    });
    if (!sale) throw new Error("Sale not found");
    if (sale.status === "CANCELLED") throw new Error("Sale already cancelled");

    // Can only cancel if no payments received
    if (sale.payments.length > 0) {
      throw new Error("Cannot cancel sale with payments — process refunds first");
    }

    // Revert asset status
    if (sale.assetType === "LAND" && sale.landParcelId) {
      await tx.landParcel.update({
        where: { id: sale.landParcelId },
        data: { status: "AVAILABLE", saleId: null },
      });
    } else if (sale.builtUnitId) {
      await tx.builtUnit.update({
        where: { id: sale.builtUnitId },
        data: { status: "AVAILABLE", saleId: null },
      });
    }

    // Re-run cost allocation — a sold unit's production cost was cached;
    // cancellation makes it sellable again, so allocation must be refreshed.
    await reallocateProjectCosts(tx, sale.projectId);

    const updated = await tx.assetSale.update({
      where: { id: saleId },
      data: { status: "CANCELLED" },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "ASSET_SALE_CANCEL",
        entityType: "AssetSale",
        entityId: saleId,
        before: { status: sale.status },
        after: { status: "CANCELLED" },
      });
    }

    return updated;
  });
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
