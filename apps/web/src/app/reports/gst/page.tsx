import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { GstReport } from "@/components/reports/gst-report";

import { NoAccess } from "@/components/no-access";
export default function GstReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading GST report…" variant="cards" />}>
        <GstReportContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function GstReportContent({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();
  const { from: fromParam, to: toParam } = await searchParams;
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return (
      <NoAccess what="the GST report" />
    );
  }

  // Default to current financial year (Apr 1 → Mar 31) if no range given
  const now = new Date();
  const fyStart = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
  const fromDate = fromParam ? new Date(fromParam) : fyStart;
  const toDate = toParam ? new Date(toParam) : now;
  toDate.setHours(23, 59, 59, 999);
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);

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

  return (
    <>
      <PageHeader
        title="GST Report"
        description="Input GST (ITC) vs Output GST — your net tax liability position for the selected period."
        stats={[
          { label: "Input GST (ITC)", value: formatCurrency(totalInput) },
          { label: "Output GST", value: formatCurrency(totalOutput) },
          { label: "Net Payable", value: formatCurrency(Math.max(0, netPayable)) },
          { label: "ITC Credit", value: formatCurrency(Math.max(0, -netPayable)) },
        ]}
      />
      <GstReport
        from={from}
        to={to}
        monthly={monthly}
        totalInput={totalInput}
        totalOutput={totalOutput}
        netPayable={netPayable}
        poRows={poRows}
        saleRows={saleRows}
      />
    </>
  );
}
