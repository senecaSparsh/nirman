import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { FileText, TrendingUp, TrendingDown, Truck } from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileReportHeader, MobileReportSummary, MobileBarChart } from "@/components/mobile/v2/report-ui";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * /m/reports/purchase-register — mobile purchase register.
 * Purchase bills and returns in a period.
 */
export default function MobilePurchaseRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobilePurchaseRegisterContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MobilePurchaseRegisterContent({
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

  const fyLabel = `FY ${fromDate.getFullYear()}-${String(fromDate.getFullYear() + 1).slice(2)}`;

  const [purchases, returns] = await Promise.all([
    prisma.directPurchase.findMany({
      where: { companyId: company.id, billDate: { gte: fromDate, lte: toDate } },
      include: { supplier: { select: { name: true } } },
      orderBy: { billDate: "asc" },
    }),
    prisma.supplierReturn.findMany({
      where: { companyId: company.id, status: { in: ["SUBMITTED", "COMPLETED"] }, returnDate: { gte: fromDate, lte: toDate } },
      include: { supplier: { select: { name: true } }, lines: { select: { qty: true, unitCost: true } } },
      orderBy: { returnDate: "asc" },
    }),
  ]);

  type Row = { id: string; type: "PURCHASE" | "RETURN"; number: string; date: string; name: string; billAmt: number };
  const rows: Row[] = [];

  for (const p of purchases) {
    rows.push({ id: p.id, type: "PURCHASE", number: p.billNumber, date: p.billDate.toISOString().slice(0, 10), name: p.supplier?.name ?? p.supplierName, billAmt: toNum(p.billAmount) });
  }
  for (const r of returns) {
    const returnAmount = r.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0);
    rows.push({ id: r.id, type: "RETURN", number: r.returnNumber, date: r.returnDate.toISOString().slice(0, 10), name: r.supplier.name, billAmt: -returnAmount });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));

  const totalPurchases = rows.filter((r) => r.type === "PURCHASE").reduce((s, r) => s + r.billAmt, 0);
  const totalReturns = rows.filter((r) => r.type === "RETURN").reduce((s, r) => s + r.billAmt, 0);
  const netTotal = totalPurchases + totalReturns;

  if (rows.length === 0) {
    return <MobileEmptyState icon={FileText} title="No purchases in this period" hint="Purchase bills will appear here once recorded" />;
  }

  // Top suppliers by purchase amount
  const supplierMap = new Map<string, number>();
  for (const r of rows.filter((r) => r.type === "PURCHASE")) {
    supplierMap.set(r.name, (supplierMap.get(r.name) ?? 0) + r.billAmt);
  }
  const topSuppliers = Array.from(supplierMap.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const csvColumns: MobileColumnSpec[] = [
    { key: "type", label: "Type" },
    { key: "number", label: "Bill/Return Number" },
    { key: "date", label: "Date" },
    { key: "name", label: "Supplier" },
    { key: "billAmt", label: "Bill Amount", format: "currency" },
  ];

  return (
    <div>
      <MobileReportHeader
        title="Purchase Register"
        subtitle="Purchase bills and supplier returns for the period"
        icon={FileText}
        period={fyLabel}
      />

      <MobileReportSummary
        items={[
          { label: "Bills", value: String(rows.length) },
          { label: "Purchases", value: formatCurrency(totalPurchases) },
          { label: "Returns", value: formatCurrency(totalReturns), tone: "stop" },
          { label: "Net", value: formatCurrency(netTotal), tone: netTotal >= 0 ? "go" : "stop" },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="Purchase Register Report"
          rows={rows as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`Purchases: ${formatCurrency(totalPurchases)} · Returns: ${formatCurrency(totalReturns)} · Net: ${formatCurrency(netTotal)}`}
        />
      </div>

      {/* Top suppliers bar chart */}
      {topSuppliers.length > 0 && (
        <>
          <MobileSectionTitle>Top Suppliers</MobileSectionTitle>
          <div className="mb-4">
            <MobileBarChart
              data={topSuppliers.map((s) => ({
                label: s.name,
                value: s.total,
                tone: "signal" as const,
              }))}
              formatValue={(v) => formatCurrency(v)}
            />
          </div>
        </>
      )}

      <MobileSectionTitle>All Bills ({rows.length})</MobileSectionTitle>
      <div className="flex flex-col gap-2">
        {rows.slice(0, 50).map((r) => (
          <MobileRow
            key={`${r.type}-${r.id}`}
            icon={r.type === "PURCHASE" ? Truck : TrendingDown}
            title={r.name}
            subtitle={`${r.number} · ${formatDate(r.date)}`}
            meta={formatCurrency(Math.abs(r.billAmt))}
            metaSub={r.type === "RETURN" ? "Return" : "Purchase"}
            tone={r.type === "RETURN" ? "danger" : "default"}
          />
        ))}
        {rows.length > 50 && (
          <p className="text-center text-[0.625rem] py-2" style={{ color: "var(--color-ink-500)" }}>
            Showing 50 of {rows.length} bills
          </p>
        )}
      </div>
    </div>
  );
}
