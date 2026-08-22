import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { ShoppingCart, TrendingUp, Wallet, Building2 } from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileStatCard,
  MobileRow,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileReportHeader, MobileReportSummary, MobileBarChart } from "@/components/mobile/v2/report-ui";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * /m/reports/sales-revenue — mobile sales & revenue report.
 * Shows headline stats + per-sale list with collected/outstanding amounts.
 */
export default function MobileSalesRevenuePage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileSalesRevenueContent />
    </Suspense>
  );
}

async function MobileSalesRevenueContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW) && !hasPermission(role, PERM.SALES_VIEW)) notFound();
  const company = await getCompany();

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const sales = await prisma.assetSale.findMany({
    where: { companyId: company.id, status: "ACTIVE", saleDate: { gte: from } },
    include: {
      customer: { select: { name: true } },
      project: { select: { name: true } },
      builtUnit: { select: { unitType: true } },
      payments: { select: { amount: true } },
    },
    orderBy: { saleDate: "desc" },
  });

  const records = sales.map((s) => {
    const collected = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
    return {
      id: s.id,
      saleNumber: s.saleNumber,
      customer: s.customer.name,
      projectName: s.project?.name ?? "—",
      unitType: s.builtUnit?.unitType ?? null,
      salePrice: toNum(s.salePrice),
      collected,
      outstanding: toNum(s.salePrice) - collected,
      saleDate: s.saleDate.toISOString(),
    };
  });

  const totalSales = records.reduce((s, r) => s + r.salePrice, 0);
  const totalCollected = records.reduce((s, r) => s + r.collected, 0);
  const totalOutstanding = records.reduce((s, r) => s + r.outstanding, 0);

  if (records.length === 0) {
    return (
      <MobileEmptyState
        icon={ShoppingCart}
        title="No sales in the last 12 months"
        hint="Asset sales will appear here once recorded"
      />
    );
  }

  // Group by project
  const byProject = new Map<string, { name: string; value: number; collected: number; count: number }>();
  for (const r of records) {
    if (!byProject.has(r.projectName)) {
      byProject.set(r.projectName, { name: r.projectName, value: 0, collected: 0, count: 0 });
    }
    const row = byProject.get(r.projectName)!;
    row.value += r.salePrice;
    row.collected += r.collected;
    row.count += 1;
  }
  const projectRows = Array.from(byProject.values()).sort((a, b) => b.value - a.value);

  // CSV export columns
  const csvColumns: MobileColumnSpec[] = [
    { key: "saleNumber", label: "Sale Number" },
    { key: "customer", label: "Customer" },
    { key: "projectName", label: "Project" },
    { key: "unitType", label: "Unit Type" },
    { key: "salePrice", label: "Sale Price", format: "currency" },
    { key: "collected", label: "Collected", format: "currency" },
    { key: "outstanding", label: "Outstanding", format: "currency" },
    { key: "saleDate", label: "Sale Date", format: "date" },
  ];

  return (
    <div>
      <MobileReportHeader
        title="Sales & Revenue"
        subtitle="Asset sales, collections, and outstanding receivables"
        icon={ShoppingCart}
        period="Last 12 months"
      />

      <MobileReportSummary
        items={[
          { label: "Sales Value", value: formatCurrency(totalSales) },
          { label: "Collected", value: formatCurrency(totalCollected), tone: "go" },
          { label: "Outstanding", value: formatCurrency(totalOutstanding), tone: totalOutstanding > 0 ? "signal" : "default" },
          { label: "Deals", value: String(records.length) },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="Sales Revenue Report"
          rows={records as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          exportType="sales-revenue"
          summary={`Sales: ${formatCurrency(totalSales)} · Collected: ${formatCurrency(totalCollected)} · Outstanding: ${formatCurrency(totalOutstanding)} · ${records.length} deals`}
        />
      </div>

      {/* Revenue by project — bar chart */}
      <MobileSectionTitle>Revenue by Project</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={projectRows.map((p) => ({ label: p.name, value: p.value, tone: "go" as const }))}
          formatValue={(v) => formatCurrency(v)}
          maxItems={8}
        />
      </div>

      {/* Project breakdown */}
      <MobileSectionTitle>Project Details</MobileSectionTitle>
      <div className="flex flex-col gap-2 mb-4">
        {projectRows.map((p) => (
          <MobileRow
            key={p.name}
            icon={Building2}
            title={p.name}
            subtitle={`${p.count} deal${p.count > 1 ? "s" : ""} · Collected ${formatCurrency(p.collected)}`}
            meta={formatCurrency(p.value)}
            tone="success"
          />
        ))}
      </div>

      {/* Individual sales */}
      <MobileSectionTitle>All Sales ({records.length})</MobileSectionTitle>
      <div className="flex flex-col gap-2">
        {records.slice(0, 30).map((r) => (
          <MobileRow
            key={r.id}
            icon={ShoppingCart}
            title={r.customer}
            subtitle={`${r.saleNumber} · ${formatDate(r.saleDate)}${r.unitType ? ` · ${r.unitType}` : ""}`}
            meta={formatCurrency(r.salePrice)}
            metaSub={r.outstanding > 0 ? `${formatCurrency(r.outstanding)} due` : "Fully paid"}
            tone={r.outstanding > 0 ? "warning" : "success"}
          />
        ))}
        {records.length > 30 && (
          <p className="text-center text-[0.625rem] py-2" style={{ color: "var(--color-ink-500)" }}>
            Showing 30 of {records.length} sales · Export for full list
          </p>
        )}
      </div>
    </div>
  );
}
