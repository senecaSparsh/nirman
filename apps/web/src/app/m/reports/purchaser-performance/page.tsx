import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Users, TrendingUp, Wallet } from "lucide-react";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { getPurchaserPerformance } from "@nirman/services";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileReportHeader, MobileReportSummary, MobileBarChart } from "@/components/mobile/v2/report-ui";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * /m/reports/purchaser-performance — mobile purchaser performance report.
 */
export default function MobilePurchaserPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={4} />}>
      <MobilePurchaserPerformanceContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MobilePurchaserPerformanceContent({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();
  const { from: fromParam, to: toParam } = await searchParams;
  const role = await getUserRole();
  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) notFound();
  const company = await getCompany();

  const now = new Date();
  const fyStart = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
  const fromDate = fromParam ? new Date(fromParam) : fyStart;
  const toDate = toParam ? new Date(toParam) : now;
  toDate.setHours(23, 59, 59, 999);

  const rows = await getPurchaserPerformance(company.id, { from: fromDate, to: toDate });

  const mapped = rows.map((r) => ({
    ...r,
    totalSpend: r.totalSpend.toNumber(),
    potentialSavings: r.potentialSavings.toNumber(),
  }));

  const totalQuotes = mapped.reduce((s, r) => s + r.quotesUploaded, 0);
  const totalSpend = mapped.reduce((s, r) => s + r.totalSpend, 0);
  const totalSavings = mapped.reduce((s, r) => s + r.potentialSavings, 0);

  if (mapped.length === 0) {
    return <MobileEmptyState icon={Users} title="No purchaser activity yet" hint="Quote uploads and PO conversions will appear here" />;
  }

  const csvColumns: MobileColumnSpec[] = [
    { key: "userName", label: "Purchaser" },
    { key: "userEmail", label: "Email" },
    { key: "role", label: "Role" },
    { key: "quotesUploaded", label: "Quotes Uploaded" },
    { key: "requisitionsHandled", label: "Requisitions Handled" },
    { key: "totalSpend", label: "Total Spend", format: "currency" },
    { key: "potentialSavings", label: "Potential Savings", format: "currency" },
    { key: "cheapestSelectionRate", label: "Cheapest Selection Rate", format: "percent" },
  ];

  return (
    <div>
      <MobileReportHeader
        title="Purchaser Performance"
        subtitle="Quote uploads, requisitions handled, and savings per purchaser"
        icon={Users}
        period="FY 2025-26"
      />

      <MobileReportSummary
        items={[
          { label: "Purchasers", value: String(mapped.length) },
          { label: "Quotes", value: String(totalQuotes) },
          { label: "Total Spend", value: formatCurrency(totalSpend) },
          { label: "Savings", value: formatCurrency(totalSavings), tone: "go" },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="Purchaser Performance Report"
          rows={mapped as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`Purchasers: ${mapped.length} · Quotes: ${totalQuotes} · Total Spend: ${formatCurrency(totalSpend)} · Savings: ${formatCurrency(totalSavings)}`}
        />
      </div>

      {/* Total spend by purchaser — bar chart */}
      <MobileSectionTitle>Total Spend by Purchaser</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={mapped.map((r) => ({
            label: r.userName,
            value: r.totalSpend,
            tone: "signal" as const,
          }))}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      {/* By purchaser */}
      <MobileSectionTitle>By Purchaser</MobileSectionTitle>
      <div className="flex flex-col gap-2">
        {mapped.map((r) => (
          <MobileRow
            key={r.userId}
            icon={Users}
            title={r.userName}
            subtitle={`${r.quotesUploaded} quotes · ${r.requisitionsHandled} reqs`}
            meta={formatCurrency(r.totalSpend)}
            metaSub={`Saved ${formatCurrency(r.potentialSavings)}`}
            tone="default"
          />
        ))}
      </div>
    </div>
  );
}
