import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { PendingPaymentsReport } from "@/components/reports/pending-payments-report";

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
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return (
      <NoAccess what="the money owed report" />
    );
  }

  const now = new Date();

  // 1. Overdue POs (ORDERED/PARTIAL past expectedDate) — outbound payables
  const overduePOs = await prisma.purchaseOrder.findMany({
    where: {
      companyId: company.id,
      status: { in: ["ORDERED", "PARTIAL"] },
      expectedDate: { lt: now },
    },
    include: {
      supplier: { select: { name: true } },
      lines: { select: { qtyOrdered: true, qtyReceived: true, unitCost: true } },
    },
    orderBy: { expectedDate: "asc" },
  });

  const overdueRows = overduePOs.map((po) => {
    const receivedValue = po.lines.reduce((s, l) => s + toNum(l.qtyReceived) * toNum(l.unitCost), 0);
    const orderedValue = po.lines.reduce((s, l) => s + toNum(l.qtyOrdered) * toNum(l.unitCost), 0);
    const daysOverdue = po.expectedDate ? Math.floor((now.getTime() - po.expectedDate.getTime()) / 86400000) : 0;
    return {
      id: po.id,
      poNumber: po.poNumber,
      supplier: po.supplier.name,
      expectedDate: po.expectedDate?.toISOString() ?? null,
      orderedValue,
      receivedValue,
      payable: receivedValue, // pay for what's been received
      status: po.status,
      daysOverdue,
      agingBucket: getAgingBucket(daysOverdue),
    };
  });

  // 2. Outstanding sale receivables — inbound
  const sales = await prisma.assetSale.findMany({
    where: {
      companyId: company.id,
      status: "ACTIVE",
      paymentStatus: { in: ["PENDING", "PARTIAL"] },
    },
    include: {
      customer: { select: { name: true } },
      project: { select: { name: true } },
      payments: { select: { amount: true } },
    },
    orderBy: { saleDate: "asc" },
  });

  const receivableRows = sales.map((s) => {
    const collected = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
    const daysSinceSale = Math.floor((now.getTime() - s.saleDate.getTime()) / 86400000);
    return {
      id: s.id,
      saleNumber: s.saleNumber,
      customer: s.customer.name,
      project: s.project.name,
      saleDate: s.saleDate.toISOString(),
      salePrice: toNum(s.salePrice),
      collected,
      outstanding: toNum(s.salePrice) - collected,
      paymentStatus: s.paymentStatus,
      daysSinceSale,
      agingBucket: getAgingBucket(daysSinceSale),
    };
  }).filter((r) => r.outstanding > 0.01);

  // 3. Draft POs awaiting approval (not yet payable, but pending action)
  const draftPOs = await prisma.purchaseOrder.findMany({
    where: { companyId: company.id, status: "DRAFT" },
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

  const totalPayable = overdueRows.reduce((s, r) => s + r.payable, 0);
  const totalReceivable = receivableRows.reduce((s, r) => s + r.outstanding, 0);
  const totalDraft = draftRows.reduce((s, r) => s + r.value, 0);
  const netCash = totalReceivable - totalPayable;

  // Aging bucket summaries
  const payableAging = summarizeAging(overdueRows, (r) => r.payable);
  const receivableAging = summarizeAging(receivableRows, (r) => r.outstanding);

  return (
    <>
      <PageHeader
        title="Pending Payments"
        description="Outbound payables (overdue POs received but unpaid), inbound receivables (sales with outstanding balances), and draft POs awaiting approval."
        stats={[
          { label: "Payable (overdue)", value: formatCurrency(totalPayable) },
          { label: "Receivable", value: formatCurrency(totalReceivable) },
          { label: "Net cash", value: formatCurrency(netCash) },
          { label: "Draft POs", value: formatCurrency(totalDraft) },
        ]}
      />
      <PendingPaymentsReport
        overduePOs={overdueRows}
        receivables={receivableRows}
        draftPOs={draftRows}
        totalPayable={totalPayable}
        totalReceivable={totalReceivable}
        totalDraft={totalDraft}
        payableAging={payableAging}
        receivableAging={receivableAging}
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
