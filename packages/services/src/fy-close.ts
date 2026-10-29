/**
 * Financial-year close — the Apr–Mar books ritual as a single action.
 *
 * Indian SMBs close a FY by posting one closing journal that zeroes every
 * profit-and-loss account into Retained Earnings, then locking the period
 * so nothing can back-post into the filed books. The primitives already
 * exist — `glLockedUntil` enforcement in postJournalEntry and the 3000
 * Retained Earnings account — this function performs the ritual between
 * them: compute P&L balances as-of fyEnd → post the closing JE dated
 * fyEnd → advance glLockedUntil to fyEnd, all in one transaction.
 *
 * Idempotent: a second run for the same fyEnd finds every P&L account
 * already zeroed (the first closing JE is inside the window) and returns
 * { closed: false } instead of posting a duplicate.
 */

import Decimal from "decimal.js";
import { ServiceError } from "./errors";
import { withSerializableTransaction } from "./transaction";
import { ACCT, postJournalEntry } from "./gl-posting";

export interface CloseFinancialYearInput {
  companyId: string;
  /** Books closed through this date (inclusive) — e.g. 2026-03-31. */
  fyEnd: Date;
  userId?: string;
}

export interface CloseFinancialYearResult {
  closed: boolean;
  entryId?: string;
  entryNumber?: string;
  /** Nominal totals that were rolled into Retained Earnings. */
  revenueClosed?: Decimal;
  expenseClosed?: Decimal;
  /** Positive = profit (RE credited), negative = loss (RE debited). */
  netIncome?: Decimal;
  accountsClosed?: number;
  lockedUntil?: Date;
  reason?: string;
}

export async function closeFinancialYear(input: CloseFinancialYearInput): Promise<CloseFinancialYearResult> {
  if (Number.isNaN(input.fyEnd.getTime())) throw new ServiceError("Invalid fyEnd date", 400);
  // A closing date in the future would lock books that haven't happened yet.
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  if (input.fyEnd.getTime() > today.getTime()) {
    throw new ServiceError("Cannot close a period that hasn't ended — fyEnd must be today or earlier", 400);
  }

  return withSerializableTransaction(async (tx) => {
    const company = await tx.company.findUnique({
      where: { id: input.companyId },
      select: { glLockedUntil: true },
    });
    if (!company) throw new ServiceError("Company not found", 404);
    if (company.glLockedUntil && input.fyEnd.getTime() <= company.glLockedUntil.getTime()) {
      throw new ServiceError(
        `Period already locked through ${company.glLockedUntil.toISOString().slice(0, 10)} — fyEnd must be later`,
        409,
      );
    }

    // P&L balances as-of fyEnd: per-account net (debit − credit) over all
    // POSTED entries in the window. A prior closing JE is inside the
    // window by design — its presence zeroes the accounts it touched,
    // which is what makes a repeat run a no-op.
    const grouped = await tx.journalLine.groupBy({
      by: ["accountId"],
      where: { journalEntry: { companyId: input.companyId, status: "POSTED", entryDate: { lte: input.fyEnd } } },
      _sum: { debit: true, credit: true },
    });
    const accounts = await tx.glAccount.findMany({
      where: { id: { in: grouped.map((g) => g.accountId) } },
      select: { id: true, code: true, name: true, type: true },
    });
    const typeById = new Map(accounts.map((a) => [a.id, a.type]));
    const codeById = new Map(accounts.map((a) => [a.id, a.code]));

    // Closing line per non-zero P&L account: revenue (credit balance,
    // net<0) is debited, expense/contra (net>0) is credited. The RE leg
    // takes whatever balances the entry — credit on profit, debit on loss.
    const lines: { accountCode: string; debit: Decimal; credit: Decimal; entityType: string; entityId: string; memo: string }[] = [];
    let signedNet = new Decimal(0);
    let revenueClosed = new Decimal(0);
    let expenseClosed = new Decimal(0);
    for (const g of grouped) {
      const type = typeById.get(g.accountId);
      if (type !== "REVENUE" && type !== "EXPENSE" && type !== "CONTRA_EXPENSE") continue;
      const net = new Decimal(g._sum.debit ?? 0).minus(g._sum.credit ?? 0);
      if (net.isZero()) continue;
      signedNet = signedNet.plus(net);
      const code = codeById.get(g.accountId)!;
      if (type === "REVENUE") revenueClosed = revenueClosed.plus(net.abs());
      else expenseClosed = expenseClosed.plus(net);
      lines.push({
        accountCode: code,
        debit: net.lt(0) ? net.abs() : new Decimal(0),
        credit: net.gt(0) ? net : new Decimal(0),
        entityType: "FinancialYearClose",
        entityId: input.fyEnd.toISOString().slice(0, 10),
        memo: `FY close — ${code} rolled to retained earnings`,
      });
    }

    if (lines.length === 0) {
      return { closed: false, reason: "No P&L balance to close — already closed or nothing posted", lockedUntil: company.glLockedUntil ?? undefined };
    }

    // signedNet = Σ(debit−credit) over P&L = −netIncome. Profit (signedNet<0)
    // needs an RE credit; a loss needs an RE debit.
    const netIncome = signedNet.neg();
    lines.push({
      accountCode: ACCT.RETAINED_EARNINGS,
      debit: netIncome.lt(0) ? netIncome.abs() : new Decimal(0),
      credit: netIncome.gt(0) ? netIncome : new Decimal(0),
      entityType: "FinancialYearClose",
      entityId: input.fyEnd.toISOString().slice(0, 10),
      memo: `FY close — net ${netIncome.gte(0) ? "profit" : "loss"} to retained earnings`,
    });

    const fyLabel = fyLabelFor(input.fyEnd);
    const entry = await postJournalEntry(tx, {
      companyId: input.companyId,
      sourceType: "FY_CLOSING",
      sourceId: input.fyEnd.toISOString().slice(0, 10),
      memo: `FY ${fyLabel} closing — profit & loss rolled to retained earnings`,
      entryDate: input.fyEnd,
      lines,
    });
    if (!entry) {
      return { closed: false, reason: "Closing entry collapsed to zero", lockedUntil: company.glLockedUntil ?? undefined };
    }

    // Lock AFTER posting — postJournalEntry's lock check reads the
    // pre-update value, so the closing JE itself always fits inside.
    await tx.company.update({
      where: { id: input.companyId },
      data: { glLockedUntil: input.fyEnd },
    });

    return {
      closed: true,
      entryId: entry.id,
      entryNumber: entry.entryNumber,
      revenueClosed,
      expenseClosed,
      netIncome,
      accountsClosed: lines.length - 1,
      lockedUntil: input.fyEnd,
    };
  });
}

/** Indian FY label for a date: 2026-03-31 → "2025-26". */
function fyLabelFor(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
