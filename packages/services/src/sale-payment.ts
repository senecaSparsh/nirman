import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { postMaterialSalePayment } from "./gl-posting";
import { ServiceError } from "./errors";

/**
 * Material Sale Payment Service — recording money received from customers
 * against material sales (partial / additional payments after sale creation).
 *
 * A material sale payment reduces what the customer owes (Accounts Receivable)
 * and increases cash/bank. The GL entry (Dr Cash / Cr AR) is posted inside the
 * same transaction as the payment record so the books never diverge from reality.
 *
 * The sale's `paymentStatus` is updated to PARTIAL or PAID based on the total
 * of all payments vs the sale's totalAmount.
 */

export async function createMaterialSalePayment(input: {
  saleId: string;
  companyId: string;
  amount: number | Decimal;
  paymentDate?: Date;
  paymentMode: string;
  referenceNo?: string;
  notes?: string;
  userId?: string;
}) {
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new ServiceError("Payment amount must be greater than 0");

  return prisma.$transaction(async (tx) => {
    // 1. Validate the sale exists and belongs to the company
    const sale = await tx.materialSale.findFirst({
      where: { id: input.saleId, companyId: input.companyId },
    });
    if (!sale) throw new ServiceError("Material sale not found", 404);
    if (sale.status === "CANCELLED") throw new ServiceError("Cannot record payment on a cancelled sale");

    // 2. Calculate total paid so far (existing payments)
    const existingPayments = await tx.materialSalePayment.findMany({
      where: { saleId: input.saleId },
      select: { amount: true },
    });
    const previouslyPaid = existingPayments.reduce(
      (sum, p) => sum.plus(new Decimal(p.amount)),
      new Decimal(0),
    );

    const totalAfterPayment = previouslyPaid.plus(amount);
    const saleTotal = new Decimal(sale.totalAmount);

    // Don't allow overpayment beyond the sale total
    if (totalAfterPayment.gt(saleTotal)) {
      throw new ServiceError(
        `Payment ${amount} exceeds outstanding balance. Outstanding: ${saleTotal.minus(previouslyPaid)}`,
      );
    }

    // 3. Create the payment record
    const payment = await tx.materialSalePayment.create({
      data: {
        saleId: input.saleId,
        amount,
        paymentDate: input.paymentDate ?? new Date(),
        paymentMode: input.paymentMode,
        referenceNo: input.referenceNo,
        notes: input.notes,
        createdById: input.userId,
      },
    });

    // 4. Update sale's paymentStatus (PENDING → PARTIAL → PAID)
    const paymentStatus = totalAfterPayment.equals(saleTotal) ? "PAID" : "PARTIAL";
    await tx.materialSale.update({
      where: { id: input.saleId },
      data: { paymentStatus },
    });

    // 5. Post GL entry: Dr Cash, Cr AR
    await postMaterialSalePayment(tx, {
      companyId: input.companyId,
      materialSaleId: input.saleId,
      paymentId: payment.id,
      amount,
      postedById: input.userId,
    });

    // 6. Log action
    await logAction(tx, {
      userId: input.userId,
      action: "MATERIAL_SALE_PAYMENT_CREATE",
      entityType: "MaterialSalePayment",
      entityId: payment.id,
      after: {
        saleId: input.saleId,
        saleNumber: sale.saleNumber,
        amount: amount.toString(),
        paymentMode: input.paymentMode,
        paymentStatus,
        previouslyPaid: previouslyPaid.toString(),
        totalAfterPayment: totalAfterPayment.toString(),
        saleTotal: saleTotal.toString(),
      },
    });

    return payment;
  });
}

export async function getMaterialSalePayments(saleId: string) {
  return prisma.materialSalePayment.findMany({
    where: { saleId },
    include: {
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { paymentDate: "desc" },
  });
}
