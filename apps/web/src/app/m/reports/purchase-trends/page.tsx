import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { TrendingUp, Truck, Users, FileText } from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileReportHeader, MobileReportSummary, MobileBarChart } from "@/components/mobile/v2/report-ui";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * /m/reports/purchase-trends — mobile purchase trends report.
 * Monthly procurement spend + top suppliers over 12 months.
 */
export default function MobilePurchaseTrendsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobilePurchaseTrendsContent />
    </Suspense>
  );
}

async function MobilePurchaseTrendsContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW)) notFound();
  const company = await getCompany();

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const orders = await prisma.purchaseOrder.findMany({
    where: { companyId: company.id, status: { not: "CANCELLED" }, orderDate: { gte: from } },
    select: { id: true, poNumber: true, orderDate: true, status: true, total: true, subtotal: true, gstTotal: true, supplier: { select: { name: true } } },
    orderBy: { orderDate: "asc" },
  });

  const monthlyMap = new Map<string, { label: string; subtotal: number; gst: number; total: number; count: number }>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    monthlyMap.set(key, { label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, subtotal: 0, gst: 0, total: 0, count: 0 });
  }
  for (const o of orders) {
    const d = o.orderDate;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const row = monthlyMap.get(key);
    if (!row) continue;
    row.subtotal += toNum(o.subtotal);
    row.gst += toNum(o.gstTotal);
    row.total += toNum(o.total);
    row.count += 1;
  }
  const monthly = Array.from(monthlyMap.values());

  const supplierMap = new Map<string, { name: string; total: number; count: number }>();
  for (const o of orders) {
    const name = o.supplier.name;
    if (!supplierMap.has(name)) supplierMap.set(name, { name, total: 0, count: 0 });
    const row = supplierMap.get(name)!;
    row.total += toNum(o.total);
    row.count += 1;
  }
  const topSuppliers = Array.from(supplierMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);

  const grandTotal = monthly.reduce((s, m) => s + m.total, 0);
  const totalOrders = monthly.reduce((s, m) => s + m.count, 0);

  if (totalOrders === 0) {
    return <MobileEmptyState icon={TrendingUp} title="No purchases in the last 12 months" hint="Purchase orders will appear here once created" />;
  }

  const csvColumns: MobileColumnSpec[] = [
    { key: "label", label: "Month" },
    { key: "subtotal", label: "Subtotal", format: "currency" },
    { key: "gst", label: "GST", format: "currency" },
    { key: "total", label: "Total", format: "currency" },
    { key: "count", label: "Orders" },
  ];

  return (
    <div>
      <MobileReportHeader
        title="Purchase Trends"
        subtitle="Monthly procurement spend and top suppliers"
        icon={TrendingUp}
        period="Last 12 months"
      />

      <MobileReportSummary
        items={[
          { label: "12-mo Spend", value: formatCurrency(grandTotal) },
          { label: "Orders", value: String(totalOrders) },
          { label: "Suppliers", value: String(topSuppliers.length) },
          { label: "Avg Order", value: formatCurrency(totalOrders > 0 ? grandTotal / totalOrders : 0) },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="Purchase Trends Report"
          rows={monthly as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`Total Spend: ${formatCurrency(grandTotal)} · ${totalOrders} orders · ${topSuppliers.length} suppliers`}
        />
      </div>

      {/* Monthly spend trend — bar chart */}
      <MobileSectionTitle>Monthly Spend Trend</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={monthly.map((m) => ({
            label: m.label,
            value: m.total,
            tone: "signal" as const,
          }))}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      {/* Monthly breakdown */}
      <MobileSectionTitle>Monthly Breakdown</MobileSectionTitle>
      <div className="flex flex-col gap-2 mb-4">
        {monthly.map((m) => (
          <MobileRow
            key={m.label}
            title={m.label}
            subtitle={`${m.count} order${m.count !== 1 ? "s" : ""} · GST ${formatCurrency(m.gst)}`}
            meta={formatCurrency(m.total)}
            tone={m.count > 0 ? "default" : "default"}
          />
        ))}
      </div>

      {/* Top suppliers */}
      <MobileSectionTitle>Top Suppliers</MobileSectionTitle>
      <div className="flex flex-col gap-2">
        {topSuppliers.map((s) => (
          <MobileRow
            key={s.name}
            icon={Users}
            title={s.name}
            subtitle={`${s.count} order${s.count !== 1 ? "s" : ""}`}
            meta={formatCurrency(s.total)}
            tone="default"
          />
        ))}
      </div>
    </div>
  );
}
