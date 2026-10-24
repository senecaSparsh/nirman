import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import {Wallet, TrendingUp, FileText, AlertTriangle} from "lucide-react";
import { getCompany, toNum, scopeWhere, getEffectivePermissions } from "@/lib/server";
import { computeLateInterest } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import { squareToSupplierCards } from "@/lib/supplier-payables";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileReportHeader, MobileReportSummary, MobileBarChart } from "@/components/mobile/v2/report-ui";
import { MobileExportShareIcons } from "@/components/mobile/v2/export-share-bar";
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
  const __effPerms = await getEffectivePermissions();
  if (!__effPerms.includes(PERM.FINANCE_VIEW)) notFound();
  const company = await getCompany();
  const now = new Date();

  const [overduePOs, supplierPayments, supplierCards, sales, draftPOs, approvedRaBills] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { ...await scopeWhere("PurchaseOrder"), companyId: company.id, status: { in: ["ORDERED", "PARTIAL", "RECEIVED"] }, lines: { some: { qtyReceived: { gt: 0 } } } },
      include: { supplier: { select: { id: true, name: true } }, lines: { select: { qtyOrdered: true, qtyReceived: true, unitCost: true, gstRate: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.supplierPayment.findMany({
      where: { ...await scopeWhere("SupplierPayment"), companyId: company.id, status: "ACTIVE" },
      select: { supplierId: true, amount: true },
    }),
    prisma.supplier.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true, balanceOwed: true, createdAt: true },
      take: 2000,
    }),
    prisma.assetSale.findMany({
      where: { ...await scopeWhere("AssetSale"), companyId: company.id, status: "ACTIVE", paymentStatus: { in: ["PENDING", "PARTIAL"] } },
      include: {
        customer: { select: { name: true } },
        project: { select: { name: true } },
        payments: {
          where: { status: { not: "VOID" }, OR: [{ chequeStatus: null }, { chequeStatus: "CLEARED" }] },
          select: { amount: true },
        },
      },
      orderBy: { saleDate: "asc" },
    }),
    prisma.purchaseOrder.findMany({
      where: { ...await scopeWhere("PurchaseOrder"), companyId: company.id, status: "DRAFT" },
      include: { supplier: { select: { name: true } }, lines: { select: { qtyOrdered: true, unitCost: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.raBill.findMany({
      where: { ...await scopeWhere("RaBill"), companyId: company.id, status: "APPROVED" },
      include: { workOrder: { select: { workOrderNumber: true, subcontractor: { select: { name: true } } } } },
      orderBy: { billDate: "asc" },
      take: 500,
    }),
  ]);

  const paidBySupplier = new Map<string, number>();
  for (const p of supplierPayments) {
    paidBySupplier.set(p.supplierId, (paidBySupplier.get(p.supplierId) ?? 0) + toNum(p.amount));
  }

  const poOverdueRows = overduePOs.map((po) => {
    const receivedValue = po.lines.reduce((s, l) => s + toNum(l.qtyReceived) * toNum(l.unitCost) * (1 + toNum(l.gstRate) / 100), 0);
    const paidPool = paidBySupplier.get(po.supplierId) ?? 0;
    const applied = Math.min(paidPool, receivedValue);
    paidBySupplier.set(po.supplierId, paidPool - applied);
    const daysOverdue = po.expectedDate ? Math.floor((now.getTime() - po.expectedDate.getTime()) / 86400000) : 0;
    return {
      id: po.id,
      supplierId: po.supplierId,
      poNumber: po.poNumber,
      supplier: po.supplier.name,
      daysOverdue,
      payable: receivedValue - applied,
      agingBucket: getAgingBucket(daysOverdue),
      ageLabel: daysOverdue > 0 ? `${daysOverdue}d overdue` : "not yet due",
    };
  });

  const { poRows: payablePOs, unexplained } = squareToSupplierCards(
    poOverdueRows,
    supplierCards.map((s) => ({ id: s.id, balanceOwed: toNum(s.balanceOwed) })),
  );
  const unlinkedSupplierRows = supplierCards
    .filter((s) => unexplained.has(s.id))
    .map((s) => {
      const payable = unexplained.get(s.id) ?? 0;
      const daysOverdue = Math.floor((now.getTime() - s.createdAt.getTime()) / 86400000);
      return { id: `sup-bal-${s.id}`, poNumber: "Opening / bills", supplier: s.name, daysOverdue, payable, agingBucket: getAgingBucket(daysOverdue), ageLabel: `${daysOverdue}d open` };
    });

  // Approved RA bills are subcontractor payables (AP credit posts at
  // approval; they settle whole on payment — no partials).
  const raBillRows = approvedRaBills
    .map((b) => {
      const daysOverdue = Math.floor((now.getTime() - b.billDate.getTime()) / 86400000);
      return {
        id: `ra-${b.id}`,
        poNumber: b.raBillNumber,
        supplier: b.workOrder.subcontractor.name,
        daysOverdue,
        payable: toNum(b.netPayable),
        agingBucket: getAgingBucket(daysOverdue),
        ageLabel: `RA bill · ${daysOverdue > 0 ? `${daysOverdue}d` : "today"}`,
      };
    })
    .filter((r) => r.payable > 0.01);

  const overdueRows = [...payablePOs, ...unlinkedSupplierRows, ...raBillRows];

  // ── Overdue buyer installments — the collections workbench the sales
  //    manager needs on their phone. Interest at MCLR+2% like the desktop
  //    workbench; each row deep-links to the sale to collect or demand.
  const overdueItems = await prisma.paymentScheduleItem.findMany({
    take: 100,
    where: {
      status: { in: ["DUE", "PARTIAL"] },
      dueDate: { lte: now },
      paymentSchedule: { assetSale: { companyId: company.id, status: "ACTIVE", ...await scopeWhere("AssetSale") } },
    },
    include: {
      paymentSchedule: {
        include: { assetSale: { select: { id: true, saleNumber: true, customer: { select: { name: true } } } } },
      },
    },
    orderBy: { dueDate: "asc" },
  });
  const installmentRows = overdueItems
    .map((i) => {
      const late = computeLateInterest({ totalAmount: i.totalAmount, paidAmount: i.paidAmount, dueDate: i.dueDate, asOf: now });
      if (!late) return null;
      return {
        id: i.id,
        saleId: i.paymentSchedule.assetSale.id,
        saleNumber: i.paymentSchedule.assetSale.saleNumber,
        customer: i.paymentSchedule.assetSale.customer.name,
        installment: `#${i.installmentNo} ${i.description}`,
        daysOverdue: late.daysOverdue,
        principal: Number(late.principalDue),
        interest: Number(late.interest),
        totalPayable: Number(late.totalPayable),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && r.principal > 0.01);

  const receivableRows = sales.map((s) => {
    const collected = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
    const outstanding = Math.max(0, toNum(s.salePrice) + toNum(s.gstAmount) - collected - toNum(s.tdsAmount));
    const daysSinceSale = Math.floor((now.getTime() - s.saleDate.getTime()) / 86400000);
    return { id: s.id, saleNumber: s.saleNumber, customer: s.customer.name, project: s.project?.name ?? "—", outstanding, daysSinceSale, agingBucket: getAgingBucket(daysSinceSale) };
  }).filter((r) => r.outstanding > 0.01);

  const draftRows = draftPOs.map((po) => ({
    id: po.id, poNumber: po.poNumber, supplier: po.supplier.name,
    value: po.lines.reduce((s, l) => s + toNum(l.qtyOrdered) * toNum(l.unitCost), 0),
  }));

  const totalPayable = overdueRows.reduce((s, r) => s + toNum(r.payable), 0);
  const totalReceivable = receivableRows.reduce((s, r) => s + toNum(r.outstanding), 0);
  const totalDraft = draftRows.reduce((s, r) => s + toNum(r.value), 0);
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
        subtitle="Payables to suppliers & contractors, receivables, draft POs"
        icon={Wallet}
        period="Current"
      />

      <MobileReportSummary
        items={[
          // Overdue-PO payable only — not all supplier balances (those live
          // on the Accounts hub at ₹10.96L). Labeled so the number isn't
          // misread as the company-wide payable figure.
          { label: "Payable", value: formatCurrencyCompact(totalPayable), tone: "stop" },
          { label: "Receivable", value: formatCurrencyCompact(totalReceivable), tone: "go" },
          { label: "Net Cash", value: formatCurrencyCompact(netCash), tone: netCash >= 0 ? "go" : "stop" },
          { label: "Draft POs", value: formatCurrencyCompact(totalDraft), tone: "signal" },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareIcons
          title="Pending Payments Report"
          rows={exportRows as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`Payable: ${formatCurrencyCompact(totalPayable)} · Receivable: ${formatCurrencyCompact(totalReceivable)} · Net: ${formatCurrency(netCash)}`}
        />
      </div>

      {/* Overdue installments — collections workbench on mobile. First in
          the page: this is the money the business chases daily. */}
      {installmentRows.length > 0 && (
        <>
          <MobileSectionTitle>
            <span className="flex items-center gap-1.5"><AlertTriangle className="size-3.5 text-warning" /> Overdue installments ({installmentRows.length})</span>
          </MobileSectionTitle>
          <div className="mb-4 space-y-1.5">
            {installmentRows.map((i) => (
              <MobileRow
                key={i.id}
                href={`/m/sales/${i.saleId}`}
                title={`${i.customer} · ${i.installment}`}
                subtitle={`${i.saleNumber} · ${i.daysOverdue}d overdue`}
                meta={formatCurrency(i.totalPayable)}
                metaSub={`${formatCurrencyCompact(i.principal)}${i.interest > 0 ? ` + ${formatCurrencyCompact(i.interest)} int` : ""}`}
                tone="danger"
              />
            ))}
          </div>
        </>
      )}

      {/* Top overdue POs by payable amount */}
      {overdueRows.length > 0 && (
        <>
          <MobileSectionTitle>Largest Payables</MobileSectionTitle>
          <div className="mb-4">
            <MobileBarChart
              data={overdueRows.slice(0, 10).map((r) => ({
                label: `${r.supplier} (${r.poNumber})`,
                value: r.payable,
                tone: "stop" as const,
              }))}
              formatValue={(v) => formatCurrencyCompact(v)}
            />
          </div>
        </>
      )}

      {/* Overdue POs */}
      {overdueRows.length > 0 && (
        <>
          <MobileSectionTitle>Payables ({overdueRows.length})</MobileSectionTitle>
          <div className="flex flex-col gap-2 mb-4">
            {overdueRows.slice(0, 15).map((r) => (
              <MobileRow
                key={r.id}
                icon={AlertTriangle}
                title={r.supplier}
                subtitle={`${r.poNumber} · ${r.ageLabel}`}
                meta={formatCurrencyCompact(r.payable)}
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
                meta={formatCurrencyCompact(r.outstanding)}
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
                meta={formatCurrencyCompact(r.value)}
                tone="warning"
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
