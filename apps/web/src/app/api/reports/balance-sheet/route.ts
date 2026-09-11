import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";

/**
 * GET /api/reports/balance-sheet
 * Returns a balance sheet (assets = liabilities + equity) as of now
 * (or an optional `asOf` date query param).
 *
 * Uses the same trial-balance grouping approach: sum all posted journal
 * lines per account, then classify by account type.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();

  const asOfParam = req.nextUrl.searchParams.get("asOf");
  const asOf = asOfParam ? new Date(asOfParam) : new Date();
  if (isNaN(asOf.getTime())) {
    return json({ error: "Invalid asOf date" }, { status: 400 });
  }

  // Aggregate debit/credit per account up to asOf
  const grouped = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: {
      journalEntry: {
        companyId: company.id,
        status: "POSTED",
        entryDate: { lte: asOf },
      },
    },
    _sum: { debit: true, credit: true },
    orderBy: { accountId: "asc" },
  });

  const accounts = await prisma.glAccount.findMany({
    where: { id: { in: grouped.map((g) => g.accountId) } },
    select: { id: true, code: true, name: true, type: true },
  });
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  type Section = { code: string; name: string; balance: number };
  const assets: Section[] = [];
  const liabilities: Section[] = [];
  const equity: Section[] = [];

  for (const g of grouped) {
    const acct = accountMap.get(g.accountId);
    if (!acct) continue;
    const debit = new Decimal(g._sum.debit ?? 0);
    const credit = new Decimal(g._sum.credit ?? 0);
    const isDebitNormal = acct.type === "ASSET" || acct.type === "EXPENSE";
    const balance = isDebitNormal ? debit.minus(credit) : credit.minus(debit);
    const balNum = toNum(balance);
    if (balNum === 0) continue; // skip zero-balance accounts

    const entry = { code: acct.code, name: acct.name, balance: balNum };
    if (acct.type === "ASSET") assets.push(entry);
    else if (acct.type === "LIABILITY") liabilities.push(entry);
    else if (acct.type === "EQUITY") equity.push(entry);
    // Revenue and Expense accounts are P&L — not on the balance sheet directly.
    // CONTRA_EXPENSE (cost recovery) is treated as a reduction of expenses,
    // so it doesn't appear on the balance sheet either.
  }

  // Compute net income (revenue - expenses) and add to equity as retained earnings
  const revenueAndExpense = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: {
      journalEntry: {
        companyId: company.id,
        status: "POSTED",
        entryDate: { lte: asOf },
      },
    },
    _sum: { debit: true, credit: true },
  });
  const revAccts = await prisma.glAccount.findMany({
    where: { companyId: company.id, type: { in: ["REVENUE", "EXPENSE", "CONTRA_EXPENSE"] } },
    select: { id: true, type: true },
  });
  const revMap = new Map(revAccts.map((a) => [a.id, a.type]));
  let totalRevenue = new Decimal(0);
  let totalExpense = new Decimal(0);
  for (const g of revenueAndExpense) {
    const type = revMap.get(g.accountId);
    if (!type) continue;
    const debit = new Decimal(g._sum.debit ?? 0);
    const credit = new Decimal(g._sum.credit ?? 0);
    if (type === "REVENUE") totalRevenue = totalRevenue.plus(credit.minus(debit));
    else if (type === "EXPENSE") totalExpense = totalExpense.plus(debit.minus(credit));
    else if (type === "CONTRA_EXPENSE") totalExpense = totalExpense.minus(credit.minus(debit));
  }
  const netIncome = totalRevenue.minus(totalExpense);
  const netIncomeNum = toNum(netIncome);
  if (netIncomeNum !== 0) {
    equity.push({ code: "3900", name: "Net Income (current period)", balance: netIncomeNum });
  }

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
  const totalEquity = equity.reduce((s, a) => s + a.balance, 0);
  const totalLiabEquity = totalLiabilities + totalEquity;
  const isBalanced = Math.abs(totalAssets - totalLiabEquity) < 0.01;

  return json({
    asOf: asOf.toISOString(),
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalLiabEquity,
    isBalanced,
  });
});
