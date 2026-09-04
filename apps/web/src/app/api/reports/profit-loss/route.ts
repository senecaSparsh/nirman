import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";

/**
 * GET /api/reports/profit-loss
 * Returns a Profit & Loss statement for a date range (defaults to current
 * financial year: Apr 1 → Mar 31). Uses the same trial-balance grouping
 * approach as the balance sheet: sum all posted journal lines per account,
 * then classify by REVENUE / EXPENSE / CONTRA_EXPENSE.
 *
 * Query params:
 *   from  — start date (YYYY-MM-DD), defaults to Apr 1 of current FY
 *   to    — end date (YYYY-MM-DD), defaults to today
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();

  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const now = new Date();
  // Default FY: Apr 1 → Mar 31. If current month < Apr, FY started last year.
  const fyStartYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  const from = fromParam ? new Date(fromParam) : new Date(fyStartYear, 3, 1);
  const to = toParam ? new Date(toParam) : now;
  if (isNaN(from.getTime())) return json({ error: "Invalid from date" }, { status: 400 });
  if (isNaN(to.getTime())) return json({ error: "Invalid to date" }, { status: 400 });

  // Aggregate debit/credit per account in the date range
  const grouped = await prisma.journalLine.groupBy({
    by: ["accountCode"],
    where: {
      journalEntry: {
        companyId: company.id,
        status: "POSTED",
        entryDate: { gte: from, lte: to },
      },
    },
    _sum: { debit: true, credit: true },
    orderBy: { accountCode: "asc" },
  });

  const accounts = await prisma.glAccount.findMany({
    where: { code: { in: grouped.map((g) => g.accountCode) } },
    select: { code: true, name: true, type: true },
  });
  const accountMap = new Map(accounts.map((a) => [a.code, a]));

  type LineItem = { code: string; name: string; balance: number };
  const revenue: LineItem[] = [];
  const expenses: LineItem[] = [];
  const contraExpense: LineItem[] = [];

  let totalRevenue = new Decimal(0);
  let totalExpense = new Decimal(0);
  let totalContra = new Decimal(0);

  for (const g of grouped) {
    const acct = accountMap.get(g.accountCode);
    if (!acct) continue;
    const debit = new Decimal(g._sum.debit ?? 0);
    const credit = new Decimal(g._sum.credit ?? 0);

    if (acct.type === "REVENUE") {
      const balance = credit.minus(debit); // credit-normal
      const balNum = toNum(balance);
      if (balNum !== 0) {
        revenue.push({ code: acct.code, name: acct.name, balance: balNum });
        totalRevenue = totalRevenue.plus(balance);
      }
    } else if (acct.type === "EXPENSE") {
      const balance = debit.minus(credit); // debit-normal
      const balNum = toNum(balance);
      if (balNum !== 0) {
        expenses.push({ code: acct.code, name: acct.name, balance: balNum });
        totalExpense = totalExpense.plus(balance);
      }
    } else if (acct.type === "CONTRA_EXPENSE") {
      const balance = credit.minus(debit); // credit-normal (reduces expense)
      const balNum = toNum(balance);
      if (balNum !== 0) {
        contraExpense.push({ code: acct.code, name: acct.name, balance: balNum });
        totalContra = totalContra.plus(balance);
      }
    }
    // ASSET / LIABILITY / EQUITY accounts are not part of P&L
  }

  const grossProfit = totalRevenue.minus(totalExpense);
  const netProfit = grossProfit.plus(totalContra);
  const grossMargin = totalRevenue.gt(0)
    ? Number(grossProfit.div(totalRevenue).times(100).toFixed(2))
    : 0;
  const netMargin = totalRevenue.gt(0)
    ? Number(netProfit.div(totalRevenue).times(100).toFixed(2))
    : 0;

  return json({
    from: from.toISOString(),
    to: to.toISOString(),
    revenue,
    expenses,
    contraExpense,
    totalRevenue: toNum(totalRevenue),
    totalExpense: toNum(totalExpense),
    totalContra: toNum(totalContra),
    grossProfit: toNum(grossProfit),
    netProfit: toNum(netProfit),
    grossMargin,
    netMargin,
  });
});
