import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { postJournalEntry, ACCT } from "./gl-posting";
import { ServiceError } from "./errors";

/**
 * Supplier Payment Service — recording money paid out to suppliers.
 *
 * A supplier payment reduces what we owe (Accounts Payable) and reduces
 * cash/bank. Optionally linked to a specific Purchase Order. The GL
 * entry (Dr AP / Cr Cash) is posted inside the same transaction as the
 * payment record so the books never diverge from reality.
 *
 * Payment number format: SP-YYMMDD-NNNN (sequential per day).
 */

// Generate payment number: SP-YYMMDD-NNNN
async function generatePaymentNumber(tx: Prisma.TransactionClient): Promise<string> {
  const today = new Date();
  const yy = String(today.getFullYear()).slice(2);
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const prefix = `SP-${yy}${mm}${dd}`;
  const count = await tx.supplierPayment.count({ where: { paymentNumber: { startsWith: prefix } } });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

export async function createSupplierPayment(input: {
  supplierId: string;
  companyId: string;
  purchaseOrderId?: string;
  amount: number | Decimal;
  tdsAmount?: number | Decimal;
  tdsSection?: string;
  paymentDate?: Date;
  paymentMode: string;
  referenceNo?: string;
  notes?: string;
  userId?: string;
}) {
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new ServiceError("Payment amount must be greater than 0");
  const tdsAmount = input.tdsAmount ? new Decimal(input.tdsAmount) : new Decimal(0);
  if (tdsAmount.lt(0)) throw new ServiceError("TDS amount cannot be negative");
  if (tdsAmount.gt(amount)) throw new ServiceError("TDS amount cannot exceed payment amount");
  const netPaidAmount = amount.minus(tdsAmount);

  return prisma.$transaction(async (tx) => {
    // 1. Validate supplier exists and isn't deleted
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, deletedAt: null },
    });
    if (!supplier) throw new ServiceError("Supplier not found or deleted", 404);

    // 2. Validate PO exists and belongs to the supplier if purchaseOrderId is provided
    if (input.purchaseOrderId) {
      const po = await tx.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId } });
      if (!po) throw new ServiceError("Purchase order not found", 404);
      if (po.supplierId !== input.supplierId) {
        throw new ServiceError("Purchase order does not belong to this supplier");
      }
      if (po.companyId !== input.companyId) {
        throw new ServiceError("Purchase order does not belong to this company");
      }
    }

    // 3. Generate payment number
    const paymentNumber = await generatePaymentNumber(tx);

    // 4. Create the payment record
    const payment = await tx.supplierPayment.create({
      data: {
        paymentNumber,
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId ?? null,
        companyId: input.companyId,
        amount,
        tdsAmount,
        tdsSection: input.tdsSection,
        netPaidAmount,
        paymentDate: input.paymentDate ?? new Date(),
        paymentMode: input.paymentMode,
        referenceNo: input.referenceNo,
        notes: input.notes,
        createdById: input.userId,
      },
      include: { supplier: true, purchaseOrder: true },
    });

    // 5. Update Supplier.balanceOwed (decrement by amount, floor at 0)
    const newBalance = new Decimal(supplier.balanceOwed).minus(amount);
    await tx.supplier.update({
      where: { id: input.supplierId },
      data: { balanceOwed: newBalance.lt(0) ? new Decimal(0) : newBalance },
    });

    // 6. Post GL entry: Dr AP (full), Cr Cash (net), Cr TDS Payable (tds)
    const lines: { accountCode: string; debit: Decimal; credit: Decimal; entityType: string; entityId: string; memo: string }[] = [
      { accountCode: ACCT.AP, debit: amount, credit: new Decimal(0), entityType: "SupplierPayment", entityId: payment.id, memo: "Payment to supplier" },
      { accountCode: ACCT.CASH, debit: new Decimal(0), credit: netPaidAmount, entityType: "SupplierPayment", entityId: payment.id, memo: `Cash out (${input.paymentMode})` },
    ];
    if (tdsAmount.gt(0)) {
      lines.push({ accountCode: ACCT.TDS_PAYABLE, debit: new Decimal(0), credit: tdsAmount, entityType: "SupplierPayment", entityId: payment.id, memo: `TDS deducted${input.tdsSection ? ` u/s ${input.tdsSection}` : ""}` });
    }
    await postJournalEntry(tx, {
      companyId: input.companyId,
      sourceType: "SUPPLIER_PAYMENT",
      sourceId: payment.id,
      memo: `Supplier payment ${paymentNumber} to ${supplier.name}`,
      postedById: input.userId,
      lines,
    });

    // 7. Log action
    await logAction(tx, {
      userId: input.userId,
      action: "SUPPLIER_PAYMENT_CREATE",
      entityType: "SupplierPayment",
      entityId: payment.id,
      after: { paymentNumber, supplierId: input.supplierId, amount: amount.toString(), tdsAmount: tdsAmount.toString(), netPaidAmount: netPaidAmount.toString(), paymentMode: input.paymentMode, purchaseOrderId: input.purchaseOrderId ?? null },
    });

    return payment;
  });
}

export async function getSupplierPayments(opts: {
  companyId: string;
  supplierId?: string;
  purchaseOrderId?: string;
}) {
  return prisma.supplierPayment.findMany({
    where: {
      companyId: opts.companyId,
      ...(opts.supplierId ? { supplierId: opts.supplierId } : {}),
      ...(opts.purchaseOrderId ? { purchaseOrderId: opts.purchaseOrderId } : {}),
    },
    include: {
      supplier: { select: { id: true, name: true, gstin: true } },
      purchaseOrder: { select: { id: true, poNumber: true, total: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { paymentDate: "desc" },
  });
}

export async function getSupplierOutstanding(companyId: string, supplierId?: string) {
  // Calculate outstanding balance per supplier using the Supplier.balanceOwed field.
  // This is kept in sync by createSupplierPayment (decremented) and the
  // procurement/receipt flow (incremented when goods are received on credit).
  const suppliers = await prisma.supplier.findMany({
    where: {
      deletedAt: null,
      ...(supplierId ? { id: supplierId } : {}),
      purchaseOrders: { some: { companyId } },
    },
    select: {
      id: true,
      name: true,
      gstin: true,
      balanceOwed: true,
    },
    orderBy: { name: "asc" },
  });

  return suppliers.map((s) => ({
    supplierId: s.id,
    name: s.name,
    gstin: s.gstin,
    balanceOwed: new Decimal(s.balanceOwed),
  }));
}
