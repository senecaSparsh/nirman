import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { Package, Truck, ShoppingCart, Building2, Wallet, ClipboardCheck, TrendingUp } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileStatCard,
  MobileRow,
} from "@/components/mobile/v2/primitives";

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
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW)) notFound();
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

  const allZero =
    inventoryValue === 0 &&
    salesRevenue === 0 &&
    salesBooked === 0 &&
    purchaseSpend === 0 &&
    totalProjectCosts === 0 &&
    totalExpenses === 0;

  if (allZero) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-[0.5rem] border py-16 text-center"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
      >
        <TrendingUp className="size-8 mb-2" style={{ color: "var(--color-ink-300)" }} />
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
          No financial data yet
        </p>
        <p className="text-[0.6875rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
          Post transactions to see analytics here
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <MobileStatCard label="Inventory Value" value={formatCurrency(inventoryValue)} icon={Package} href="/m/inventory" />
        <MobileStatCard label="Sales Revenue" value={formatCurrency(salesRevenue)} icon={ShoppingCart} tone="go" href="/m/sales" />
        <MobileStatCard label="Sales Booked" value={formatCurrency(salesBooked)} icon={ShoppingCart} href="/m/sales" />
        <MobileStatCard label="Purchase Spend" value={formatCurrency(purchaseSpend)} icon={Truck} href="/m/procurement" />
        <MobileStatCard label="Project Costs" value={formatCurrency(totalProjectCosts)} icon={Building2} href="/m/books/finance" />
        <MobileStatCard label="Expenses" value={formatCurrency(totalExpenses)} icon={Wallet} href="/m/books/finance" />
      </div>

      <MobileSectionTitle>Revenue</MobileSectionTitle>
      <div className="flex flex-col gap-2.5">
        <MobileRow icon={ShoppingCart} title="Total received" meta={formatCurrency(totalReceived)} tone="success" />
        <MobileRow icon={ClipboardCheck} title="Booked (active sales)" meta={formatCurrency(salesBooked)} />
        <MobileRow icon={TrendingUp} title="Outstanding" meta={formatCurrency(salesBooked - totalReceived)} tone="warning" />
      </div>

      <MobileSectionTitle>Costs</MobileSectionTitle>
      <div className="flex flex-col gap-2.5">
        <MobileRow icon={Building2} title="Project costs" meta={formatCurrency(totalProjectCosts)} />
        <MobileRow icon={Wallet} title="Operating expenses" meta={formatCurrency(totalExpenses)} />
        <MobileRow icon={Truck} title="Purchases" meta={formatCurrency(purchaseSpend)} />
      </div>
    </div>
  );
}
