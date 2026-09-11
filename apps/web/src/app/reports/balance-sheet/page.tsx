import { Suspense } from "react";
import { connection } from "next/server";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { BalanceSheetReport } from "@/components/reports/balance-sheet-report";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";

export default function BalanceSheetPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading balance sheet…" variant="cards" />}>
        <BalanceSheetContent />
      </Suspense>
    </div>
  );
}

async function BalanceSheetContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return <NoAccess what="the balance sheet" />;
  }

  const asOf = new Date();

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

  // Also compute net income from revenue/expense accounts
  let totalRevenue = new Decimal(0);
  let totalExpense = new Decimal(0);

  for (const g of grouped) {
    const acct = accountMap.get(g.accountId);
    if (!acct) continue;
    const debit = new Decimal(g._sum.debit ?? 0);
    const credit = new Decimal(g._sum.credit ?? 0);
    const isDebitNormal = acct.type === "ASSET" || acct.type === "EXPENSE";
    const balance = isDebitNormal ? debit.minus(credit) : credit.minus(debit);
    const balNum = toNum(balance);
    if (balNum === 0) continue;

    const entry = { code: acct.code, name: acct.name, balance: balNum };
    if (acct.type === "ASSET") assets.push(entry);
    else if (acct.type === "LIABILITY") liabilities.push(entry);
    else if (acct.type === "EQUITY") equity.push(entry);
    else if (acct.type === "REVENUE") totalRevenue = totalRevenue.plus(balance);
    else if (acct.type === "EXPENSE") totalExpense = totalExpense.plus(balance);
    else if (acct.type === "CONTRA_EXPENSE") totalExpense = totalExpense.minus(balance);
  }

  const netIncome = toNum(totalRevenue.minus(totalExpense));
  if (netIncome !== 0) {
    equity.push({ code: "3900", name: "Net Income (current period)", balance: netIncome });
  }

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
  const totalEquity = equity.reduce((s, a) => s + a.balance, 0);
  const totalLiabEquity = totalLiabilities + totalEquity;
  const isBalanced = Math.abs(totalAssets - totalLiabEquity) < 0.01;

  return (
    <>
      <PageHeader
        title="Balance Sheet"
        description={`As of ${asOf.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })} — assets, liabilities, and equity at a glance.`}
        stats={[
          { label: "Total Assets", value: formatCurrency(totalAssets) },
          { label: "Total Liabilities", value: formatCurrency(totalLiabilities) },
          { label: "Total Equity", value: formatCurrency(totalEquity) },
          { label: isBalanced ? "Balanced" : "Out of Balance", value: isBalanced ? "✓ A = L + E" : `Δ ${formatCurrency(Math.abs(totalAssets - totalLiabEquity))}` },
        ]}
      />
      <BalanceSheetReport
        assets={assets}
        liabilities={liabilities}
        equity={equity}
        totalAssets={totalAssets}
        totalLiabilities={totalLiabilities}
        totalEquity={totalEquity}
        isBalanced={isBalanced}
      />
    </>
  );
}
