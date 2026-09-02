import { type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";
import { postJournalEntry, ACCT } from "./gl-posting";
import { withSerializableTransaction } from "./transaction";

/**
 * Petty Cash Service — small cash reserves held at sites/offices.
 * Top-ups increase the float; the float balance = topUpTotal − spentTotal.
 * Expenses paid from petty cash are tracked via the Expense model
 * (paymentMode = "CASH" + a link convention); this service manages the
 * float itself and its top-up history.
 */

export interface CreateFloatInput {
  companyId: string;
  projectId?: string | null;
  name: string;
  floatAmount: Decimal | number | string;
  custodianId?: string | null;
  userId?: string;
}

export async function createPettyCashFloat(input: CreateFloatInput) {
  const amount = new Decimal(input.floatAmount);
  if (!amount.gte(0)) throw new ServiceError("Float amount must be >= 0");
  return withSerializableTransaction(async (tx) => {
    const float = await tx.pettyCashFloat.create({
      data: {
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        name: input.name,
        floatAmount: amount,
        topUpTotal: amount,
        custodianId: input.custodianId ?? null,
      },
    });
    // Post GL: Dr Petty Cash (use Cash account as proxy — in a real chart
    // this would be a dedicated Petty Cash sub-account under 1000), Cr Cash/Bank.
    if (amount.gt(0)) {
      await postJournalEntry(tx, {
        companyId: input.companyId,
        sourceType: "PETTY_CASH_CREATE",
        sourceId: float.id,
        memo: `Petty cash float created — ${input.name}`,
        postedById: input.userId,
        lines: [
          { accountCode: ACCT.CASH, debit: amount, credit: 0, entityType: "PettyCashFloat", entityId: float.id },
          { accountCode: ACCT.CASH, debit: 0, credit: amount, entityType: "PettyCashFloat", entityId: float.id },
        ],
      });
    }
    await logAction(tx, {
      userId: input.userId, companyId: input.companyId,
      action: "PETTY_CASH_CREATE", entityType: "PettyCashFloat", entityId: float.id,
      after: { name: input.name, floatAmount: amount },
    });
    return float;
  });
}

export interface TopUpInput {
  floatId: string;
  companyId: string;
  amount: Decimal | number | string;
  paymentMode?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
  userId?: string;
}

export async function topUpPettyCash(input: TopUpInput) {
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new ServiceError("Top-up amount must be > 0");
  return withSerializableTransaction(async (tx) => {
    const float = await tx.pettyCashFloat.findFirst({ where: { id: input.floatId, companyId: input.companyId } });
    if (!float) throw new ServiceError("Petty cash float not found", 404);
    const topUp = await tx.pettyCashTopUp.create({
      data: {
        floatId: input.floatId,
        amount,
        paymentMode: input.paymentMode ?? null,
        referenceNo: input.referenceNo ?? null,
        notes: input.notes ?? null,
        createdById: input.userId ?? null,
      },
    });
    await tx.pettyCashFloat.update({
      where: { id: input.floatId },
      data: {
        floatAmount: (float.floatAmount as Decimal).plus(amount),
        topUpTotal: (float.topUpTotal as Decimal).plus(amount),
      },
    });
    // Post GL: Dr Petty Cash, Cr Cash/Bank (money moved from bank to petty cash)
    await postJournalEntry(tx, {
      companyId: input.companyId,
      sourceType: "PETTY_CASH_TOPUP",
      sourceId: topUp.id,
      memo: `Petty cash top-up — ${float.name}`,
      postedById: input.userId,
      lines: [
        { accountCode: ACCT.CASH, debit: amount, credit: 0, entityType: "PettyCashTopUp", entityId: topUp.id },
        { accountCode: ACCT.CASH, debit: 0, credit: amount, entityType: "PettyCashTopUp", entityId: topUp.id },
      ],
    });
    await logAction(tx, {
      userId: input.userId, companyId: input.companyId,
      action: "PETTY_CASH_TOPUP", entityType: "PettyCashTopUp", entityId: topUp.id,
      after: { floatId: input.floatId, amount },
    });
    return topUp;
  });
}

/**
 * Record a spend against a petty cash float (reduces the balance).
 * Also creates an APPROVED Expense row (so it appears in reports) and
 * posts the GL entry (Dr Operating Expenses, Cr Cash) — since petty
 * cash spends are small and immediate, they bypass the approval flow.
 */
export async function recordPettyCashSpend(
  floatId: string,
  companyId: string,
  input: {
    amount: Decimal | number | string;
    category: string;
    categoryId?: string | null;
    projectId?: string | null;
    date?: Date;
    notes?: string | null;
  },
  userId?: string,
) {
  const amt = new Decimal(input.amount);
  if (!amt.gt(0)) throw new ServiceError("Spend amount must be > 0");
  return withSerializableTransaction(async (tx) => {
    const float = await tx.pettyCashFloat.findFirst({ where: { id: floatId, companyId } });
    if (!float) throw new ServiceError("Petty cash float not found", 404);
    if ((float.floatAmount as Decimal).lt(amt)) {
      throw new ServiceError("Insufficient petty cash balance", 409);
    }

    // Resolve GL account for the category
    let expenseAccountCode: string | undefined;
    if (input.categoryId) {
      const cat = await tx.expenseCategory.findUnique({ where: { id: input.categoryId } });
      expenseAccountCode = cat?.glAccountCode;
    }

    // Create an APPROVED Expense (petty cash = immediate, no approval needed)
    const expense = await tx.expense.create({
      data: {
        companyId,
        projectId: input.projectId ?? float.projectId ?? null,
        categoryId: input.categoryId ?? null,
        category: input.category,
        amount: amt,
        subtotal: amt,
        paymentMode: "CASH",
        payeeName: `Petty Cash — ${float.name}`,
        date: input.date ?? new Date(),
        notes: input.notes ?? null,
        status: "APPROVED",
        approvedById: userId ?? null,
        approvedAt: new Date(),
        glPostedAt: new Date(),
        createdById: userId ?? null,
      },
    });

    // Post GL: Dr <expense account>, Cr Cash
    await postJournalEntry(tx, {
      companyId,
      sourceType: "PETTY_CASH_SPEND",
      sourceId: expense.id,
      memo: `Petty cash spend — ${float.name}`,
      postedById: userId,
      lines: [
        { accountCode: expenseAccountCode ?? ACCT.OPERATING_EXPENSE, debit: amt, credit: 0, entityType: "Expense", entityId: expense.id },
        { accountCode: ACCT.CASH, debit: 0, credit: amt, entityType: "Expense", entityId: expense.id },
      ],
    });

    // Reduce the float balance
    await tx.pettyCashFloat.update({
      where: { id: floatId },
      data: {
        floatAmount: (float.floatAmount as Decimal).minus(amt),
        spentTotal: (float.spentTotal as Decimal).plus(amt),
      },
    });
    await logAction(tx, {
      userId, companyId, action: "PETTY_CASH_SPEND",
      entityType: "PettyCashFloat", entityId: floatId,
      after: { amount: amt, expenseId: expense.id, category: input.category },
    });
    return { ok: true, expenseId: expense.id };
  });
}
