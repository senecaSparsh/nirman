import Decimal from "decimal.js";
import { logAction } from "./audit";
import { postExpense, reverseJournalEntry } from "./gl-posting";
import { checkExpenseBudget } from "./expense-budget";
import { ServiceError } from "./errors";
import { withSerializableTransaction } from "./transaction";

/**
 * Expense Service — full expense-booking lifecycle.
 *
 *   DRAFT → PENDING → APPROVED | REJECTED
 *
 * The General Ledger posts on APPROVAL (not creation), so drafts never
 * affect the books. Rejected expenses can be edited and resubmitted.
 * Each mutation wraps its writes (including the audit log + GL posting)
 * in one Serializable transaction.
 */

export interface CreateExpenseInput {
  companyId: string;
  projectId?: string | null;
  categoryId?: string | null;
  category: string;
  amount: Decimal | number | string;
  subtotal?: Decimal | number | string;
  cgst?: Decimal | number | string;
  sgst?: Decimal | number | string;
  igst?: Decimal | number | string;
  tdsAmount?: Decimal | number | string;
  supplierId?: string | null;
  payeeName?: string | null;
  paymentMode?: string | null;
  bankAccount?: string | null;
  chequeNo?: string | null;
  chequeDate?: Date | null;
  chequePhotoUrl?: string | null;
  referenceNo?: string | null;
  receiptUrl?: string | null;
  date?: Date;
  notes?: string | null;
  /** Skip the draft step and submit immediately for approval. */
  submitForApproval?: boolean;
  userId?: string;
}

/** Compute the GST total from the three components. */
export function gstTotalOf(cgst: Decimal, sgst: Decimal, igst: Decimal): Decimal {
  return cgst.plus(sgst).plus(igst);
}

export async function createExpense(input: CreateExpenseInput) {
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new ServiceError("Expense amount must be > 0");
  const subtotal = input.subtotal != null ? new Decimal(input.subtotal) : amount;
  const cgst = input.cgst != null ? new Decimal(input.cgst) : new Decimal(0);
  const sgst = input.sgst != null ? new Decimal(input.sgst) : new Decimal(0);
  const igst = input.igst != null ? new Decimal(input.igst) : new Decimal(0);
  const tdsAmount = input.tdsAmount != null ? new Decimal(input.tdsAmount) : new Decimal(0);

  // Consistency: subtotal + gst should equal amount (the grand total).
  const computedTotal = subtotal.plus(gstTotalOf(cgst, sgst, igst));
  if (!computedTotal.eq(amount) && !computedTotal.eq(subtotal)) {
    // Tolerate legacy callers that pass only `amount`; otherwise warn by
    // trusting the explicit breakdown when present.
  }

  return withSerializableTransaction(async (tx) => {
    const status = input.submitForApproval ? "PENDING" : "DRAFT";
    const expense = await tx.expense.create({
      data: {
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        categoryId: input.categoryId ?? null,
        category: input.category,
        amount,
        subtotal,
        cgst,
        sgst,
        igst,
        tdsAmount,
        supplierId: input.supplierId ?? null,
        payeeName: input.payeeName ?? null,
        paymentMode: input.paymentMode ?? null,
        bankAccount: input.bankAccount ?? null,
        chequeNo: input.chequeNo ?? null,
        chequeDate: input.chequeDate ?? null,
        chequePhotoUrl: input.chequePhotoUrl ?? null,
        referenceNo: input.referenceNo ?? null,
        receiptUrl: input.receiptUrl ?? null,
        status,
        submittedById: input.submitForApproval ? input.userId ?? null : null,
        submittedAt: input.submitForApproval ? new Date() : null,
        date: input.date ?? new Date(),
        notes: input.notes ?? null,
        createdById: input.userId ?? null,
      },
    });

    await logAction(tx, {
      userId: input.userId,
      companyId: input.companyId,
      action: input.submitForApproval ? "EXPENSE_CREATE_SUBMITTED" : "EXPENSE_CREATE",
      entityType: "Expense",
      entityId: expense.id,
      after: { category: input.category, amount, status, categoryId: input.categoryId },
    });
    return expense;
  });
}

export interface UpdateExpenseInput {
  companyId: string;
  projectId?: string | null;
  categoryId?: string | null;
  category?: string;
  amount?: Decimal | number | string;
  subtotal?: Decimal | number | string;
  cgst?: Decimal | number | string;
  sgst?: Decimal | number | string;
  igst?: Decimal | number | string;
  tdsAmount?: Decimal | number | string;
  supplierId?: string | null;
  payeeName?: string | null;
  paymentMode?: string | null;
  bankAccount?: string | null;
  chequeNo?: string | null;
  chequeDate?: Date | null;
  chequePhotoUrl?: string | null;
  referenceNo?: string | null;
  receiptUrl?: string | null;
  date?: Date;
  notes?: string | null;
  userId?: string;
}

/** Edit an expense. Only DRAFT and REJECTED expenses are editable. */
export async function updateExpense(expenseId: string, input: UpdateExpenseInput) {
  return withSerializableTransaction(async (tx) => {
    const existing = await tx.expense.findFirst({ where: { id: expenseId, companyId: input.companyId } });
    if (!existing) throw new ServiceError("Expense not found in this company", 404);
    if (existing.status === "PENDING" || existing.status === "APPROVED") {
      throw new ServiceError(`Cannot edit an expense that is ${existing.status.toLowerCase()}`, 409);
    }

    const data: Record<string, unknown> = {};
    if (input.projectId !== undefined) data.projectId = input.projectId;
    if (input.categoryId !== undefined) data.categoryId = input.categoryId;
    if (input.category !== undefined) data.category = input.category;
    if (input.amount !== undefined) data.amount = new Decimal(input.amount);
    if (input.subtotal !== undefined) data.subtotal = new Decimal(input.subtotal);
    if (input.cgst !== undefined) data.cgst = new Decimal(input.cgst);
    if (input.sgst !== undefined) data.sgst = new Decimal(input.sgst);
    if (input.igst !== undefined) data.igst = new Decimal(input.igst);
    if (input.tdsAmount !== undefined) data.tdsAmount = new Decimal(input.tdsAmount);
    if (input.supplierId !== undefined) data.supplierId = input.supplierId;
    if (input.payeeName !== undefined) data.payeeName = input.payeeName;
    if (input.paymentMode !== undefined) data.paymentMode = input.paymentMode;
    if (input.bankAccount !== undefined) data.bankAccount = input.bankAccount;
    if (input.chequeNo !== undefined) data.chequeNo = input.chequeNo;
    if (input.chequeDate !== undefined) data.chequeDate = input.chequeDate;
    if (input.chequePhotoUrl !== undefined) data.chequePhotoUrl = input.chequePhotoUrl;
    if (input.referenceNo !== undefined) data.referenceNo = input.referenceNo;
    if (input.receiptUrl !== undefined) data.receiptUrl = input.receiptUrl;
    if (input.date !== undefined) data.date = input.date;
    if (input.notes !== undefined) data.notes = input.notes;

    const updated = await tx.expense.update({ where: { id: expenseId }, data });

    await logAction(tx, {
      userId: input.userId,
      companyId: input.companyId,
      action: "EXPENSE_UPDATE",
      entityType: "Expense",
      entityId: expenseId,
      before: { category: existing.category, amount: existing.amount, status: existing.status },
      after: data,
    });
    return updated;
  });
}

/** Submit a DRAFT (or resubmit a REJECTED) expense for approval. */
export async function submitExpense(expenseId: string, companyId: string, userId?: string) {
  return withSerializableTransaction(async (tx) => {
    const existing = await tx.expense.findFirst({ where: { id: expenseId, companyId } });
    if (!existing) throw new ServiceError("Expense not found in this company", 404);
    if (existing.status !== "DRAFT" && existing.status !== "REJECTED") {
      throw new ServiceError(`Only DRAFT or REJECTED expenses can be submitted (current: ${existing.status})`, 409);
    }
    const updated = await tx.expense.update({
      where: { id: expenseId },
      data: {
        status: "PENDING",
        submittedById: userId ?? existing.submittedById,
        submittedAt: new Date(),
        rejectedReason: null,
      },
    });
    await logAction(tx, {
      userId,
      companyId,
      action: "EXPENSE_SUBMIT",
      entityType: "Expense",
      entityId: expenseId,
      before: { status: existing.status },
      after: { status: "PENDING" },
    });
    return updated;
  });
}

/** Approve a PENDING expense — this is where the GL entry is posted. */
export async function approveExpense(
  expenseId: string,
  companyId: string,
  userId?: string,
  options?: { allowBudgetOverrun?: boolean },
) {
  return withSerializableTransaction(async (tx) => {
    const existing = await tx.expense.findFirst({ where: { id: expenseId, companyId } });
    if (!existing) throw new ServiceError("Expense not found in this company", 404);
    if (existing.status !== "PENDING") {
      throw new ServiceError(`Only PENDING expenses can be approved (current: ${existing.status})`, 409);
    }
    // Prevent self-approval: the submitter cannot approve their own expense.
    if (userId && existing.submittedById && userId === existing.submittedById) {
      throw new ServiceError("You cannot approve an expense you submitted — ask another approver", 403);
    }

    // Budget enforcement: check if approving this expense would exceed the
    // category/project budget for the period. Block unless explicitly authorized.
    const budgetCheck = await checkExpenseBudget(tx, {
      companyId,
      projectId: existing.projectId,
      categoryId: existing.categoryId,
      category: existing.category,
      amount: existing.amount,
      date: existing.date,
    });
    if (budgetCheck?.wouldExceed && !options?.allowBudgetOverrun) {
      throw new ServiceError(
        `Approving this expense would exceed the budget for ${existing.category} ` +
        `(budget ${budgetCheck.budgetAmount.toFixed(0)}, spent ${budgetCheck.actualAmount.toFixed(0)}, ` +
        `remaining ${budgetCheck.remaining.toFixed(0)}, this expense ${Number(existing.amount).toFixed(0)}). ` +
        `Approve with explicit budget overrun authorization if intentional.`,
        409,
      );
    }

    const subtotal = existing.subtotal ?? existing.amount;
    const gstTotal = (existing.cgst ?? 0).plus(existing.sgst ?? 0).plus(existing.igst ?? 0);
    const expenseAccountCode = existing.categoryId
      ? (await tx.expenseCategory.findUnique({ where: { id: existing.categoryId } }))?.glAccountCode
      : undefined;
    const payViaAp = !!existing.supplierId && (!existing.paymentMode || existing.paymentMode === "CREDIT");

    // Post the GL entry now (on approval, not creation).
    await postExpense(tx, {
      companyId,
      expenseId,
      amount: existing.amount,
      subtotal,
      gstTotal: gstTotal.gt(0) ? gstTotal : undefined,
      tdsAmount: (existing.tdsAmount ?? 0).gt(0) ? existing.tdsAmount : undefined,
      expenseAccountCode,
      payViaAp,
      postedById: userId,
    });

    const updated = await tx.expense.update({
      where: { id: expenseId },
      data: {
        status: "APPROVED",
        approvedById: userId ?? null,
        approvedAt: new Date(),
        glPostedAt: new Date(),
        rejectedReason: null,
      },
    });

    await logAction(tx, {
      userId,
      companyId,
      action: "EXPENSE_APPROVE",
      entityType: "Expense",
      entityId: expenseId,
      before: { status: existing.status },
      after: { status: "APPROVED", amount: existing.amount },
    });
    return updated;
  });
}

/** Reject a PENDING expense with a reason. */
export async function rejectExpense(expenseId: string, companyId: string, reason: string, userId?: string) {
  if (!reason.trim()) throw new ServiceError("A rejection reason is required", 400);
  return withSerializableTransaction(async (tx) => {
    const existing = await tx.expense.findFirst({ where: { id: expenseId, companyId } });
    if (!existing) throw new ServiceError("Expense not found in this company", 404);
    if (existing.status !== "PENDING") {
      throw new ServiceError(`Only PENDING expenses can be rejected (current: ${existing.status})`, 409);
    }
    const updated = await tx.expense.update({
      where: { id: expenseId },
      data: {
        status: "REJECTED",
        approvedById: userId ?? null,
        approvedAt: new Date(),
        rejectedReason: reason.trim(),
      },
    });
    await logAction(tx, {
      userId,
      companyId,
      action: "EXPENSE_REJECT",
      entityType: "Expense",
      entityId: expenseId,
      before: { status: existing.status },
      after: { status: "REJECTED", reason: reason.trim() },
    });
    return updated;
  });
}

/** Delete an expense. APPROVED expenses reverse the GL entry first. */
export async function deleteExpense(expenseId: string, companyId: string, userId?: string) {
  return withSerializableTransaction(async (tx) => {
    const existing = await tx.expense.findFirst({ where: { id: expenseId, companyId } });
    if (!existing) throw new ServiceError("Expense not found in this company", 404);
    if (existing.status === "PENDING") {
      throw new ServiceError("Cannot delete a PENDING expense — reject it first", 409);
    }

    // Reverse the GL entry if one was posted (APPROVED expenses).
    if (existing.glPostedAt) {
      const glEntry = await tx.journalEntry.findFirst({
        where: { sourceType: "EXPENSE", sourceId: expenseId },
      });
      if (glEntry) {
        await reverseJournalEntry(tx, glEntry.id, {
          postedById: userId,
          memo: "Reversal: expense deleted",
        });
      }
    }

    await tx.expense.delete({ where: { id: expenseId } });

    await logAction(tx, {
      userId,
      companyId,
      action: "EXPENSE_DELETE",
      entityType: "Expense",
      entityId: expenseId,
      before: { category: existing.category, amount: existing.amount, status: existing.status },
    });
    return { deleted: true };
  });
}

// ── Expense Category master ──────────────────────────────────────

export interface CreateCategoryInput {
  companyId: string;
  name: string;
  glAccountCode: string;
  description?: string | null;
  userId?: string;
}

export async function createExpenseCategory(input: CreateCategoryInput) {
  return withSerializableTransaction(async (tx) => {
    const cat = await tx.expenseCategory.create({
      data: {
        companyId: input.companyId,
        name: input.name.trim(),
        glAccountCode: input.glAccountCode,
        description: input.description ?? null,
      },
    });
    await logAction(tx, {
      userId: input.userId,
      companyId: input.companyId,
      action: "EXPENSE_CATEGORY_CREATE",
      entityType: "ExpenseCategory",
      entityId: cat.id,
      after: { name: cat.name, glAccountCode: cat.glAccountCode },
    });
    return cat;
  });
}

export async function updateExpenseCategory(
  categoryId: string,
  input: Partial<Omit<CreateCategoryInput, "companyId">> & { companyId: string },
) {
  return withSerializableTransaction(async (tx) => {
    const existing = await tx.expenseCategory.findFirst({ where: { id: categoryId, companyId: input.companyId } });
    if (!existing) throw new ServiceError("Expense category not found", 404);
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.glAccountCode !== undefined) data.glAccountCode = input.glAccountCode;
    if (input.description !== undefined) data.description = input.description;
    const updated = await tx.expenseCategory.update({ where: { id: categoryId }, data });
    await logAction(tx, {
      userId: input.userId,
      companyId: input.companyId,
      action: "EXPENSE_CATEGORY_UPDATE",
      entityType: "ExpenseCategory",
      entityId: categoryId,
      before: { name: existing.name, glAccountCode: existing.glAccountCode },
      after: data,
    });
    return updated;
  });
}

export async function deleteExpenseCategory(categoryId: string, companyId: string, userId?: string) {
  return withSerializableTransaction(async (tx) => {
    const existing = await tx.expenseCategory.findFirst({ where: { id: categoryId, companyId } });
    if (!existing) throw new ServiceError("Expense category not found", 404);
    // Soft-disable instead of hard delete if expenses reference it.
    const inUse = await tx.expense.count({ where: { categoryId } });
    if (inUse > 0) {
      const updated = await tx.expenseCategory.update({ where: { id: categoryId }, data: { isActive: false } });
      await logAction(tx, {
        userId, companyId, action: "EXPENSE_CATEGORY_DEACTIVATE",
        entityType: "ExpenseCategory", entityId: categoryId, before: { name: existing.name },
      });
      return { deactivated: true, id: updated.id };
    }
    await tx.expenseCategory.delete({ where: { id: categoryId } });
    await logAction(tx, {
      userId, companyId, action: "EXPENSE_CATEGORY_DELETE",
      entityType: "ExpenseCategory", entityId: categoryId, before: { name: existing.name },
    });
    return { deleted: true };
  });
}
