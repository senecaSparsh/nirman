import { type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";
import { withSerializableTransaction } from "./transaction";

/**
 * Recurring Expense Service — templates for periodic expenses (rent,
 * salaries, AMC). A scheduler (generateDueRecurringExpenses) creates
 * DRAFT Expense rows on each nextRunDate and advances the schedule.
 */

export interface CreateRecurringInput {
  companyId: string;
  projectId?: string | null;
  categoryId?: string | null;
  category: string;
  amount: Decimal | number | string;
  frequency: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  startDate: Date;
  endDate?: Date | null;
  payeeName?: string | null;
  supplierId?: string | null;
  paymentMode?: string | null;
  notes?: string | null;
  userId?: string;
}

/**
 * Advance a schedule by one period. Month-based frequencies clamp to the last
 * day of the target month and snap back to `anchorDay` (the template's start
 * day) when it fits — so rent due on the 31st runs Jan 31 → Feb 28 → Mar 31,
 * instead of overflowing Jan 31 → Mar 3 and silently skipping February.
 */
export function addPeriod(date: Date, frequency: string, anchorDay: number = date.getDate()): Date {
  const d = new Date(date);
  const months = frequency === "MONTHLY" ? 1 : frequency === "QUARTERLY" ? 3 : frequency === "YEARLY" ? 12 : 0;
  if (frequency === "WEEKLY") {
    d.setDate(d.getDate() + 7);
  } else if (months > 0) {
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(anchorDay, lastDay));
  }
  return d;
}

/** Upper bound on back-filled occurrences per template per run. */
const MAX_CATCH_UP = 60;

/**
 * Validate that every referenced entity belongs to this company. A foreign
 * project/category/supplier id would otherwise be stored verbatim and every
 * auto-generated Expense row would inherit the cross-tenant link.
 */
async function assertRecurringRefs(
  tx: Prisma.TransactionClient,
  companyId: string,
  refs: { projectId?: string | null; categoryId?: string | null; supplierId?: string | null },
) {
  if (refs.projectId) {
    const p = await tx.project.findFirst({
      where: { id: refs.projectId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!p) throw new ServiceError("Project not found in this company", 404);
  }
  if (refs.categoryId) {
    const c = await tx.expenseCategory.findFirst({
      where: { id: refs.categoryId, companyId },
      select: { id: true },
    });
    if (!c) throw new ServiceError("Expense category not found in this company", 404);
  }
  if (refs.supplierId) {
    const s = await tx.supplier.findFirst({
      where: { id: refs.supplierId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!s) throw new ServiceError("Supplier not found in this company", 404);
  }
}

export async function createRecurringExpense(input: CreateRecurringInput) {
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new ServiceError("Amount must be > 0");
  if (Number.isNaN(input.startDate.getTime())) throw new ServiceError("Invalid start date");
  if (input.endDate && Number.isNaN(input.endDate.getTime())) throw new ServiceError("Invalid end date");
  if (input.endDate && input.endDate < input.startDate) {
    throw new ServiceError("End date must be on or after the start date");
  }
  return withSerializableTransaction(async (tx) => {
    await assertRecurringRefs(tx, input.companyId, input);
    const recurring = await tx.recurringExpense.create({
      data: {
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        categoryId: input.categoryId ?? null,
        category: input.category,
        amount,
        frequency: input.frequency,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        nextRunDate: input.startDate,
        payeeName: input.payeeName ?? null,
        supplierId: input.supplierId ?? null,
        paymentMode: input.paymentMode ?? null,
        notes: input.notes ?? null,
        createdById: input.userId ?? null,
      },
    });
    await logAction(tx, {
      userId: input.userId, companyId: input.companyId,
      action: "RECURRING_EXPENSE_CREATE", entityType: "RecurringExpense", entityId: recurring.id,
      after: { category: input.category, amount, frequency: input.frequency },
    });
    return recurring;
  });
}

/**
 * Generate DRAFT expense rows for all recurring templates whose
 * nextRunDate is on or before `asOf`. Returns the count + created rows.
 */
export async function generateDueRecurringExpenses(companyId: string, asOf: Date = new Date(), userId?: string) {
  return withSerializableTransaction(async (tx) => {
    const due = await tx.recurringExpense.findMany({
      where: {
        companyId,
        isActive: true,
        nextRunDate: { lte: asOf },
      },
    });
    const created: string[] = [];
    for (const r of due) {
      // Back-fill every missed occurrence up to asOf (bounded by endDate) —
      // one draft per period, so a scheduler outage doesn't drop months.
      // An occurrence dated on/before endDate is still owed even when the
      // template has since ended.
      const anchorDay = r.startDate.getDate();
      let runDate = r.nextRunDate;
      let lastRun: Date | null = null;
      for (let i = 0; i < MAX_CATCH_UP && runDate <= asOf && (!r.endDate || runDate <= r.endDate); i++) {
        const expense = await tx.expense.create({
          data: {
            companyId: r.companyId,
            projectId: r.projectId,
            categoryId: r.categoryId,
            category: r.category,
            amount: r.amount,
            subtotal: r.amount,
            payeeName: r.payeeName,
            supplierId: r.supplierId,
            paymentMode: r.paymentMode,
            notes: r.notes,
            status: "DRAFT",
            date: runDate,
            createdById: userId ?? null,
            recurringExpenseId: r.id,
          },
        });
        created.push(expense.id);
        lastRun = runDate;
        runDate = addPeriod(runDate, r.frequency, anchorDay);
      }
      if (lastRun) {
        await tx.recurringExpense.update({
          where: { id: r.id },
          data: { lastRunDate: lastRun, nextRunDate: runDate },
        });
      }
    }
    if (created.length > 0) {
      await logAction(tx, {
        userId, companyId, action: "RECURRING_EXPENSE_GENERATE",
        entityType: "RecurringExpense", entityId: "batch",
        after: { count: created.length },
      });
    }
    return { count: created.length, expenseIds: created };
  });
}
