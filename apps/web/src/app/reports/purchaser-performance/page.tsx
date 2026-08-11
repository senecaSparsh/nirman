import { Suspense } from "react";
import { connection } from "next/server";
import { getPurchaserPerformance } from "@nirman/services";
import { getCompany, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { PurchaserPerformanceReport } from "@/components/reports/purchaser-performance-report";
import { NoAccess } from "@/components/no-access";

export default function PurchaserPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading purchaser performance…" variant="list" />}>
        <PurchaserPerformanceContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PurchaserPerformanceContent({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();
  const { from: fromParam, to: toParam } = await searchParams;
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    return <NoAccess what="the purchaser performance report" />;
  }

  // Default to current financial year (Apr 1 → Mar 31)
  const now = new Date();
  const fyStart = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
  const fromDate = fromParam ? new Date(fromParam) : fyStart;
  const toDate = toParam ? new Date(toParam) : now;
  toDate.setHours(23, 59, 59, 999);
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);

  const rows = await getPurchaserPerformance(company.id, { from: fromDate, to: toDate });

  const report = {
    from,
    to,
    rows: rows.map((r) => ({
      ...r,
      totalSpend: r.totalSpend.toNumber(),
      potentialSavings: r.potentialSavings.toNumber(),
    })),
    count: rows.length,
    totalQuotes: rows.reduce((s, r) => s + r.quotesUploaded, 0),
    totalSpend: rows.reduce((s, r) => s + r.totalSpend.toNumber(), 0),
    totalSavings: rows.reduce((s, r) => s + r.potentialSavings.toNumber(), 0),
  };

  return (
    <>
      <PageHeader
        title="Purchaser Performance"
        description="How many quotes each purchaser collected and how cost-efficient their buys are. The comparative quote engine tracks who uploaded quotes, whether the cheapest was selected, and how much was saved versus the worst quote."
        stats={[
          { label: "Purchasers", value: report.count },
          { label: "Quotes", value: report.totalQuotes },
          { label: "Spend", value: formatCurrency(report.totalSpend) },
          { label: "Savings", value: formatCurrency(report.totalSavings) },
        ]}
      />
      <PurchaserPerformanceReport report={report} />
    </>
  );
}
