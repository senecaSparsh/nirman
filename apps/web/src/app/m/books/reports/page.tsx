import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Package, Truck, ShoppingCart, Building2, Wallet, ClipboardCheck, TrendingUp } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileStatCard,
  MobileInfoRow,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";

/**
 * /m/books/reports — mobile analytics hub with key metrics inline.
 * Replaces desktop `/reports/*` leaks from the mobile surface.
 * Rather than linking to desktop report dashboards, shows the headline
 * numbers (inventory value, sales revenue, purchase spend, pending payments)
 * directly as stat cards so the user stays in the mobile shell.
 */
export default function MobileReportsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileReportsContent />
    </Suspense>
  );
}

async function MobileReportsContent() {
  await connection();
  const company = await getCompany();

  const [stockItems, sales, purchaseOrders, pendingPayments, projectCosts, expenses] = await Promise.all([
    prisma.stockLocationItem.findMany({
      where: { location: { companyId: company.id } },
      select: { qty: true, movingAvgCost: true },
    }),
    prisma.assetSale.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      select: { salePrice: true, payments: { where: { status: "RECEIVED" }, select: { amount: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: { in: ["RECEIVED", "PARTIAL", "ORDERED"] } },
      select: { total: true },
    }),
    prisma.assetSalePayment.findMany({
      where: { assetSale: { companyId: company.id }, status: "RECEIVED" },
      select: { amount: true },
    }),
    prisma.projectCost.findMany({
      where: { project: { companyId: company.id } },
      select: { amount: true },
    }),
    prisma.expense.findMany({
      where: { companyId: company.id },
      select: { amount: true },
    }),
  ]);

  const inventoryValue = stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0);
  const salesRevenue = sales.reduce((s, sale) => s + sale.payments.reduce((ps, p) => ps + toNum(p.amount), 0), 0);
  const salesBooked = sales.reduce((s, sale) => s + toNum(sale.salePrice), 0);
  const purchaseSpend = purchaseOrders.reduce((s, p) => s + toNum(p.total), 0);
  const totalReceived = pendingPayments.reduce((s, p) => s + toNum(p.amount), 0);
  const totalProjectCosts = projectCosts.reduce((s, c) => s + toNum(c.amount), 0);
  const totalExpenses = expenses.reduce((s, e) => s + toNum(e.amount), 0);

  return (
    <div>
      <MobilePageHeader title="Analytics" subtitle="Key metrics at a glance" right={<MobileRefreshButton />} />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Inventory Value" value={formatCurrency(inventoryValue)} icon={Package} />
        <MobileStatCard label="Sales Revenue" value={formatCurrency(salesRevenue)} icon={ShoppingCart} tone="success" />
        <MobileStatCard label="Sales Booked" value={formatCurrency(salesBooked)} icon={ShoppingCart} />
        <MobileStatCard label="Purchase Spend" value={formatCurrency(purchaseSpend)} icon={Truck} />
        <MobileStatCard label="Project Costs" value={formatCurrency(totalProjectCosts)} icon={Building2} />
        <MobileStatCard label="Expenses" value={formatCurrency(totalExpenses)} icon={Wallet} />
      </div>

      <MobileSectionTitle>Revenue</MobileSectionTitle>
      <div>
        <MobileInfoRow icon={ShoppingCart} title="Total received" value={formatCurrency(totalReceived)} tone="success" />
        <MobileInfoRow icon={ClipboardCheck} title="Booked (active sales)" value={formatCurrency(salesBooked)} />
        <MobileInfoRow icon={TrendingUp} title="Outstanding" value={formatCurrency(salesBooked - totalReceived)} tone="warning" />
      </div>

      <MobileSectionTitle>Costs</MobileSectionTitle>
      <div>
        <MobileInfoRow icon={Building2} title="Project costs" value={formatCurrency(totalProjectCosts)} />
        <MobileInfoRow icon={Wallet} title="Operating expenses" value={formatCurrency(totalExpenses)} />
        <MobileInfoRow icon={Truck} title="Purchases" value={formatCurrency(purchaseSpend)} />
      </div>
    </div>
  );
}
