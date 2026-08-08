import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { PurchaseTrendsReport } from "@/components/reports/purchase-trends-report";

import { NoAccess } from "@/components/no-access";
export default function PurchaseTrendsPage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading purchase trends…" variant="cards" />}>
        <PurchaseTrendsContent />
      </Suspense>
    </div>
  );
}

async function PurchaseTrendsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return (
      <NoAccess what="the purchase trends report" />
    );
  }

  // Last 12 months window
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      companyId: company.id,
      status: { not: "CANCELLED" },
      orderDate: { gte: from },
    },
    select: {
      id: true,
      poNumber: true,
      orderDate: true,
      status: true,
      total: true,
      subtotal: true,
      gstTotal: true,
      supplier: { select: { name: true } },
    },
    orderBy: { orderDate: "asc" },
  });

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Group by month
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

  // Top suppliers by spend
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

  return (
    <>
      <PageHeader
        title="Purchase Trends"
        description="Monthly procurement spend (excl. cancelled POs) over the last 12 months — velocity, GST impact, and top suppliers."
        stats={[
          { label: "12-mo spend", value: formatCurrency(grandTotal) },
          { label: "Orders", value: totalOrders },
          { label: "Suppliers", value: topSuppliers.length },
        ]}
      />
      <PurchaseTrendsReport monthly={monthly} topSuppliers={topSuppliers} grandTotal={grandTotal} />
    </>
  );
}
