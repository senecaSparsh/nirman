import { prisma, Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { postMaterialSalePayment, postJournalEntry, reverseJournalEntry, ACCT } from "./gl-posting";
import { ServiceError } from "./errors";
import { withSerializableTransaction } from "./transaction";
import { autoSyncEntryToTally } from "./auto-sync";

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

/**
 * Validate a sale payment and determine the new payment status.
 * Pure function — no DB access.
 *
 * Throws if amount ≤ 0 or if the payment would exceed the outstanding balance.
 * Returns "PAID" if total equals sale total, "PARTIAL" otherwise.
 */
export function validateSalePayment(
  amount: Decimal,
  previouslyPaid: Decimal,
  saleTotal: Decimal,
): { totalAfterPayment: Decimal; paymentStatus: "PAID" | "PARTIAL" } {
  if (!amount.gt(0)) throw new ServiceError("Payment amount must be greater than 0");
  const totalAfterPayment = previouslyPaid.plus(amount);
  if (totalAfterPayment.gt(saleTotal)) {
    throw new ServiceError(
      `Payment ${amount} exceeds outstanding balance. Outstanding: ${saleTotal.minus(previouslyPaid)}`,
    );
  }
  const paymentStatus = totalAfterPayment.gte(saleTotal) ? "PAID" : "PARTIAL";
  return { totalAfterPayment, paymentStatus };
}

// What the customer still owes after credit notes: a sale's receivable is its
// totalAmount minus all COMPLETED returns, not the original invoice total.
// Capping payments at the original total would let collections exceed what is
// owed on partially/fully returned sales (negative AR).
async function netReceivableFor(
  tx: Prisma.TransactionClient,
  saleId: string,
  saleTotal: Decimal,
): Promise<Decimal> {
  const returned = await tx.materialSaleReturn.aggregate({
    where: { materialSaleId: saleId, status: "COMPLETED" },
    _sum: { totalAmount: true },
  });
  return saleTotal.minus(new Decimal(returned._sum.totalAmount ?? 0));
}

export async function createMaterialSalePayment(input: {
  saleId: string;
  companyId: string;
  amount: string | number | Decimal;
  paymentDate?: Date;
  paymentMode: string;
  referenceNo?: string;
  notes?: string;
  userId?: string;
  // Cheque details
  chequeNo?: string;
  chequeDate?: string; // ISO date
  chequeBank?: string;
  chequePhotoUrl?: string;
}) {
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new ServiceError("Payment amount must be greater than 0");

  const payment = await withSerializableTransaction(async (tx) => {
    // 1. Validate the sale exists and belongs to the company
    const sale = await tx.materialSale.findFirst({
      where: { id: input.saleId, companyId: input.companyId },
    });
    if (!sale) throw new ServiceError("Material sale not found", 404);
    if (sale.status === "CANCELLED") throw new ServiceError("Cannot record payment on a cancelled sale");

    // Duplicate-reference guard — same UTR/cheque across payments means the
    // same bank transaction booked twice.
    if (input.referenceNo) {
      const dupe = await tx.materialSalePayment.findFirst({
        where: { referenceNo: input.referenceNo, status: { not: "VOID" }, sale: { companyId: input.companyId } },
        select: { id: true, saleId: true },
      });
      if (dupe) {
        throw new ServiceError(
          `Reference ${input.referenceNo} is already recorded on another payment (sale ${dupe.saleId}). Check the UTR/cheque number — the same bank transaction cannot pay twice.`,
        );
      }
    }

    // 2. Calculate total paid so far (IN payments only — OUT refunds are
    // money back to the customer, never collection credit; BOUNCED cheques
    // were never real money either)
    const existingPayments = await tx.materialSalePayment.findMany({
      where: { saleId: input.saleId, status: { not: "VOID" }, direction: "IN", OR: [{ chequeStatus: null }, { chequeStatus: { not: "BOUNCED" } }] },
      select: { amount: true },
    });
    const previouslyPaid = existingPayments.reduce(
      (sum, p) => sum.plus(new Decimal(p.amount)),
      new Decimal(0),
    );

    const totalAfterPayment = previouslyPaid.plus(amount);
    const saleTotal = new Decimal(sale.totalAmount);
    const netReceivable = await netReceivableFor(tx, input.saleId, saleTotal);
    if (netReceivable.lte(0)) {
      throw new ServiceError("Sale is fully returned — nothing is outstanding on it.");
    }
    // Don't allow overpayment beyond the post-return receivable
    if (totalAfterPayment.gt(netReceivable)) {
      throw new ServiceError(
        `Payment ${amount} exceeds outstanding balance. Outstanding after returns: ${netReceivable.minus(previouslyPaid)}`,
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
        // Cheque details
        chequeNo: input.chequeNo ?? null,
        chequeDate: input.chequeDate ? new Date(input.chequeDate) : null,
        chequeBank: input.chequeBank ?? null,
        chequePhotoUrl: input.chequePhotoUrl ?? null,
        chequeStatus: (input.paymentMode === "CHEQUE") ? "PENDING" : null,
      },
    });

    // 4. Update sale's paymentStatus (PENDING → PARTIAL → PAID)
    const paymentStatus = totalAfterPayment.gte(netReceivable) ? "PAID" : "PARTIAL";
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

  // Auto-sync the MATERIAL_SALE_PAYMENT entry to Tally (best-effort, outside the transaction)
  void (async () => {
    try {
      const je = await prisma.journalEntry.findFirst({
        where: { sourceId: payment.id, sourceType: "MATERIAL_SALE_PAYMENT" },
        select: { id: true },
      });
      if (je) await autoSyncEntryToTally(input.companyId, je.id);
    } catch { /* best-effort */ }
  })();

  return payment;
}

/**
 * Void a mis-entered material-sale payment — the row stays (status → VOID)
 * for the audit trail but is excluded from paid-sums; the posted GL entry
 * is reversed and the sale's paymentStatus is recomputed (PAID → PARTIAL or
 * PENDING) so the customer owes the amount again.
 */
export async function voidMaterialSalePayment(input: {
  paymentId: string;
  companyId: string;
  userId?: string;
  reason?: string;
}) {
  return withSerializableTransaction(async (tx) => {
    const payment = await tx.materialSalePayment.findFirst({
      where: { id: input.paymentId, sale: { companyId: input.companyId } },
      include: { sale: true },
    });
    if (!payment) throw new ServiceError("Payment not found", 404);
    if (payment.status === "VOID") throw new ServiceError("Payment is already void");

    await tx.materialSalePayment.update({
      where: { id: payment.id },
      data: {
        status: "VOID",
        voidedAt: new Date(),
        voidedById: input.userId ?? null,
        voidReason: input.reason ?? null,
      },
    });

    // Recompute paymentStatus from the remaining non-void IN payments
    // (bounced cheques never counted — they weren't real money)
    const remaining = await tx.materialSalePayment.aggregate({
      where: { saleId: payment.saleId, status: { not: "VOID" }, direction: "IN", OR: [{ chequeStatus: null }, { chequeStatus: { not: "BOUNCED" } }] },
      _sum: { amount: true },
    });
    const totalPaid = new Decimal(remaining._sum.amount ?? 0);
    const saleTotal = new Decimal(payment.sale.totalAmount);
    const netReceivable = await netReceivableFor(tx, payment.saleId, saleTotal);
    // Voiding a refund (OUT) doesn't change the collection status — only the
    // refundable credit grows back. IN payments still drive paymentStatus.
    const paymentStatus = totalPaid.lte(0) ? "PENDING" : totalPaid.gte(netReceivable) ? "PAID" : "PARTIAL";
    if (payment.direction !== "OUT") {
      await tx.materialSale.update({
        where: { id: payment.saleId },
        data: { paymentStatus },
      });
    }

    // Reverse the GL entry posted at creation. CREDIT_APPLIED posts its JE
    // against the IN row's id, so the pair's journal lives on either
    // payment.id or its linked counterpart — check both.
    const je = await tx.journalEntry.findFirst({
      where: {
        sourceId: payment.paymentMode === "CREDIT_APPLIED"
          ? { in: [payment.id, payment.linkedPaymentId ?? ""] }
          : payment.id,
        sourceType: payment.paymentMode === "CREDIT_APPLIED"
          ? "MATERIAL_SALE_CREDIT_APPLY"
          : payment.direction === "OUT" ? "MATERIAL_SALE_REFUND" : "MATERIAL_SALE_PAYMENT",
      },
      select: { id: true },
    });
    if (je) {
      await reverseJournalEntry(tx, je.id, {
        postedById: input.userId,
        memo: `Void material-sale payment${input.reason ? ` — ${input.reason}` : ""}`,
      });
    }

    // CREDIT_APPLIED rows come in pairs (IN on target / OUT on source, joined
    // by linkedPaymentId) — voiding one without the other either re-opens the
    // target's receivable while the source's credit stays spent, or restores
    // the credit while the target stays paid. Void the pair together. Done
    // inline rather than by recursion — the caller's transaction must carry
    // both rows.
    if (payment.linkedPaymentId) {
      const linked = await tx.materialSalePayment.findUnique({ where: { id: payment.linkedPaymentId } });
      if (linked && linked.status !== "VOID") {
        await tx.materialSalePayment.update({
          where: { id: linked.id },
          data: { status: "VOID", voidedAt: new Date(), voidedById: input.userId ?? null, voidReason: `Paired credit-apply voided — ${input.reason ?? "no reason"}` },
        });
        if (linked.direction === "IN") {
          // Re-open the linked sale's receivable from the remaining IN rows.
          const linkedRemaining = await tx.materialSalePayment.aggregate({
            where: { saleId: linked.saleId, status: { not: "VOID" }, direction: "IN" },
            _sum: { amount: true },
          });
          const linkedPaid = new Decimal(linkedRemaining._sum.amount ?? 0);
          const linkedSale = await tx.materialSale.findUniqueOrThrow({ where: { id: linked.saleId }, select: { totalAmount: true } });
          const linkedNet = await netReceivableFor(tx, linked.saleId, new Decimal(linkedSale.totalAmount));
          const linkedStatus = linkedPaid.lte(0) ? "PENDING" : linkedPaid.gte(linkedNet) ? "PAID" : "PARTIAL";
          await tx.materialSale.update({ where: { id: linked.saleId }, data: { paymentStatus: linkedStatus } });
        }
        await logAction(tx, {
          userId: input.userId,
          action: "MATERIAL_SALE_PAYMENT_VOID",
          entityType: "MaterialSalePayment",
          entityId: linked.id,
          after: { status: "VOID", reason: `Paired with ${payment.id}` },
        });
      }
    }

    await logAction(tx, {
      userId: input.userId,
      action: "MATERIAL_SALE_PAYMENT_VOID",
      entityType: "MaterialSalePayment",
      entityId: payment.id,
      before: { status: "RECEIVED" },
      after: { status: "VOID", reason: input.reason ?? null, paymentStatus },
    });

    return { paymentStatus };
  });
}

/**
 * Refund a customer credit — returns on an already-paid sale push AR negative
 * (the customer is owed money back). A refund settles that credit:
 *   Dr Accounts Receivable / Cr Cash.
 * Capped at the outstanding credit (paid-in − net receivable − already
 * refunded) so it can never over-refund. The row is a direction=OUT
 * MaterialSalePayment — money in/out stays on one timeline per sale.
 */
export async function recordMaterialSaleRefund(input: {
  saleId: string;
  companyId: string;
  amount: string | number | Decimal;
  paymentMode: string;
  referenceNo?: string;
  notes?: string;
  userId?: string;
}) {
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new ServiceError("Refund amount must be greater than 0");

  const payment = await withSerializableTransaction(async (tx) => {
    const sale = await tx.materialSale.findFirst({
      where: { id: input.saleId, companyId: input.companyId },
    });
    if (!sale) throw new ServiceError("Material sale not found", 404);
    if (sale.status === "CANCELLED") throw new ServiceError("Cannot refund a cancelled sale");

    const agg = await tx.materialSalePayment.groupBy({
      by: ["direction"],
      where: { saleId: input.saleId, status: { not: "VOID" }, OR: [{ chequeStatus: null }, { chequeStatus: { not: "BOUNCED" } }] },
      _sum: { amount: true },
    });
    const sumOf = (dir: string) => new Decimal(agg.find((a) => a.direction === dir)?._sum.amount ?? 0);
    const paidIn = sumOf("IN");
    const refundedOut = sumOf("OUT");
    const netReceivable = await netReceivableFor(tx, input.saleId, new Decimal(sale.totalAmount));
    // Customer credit = collected beyond what the post-return sale is worth.
    const refundable = paidIn.minus(netReceivable).minus(refundedOut);
    if (refundable.lte(0)) {
      throw new ServiceError("No refundable credit on this sale — nothing has been over-collected", 400);
    }
    if (amount.gt(refundable)) {
      throw new ServiceError(`Refund ${amount} exceeds the refundable credit of ${refundable}`, 400);
    }

    const refund = await tx.materialSalePayment.create({
      data: {
        saleId: input.saleId,
        amount,
        paymentDate: new Date(),
        paymentMode: input.paymentMode,
        referenceNo: input.referenceNo ?? null,
        notes: input.notes ?? null,
        createdById: input.userId,
        direction: "OUT",
      },
    });

    // Dr AR / Cr Cash — the AR credit is settled, cash leaves.
    await postJournalEntry(tx, {
      companyId: input.companyId,
      sourceType: "MATERIAL_SALE_REFUND",
      sourceId: refund.id,
      memo: `Customer refund — sale ${sale.saleNumber}`,
      postedById: input.userId,
      lines: [
        { accountCode: ACCT.AR, debit: amount, credit: 0, entityType: "MaterialSale", entityId: sale.id, memo: "Customer credit settled by refund" },
        { accountCode: ACCT.CASH, debit: 0, credit: amount, entityType: "MaterialSale", entityId: sale.id, memo: "Refund paid to customer" },
      ],
    });

    await logAction(tx, {
      userId: input.userId,
      action: "MATERIAL_SALE_REFUND",
      entityType: "MaterialSalePayment",
      entityId: refund.id,
      after: { saleId: sale.id, saleNumber: sale.saleNumber, amount: amount.toString(), paymentMode: input.paymentMode, refundableBefore: refundable.toString() },
    });

    return refund;
  });

  return payment;
}

/**
 * The refundable credit left on a sale: collected beyond its post-return
 * value, minus credits already settled (refunds + credit-applied OUTs).
 */
async function refundableCreditFor(tx: Prisma.TransactionClient, sale: { id: string; totalAmount: Decimal | number | string }): Promise<Decimal> {
  const agg = await tx.materialSalePayment.groupBy({
    by: ["direction"],
    where: { saleId: sale.id, status: { not: "VOID" }, OR: [{ chequeStatus: null }, { chequeStatus: { not: "BOUNCED" } }] },
    _sum: { amount: true },
  });
  const sumOf = (dir: string) => new Decimal(agg.find((a) => a.direction === dir)?._sum.amount ?? 0);
  const netReceivable = await netReceivableFor(tx, sale.id, new Decimal(sale.totalAmount));
  return sumOf("IN").minus(netReceivable).minus(sumOf("OUT"));
}

/**
 * Every sale of a customer that still carries a spendable credit — the
 * payment dialog offers these to offset a new sale instead of refunding.
 */
export async function listCustomerCredits(input: { customerId: string; companyId: string; excludeSaleId?: string }) {
  const sales = await prisma.materialSale.findMany({
    where: {
      customerId: input.customerId,
      companyId: input.companyId,
      status: { not: "CANCELLED" },
      ...(input.excludeSaleId ? { id: { not: input.excludeSaleId } } : {}),
    },
    select: { id: true, saleNumber: true, totalAmount: true },
  });
  const credits: { saleId: string; saleNumber: string; refundable: Decimal }[] = [];
  for (const s of sales) {
    const refundable = await prisma.$transaction(async (tx) => refundableCreditFor(tx, s));
    if (refundable.gt(0)) credits.push({ saleId: s.id, saleNumber: s.saleNumber, refundable });
  }
  return credits;
}

/**
 * Apply a customer's credit from one sale toward what they owe on another —
 * the common settlement: a returned-but-paid sale's over-collection settles
 * the next purchase instead of cash leaving. Money semantics:
 *
 *   Dr AR(source sale) — lifts its negative balance toward zero
 *   Cr AR(target sale) — reduces what the target sale is owed
 *
 * Doc rows: a CREDIT_APPLIED IN payment on the target (drives its
 * paymentStatus like any collection) paired with a CREDIT_APPLIED OUT row on
 * the source (the refundable formula sees the credit as spent — it cannot be
 * refunded AND applied). `linkedPaymentId` ties the pair so voiding one
 * reverses both. No cash moves.
 */
export async function applySaleCredit(input: {
  sourceSaleId: string;
  targetSaleId: string;
  companyId: string;
  amount: string | number | Decimal;
  notes?: string;
  userId?: string;
}) {
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new ServiceError("Amount must be greater than 0");
  if (input.sourceSaleId === input.targetSaleId) throw new ServiceError("Source and target sale must differ", 400);

  return withSerializableTransaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.materialSale.findFirst({ where: { id: input.sourceSaleId, companyId: input.companyId } }),
      tx.materialSale.findFirst({ where: { id: input.targetSaleId, companyId: input.companyId } }),
    ]);
    if (!source) throw new ServiceError("Source sale not found", 404);
    if (!target) throw new ServiceError("Target sale not found", 404);
    if (source.customerId !== target.customerId) {
      throw new ServiceError("Credit can only move between sales of the same customer", 400);
    }
    if (target.status === "CANCELLED" || target.status === "RETURNED") {
      throw new ServiceError(`Cannot apply credit to a ${target.status.toLowerCase()} sale`, 400);
    }

    const refundable = await refundableCreditFor(tx, source);
    if (refundable.lte(0)) throw new ServiceError("Source sale has no customer credit to apply", 400);
    if (amount.gt(refundable)) throw new ServiceError(`Cannot apply ${amount} — the source sale's credit is ${refundable}`, 400);

    const targetTotal = new Decimal(target.totalAmount);
    const targetNet = await netReceivableFor(tx, target.id, targetTotal);
    if (targetNet.lte(0)) throw new ServiceError("Target sale is fully returned — nothing outstanding", 400);
    const targetPaid = new Decimal(
      (await tx.materialSalePayment.aggregate({
        where: { saleId: target.id, status: { not: "VOID" }, direction: "IN", OR: [{ chequeStatus: null }, { chequeStatus: { not: "BOUNCED" } }] },
        _sum: { amount: true },
      }))._sum.amount ?? 0,
    );
    const outstanding = targetNet.minus(targetPaid);
    if (amount.gt(outstanding)) {
      throw new ServiceError(`Cannot apply ${amount} — the target sale only owes ${outstanding}`, 400);
    }

    const now = new Date();
    // IN on the target — the credit counts as payment collected.
    const inRow = await tx.materialSalePayment.create({
      data: {
        saleId: target.id,
        amount,
        paymentDate: now,
        paymentMode: "CREDIT_APPLIED",
        notes: input.notes ?? `Credit applied from sale ${source.saleNumber}`,
        createdById: input.userId,
        direction: "IN",
      },
    });
    // OUT on the source — the credit is spent here, it can't be refunded too.
    const outRow = await tx.materialSalePayment.create({
      data: {
        saleId: source.id,
        amount,
        paymentDate: now,
        paymentMode: "CREDIT_APPLIED",
        notes: `Credit applied to sale ${target.saleNumber}`,
        createdById: input.userId,
        direction: "OUT",
        linkedPaymentId: inRow.id,
      },
    });
    await tx.materialSalePayment.update({ where: { id: inRow.id }, data: { linkedPaymentId: outRow.id } });

    const paymentStatus = targetPaid.plus(amount).gte(targetNet) ? "PAID" : "PARTIAL";
    await tx.materialSale.update({ where: { id: target.id }, data: { paymentStatus } });

    await postJournalEntry(tx, {
      companyId: input.companyId,
      sourceType: "MATERIAL_SALE_CREDIT_APPLY",
      sourceId: inRow.id,
      memo: `Customer credit applied — ${source.saleNumber} → ${target.saleNumber}`,
      postedById: input.userId,
      lines: [
        { accountCode: ACCT.AR, debit: amount, credit: 0, entityType: "MaterialSale", entityId: source.id, memo: "Customer credit moved out" },
        { accountCode: ACCT.AR, debit: 0, credit: amount, entityType: "MaterialSale", entityId: target.id, memo: "Credit applied as payment" },
      ],
    });

    await logAction(tx, {
      userId: input.userId,
      action: "MATERIAL_SALE_CREDIT_APPLY",
      entityType: "MaterialSalePayment",
      entityId: inRow.id,
      after: { sourceSaleId: source.id, targetSaleId: target.id, amount: amount.toString(), paymentStatus },
    });
    return { inRow, outRow, paymentStatus };
  });
}

/**
 * Cheque lifecycle for material-sale payments — the model carried the full
 * machinery (PENDING/CLEARED/BOUNCED + cheque no/date/bank/photo) but had no
 * transitions: a bounced customer cheque stayed "paid" in the books forever.
 *
 * GL posts at record time (Dr Cash / Cr AR) — clearance just confirms it;
 * a bounce reverses the JE, marks the cheque BOUNCED, and recomputes the
 * sale's paymentStatus from the remaining valid payments. Paid-sums and
 * credit math exclude BOUNCED everywhere (see the filters above).
 */
export async function clearMaterialSaleCheque(input: { paymentId: string; companyId: string; userId?: string }) {
  return withSerializableTransaction(async (tx) => {
    const payment = await tx.materialSalePayment.findFirst({
      where: { id: input.paymentId, sale: { companyId: input.companyId } },
    });
    if (!payment) throw new ServiceError("Payment not found", 404);
    if (payment.paymentMode !== "CHEQUE") throw new ServiceError("Only cheque payments can be cleared", 400);
    if (payment.status === "VOID") throw new ServiceError("Payment is voided", 400);
    if (payment.chequeStatus !== "PENDING") {
      throw new ServiceError(`Cheque is already ${payment.chequeStatus?.toLowerCase() ?? "not pending"}`, 400);
    }
    const updated = await tx.materialSalePayment.update({
      where: { id: payment.id },
      data: { chequeStatus: "CLEARED", chequeClearDate: new Date() },
    });
    await logAction(tx, {
      userId: input.userId,
      action: "MATERIAL_SALE_CHEQUE_CLEARED",
      entityType: "MaterialSalePayment",
      entityId: payment.id,
      after: { chequeStatus: "CLEARED" },
    });
    return updated;
  });
}

export async function bounceMaterialSaleCheque(input: { paymentId: string; companyId: string; userId?: string; bounceReason?: string }) {
  return withSerializableTransaction(async (tx) => {
    const payment = await tx.materialSalePayment.findFirst({
      where: { id: input.paymentId, sale: { companyId: input.companyId } },
      include: { sale: { select: { id: true, status: true, totalAmount: true } } },
    });
    if (!payment) throw new ServiceError("Payment not found", 404);
    if (payment.paymentMode !== "CHEQUE") throw new ServiceError("Only cheque payments can bounce", 400);
    if (payment.status === "VOID") throw new ServiceError("Payment is voided", 400);
    if (payment.chequeStatus !== "PENDING") {
      throw new ServiceError(`Cheque is already ${payment.chequeStatus?.toLowerCase() ?? "not pending"}`, 400);
    }

    await tx.materialSalePayment.update({
      where: { id: payment.id },
      data: { chequeStatus: "BOUNCED", chequeBounceReason: input.bounceReason ?? null },
    });

    // The Dr Cash / Cr AR posted at record time was never real money —
    // reverse it so cash and AR return to the truth.
    const je = await tx.journalEntry.findFirst({
      where: { sourceType: "MATERIAL_SALE_PAYMENT", sourceId: payment.id, status: "POSTED" },
      select: { id: true },
    });
    if (je) {
      await reverseJournalEntry(tx, je.id, {
        postedById: input.userId,
        memo: `Cheque bounced${input.bounceReason ? `: ${input.bounceReason}` : ""}`,
      });
    }

    // Recompute paymentStatus from remaining valid IN payments.
    const remaining = await tx.materialSalePayment.aggregate({
      where: { saleId: payment.saleId, status: { not: "VOID" }, direction: "IN", OR: [{ chequeStatus: null }, { chequeStatus: { not: "BOUNCED" } }] },
      _sum: { amount: true },
    });
    const totalPaid = new Decimal(remaining._sum.amount ?? 0);
    const netReceivable = await netReceivableFor(tx, payment.saleId, new Decimal(payment.sale.totalAmount));
    const paymentStatus = totalPaid.lte(0) ? "PENDING" : totalPaid.gte(netReceivable) ? "PAID" : "PARTIAL";
    await tx.materialSale.update({ where: { id: payment.saleId }, data: { paymentStatus } });

    await logAction(tx, {
      userId: input.userId,
      action: "MATERIAL_SALE_CHEQUE_BOUNCED",
      entityType: "MaterialSalePayment",
      entityId: payment.id,
      after: { chequeStatus: "BOUNCED", bounceReason: input.bounceReason ?? null, paymentStatus },
    });
    return { paymentStatus };
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
