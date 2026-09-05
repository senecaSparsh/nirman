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

export function addPeriod(date: Date, frequency: string): Date {
  const d = new Date(date);
  switch (frequency) {
    case "WEEKLY": d.setDate(d.getDate() + 7); break;
    case "MONTHLY": d.setMonth(d.getMonth() + 1); break;
    case "QUARTERLY": d.setMonth(d.getMonth() + 3); break;
    case "YEARLY": d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

export async function createRecurringExpense(input: CreateRecurringInput) {
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new ServiceError("Amount must be > 0");
  return withSerializableTransaction(async (tx) => {
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
        OR: [{ endDate: null }, { endDate: { gte: asOf } }],
      },
    });
    const created: string[] = [];
    for (const r of due) {
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
          date: r.nextRunDate,
          createdById: userId ?? null,
          recurringExpenseId: r.id,
        },
      });
      const nextRun = addPeriod(r.nextRunDate, r.frequency);
      await tx.recurringExpense.update({
        where: { id: r.id },
        data: { lastRunDate: r.nextRunDate, nextRunDate: nextRun },
      });
      created.push(expense.id);
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
