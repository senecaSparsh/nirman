import { type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";
import { postJournalEntry, ACCT } from "./gl-posting";
import { withSerializableTransaction } from "./transaction";

/**
 * Expense Claim Service — employee reimbursement lifecycle.
 *
 *   DRAFT → SUBMITTED → APPROVED | REJECTED → PAID
 *
 * A claim bundles multiple expense lines (travel, site expenses) into one
 * approval + payment cycle. On approval, the claim can be converted into
 * individual Expense rows (one per line) so they hit the GL, or paid out
 * directly (the payment itself is recorded as an Expense).
 */

/**
 * Compute an expense claim line's GST amount.
 * Pure function — no DB access.
 *
 *   gstAmount = amount × gstRate / 100  (or null if no gstRate)
 */
export function computeClaimLineGst(
  amount: Decimal,
  gstRate: Decimal | null,
): Decimal | null {
  return gstRate ? amount.mul(gstRate).div(100) : null;
}

export interface CreateClaimInput {
  companyId: string;
  claimantId: string;
  projectId?: string | null;
  description?: string | null;
  userId?: string;
}

export async function createExpenseClaim(input: CreateClaimInput) {
  return withSerializableTransaction(async (tx) => {
    const claim = await tx.expenseClaim.create({
      data: {
        companyId: input.companyId,
        claimantId: input.claimantId,
        projectId: input.projectId ?? null,
        description: input.description ?? null,
        totalAmount: 0,
        createdById: input.userId ?? null,
      },
    });
    await logAction(tx, {
      userId: input.userId,
      companyId: input.companyId,
      action: "EXPENSE_CLAIM_CREATE",
      entityType: "ExpenseClaim",
      entityId: claim.id,
      after: { claimantId: input.claimantId, projectId: input.projectId },
    });
    return claim;
  });
}

export interface AddClaimLineInput {
  claimId: string;
  companyId: string;
  categoryId?: string | null;
  category: string;
  amount: Decimal | number | string;
  gstRate?: Decimal | number | string | null;
  date?: Date;
  receiptUrl?: string | null;
  notes?: string | null;
  userId?: string;
}

export async function addClaimLine(input: AddClaimLineInput) {
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new ServiceError("Line amount must be > 0");
  const gstRate = input.gstRate != null ? new Decimal(input.gstRate) : null;
  const gstAmount = gstRate ? amount.mul(gstRate).div(100) : null;
  return withSerializableTransaction(async (tx) => {
    const claim = await tx.expenseClaim.findFirst({ where: { id: input.claimId, companyId: input.companyId } });
    if (!claim) throw new ServiceError("Claim not found", 404);
    if (claim.status !== "DRAFT") throw new ServiceError("Can only add lines to a DRAFT claim", 409);

    const line = await tx.expenseClaimLine.create({
      data: {
        claimId: input.claimId,
        categoryId: input.categoryId ?? null,
        category: input.category,
        amount,
        gstRate: gstRate ?? null,
        gstAmount: gstAmount ?? null,
        date: input.date ?? new Date(),
        receiptUrl: input.receiptUrl ?? null,
        notes: input.notes ?? null,
      },
    });
    // Update claim total
    await tx.expenseClaim.update({
      where: { id: input.claimId },
      data: { totalAmount: (claim.totalAmount as Decimal).plus(amount).plus(gstAmount ?? 0) },
    });
    await logAction(tx, {
      userId: input.userId,
      companyId: input.companyId,
      action: "EXPENSE_CLAIM_LINE_ADD",
      entityType: "ExpenseClaimLine",
      entityId: line.id,
      after: { claimId: input.claimId, category: input.category, amount },
    });
    return line;
  });
}

export async function removeClaimLine(lineId: string, companyId: string, userId?: string) {
  return withSerializableTransaction(async (tx) => {
    const line = await tx.expenseClaimLine.findUnique({
      where: { id: lineId },
      include: { claim: true },
    });
    if (!line || line.claim.companyId !== companyId) throw new ServiceError("Claim line not found", 404);
    if (line.claim.status !== "DRAFT") throw new ServiceError("Can only remove lines from a DRAFT claim", 409);
    await tx.expenseClaimLine.delete({ where: { id: lineId } });
    const lineGst = line.gstAmount ? new Decimal(line.gstAmount) : new Decimal(0);
    await tx.expenseClaim.update({
      where: { id: line.claimId },
      data: { totalAmount: (line.claim.totalAmount as Decimal).minus(line.amount).minus(lineGst) },
    });
    await logAction(tx, {
      userId, companyId, action: "EXPENSE_CLAIM_LINE_REMOVE",
      entityType: "ExpenseClaimLine", entityId: lineId,
      before: { amount: line.amount },
    });
    return { removed: true };
  });
}

export async function submitExpenseClaim(claimId: string, companyId: string, userId?: string) {
  return withSerializableTransaction(async (tx) => {
    const claim = await tx.expenseClaim.findFirst({ where: { id: claimId, companyId } });
    if (!claim) throw new ServiceError("Claim not found", 404);
    if (claim.status !== "DRAFT") throw new ServiceError(`Only DRAFT claims can be submitted (current: ${claim.status})`, 409);
    const updated = await tx.expenseClaim.update({
      where: { id: claimId },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    await logAction(tx, {
      userId, companyId, action: "EXPENSE_CLAIM_SUBMIT",
      entityType: "ExpenseClaim", entityId: claimId,
      before: { status: claim.status }, after: { status: "SUBMITTED" },
    });
    return updated;
  });
}

export async function approveExpenseClaim(claimId: string, companyId: string, userId?: string) {
  return withSerializableTransaction(async (tx) => {
    const claim = await tx.expenseClaim.findFirst({
      where: { id: claimId, companyId },
      include: { lines: true, claimant: true },
    });
    if (!claim) throw new ServiceError("Claim not found", 404);
    if (claim.status !== "SUBMITTED") throw new ServiceError(`Only SUBMITTED claims can be approved (current: ${claim.status})`, 409);
    // Prevent self-approval: the claimant cannot approve their own claim.
    if (userId && claim.claimantId === userId) {
      throw new ServiceError("You cannot approve your own claim — ask another approver", 403);
    }

    // Convert each claim line into an APPROVED Expense row so it flows
    // into expense reports, project costing, and the GL. The claim is the
    // "reimbursement request" container; the individual Expense rows are
    // the actual booked costs.
    const createdExpenseIds: string[] = [];
    for (const line of claim.lines) {
      const expense = await tx.expense.create({
        data: {
          companyId,
          projectId: claim.projectId,
          categoryId: line.categoryId,
          category: line.category,
          amount: line.amount as Decimal,
          subtotal: line.amount as Decimal,
          date: line.date,
          notes: line.notes,
          receiptUrl: line.receiptUrl,
          status: "APPROVED",
          submittedById: claim.claimantId,
          submittedAt: claim.submittedAt ?? new Date(),
          approvedById: userId ?? null,
          approvedAt: new Date(),
          glPostedAt: new Date(),
          payeeName: claim.claimant?.name ?? claim.claimant?.email ?? claim.claimantId,
          paymentMode: "REIMBURSEMENT",
          createdById: userId ?? null,
        },
      });
      createdExpenseIds.push(expense.id);

      // Post GL for each line: Dr <expense account>, Dr Input GST (ITC), Cr Reimbursements Payable
      let accountCode: string = ACCT.OPERATING_EXPENSE;
      if (line.categoryId) {
        const cat = await tx.expenseCategory.findUnique({ where: { id: line.categoryId } });
        if (cat?.glAccountCode) accountCode = cat.glAccountCode;
      }
      const lineGst = line.gstAmount ? new Decimal(line.gstAmount) : new Decimal(0);
      const totalLineAmount = (line.amount as Decimal).plus(lineGst);
      // Post GL: Dr <expense account> for base amount, Dr Input GST (ITC) for GST,
      // Cr Reimbursements Payable for total (base + GST) — accrued until paid
      const glLines = [
        { accountCode, debit: line.amount as Decimal, credit: 0, entityType: "Expense" as const, entityId: expense.id },
        { accountCode: ACCT.REIMBURSEMENTS_PAYABLE, debit: 0, credit: totalLineAmount, entityType: "Expense" as const, entityId: expense.id },
      ];
      if (lineGst.gt(0)) {
        glLines.splice(1, 0, {
          accountCode: ACCT.INPUT_GST,
          debit: lineGst,
          credit: 0,
          entityType: "Expense" as const,
          entityId: expense.id,
        });
      }
      await postJournalEntry(tx, {
        companyId,
        sourceType: "EXPENSE_CLAIM_APPROVAL",
        sourceId: expense.id,
        memo: `Claim reimbursement — ${line.category}`,
        postedById: userId,
        lines: glLines,
      });
    }

    const updated = await tx.expenseClaim.update({
      where: { id: claimId },
      data: { status: "APPROVED", approvedById: userId ?? null, approvedAt: new Date() },
    });
    await logAction(tx, {
      userId, companyId, action: "EXPENSE_CLAIM_APPROVE",
      entityType: "ExpenseClaim", entityId: claimId,
      before: { status: claim.status },
      after: { status: "APPROVED", createdExpenseIds },
    });
    return updated;
  });
}

export async function rejectExpenseClaim(claimId: string, companyId: string, reason: string, userId?: string) {
  if (!reason.trim()) throw new ServiceError("A rejection reason is required", 400);
  return withSerializableTransaction(async (tx) => {
    const claim = await tx.expenseClaim.findFirst({ where: { id: claimId, companyId } });
    if (!claim) throw new ServiceError("Claim not found", 404);
    if (claim.status !== "SUBMITTED") throw new ServiceError(`Only SUBMITTED claims can be rejected (current: ${claim.status})`, 409);
    const updated = await tx.expenseClaim.update({
      where: { id: claimId },
      data: { status: "REJECTED", rejectedReason: reason, approvedById: null, approvedAt: null },
    });
    await logAction(tx, {
      userId, companyId, action: "EXPENSE_CLAIM_REJECT",
      entityType: "ExpenseClaim", entityId: claimId,
      before: { status: claim.status }, after: { status: "REJECTED", reason },
    });
    return updated;
  });
}

/**
 * Mark an approved claim as paid, recording the payment details.
 * Posts the settlement entry: Dr Reimbursements Payable / Cr Cash.
 */
export async function payExpenseClaim(
  claimId: string,
  companyId: string,
  payment: { paymentMode: string; referenceNo?: string | null },
  userId?: string,
) {
  return withSerializableTransaction(async (tx) => {
    const claim = await tx.expenseClaim.findFirst({
      where: { id: claimId, companyId },
      include: { lines: true },
    });
    if (!claim) throw new ServiceError("Claim not found", 404);
    if (claim.status !== "APPROVED") throw new ServiceError(`Only APPROVED claims can be paid (current: ${claim.status})`, 409);

    // Compute total payable = sum of (line amount + line GST)
    const totalPayable = claim.lines.reduce(
      (sum, l) => sum.plus(new Decimal(l.amount as Decimal)).plus(new Decimal(l.gstAmount ?? 0)),
      new Decimal(0),
    );

    // Post settlement: Dr Reimbursements Payable / Cr Cash
    await postJournalEntry(tx, {
      companyId,
      sourceType: "EXPENSE_CLAIM_PAYMENT",
      sourceId: claimId,
      memo: `Expense claim payment — ${claim.description ?? claim.id}`,
      postedById: userId,
      lines: [
        { accountCode: ACCT.REIMBURSEMENTS_PAYABLE, debit: totalPayable, credit: 0, entityType: "ExpenseClaim", entityId: claimId },
        { accountCode: ACCT.CASH, debit: 0, credit: totalPayable, entityType: "ExpenseClaim", entityId: claimId },
      ],
    });

    const updated = await tx.expenseClaim.update({
      where: { id: claimId },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paymentMode: payment.paymentMode,
        referenceNo: payment.referenceNo ?? null,
      },
    });
    await logAction(tx, {
      userId, companyId, action: "EXPENSE_CLAIM_PAY",
      entityType: "ExpenseClaim", entityId: claimId,
      after: { status: "PAID", paymentMode: payment.paymentMode, totalPayable: totalPayable.toString() },
    });
    return updated;
  });
}
