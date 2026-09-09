import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";
import { withSerializableTransaction } from "./transaction";

/**
 * Expense Budget Service — set budgets per category (optionally per
 * project) for a period, and compute budget-vs-actuals variance.
 * Actuals are summed from APPROVED expenses in the period.
 */

/**
 * Compute budget utilization percentage.
 * Pure function — no DB access.
 *
 *   utilizationPct = round(actual / budget × 1000) / 10  (1 decimal place)
 *   Returns 0 when budget ≤ 0.
 */
export function computeUtilizationPct(budgetAmt: number, actual: number): number {
  return budgetAmt > 0 ? Math.round((actual / budgetAmt) * 1000) / 10 : 0;
}

/**
 * Compute budget variance.
 * Pure function — no DB access.
 *
 *   variance = budget − actual
 */
export function computeBudgetVarianceAmount(budgetAmt: number, actual: number): number {
  return budgetAmt - actual;
}

export interface SetBudgetInput {
  companyId: string;
  projectId?: string | null;
  categoryId?: string | null;
  category: string;
  amount: Decimal | number | string;
  periodStart: Date;
  periodEnd: Date;
  notes?: string | null;
  userId?: string;
}

export async function setExpenseBudget(input: SetBudgetInput) {
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new ServiceError("Budget amount must be > 0");
  return withSerializableTransaction(async (tx) => {
    // Upsert on the unique [companyId, projectId, categoryId, periodStart]
    const existing = await tx.expenseBudget.findFirst({
      where: {
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        categoryId: input.categoryId ?? null,
        periodStart: input.periodStart,
      },
    });
    let budget;
    if (existing) {
      budget = await tx.expenseBudget.update({
        where: { id: existing.id },
        data: { amount, periodEnd: input.periodEnd, notes: input.notes ?? null },
      });
    } else {
      budget = await tx.expenseBudget.create({
        data: {
          companyId: input.companyId,
          projectId: input.projectId ?? null,
          categoryId: input.categoryId ?? null,
          category: input.category,
          amount,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          notes: input.notes ?? null,
        },
      });
    }
    await logAction(tx, {
      userId: input.userId, companyId: input.companyId,
      action: "EXPENSE_BUDGET_SET", entityType: "ExpenseBudget", entityId: budget.id,
      after: { category: input.category, amount, periodStart: input.periodStart },
    });
    return budget;
  });
}

export interface ExpenseBudgetVariance {
  budgetId: string;
  category: string;
  projectId: string | null;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
  utilizationPct: number;
}

/**
 * Compute budget-vs-actuals for all budgets of a company. Actuals are
 * summed from APPROVED expenses whose date falls in [periodStart, periodEnd]
 * and whose category (master or free-text) matches.
 */
export async function getExpenseBudgetVariance(companyId: string): Promise<ExpenseBudgetVariance[]> {
  const budgets = await prisma.expenseBudget.findMany({
    where: { companyId },
    orderBy: { periodStart: "desc" },
  });
  if (budgets.length === 0) return [];

  const result: ExpenseBudgetVariance[] = [];
  for (const b of budgets) {
    // Match by categoryId if set, else by free-text category.
    const where = {
      companyId,
      status: "APPROVED" as const,
      date: { gte: b.periodStart, lte: b.periodEnd },
      ...(b.projectId ? { projectId: b.projectId } : {}),
      ...(b.categoryId ? { categoryId: b.categoryId } : { category: b.category }),
    };
    const expenses = await prisma.expense.aggregate({ where, _sum: { amount: true } });
    const actual = expenses._sum.amount ? Number(expenses._sum.amount) : 0;
    const budgetAmt = Number(b.amount);
    result.push({
      budgetId: b.id,
      category: b.category,
      projectId: b.projectId,
      budgetAmount: budgetAmt,
      actualAmount: actual,
      variance: budgetAmt - actual,
      utilizationPct: budgetAmt > 0 ? Math.round((actual / budgetAmt) * 1000) / 10 : 0,
    });
  }
  return result;
}

/**
 * Check whether approving a given expense would exceed its budget.
 * Returns `{ wouldExceed, budget, actual, remaining, utilizationPct }`
 * or `null` when no matching budget exists (no enforcement).
 *
 * Call this inside approveExpense (within the transaction) to decide
 * whether to block the approval or warn.
 */
export async function checkExpenseBudget(
  tx: Prisma.TransactionClient,
  expense: {
    companyId: string;
    projectId: string | null;
    categoryId: string | null;
    category: string;
    amount: Decimal;
    date: Date;
  },
): Promise<{
  wouldExceed: boolean;
  budgetAmount: number;
  actualAmount: number;
  remaining: number;
  utilizationPct: number;
} | null> {
  // Find a matching budget for this expense's period + category + project.
  const budget = await tx.expenseBudget.findFirst({
    where: {
      companyId: expense.companyId,
      periodStart: { lte: expense.date },
      periodEnd: { gte: expense.date },
      ...(expense.projectId ? { projectId: expense.projectId } : { projectId: null }),
      ...(expense.categoryId ? { categoryId: expense.categoryId } : { categoryId: null, category: expense.category }),
    },
  });
  if (!budget) return null;

  const where = {
    companyId: expense.companyId,
    status: "APPROVED" as const,
    date: { gte: budget.periodStart, lte: budget.periodEnd },
    ...(budget.projectId ? { projectId: budget.projectId } : {}),
    ...(budget.categoryId ? { categoryId: budget.categoryId } : { category: budget.category }),
  };
  const agg = await tx.expense.aggregate({ where, _sum: { amount: true } });
  const actual = agg._sum.amount ? Number(agg._sum.amount) : 0;
  const budgetAmt = Number(budget.amount);
  const projected = actual + Number(expense.amount);
  const remaining = budgetAmt - actual;
  const utilizationPct = budgetAmt > 0 ? Math.round((projected / budgetAmt) * 1000) / 10 : 0;
  return {
    wouldExceed: projected > budgetAmt,
    budgetAmount: budgetAmt,
    actualAmount: actual,
    remaining,
    utilizationPct,
  };
}
