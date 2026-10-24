import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, scopeWhere, getUserPermissions } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { PendingPaymentsReport } from "@/components/reports/pending-payments-report";
import { computeLateInterest } from "@nirman/services";
import { squareToSupplierCards } from "@/lib/supplier-payables";

import { NoAccess } from "@/components/no-access";
export default function PendingPaymentsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading pending payments…" variant="list" />}>
        <PendingPaymentsContent />
      </Suspense>
    </div>
  );
}

async function PendingPaymentsContent() {
  await connection();
  const __effPerms = await getUserPermissions();
  const company = await getCompany();

  if (!__effPerms.includes(PERM.FINANCE_VIEW)) {
    return (
      <NoAccess what="the money owed report" permission={PERM.FINANCE_VIEW} />
    );
  }

  const now = new Date();

  // 1. Outbound payables — every PO with goods received but not yet paid
  //    for. Supplier payments are recorded per-supplier (not per-PO), so we
  //    allocate each supplier's paid pool FIFO over their oldest received
  //    POs to get a per-PO unpaid balance.
  const receivedPOs = await prisma.purchaseOrder.findMany({
    take: 500,
    where: { ...await scopeWhere("PurchaseOrder"),
      companyId: company.id,
      status: { in: ["ORDERED", "PARTIAL", "RECEIVED"] },
      lines: { some: { qtyReceived: { gt: 0 } } },
    },
    include: {
      supplier: { select: { id: true, name: true, isMsme: true } },
      lines: { select: { qtyOrdered: true, qtyReceived: true, unitCost: true, gstRate: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const [supplierPayments, supplierCards] = await Promise.all([
    prisma.supplierPayment.findMany({
      where: { ...await scopeWhere("SupplierPayment"), companyId: company.id, status: "ACTIVE" },
      select: { supplierId: true, amount: true },
    }),
    prisma.supplier.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true, balanceOwed: true, createdAt: true },
      take: 2000,
    }),
  ]);
  const paidBySupplier = new Map<string, number>();
  for (const p of supplierPayments) {
    paidBySupplier.set(p.supplierId, (paidBySupplier.get(p.supplierId) ?? 0) + toNum(p.amount));
  }

  const poOverdueRows = receivedPOs.map((po) => {
    const receivedValue = po.lines.reduce((s, l) => s + toNum(l.qtyReceived) * toNum(l.unitCost) * (1 + toNum(l.gstRate) / 100), 0);
    const orderedValue = po.lines.reduce((s, l) => s + toNum(l.qtyOrdered) * toNum(l.unitCost) * (1 + toNum(l.gstRate) / 100), 0);
    const paidPool = paidBySupplier.get(po.supplierId) ?? 0;
    const applied = Math.min(paidPool, receivedValue);
    paidBySupplier.set(po.supplierId, paidPool - applied);
    const payable = receivedValue - applied;
    const fullyPaid = payable <= 0.01;
    const daysOverdue = po.expectedDate ? Math.floor((now.getTime() - po.expectedDate.getTime()) / 86400000) : 0;
    return {
      id: po.id,
      supplierId: po.supplierId,
      poNumber: po.poNumber,
      supplier: po.supplier.name,
      isMsme: po.supplier.isMsme,
      expectedDate: po.expectedDate?.toISOString() ?? null,
      orderedValue,
      receivedValue,
      payable,
      status: po.status,
      daysOverdue,
      agingBucket: getAgingBucket(daysOverdue),
      fullyPaid,
    };
  }).filter((r) => !r.fullyPaid);

  // Supplier cards are the reconciled AP subledger: PO payables are squared to
  // them, and the balance the POs don't explain is opening / bills (no due date).
  const { poRows: payablePOs, unexplained } = squareToSupplierCards(
    poOverdueRows,
    supplierCards.map((s) => ({ id: s.id, balanceOwed: toNum(s.balanceOwed) })),
  );
  const unlinkedSupplierRows = supplierCards
    .filter((s) => unexplained.has(s.id))
    .map((s) => {
      const payable = unexplained.get(s.id) ?? 0;
      const daysOverdue = Math.floor((now.getTime() - s.createdAt.getTime()) / 86400000);
      return {
        id: `sup-bal-${s.id}`,
        supplierId: s.id,
        poNumber: "Opening / bills",
        supplier: s.name,
        expectedDate: null,
        orderedValue: payable,
        receivedValue: payable,
        payable,
        status: "OPEN",
        daysOverdue,
        agingBucket: getAgingBucket(daysOverdue),
      };
    });

  // Approved RA bills are subcontractor payables — approval posts the AP
  // credit (Cr 2000), and they settle in one shot on payment (APPROVED →
  // PAID, no partials). Gross billed vs net payable differ by deductions.
  const approvedRaBills = await prisma.raBill.findMany({
    take: 500,
    where: { ...await scopeWhere("RaBill"), companyId: company.id, status: "APPROVED" },
    include: { workOrder: { select: { workOrderNumber: true, subcontractor: { select: { name: true } } } } },
    orderBy: { billDate: "asc" },
  });
  const raBillRows = approvedRaBills
    .map((b) => {
      const payable = toNum(b.netPayable);
      const daysOverdue = Math.floor((now.getTime() - b.billDate.getTime()) / 86400000);
      return {
        id: `ra-${b.id}`,
        poNumber: b.raBillNumber,
        supplier: b.workOrder.subcontractor.name,
        expectedDate: null,
        orderedValue: toNum(b.grossAmount),
        receivedValue: toNum(b.grossAmount),
        payable,
        status: "RA BILL",
        daysOverdue,
        agingBucket: getAgingBucket(daysOverdue),
      };
    })
    .filter((r) => r.payable > 0.01);

  // Approved-but-unpaid expense claims — reimbursements owed to staff
  // (Cr Reimbursements Payable). ApprovedAt is the "due" reference — an
  // approved claim should clear within days, not months.
  const unpaidClaims = await prisma.expenseClaim.findMany({
    take: 500,
    where: { companyId: company.id, status: "APPROVED" },
    include: { claimant: { select: { name: true, email: true } }, lines: { select: { amount: true, gstAmount: true } } },
    orderBy: { approvedAt: "asc" },
  });
  const claimRows = unpaidClaims
    .map((c) => {
      const payable = c.lines.reduce((s, l) => s + toNum(l.amount) + toNum(l.gstAmount), 0);
      const ref = c.approvedAt ?? c.createdAt;
      const daysOverdue = Math.floor((now.getTime() - ref.getTime()) / 86400000);
      return {
        id: `claim-${c.id}`,
        poNumber: `Claim ${c.id.slice(-6)}`,
        supplier: c.claimant?.name ?? c.claimant?.email ?? "Employee",
        expectedDate: null,
        orderedValue: payable,
        receivedValue: payable,
        payable,
        status: "REIMBURSEMENT",
        daysOverdue,
        agingBucket: getAgingBucket(daysOverdue),
      };
    })
    .filter((r) => r.payable > 0.01);

  const overdueRows = [...payablePOs, ...unlinkedSupplierRows, ...raBillRows, ...claimRows];

  // 2. Outstanding sale receivables — inbound
  const sales = await prisma.assetSale.findMany({
    take: 500,
    where: {...await scopeWhere("AssetSale"), 
      companyId: company.id,
      status: "ACTIVE",
      paymentStatus: { in: ["PENDING", "PARTIAL"] },
    },
    include: {
      customer: { select: { name: true } },
      project: { select: { name: true } },
      payments: {
        where: { status: { not: "VOID" }, OR: [{ chequeStatus: null }, { chequeStatus: "CLEARED" }] },
        select: { amount: true },
      },
    },
    orderBy: { saleDate: "asc" },
  });

  const receivableRows = sales.map((s) => {
    const collected = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
    // 194-IA: buyer-withheld TDS is settled to the ITD, not owed by the
    // customer — subtract it from what's collectible (same rule as the
    // finance banner and /api/sales list).
    const totalSaleValue = toNum(s.salePrice) + toNum(s.gstAmount) - toNum(s.tdsAmount);
    const daysSinceSale = Math.floor((now.getTime() - s.saleDate.getTime()) / 86400000);
    return {
      id: s.id,
      saleNumber: s.saleNumber,
      customer: s.customer.name,
      project: s.project?.name ?? "Standalone",
      saleDate: s.saleDate.toISOString(),
      salePrice: totalSaleValue,
      collected,
      outstanding: Math.max(0, totalSaleValue - collected),
      paymentStatus: s.paymentStatus,
      daysSinceSale,
      agingBucket: getAgingBucket(daysSinceSale),
    };
  }).filter((r) => r.outstanding > 0.01);

  // 3. Draft POs awaiting approval (not yet payable, but pending action)
  const draftPOs = await prisma.purchaseOrder.findMany({
    take: 500,
    where: { ...await scopeWhere("PurchaseOrder"), companyId: company.id, status: "DRAFT" },
    include: { supplier: { select: { name: true } }, lines: { select: { qtyOrdered: true, unitCost: true } } },
    orderBy: { createdAt: "desc" },
  });
  const draftRows = draftPOs.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    supplier: po.supplier.name,
    value: po.lines.reduce((s, l) => s + toNum(l.qtyOrdered) * toNum(l.unitCost), 0),
    createdAt: po.createdAt.toISOString(),
  }));

  // 4. Overdue installments — the collections workbench. Any unpaid schedule
  //    item past its dueDate is overdue regardless of stored status (the
  //    reminder sweep flips PENDING→DUE, but the report shouldn't wait for
  //    the sweep to reflect reality). Interest accrues at SBI MCLR+2%.
  const overdueItems = await prisma.paymentScheduleItem.findMany({
    take: 300,
    where: {
      status: { in: ["PENDING", "DUE", "PARTIAL"] },
      dueDate: { lt: now },
      paymentSchedule: { assetSale: { companyId: company.id, status: { not: "CANCELLED" }, ...await scopeWhere("AssetSale") } },
    },
    include: {
      paymentSchedule: {
        include: { assetSale: { select: { saleNumber: true, customer: { select: { name: true } } } } },
      },
    },
    orderBy: { dueDate: "asc" },
  });
  // Last demand dispatch per item — the "did we already chase this buyer"
  // evidence column. DEMAND_LETTER logs carry scheduleItemId in metadata.
  const demandLogs = await prisma.notificationLog.findMany({
    where: {
      companyId: company.id,
      eventType: "DEMAND_LETTER",
      status: "SENT",
    },
    select: { metadata: true, sentAt: true },
    orderBy: { sentAt: "desc" },
    take: 500,
  });
  const lastDemandByItem = new Map<string, Date>();
  for (const l of demandLogs) {
    const itemId = (l.metadata as { scheduleItemId?: string } | null)?.scheduleItemId;
    if (itemId && !lastDemandByItem.has(itemId) && l.sentAt) lastDemandByItem.set(itemId, l.sentAt);
  }

  const installmentRows = overdueItems.map((i) => {
    const late = computeLateInterest({ totalAmount: i.totalAmount, paidAmount: i.paidAmount, dueDate: i.dueDate, asOf: now });
    return {
      id: i.id,
      saleNumber: i.paymentSchedule.assetSale.saleNumber,
      customer: i.paymentSchedule.assetSale.customer.name,
      installment: `#${i.installmentNo} ${i.description}`,
      dueDate: i.dueDate!.toISOString(),
      daysOverdue: late?.daysOverdue ?? 0,
      principal: Number(late?.principalDue ?? 0),
      interest: Number(late?.interest ?? 0),
      totalPayable: Number(late?.totalPayable ?? 0),
      lastDemanded: lastDemandByItem.get(i.id)?.toISOString() ?? null,
    };
  }).filter((r) => r.principal > 0.01);

  const totalPayable = overdueRows.reduce((s, r) => s + toNum(r.payable), 0);
  // Sec 43B(h) exposure — MSME dues aging >45 days are disallowed as expense
  const msmeOver45 = overdueRows
    .filter((r) => "isMsme" in r && r.isMsme && r.daysOverdue > 45)
    .reduce((s, r) => s + toNum(r.payable), 0);
  const totalReceivable = receivableRows.reduce((s, r) => s + toNum(r.outstanding), 0);
  const totalDraft = draftRows.reduce((s, r) => s + toNum(r.value), 0);
  const netCash = totalReceivable - totalPayable;

  // Aging bucket summaries
  const payableAging = summarizeAging(overdueRows, (r) => r.payable);
  const receivableAging = summarizeAging(receivableRows, (r) => r.outstanding);

  return (
    <>
      <PageHeader
        title="Pending Payments"
        description="Outbound payables (goods received but unpaid), inbound receivables (sales with outstanding balances), and draft POs awaiting approval."
        stats={[
          { label: "Payable", value: formatCurrency(totalPayable) },
          { label: "Receivable", value: formatCurrency(totalReceivable) },
          { label: "Net cash", value: formatCurrency(netCash) },
          { label: "Draft POs", value: formatCurrency(totalDraft) },
          ...(msmeOver45 > 0
            ? [{ label: "MSME >45d (43B)", value: formatCurrency(msmeOver45), tone: "danger" as const }]
            : []),
        ]}
      />
      <PendingPaymentsReport
        overduePOs={overdueRows}
        receivables={receivableRows}
        installments={installmentRows}
        draftPOs={draftRows}
        totalPayable={totalPayable}
        totalReceivable={totalReceivable}
        totalDraft={totalDraft}
        payableAging={payableAging}
        receivableAging={receivableAging}
        canSendReminders={__effPerms.includes(PERM.FINANCE_MANAGE)}
      />
    </>
  );
}

// ── Aging bucket helpers ────────────────────────────────────

type AgingBucket = "current" | "1-30d" | "31-60d" | "61-90d" | ">90d";

function getAgingBucket(days: number): AgingBucket {
  if (days <= 0) return "current";
  if (days <= 30) return "1-30d";
  if (days <= 60) return "31-60d";
  if (days <= 90) return "61-90d";
  return ">90d";
}

interface AgingSummary {
  current: number;
  "1-30d": number;
  "31-60d": number;
  "61-90d": number;
  ">90d": number;
}

function summarizeAging<T extends { agingBucket: AgingBucket }>(
  rows: T[],
  amountFn: (row: T) => number,
): AgingSummary {
  const summary: AgingSummary = {
    current: 0,
    "1-30d": 0,
    "31-60d": 0,
    "61-90d": 0,
    ">90d": 0,
  };
  for (const row of rows) {
    summary[row.agingBucket] += amountFn(row);
  }
  return summary;
}
