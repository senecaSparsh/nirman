import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { SalesRevenueReport } from "@/components/reports/sales-revenue-report";

import { NoAccess } from "@/components/no-access";
export default function SalesRevenuePage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading sales & revenue…" variant="cards" />}>
        <SalesRevenueContent />
      </Suspense>
    </div>
  );
}

async function SalesRevenueContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW) && !hasPermission(role, PERM.SALES_VIEW)) {
    return (
      <NoAccess what="the sales & revenue report" />
    );
  }

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const sales = await prisma.assetSale.findMany({
    where: {
      companyId: company.id,
      status: "ACTIVE",
      saleDate: { gte: from },
    },
    include: {
      customer: { select: { name: true } },
      project: { select: { name: true } },
      payments: { select: { amount: true, paymentDate: true } },
    },
    orderBy: { saleDate: "asc" },
  });

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const monthlyMap = new Map<string, { label: string; sales: number; collected: number; count: number }>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    monthlyMap.set(key, { label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, sales: 0, collected: 0, count: 0 });
  }

  let totalSales = 0;
  let totalCollected = 0;
  let totalOutstanding = 0;

  for (const s of sales) {
    totalSales += toNum(s.salePrice);
    const collected = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
    totalCollected += collected;
    totalOutstanding += toNum(s.salePrice) - collected;

    const d = s.saleDate;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const row = monthlyMap.get(key);
    if (row) {
      row.sales += toNum(s.salePrice);
      row.count += 1;
    }
    for (const p of s.payments) {
      const pd = p.paymentDate;
      const pkey = `${pd.getFullYear()}-${pd.getMonth()}`;
      const prow = monthlyMap.get(pkey);
      if (prow) prow.collected += toNum(p.amount);
    }
  }

  const monthly = Array.from(monthlyMap.values());

  // Top customers by sale value
  const customerMap = new Map<string, { name: string; sales: number; collected: number; count: number }>();
  for (const s of sales) {
    const name = s.customer.name;
    if (!customerMap.has(name)) customerMap.set(name, { name, sales: 0, collected: 0, count: 0 });
    const row = customerMap.get(name)!;
    row.sales += toNum(s.salePrice);
    row.collected += s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
    row.count += 1;
  }
  const topCustomers = Array.from(customerMap.values()).sort((a, b) => b.sales - a.sales).slice(0, 10);

  return (
    <>
      <PageHeader
        title="Sales & Revenue"
        description="Asset sales, collections received, and outstanding receivables over the last 12 months (active sales only)."
        stats={[
          { label: "Sales value", value: formatCurrency(totalSales) },
          { label: "Collected", value: formatCurrency(totalCollected) },
          { label: "Outstanding", value: formatCurrency(totalOutstanding) },
          { label: "Deals", value: sales.length },
        ]}
      />
      <SalesRevenueReport
        monthly={monthly}
        topCustomers={topCustomers}
        totalSales={totalSales}
        totalCollected={totalCollected}
        totalOutstanding={totalOutstanding}
      />
    </>
  );
}
