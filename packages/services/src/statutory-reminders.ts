import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { emitNotificationEvent, NotificationEventType } from "./notification-event-bus";

/**
 * Statutory deadline sweep — nudges finance when a government filing or
 * deposit is due soon (or already overdue) while money remains
 * unremitted. The liabilities already accrue on the GL (2400 TDS,
 * 2250 PF, 2350 ESI, 2100 output GST net of 1400 ITC); this sweep is
 * the only thing that turns "we owe it" into "someone was told".
 *
 * Indian statutory calendar (monthly rules):
 *   TDS deposit          — 7th of the following month
 *   PF + ESI remittance  — 15th
 *   GSTR-3B + net GST    — 20th
 *
 * A reminder fires once per company per period per kind, at most —
 * dedupe keys on the deadline month so overdue balances don't spam.
 */

const REMIND_WINDOW_DAYS = 3;

type StatutoryRule = {
  /** Short label for the notification + dedupe key. */
  kind: "TDS" | "PF" | "ESI" | "GST";
  /** Payable GL accounts (credit-normal liability). */
  payableCodes: string[];
  /** Offset accounts (debit-normal) — net GST = output − ITC. */
  offsetCodes?: string[];
  /** Day of month the deposit/return is due. */
  dueDay: number;
  /** Verb for the notification copy. */
  actionLabel: string;
};

const RULES: StatutoryRule[] = [
  { kind: "TDS", payableCodes: ["2400"], dueDay: 7, actionLabel: "deposit TDS" },
  { kind: "PF", payableCodes: ["2250"], dueDay: 15, actionLabel: "remit PF to EPFO" },
  { kind: "ESI", payableCodes: ["2350"], dueDay: 15, actionLabel: "remit ESI to ESIC" },
  { kind: "GST", payableCodes: ["2100"], offsetCodes: ["1400"], dueDay: 20, actionLabel: "file GSTR-3B and pay net GST" },
];

/** The next occurrence of `dueDay` in the month — this month's if it
 * hasn't passed, else next month's. */
function nextDeadline(now: Date, dueDay: number): Date {
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), dueDay);
  return now <= thisMonth
    ? thisMonth
    : new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
}

/** Credit-normal balance for `payableCodes` minus debit-normal balance
 * for `offsetCodes`, from posted journal lines only. */
async function statutoryBalance(companyId: string, rule: StatutoryRule): Promise<Decimal> {
  const accounts = await prisma.glAccount.findMany({
    where: { companyId, code: { in: [...rule.payableCodes, ...(rule.offsetCodes ?? [])] } },
    select: { id: true, code: true },
  });
  if (accounts.length === 0) return new Decimal(0);

  const grouped = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: { journalEntry: { companyId, status: "POSTED" }, accountId: { in: accounts.map((a) => a.id) } },
    _sum: { debit: true, credit: true },
  });

  let balance = new Decimal(0);
  for (const g of grouped) {
    const debit = new Decimal(g._sum.debit ?? 0);
    const credit = new Decimal(g._sum.credit ?? 0);
    // credit−debit is the right contribution for BOTH legs: payable
    // accounts hold their liability as a credit balance; an ITC asset
    // holds its offset as a debit balance (credit−debit < 0), which
    // correctly reduces the net.
    balance = balance.plus(credit.minus(debit));
  }
  return balance;
}

export async function checkStatutoryDeadlines(now: Date = new Date()): Promise<{ checked: number; due: number; notified: number }> {
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  let due = 0;
  let notified = 0;

  for (const company of companies) {
    for (const rule of RULES) {
      const balance = await statutoryBalance(company.id, rule);
      if (balance.lte(0)) continue;

      const deadline = nextDeadline(now, rule.dueDay);
      const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
      if (daysUntil > REMIND_WINDOW_DAYS) continue;

      due++;
      // One notification per company per rule per deadline period.
      const statutoryKey = `${rule.kind}:${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, "0")}`;
      const periodStart = new Date(deadline.getFullYear(), deadline.getMonth() - 1, deadline.getDate() + 1);
      const recent = await prisma.inAppNotification.findFirst({
        where: {
          companyId: company.id,
          eventType: NotificationEventType.STATUTORY_DUE,
          createdAt: { gte: periodStart },
          metadata: { path: ["statutoryKey"], equals: statutoryKey },
        },
        select: { id: true },
      });
      if (recent) continue;

      const overdue = daysUntil < 0;
      const amt = `₹${Math.round(balance.toNumber()).toLocaleString("en-IN")}`;
      void emitNotificationEvent({
        eventType: NotificationEventType.STATUTORY_DUE,
        companyId: company.id,
        entityType: "StatutoryPayment",
        variables: {
          statutoryKey,
          kind: rule.kind,
          amount: balance.toFixed(2),
          deadline: deadline.toISOString().slice(0, 10),
          message: overdue
            ? `${rule.kind} ${amt} is ${-daysUntil} day${daysUntil === -1 ? "" : "s"} past the ${rule.dueDay}${ordinalSuffix(rule.dueDay)} deadline — ${rule.actionLabel} now (interest accruing).`
            : `${rule.kind} ${amt} unremitted — ${rule.actionLabel} by the ${rule.dueDay}${ordinalSuffix(rule.dueDay)} (${daysUntil} day${daysUntil === 1 ? "" : "s"} left).`,
        },
        timestamp: new Date(),
      });
      notified++;
    }
  }

  return { checked: companies.length, due, notified };
}

function ordinalSuffix(n: number): string {
  return n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
}
