import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { Scale, CheckCircle2, AlertTriangle } from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatCurrencyCompact, cn } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileReportHeader, MobileReportSummary } from "@/components/mobile/v2/report-ui";

export default function MobileBalanceSheetPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileBalanceSheetContent />
    </Suspense>
  );
}

async function MobileBalanceSheetContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW)) notFound();
  const company = await getCompany();

  const asOf = new Date();
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

  if (assets.length === 0 && liabilities.length === 0 && equity.length === 0) {
    return <MobileEmptyState icon={Scale} title="No balance sheet data yet" hint="Post journal entries to see the balance sheet" />;
  }

  return (
    <div>
      <MobileReportHeader
        title="Balance Sheet"
        subtitle="Assets = Liabilities + Equity"
        icon={Scale}
        period={asOf.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
      />

      <MobileReportSummary
        items={[
          { label: "Assets", value: formatCurrencyCompact(totalAssets), tone: "go" },
          { label: "Liabilities", value: formatCurrencyCompact(totalLiabilities), tone: "stop" },
          { label: "Equity", value: formatCurrencyCompact(totalEquity) },
          { label: isBalanced ? "Balanced" : "Δ", value: isBalanced ? "✓" : formatCurrencyCompact(Math.abs(totalAssets - totalLiabEquity)), tone: isBalanced ? "go" : "stop" },
        ]}
      />

      {/* Assets */}
      <MobileSectionTitle>Assets</MobileSectionTitle>
      <div className="flex flex-col gap-2 mb-4">
        {assets.map((a) => (
          <MobileRow
            key={a.code}
            title={a.name}
            subtitle={a.code}
            meta={formatCurrency(a.balance)}
            tone={a.balance < 0 ? "danger" : "default"}
          />
        ))}
        <MobileRow title="Total Assets" subtitle="" meta={formatCurrency(totalAssets)} tone="success" />
      </div>

      {/* Liabilities */}
      <MobileSectionTitle>Liabilities</MobileSectionTitle>
      <div className="flex flex-col gap-2 mb-4">
        {liabilities.map((l) => (
          <MobileRow
            key={l.code}
            title={l.name}
            subtitle={l.code}
            meta={formatCurrency(l.balance)}
            tone={l.balance < 0 ? "danger" : "default"}
          />
        ))}
        <MobileRow title="Total Liabilities" subtitle="" meta={formatCurrency(totalLiabilities)} tone="danger" />
      </div>

      {/* Equity */}
      <MobileSectionTitle>Equity</MobileSectionTitle>
      <div className="flex flex-col gap-2 mb-4">
        {equity.map((e) => (
          <MobileRow
            key={e.code}
            title={e.name}
            subtitle={e.code}
            meta={formatCurrency(e.balance)}
            tone={e.balance < 0 ? "danger" : "default"}
          />
        ))}
        <MobileRow title="Total Equity" subtitle="" meta={formatCurrency(totalEquity)} tone="success" />
      </div>

      {/* Balance check */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border p-3 text-sm",
          isBalanced ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5",
        )}
      >
        {isBalanced ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
        <span className={isBalanced ? "text-success" : "text-destructive"}>
          {isBalanced ? "Balanced — Assets = L + E" : `Out of balance by ${formatCurrency(Math.abs(totalAssets - totalLiabEquity))}`}
        </span>
      </div>
    </div>
  );
}
