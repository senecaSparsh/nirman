import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import {
  Package, Truck, ShoppingCart, Building2, Wallet,
  ClipboardCheck, TrendingUp, FileText, Receipt, BarChart3,
  Layers, Gauge, Percent, Users, Calendar, ArrowRight,
} from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileStatCard,
  MobileRow,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";

/**
 * /m/reports — unified mobile reports hub.
 * Shows headline financial metrics + links to all individual report pages.
 * Replaces the need to visit desktop /reports/* on mobile.
 */
export default function MobileReportsHubPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileReportsHubContent />
    </Suspense>
  );
}

async function MobileReportsHubContent() {
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
  const totalCosts = totalProjectCosts + totalExpenses + purchaseSpend;
  const netProfit = salesRevenue - totalCosts;

  const allZero = inventoryValue === 0 && salesRevenue === 0 && salesBooked === 0 && purchaseSpend === 0 && totalProjectCosts === 0 && totalExpenses === 0;

  if (allZero) {
    return (
      <MobileEmptyState
        icon={BarChart3}
        title="No financial data yet"
        hint="Post transactions to see analytics here"
      />
    );
  }

  return (
    <div>
      {/* ── Headline metrics ── */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <MobileStatCard label="Inventory Value" value={formatCurrency(inventoryValue)} icon={Package} />
        <MobileStatCard label="Sales Revenue" value={formatCurrency(salesRevenue)} icon={ShoppingCart} tone="go" />
        <MobileStatCard label="Purchase Spend" value={formatCurrency(purchaseSpend)} icon={Truck} />
        <MobileStatCard label="Project Costs" value={formatCurrency(totalProjectCosts)} icon={Building2} />
        <MobileStatCard label="Expenses" value={formatCurrency(totalExpenses)} icon={Wallet} />
        <MobileStatCard
          label="Net Profit"
          value={formatCurrency(netProfit)}
          icon={TrendingUp}
          tone={netProfit >= 0 ? "go" : "stop"}
        />
      </div>

      {/* ── Revenue breakdown ── */}
      <MobileSectionTitle>Revenue</MobileSectionTitle>
      <div className="flex flex-col gap-2 mb-4">
        <MobileRow icon={ShoppingCart} title="Total received" meta={formatCurrency(totalReceived)} tone="success" />
        <MobileRow icon={ClipboardCheck} title="Booked (active sales)" meta={formatCurrency(salesBooked)} />
        <MobileRow icon={TrendingUp} title="Outstanding" meta={formatCurrency(salesBooked - totalReceived)} tone="warning" />
      </div>

      {/* ── Cost breakdown ── */}
      <MobileSectionTitle>Costs</MobileSectionTitle>
      <div className="flex flex-col gap-2 mb-4">
        <MobileRow icon={Building2} title="Project costs" meta={formatCurrency(totalProjectCosts)} />
        <MobileRow icon={Wallet} title="Operating expenses" meta={formatCurrency(totalExpenses)} />
        <MobileRow icon={Truck} title="Purchases" meta={formatCurrency(purchaseSpend)} />
      </div>

      {/* ── Report links — grouped ── */}
      <MobileSectionTitle>All Reports</MobileSectionTitle>

      {/* Sales & Revenue */}
      <div className="flex flex-col gap-1.5 mb-4">
        <ReportLink href="/reports/sales-revenue" icon={ShoppingCart} label="Sales Revenue" sublabel="Revenue by project, unit, period" />
        <ReportLink href="/reports/profit" icon={TrendingUp} label="Profit & Loss" sublabel="Revenue vs costs summary" />
        <ReportLink href="/reports/pending-payments" icon={Wallet} label="Pending Payments" sublabel="Outstanding receivables" />
        <ReportLink href="/reports/cash-flow" icon={Receipt} label="Cash Flow" sublabel="Inflows and outflows" />
      </div>

      {/* Purchasing */}
      <MobileSectionTitle>Purchasing</MobileSectionTitle>
      <div className="flex flex-col gap-1.5 mb-4">
        <ReportLink href="/reports/purchase-register" icon={FileText} label="Purchase Register" sublabel="All POs by date, supplier" />
        <ReportLink href="/reports/purchase-trends" icon={TrendingUp} label="Purchase Trends" sublabel="Spend over time, top materials" />
        <ReportLink href="/reports/purchaser-performance" icon={Users} label="Purchaser Performance" sublabel="Quote selection metrics" />
        <ReportLink href="/reports/comparative" icon={BarChart3} label="Comparative Quotes" sublabel="Vendor quote comparison" />
      </div>

      {/* Inventory */}
      <MobileSectionTitle>Inventory</MobileSectionTitle>
      <div className="flex flex-col gap-1.5 mb-4">
        <ReportLink href="/reports/inventory-value" icon={Package} label="Inventory Value" sublabel="Stock value by location, Moving Average Cost" />
        <ReportLink href="/reports/stock-movement-summary" icon={Layers} label="Stock Movement" sublabel="In/out/transfer summary" />
        <ReportLink href="/reports/issue-register" icon={ClipboardCheck} label="Issue Register" sublabel="Material issues to projects" />
        <ReportLink href="/reports/department-consumption" icon={Building2} label="Dept Consumption" sublabel="Material usage by department" />
      </div>

      {/* Projects */}
      <MobileSectionTitle>Projects</MobileSectionTitle>
      <div className="flex flex-col gap-1.5 mb-4">
        <ReportLink href="/reports/project-progress" icon={Gauge} label="Project Progress" sublabel="Completion %, timeline status" />
        <ReportLink href="/reports/job-costing" icon={Building2} label="Job Costing" sublabel="Per-project cost breakdown" />
        <ReportLink href="/reports/real-estate-inventory" icon={Package} label="Real Estate Inventory" sublabel="Units available, sold, rented" />
      </div>

      {/* Finance & Tax */}
      <MobileSectionTitle>Finance & Tax</MobileSectionTitle>
      <div className="flex flex-col gap-1.5 mb-4">
        <ReportLink href="/reports/gst" icon={Percent} label="GST Report" sublabel="Input/output GST summary" />
        <ReportLink href="/reports/tds-certificates" icon={FileText} label="Tax Deducted at Source Certificates" sublabel="TDS deducted by vendor" />
        <ReportLink href="/reports/payroll-expense" icon={Calendar} label="Payroll Expense" sublabel="Salary expense by month" />
        <ReportLink href="/reports/expenses" icon={Wallet} label="Expenses" sublabel="Operating expense breakdown" />
      </div>
    </div>
  );
}

/* ─── Report link row ─── */
function ReportLink({
  href,
  icon: Icon,
  label,
  sublabel,
}: {
  href: string;
  icon: any;
  label: string;
  sublabel: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-2.5 rounded-[0.5rem] border p-2.5 press active:scale-[0.99] transition-transform"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <span
        className="grid place-items-center size-8 rounded-[0.375rem] shrink-0"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        <Icon className="size-4" style={{ color: "var(--color-ink-600)" }} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[0.75rem] font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
          {label}
        </p>
        <p className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>
          {sublabel}
        </p>
      </div>
      <ArrowRight className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
    </a>
  );
}
