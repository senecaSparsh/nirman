import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { Percent, TrendingDown, TrendingUp, FileText } from "lucide-react";
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
 * /m/reports/gst — mobile GST report.
 * Shows input GST (ITC) vs output GST, net payable/credit, monthly breakdown,
 * and recent POs/sales with GST.
 */
export default function MobileGstPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileGstContent />
    </Suspense>
  );
}

async function MobileGstContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW)) notFound();
  const company = await getCompany();

  // Default to current financial year (Apr 1 → Mar 31)
  const now = new Date();
  const fyStart = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
  const fromDate = fyStart;
  const toDate = now;
  toDate.setHours(23, 59, 59, 999);

  const fyLabel = `FY ${fromDate.getFullYear()}-${String(fromDate.getFullYear() + 1).slice(2)}`;

  const dateFilter = { entryDate: { gte: fromDate, lte: toDate } };

  // Input GST (ITC) = account 1400 debits; Output GST = account 2100 credits
  const INPUT_GST = "1400";
  const OUTPUT_GST = "2100";

  const entries = await prisma.journalEntry.findMany({
    where: {
      companyId: company.id,
      status: "POSTED",
      ...dateFilter,
    },
    include: {
      lines: {
        where: { accountCode: { in: [INPUT_GST, OUTPUT_GST] } },
      },
    },
    orderBy: { entryDate: "asc" },
  });

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Build a month bucket for every month in the selected range
  const monthlyMap = new Map<string, { label: string; inputGst: number; outputGst: number }>();
  const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  const endMonth = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
  while (cursor <= endMonth) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
    monthlyMap.set(key, { label: `${MONTHS[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`, inputGst: 0, outputGst: 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const entry of entries) {
    const d = new Date(entry.entryDate);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const row = monthlyMap.get(key);
    if (!row) continue;
    for (const line of entry.lines) {
      const debit = toNum(line.debit);
      const credit = toNum(line.credit);
      if (line.accountCode === INPUT_GST) row.inputGst += debit;
      else if (line.accountCode === OUTPUT_GST) row.outputGst += credit;
    }
  }

  const monthly = Array.from(monthlyMap.values()).map((m) => ({
    ...m,
    netGst: m.outputGst - m.inputGst, // positive = payable, negative = credit
  }));

  const totalInput = monthly.reduce((s, m) => s + m.inputGst, 0);
  const totalOutput = monthly.reduce((s, m) => s + m.outputGst, 0);
  const netPayable = totalOutput - totalInput;

  // Also pull purchase orders and sales for transaction-level detail
  const [purchaseOrders, sales] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, orderDate: { gte: fromDate, lte: toDate } },
      select: { poNumber: true, gstTotal: true, subtotal: true, orderDate: true, status: true, supplierId: true },
      orderBy: { orderDate: "desc" },
      take: 50,
    }),
    prisma.assetSale.findMany({
      where: { companyId: company.id, saleDate: { gte: fromDate, lte: toDate } },
      select: { saleNumber: true, salePrice: true, gstRate: true, gstAmount: true, saleDate: true, status: true, customerId: true },
      orderBy: { saleDate: "desc" },
      take: 50,
    }),
  ]);

  const [suppliers, customers] = await Promise.all([
    purchaseOrders.length > 0 && purchaseOrders.some((p) => p.supplierId)
      ? prisma.supplier.findMany({ where: { id: { in: purchaseOrders.map((p) => p.supplierId).filter(Boolean) as string[] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    sales.length > 0 && sales.some((s) => s.customerId)
      ? prisma.customer.findMany({ where: { id: { in: sales.map((s) => s.customerId).filter(Boolean) as string[] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const customerMap = new Map(customers.map((c) => [c.id, c.name]));

  const poRows = purchaseOrders
    .filter((p) => toNum(p.gstTotal) > 0)
    .map((p) => ({
      number: p.poNumber,
      date: p.orderDate.toISOString(),
      party: supplierMap.get(p.supplierId ?? "") ?? "—",
      taxableValue: toNum(p.subtotal),
      gst: toNum(p.gstTotal),
      status: p.status,
    }));

  const saleRows = sales
    .filter((s) => toNum(s.gstAmount) > 0)
    .map((s) => ({
      number: s.saleNumber,
      date: s.saleDate.toISOString(),
      party: customerMap.get(s.customerId ?? "") ?? "—",
      taxableValue: toNum(s.salePrice),
      gst: toNum(s.gstAmount),
      status: s.status,
    }));

  const totalTransactions = poRows.length + saleRows.length;

  if (totalTransactions === 0 && entries.length === 0) {
    return (
      <MobileEmptyState
        icon={Percent}
        title="No GST transactions this FY"
        hint="GST entries will appear here once posted"
      />
    );
  }

  const csvColumns: MobileColumnSpec[] = [
    { key: "label", label: "Month" },
    { key: "inputGst", label: "Input GST (ITC)", format: "currency" },
    { key: "outputGst", label: "Output GST", format: "currency" },
    { key: "netGst", label: "Net GST", format: "currency" },
    { key: "number", label: "Number" },
    { key: "date", label: "Date" },
    { key: "party", label: "Party" },
    { key: "taxableValue", label: "Taxable Value", format: "currency" },
    { key: "gst", label: "GST", format: "currency" },
    { key: "status", label: "Status" },
  ];
  const exportRows = [...monthly, ...poRows, ...saleRows];

  return (
    <div>
      <MobileReportHeader
        title="GST Report"
        subtitle="Input GST (ITC) vs output GST, net payable, and transaction detail"
        icon={Percent}
        period={fyLabel}
      />

      <MobileReportSummary
        items={[
          { label: "Input GST", value: formatCurrency(totalInput) },
          { label: "Output GST", value: formatCurrency(totalOutput), tone: "signal" },
          { label: "Net Payable", value: formatCurrency(Math.max(0, netPayable)), tone: netPayable > 0 ? "signal" : "default" },
          { label: "Transactions", value: String(totalTransactions) },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="GST Report"
          rows={exportRows as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`Input: ${formatCurrency(totalInput)} · Output: ${formatCurrency(totalOutput)} · Net: ${formatCurrency(netPayable)}`}
        />
      </div>

      {/* Input vs Output GST by month — bar chart */}
      <MobileSectionTitle>Output GST by Month</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={monthly.map((m) => ({
            label: m.label,
            value: m.outputGst,
            tone: "signal" as const,
          }))}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      <MobileSectionTitle>Input GST (ITC) by Month</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={monthly.map((m) => ({
            label: m.label,
            value: m.inputGst,
            tone: "go" as const,
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
            icon={Percent}
            title={m.label}
            subtitle={`In ${formatCurrency(m.inputGst)} · Out ${formatCurrency(m.outputGst)}`}
            meta={formatCurrency(Math.abs(m.netGst))}
            metaSub={m.netGst > 0 ? "Payable" : m.netGst < 0 ? "Credit" : "Balanced"}
            tone={m.netGst > 0 ? "warning" : m.netGst < 0 ? "success" : "default"}
          />
        ))}
      </div>

      {/* Recent POs with GST */}
      {poRows.length > 0 && (
        <>
          <MobileSectionTitle>Recent POs with GST</MobileSectionTitle>
          <div className="flex flex-col gap-2 mb-4">
            {poRows.slice(0, 15).map((p) => (
              <MobileRow
                key={p.number}
                icon={TrendingDown}
                title={p.party}
                subtitle={`${p.number} · ${formatDate(p.date)}`}
                meta={formatCurrency(p.gst)}
                metaSub={`Taxable ${formatCurrency(p.taxableValue)}`}
                tone="default"
              />
            ))}
            {poRows.length > 15 && (
              <p className="text-center text-[0.625rem] py-2" style={{ color: "var(--color-ink-500)" }}>
                Showing 15 of {poRows.length} POs
              </p>
            )}
          </div>
        </>
      )}

      {/* Recent Sales with GST */}
      {saleRows.length > 0 && (
        <>
          <MobileSectionTitle>Recent Sales with GST</MobileSectionTitle>
          <div className="flex flex-col gap-2">
            {saleRows.slice(0, 15).map((s) => (
              <MobileRow
                key={s.number}
                icon={TrendingUp}
                title={s.party}
                subtitle={`${s.number} · ${formatDate(s.date)}`}
                meta={formatCurrency(s.gst)}
                metaSub={`Taxable ${formatCurrency(s.taxableValue)}`}
                tone="success"
              />
            ))}
            {saleRows.length > 15 && (
              <p className="text-center text-[0.625rem] py-2" style={{ color: "var(--color-ink-500)" }}>
                Showing 15 of {saleRows.length} sales
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
