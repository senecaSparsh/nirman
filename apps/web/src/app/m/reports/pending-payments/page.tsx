import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { Wallet, TrendingUp, TrendingDown, FileText, AlertTriangle } from "lucide-react";
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

type AgingBucket = "current" | "1-30d" | "31-60d" | "61-90d" | ">90d";
function getAgingBucket(days: number): AgingBucket {
  if (days <= 0) return "current";
  if (days <= 30) return "1-30d";
  if (days <= 60) return "31-60d";
  if (days <= 90) return "61-90d";
  return ">90d";
}

/**
 * /m/reports/pending-payments — mobile money owed report.
 */
export default function MobilePendingPaymentsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobilePendingPaymentsContent />
    </Suspense>
  );
}

async function MobilePendingPaymentsContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW)) notFound();
  const company = await getCompany();
  const now = new Date();

  const [overduePOs, sales, draftPOs] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] }, expectedDate: { lt: now } },
      include: { supplier: { select: { name: true } }, lines: { select: { qtyOrdered: true, qtyReceived: true, unitCost: true } } },
      orderBy: { expectedDate: "asc" },
    }),
    prisma.assetSale.findMany({
      where: { companyId: company.id, status: "ACTIVE", paymentStatus: { in: ["PENDING", "PARTIAL"] } },
      include: { customer: { select: { name: true } }, project: { select: { name: true } }, payments: { select: { amount: true } } },
      orderBy: { saleDate: "asc" },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: "DRAFT" },
      include: { supplier: { select: { name: true } }, lines: { select: { qtyOrdered: true, unitCost: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const overdueRows = overduePOs.map((po) => {
    const receivedValue = po.lines.reduce((s, l) => s + toNum(l.qtyReceived) * toNum(l.unitCost), 0);
    const daysOverdue = po.expectedDate ? Math.floor((now.getTime() - po.expectedDate.getTime()) / 86400000) : 0;
    return { id: po.id, poNumber: po.poNumber, supplier: po.supplier.name, daysOverdue, payable: receivedValue, agingBucket: getAgingBucket(daysOverdue) };
  });

  const receivableRows = sales.map((s) => {
    const collected = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
    const outstanding = toNum(s.salePrice) - collected;
    const daysSinceSale = Math.floor((now.getTime() - s.saleDate.getTime()) / 86400000);
    return { id: s.id, saleNumber: s.saleNumber, customer: s.customer.name, project: s.project?.name ?? "—", outstanding, daysSinceSale, agingBucket: getAgingBucket(daysSinceSale) };
  }).filter((r) => r.outstanding > 0.01);

  const draftRows = draftPOs.map((po) => ({
    id: po.id, poNumber: po.poNumber, supplier: po.supplier.name,
    value: po.lines.reduce((s, l) => s + toNum(l.qtyOrdered) * toNum(l.unitCost), 0),
  }));

  const totalPayable = overdueRows.reduce((s, r) => s + r.payable, 0);
  const totalReceivable = receivableRows.reduce((s, r) => s + r.outstanding, 0);
  const totalDraft = draftRows.reduce((s, r) => s + r.value, 0);
  const netCash = totalReceivable - totalPayable;

  if (overdueRows.length === 0 && receivableRows.length === 0 && draftRows.length === 0) {
    return <MobileEmptyState icon={Wallet} title="No pending payments" hint="All payables and receivables are settled" />;
  }

  const csvColumns: MobileColumnSpec[] = [
    { key: "poNumber", label: "PO Number" },
    { key: "supplier", label: "Supplier" },
    { key: "daysOverdue", label: "Days Overdue" },
    { key: "payable", label: "Payable", format: "currency" },
    { key: "saleNumber", label: "Sale Number" },
    { key: "customer", label: "Customer" },
    { key: "project", label: "Project" },
    { key: "outstanding", label: "Outstanding", format: "currency" },
    { key: "daysSinceSale", label: "Days Since Sale" },
  ];
  const exportRows = [...overdueRows, ...receivableRows];

  return (
    <div>
      <MobileReportHeader
        title="Pending Payments"
        subtitle="Overdue payables, outstanding receivables, and draft POs"
        icon={Wallet}
        period="Current"
      />

      <MobileReportSummary
        items={[
          { label: "Payable", value: formatCurrency(totalPayable), tone: "stop" },
          { label: "Receivable", value: formatCurrency(totalReceivable), tone: "go" },
          { label: "Net Cash", value: formatCurrency(netCash), tone: netCash >= 0 ? "go" : "stop" },
          { label: "Draft POs", value: formatCurrency(totalDraft), tone: "signal" },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="Pending Payments Report"
          rows={exportRows as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`Payable: ${formatCurrency(totalPayable)} · Receivable: ${formatCurrency(totalReceivable)} · Net: ${formatCurrency(netCash)}`}
        />
      </div>

      {/* Top overdue POs by payable amount */}
      {overdueRows.length > 0 && (
        <>
          <MobileSectionTitle>Top Overdue POs by Amount</MobileSectionTitle>
          <div className="mb-4">
            <MobileBarChart
              data={overdueRows.slice(0, 10).map((r) => ({
                label: `${r.supplier} (${r.poNumber})`,
                value: r.payable,
                tone: "stop" as const,
              }))}
              formatValue={(v) => formatCurrency(v)}
            />
          </div>
        </>
      )}

      {/* Overdue POs */}
      {overdueRows.length > 0 && (
        <>
          <MobileSectionTitle>Overdue POs ({overdueRows.length})</MobileSectionTitle>
          <div className="flex flex-col gap-2 mb-4">
            {overdueRows.slice(0, 15).map((r) => (
              <MobileRow
                key={r.id}
                icon={AlertTriangle}
                title={r.supplier}
                subtitle={`${r.poNumber} · ${r.daysOverdue}d overdue`}
                meta={formatCurrency(r.payable)}
                tone="danger"
              />
            ))}
          </div>
        </>
      )}

      {/* Receivables */}
      {receivableRows.length > 0 && (
        <>
          <MobileSectionTitle>Receivables ({receivableRows.length})</MobileSectionTitle>
          <div className="flex flex-col gap-2 mb-4">
            {receivableRows.slice(0, 15).map((r) => (
              <MobileRow
                key={r.id}
                icon={TrendingUp}
                title={r.customer}
                subtitle={`${r.project} · ${r.daysSinceSale}d`}
                meta={formatCurrency(r.outstanding)}
                tone="success"
              />
            ))}
          </div>
        </>
      )}

      {/* Draft POs */}
      {draftRows.length > 0 && (
        <>
          <MobileSectionTitle>Draft POs ({draftRows.length})</MobileSectionTitle>
          <div className="flex flex-col gap-2">
            {draftRows.map((r) => (
              <MobileRow
                key={r.id}
                icon={FileText}
                title={r.supplier}
                subtitle={r.poNumber}
                meta={formatCurrency(r.value)}
                tone="warning"
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
