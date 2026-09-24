import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { postJournalEntry, reverseJournalEntry, ACCT } from "./gl-posting";
import { ServiceError } from "./errors";
import { autoSyncEntryToTally } from "./auto-sync";
import { withSerializableTransaction } from "./transaction";
import { nextSequenceNumber, companyScopedPrefix } from "./sequence";

/**
 * Reconcile invoice PAID status against non-VOID payments. An invoice is
 * PAID once cumulative payments cover its total — linked payments earmark
 * their invoice; unlinked payments allocate FIFO (oldest first) across the
 * supplier's open invoices. When a payment is voided and coverage drops,
 * a PAID invoice reverts to APPROVED so it can be paid again.
 */
async function reconcileSupplierInvoiceStatuses(
  tx: Prisma.TransactionClient,
  supplierId: string,
  companyId: string,
) {
  const invoices = await tx.supplierInvoice.findMany({
    where: {
      supplierId,
      companyId,
      status: { in: ["APPROVED", "MATCHED", "PAID"] },
    },
    orderBy: [{ invoiceDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, status: true, totalAmount: true },
  });
  if (invoices.length === 0) return;

  const [linkedGroups, unlinkedSum] = await Promise.all([
    tx.supplierPayment.groupBy({
      by: ["invoiceId"],
      where: { supplierId, companyId, invoiceId: { not: null }, status: { not: "VOID" } },
      _sum: { amount: true },
    }),
    tx.supplierPayment.aggregate({
      where: { supplierId, companyId, invoiceId: null, status: { not: "VOID" } },
      _sum: { amount: true },
    }),
  ]);
  const linkedByInvoice = new Map(
    linkedGroups.map((g) => [g.invoiceId as string, new Decimal(g._sum.amount ?? 0)]),
  );
  let unlinkedAvailable = new Decimal(unlinkedSum._sum.amount ?? 0);

  const toMarkPaid: string[] = [];
  const toReopen: string[] = [];
  for (const inv of invoices) {
    const need = new Decimal(inv.totalAmount).minus(linkedByInvoice.get(inv.id) ?? new Decimal(0));
    const covered = need.lte(0) || unlinkedAvailable.gte(need);
    if (covered) {
      if (need.gt(0)) unlinkedAvailable = unlinkedAvailable.minus(need);
      if (inv.status !== "PAID") toMarkPaid.push(inv.id);
    } else if (inv.status === "PAID") {
      toReopen.push(inv.id);
    }
  }
  if (toMarkPaid.length > 0) {
    await tx.supplierInvoice.updateMany({ where: { id: { in: toMarkPaid } }, data: { status: "PAID" } });
  }
  if (toReopen.length > 0) {
    await tx.supplierInvoice.updateMany({ where: { id: { in: toReopen } }, data: { status: "APPROVED" } });
  }
}

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

/**
 * Validate and compute supplier payment amounts.
 * Pure function — no DB access.
 *
 *   netPaidAmount = amount − tdsAmount
 *
 * Throws if amount ≤ 0, tdsAmount < 0, or tdsAmount > amount.
 */
export function validateSupplierPaymentAmounts(
  amount: Decimal,
  tdsAmount: Decimal,
): { netPaidAmount: Decimal } {
  if (!amount.gt(0)) throw new ServiceError("Payment amount must be greater than 0");
  if (tdsAmount.lt(0)) throw new ServiceError("TDS amount cannot be negative");
  if (tdsAmount.gt(amount)) throw new ServiceError("TDS amount cannot exceed payment amount");
  const netPaidAmount = amount.minus(tdsAmount);
  return { netPaidAmount };
}

/**
 * Check if a payment would exceed the PO total.
 * Pure function — no DB access.
 */
export function wouldExceedPoTotal(
  alreadyPaid: Decimal,
  newAmount: Decimal,
  poTotal: Decimal,
): boolean {
  return alreadyPaid.plus(newAmount).gt(poTotal);
}

// Generate payment number: SP-YYMMDD-NNNN
async function generatePaymentNumber(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const today = new Date();
  const yy = String(today.getFullYear()).slice(2);
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const prefix = await companyScopedPrefix(tx, companyId, `SP-${yy}${mm}${dd}-`);
  return nextSequenceNumber(tx, prefix, 4);
}

export async function createSupplierPayment(input: {
  supplierId: string;
  companyId: string;
  purchaseOrderId?: string;
  invoiceId?: string;
  amount: number | Decimal | string;
  tdsAmount?: number | Decimal | string;
  tdsSection?: string;
  paymentDate?: Date;
  paymentMode: string;
  referenceNo?: string;
  chequePhotoUrl?: string | null;
  notes?: string;
  userId?: string;
}) {
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new ServiceError("Payment amount must be greater than 0");
  const tdsAmount = input.tdsAmount ? new Decimal(input.tdsAmount) : new Decimal(0);
  if (tdsAmount.lt(0)) throw new ServiceError("TDS amount cannot be negative");
  if (tdsAmount.gt(amount)) throw new ServiceError("TDS amount cannot exceed payment amount");
  const netPaidAmount = amount.minus(tdsAmount);

  const payment = await withSerializableTransaction(async (tx) => {
    // 1. Validate supplier exists and isn't deleted
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, companyId: input.companyId, deletedAt: null },
    });
    if (!supplier) throw new ServiceError("Supplier not found or deleted", 404);

    // 1b. Duplicate-reference guard — a UTR/cheque no is unique per bank
    // transaction; reusing it means paying the same money twice in the books.
    if (input.referenceNo) {
      const dupe = await tx.supplierPayment.findFirst({
        where: { companyId: input.companyId, referenceNo: input.referenceNo, status: { not: "VOID" } },
        select: { id: true, paymentNumber: true },
      });
      if (dupe) {
        throw new ServiceError(
          `Reference ${input.referenceNo} is already recorded on payment ${dupe.paymentNumber}. Check the UTR/cheque number — the same bank transaction cannot pay twice.`,
        );
      }
    }

    // 1c. Double-submit guard — an identical payment (same supplier, amount,
    // mode and user) within the last 15 seconds is almost always a UI
    // double-click or a retried submit. Without this, cash payments (which
    // carry no referenceNo) post a duplicate JE and drain the balance twice.
    const recentDupe = await tx.supplierPayment.findFirst({
      where: {
        companyId: input.companyId,
        supplierId: input.supplierId,
        amount,
        paymentMode: input.paymentMode,
        status: { not: "VOID" },
        createdById: input.userId ?? null,
        // createdAt (not paymentDate) — a backdated payment resubmitted by a
        // double-click shares its paymentDate but still hits the window.
        createdAt: { gte: new Date(Date.now() - 15_000) },
      },
      select: { paymentNumber: true },
    });
    if (recentDupe) {
      throw new ServiceError(
        `An identical ${input.paymentMode.toLowerCase()} payment of ${amount} to this supplier was recorded moments ago (${recentDupe.paymentNumber}). If this is a genuinely separate payment, wait a few seconds and retry.`,
        409,
      );
    }

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
      // PO must be at least ORDERED before a payment can be recorded.
      // Blocks paying against DRAFT, APPROVED (not yet ordered), or CANCELLED POs.
      if (!["ORDERED", "PARTIAL", "RECEIVED"].includes(po.status)) {
        throw new ServiceError(
          `Cannot pay against a PO in ${po.status} status. PO must be ordered first.`,
        );
      }
      // Check for overpayment: sum existing payments + new amount should not exceed PO total
      const existingPayments = await tx.supplierPayment.aggregate({
        where: { purchaseOrderId: input.purchaseOrderId, status: { not: "VOID" } },
        _sum: { amount: true },
      });
      const alreadyPaid = new Decimal(existingPayments._sum.amount ?? 0);
      const poTotal = new Decimal(po.total);
      if (alreadyPaid.plus(amount).gt(poTotal)) {
        throw new ServiceError(
          `Payment exceeds PO total. PO total: ${poTotal}, already paid: ${alreadyPaid}, attempting to pay: ${amount}`,
        );
      }
    }

    // 2b. Validate invoice exists and belongs to the supplier if invoiceId is provided
    if (input.invoiceId) {
      const invoice = await tx.supplierInvoice.findUnique({ where: { id: input.invoiceId } });
      if (!invoice) throw new ServiceError("Supplier invoice not found", 404);
      if (invoice.supplierId !== input.supplierId) {
        throw new ServiceError("Supplier invoice does not belong to this supplier");
      }
      if (invoice.companyId !== input.companyId) {
        throw new ServiceError("Supplier invoice does not belong to this company");
      }
      // M3: Cannot pay an invoice that hasn't been approved yet.
      // PENDING/DISPUTED invoices must be approved first to prevent paying
      // for goods that failed three-way match or are under dispute.
      if (invoice.status !== "APPROVED" && invoice.status !== "MATCHED" && invoice.status !== "PAID") {
        throw new ServiceError(
          `Cannot pay invoice with status "${invoice.status}". Invoice must be APPROVED or MATCHED first.`,
        );
      }
      // Prevent overpayment: sum existing payments for this invoice should not exceed invoice total
      const existingInvoicePayments = await tx.supplierPayment.aggregate({
        where: { invoiceId: input.invoiceId, status: { not: "VOID" } },
        _sum: { amount: true },
      });
      const alreadyPaidToInvoice = new Decimal(existingInvoicePayments._sum.amount ?? 0);
      const invoiceTotal = new Decimal(invoice.totalAmount);
      if (alreadyPaidToInvoice.plus(amount).gt(invoiceTotal)) {
        throw new ServiceError(
          `Payment exceeds invoice total. Invoice total: ${invoiceTotal}, already paid: ${alreadyPaidToInvoice}, attempting to pay: ${amount}`,
        );
      }
    }

    // 2c. For unlinked payments (no PO), prevent overpaying the supplier's balanceOwed.
    //     Without this guard, two concurrent unlinked payments could each read the
    //     same balanceOwed and both succeed, overpaying the supplier.
    if (!input.purchaseOrderId) {
      const currentBalance = new Decimal(supplier.balanceOwed);
      if (amount.gt(currentBalance)) {
        throw new ServiceError(
          `Payment amount (${amount}) exceeds supplier's outstanding balance (${currentBalance}). ` +
          `Use a linked PO payment or adjust the amount.`,
        );
      }
    }

    // 3. Generate payment number
    const paymentNumber = await generatePaymentNumber(tx, input.companyId);

    // 4. Create the payment record
    const payment = await tx.supplierPayment.create({
      data: {
        paymentNumber,
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId ?? null,
        invoiceId: input.invoiceId ?? null,
        companyId: input.companyId,
        amount,
        tdsAmount,
        tdsSection: input.tdsSection,
        netPaidAmount,
        paymentDate: input.paymentDate ?? new Date(),
        paymentMode: input.paymentMode,
        referenceNo: input.referenceNo,
        chequePhotoUrl: input.chequePhotoUrl ?? null,
        notes: input.notes,
        createdById: input.userId,
      },
      include: { supplier: true, purchaseOrder: true, invoice: true },
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

    // 6b. Reconcile invoice statuses — linked payments earmark their
    // invoice; unlinked payments allocate FIFO across open invoices.
    await reconcileSupplierInvoiceStatuses(tx, input.supplierId, input.companyId);

    // 7. Log action
    await logAction(tx, {
      userId: input.userId,
      companyId: input.companyId,
      action: "SUPPLIER_PAYMENT_CREATE",
      entityType: "SupplierPayment",
      entityId: payment.id,
      after: { paymentNumber, supplierId: input.supplierId, amount: amount.toString(), tdsAmount: tdsAmount.toString(), netPaidAmount: netPaidAmount.toString(), paymentMode: input.paymentMode, purchaseOrderId: input.purchaseOrderId ?? null },
    });

    return payment;
  });

  // Auto-sync to Tally (best-effort, outside the transaction)
  void (async () => {
    try {
      const je = await prisma.journalEntry.findFirst({
        where: { sourceId: payment.id, sourceType: "SUPPLIER_PAYMENT" },
        select: { id: true },
      });
      if (je) await autoSyncEntryToTally(input.companyId, je.id);
    } catch { /* best-effort */ }
  })();

  return payment;
}

/**
 * Void a mis-entered supplier payment — the row stays (status → VOID) for
 * the audit trail but is excluded from every payment sum; the posted GL
 * entry is reversed (Dr Cash / Cr AP) so the books net out. Side effects
 * of the original payment are undone in the same transaction:
 *   - Supplier.balanceOwed is incremented back
 *   - Invoices marked PAID solely by this payment re-open to APPROVED
 */
export async function voidSupplierPayment(input: {
  paymentId: string;
  companyId: string;
  userId?: string;
  reason?: string;
}) {
  const result = await withSerializableTransaction(async (tx) => {
    const payment = await tx.supplierPayment.findFirst({
      where: { id: input.paymentId, companyId: input.companyId },
    });
    if (!payment) throw new ServiceError("Payment not found", 404);
    if (payment.status === "VOID") throw new ServiceError("Payment is already void");

    // 1. Mark the payment void
    await tx.supplierPayment.update({
      where: { id: payment.id },
      data: {
        status: "VOID",
        voidedAt: new Date(),
        voidedById: input.userId ?? null,
        voidReason: input.reason ?? null,
      },
    });

    // 2. Restore the supplier's outstanding balance
    const supplier = await tx.supplier.findFirst({ where: { id: payment.supplierId } });
    if (supplier) {
      await tx.supplier.update({
        where: { id: supplier.id },
        data: { balanceOwed: new Decimal(supplier.balanceOwed).plus(payment.amount) },
      });
    }

    // 3. Reverse the GL entry posted at creation
    const je = await tx.journalEntry.findFirst({
      where: { sourceType: "SUPPLIER_PAYMENT", sourceId: payment.id },
      select: { id: true },
    });
    if (je) {
      await reverseJournalEntry(tx, je.id, {
        postedById: input.userId,
        memo: `Void supplier payment ${payment.paymentNumber}${input.reason ? ` — ${input.reason}` : ""}`,
      });
    }

    // 4. Re-open invoices that were marked PAID only because of this payment
    await reconcileSupplierInvoiceStatuses(tx, payment.supplierId, input.companyId);

    await logAction(tx, {
      userId: input.userId,
      companyId: input.companyId,
      action: "SUPPLIER_PAYMENT_VOID",
      entityType: "SupplierPayment",
      entityId: payment.id,
      before: { status: "ACTIVE" },
      after: { status: "VOID", reason: input.reason ?? null },
    });

    return { paymentNumber: payment.paymentNumber };
  });

  return result;
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
      invoice: { select: { id: true, invoiceNumber: true, totalAmount: true } },
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
      companyId,
      deletedAt: null,
      ...(supplierId ? { id: supplierId } : {}),
    },
    select: {
      id: true,
      name: true,
      gstin: true,
      balanceOwed: true,
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  return suppliers.map((s) => ({
    supplierId: s.id,
    name: s.name,
    gstin: s.gstin,
    balanceOwed: new Decimal(s.balanceOwed),
  }));
}
