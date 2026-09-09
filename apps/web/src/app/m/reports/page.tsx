import { type ComponentType, type CSSProperties } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { prisma } from "@nirman/db";
import {
  Package, Truck, ShoppingCart, Building2, Wallet,
  ClipboardCheck, TrendingUp, FileText, Receipt, BarChart3,
  Layers, Gauge, Percent, Users, Calendar, ArrowRight,
  FileSpreadsheet,
} from "lucide-react";
import { toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileStatCard,
  MobileRow,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileReportHeader } from "@/components/mobile/v2/report-ui";
import { MobileHubPage } from "@/components/mobile/v2/hub-page";
import { MobileReportsHubTabs } from "./MobileReportsHubTabs";

/**
 * /m/reports — unified mobile reports hub with tabbed categories.
 *
 * Tabs: Overview (headline metrics) / Finance / Purchasing / Inventory / Projects.
 * Each category tab shows its report links. The tab lives in `?tab=` so it's
 * shareable and back-button friendly.
 */
export default function MobileReportsHubPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <MobileHubPage skeleton={<MobileSkeletonList rows={6} />} perm={PERM.FINANCE_VIEW} what="reports" permission="finance.view">
      {async ({ company }) => {
        const { tab } = await searchParams;

        const validTabs = ["overview", "financial", "purchasing", "inventory", "projects"];
        const activeTab = validTabs.includes(tab ?? "") ? tab! : "overview";

        // ── Fetch headline metrics (only needed for overview tab) ──
        let overviewData: React.ReactNode = null;
        if (activeTab === "overview") {
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
          const netProfit = salesRevenue - totalProjectCosts - totalExpenses;

          const allZero = inventoryValue === 0 && salesRevenue === 0 && salesBooked === 0 && purchaseSpend === 0 && totalProjectCosts === 0 && totalExpenses === 0;

          if (allZero) {
            overviewData = (
              <MobileEmptyState
                icon={BarChart3}
                title="No financial data yet"
                hint="Post transactions to see analytics here"
              />
            );
          } else {
            overviewData = (
              <div>
                <MobileReportHeader
                  title="Reports & Analysis"
                  subtitle="All reports in one place"
                  icon={FileSpreadsheet}
                />

                {/* ── Headline metrics ── */}
                <div className="grid grid-cols-3 gap-1.5 mb-4">
                  <MobileStatCard label="Inventory Value" value={formatCurrencyCompact(inventoryValue)} icon={Package} />
                  <MobileStatCard label="Sales Revenue" value={formatCurrencyCompact(salesRevenue)} icon={ShoppingCart} tone="go" />
                  <MobileStatCard label="Purchase Spend" value={formatCurrencyCompact(purchaseSpend)} icon={Truck} />
                  <MobileStatCard label="Project Costs" value={formatCurrencyCompact(totalProjectCosts)} icon={Building2} />
                  <MobileStatCard label="Expenses" value={formatCurrencyCompact(totalExpenses)} icon={Wallet} />
                  <MobileStatCard
                    label="Net Profit"
                    value={formatCurrency(netProfit)}
                    icon={TrendingUp}
                    tone={netProfit >= 0 ? "go" : "stop"}
                  />
                </div>

                {/* ── Basis clarification ── */}
                <div
                  className="rounded-[0.5rem] border px-3 py-2 mb-4 text-m-caption"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-500)" }}
                >
                  <strong style={{ color: "var(--color-ink-700)" }}>Note:</strong> Revenue = cash received (not booked).
                  Project Costs = explicit cost entries only (equipment, contractor, overhead).
                  Purchase Spend = inventory acquisitions (not an expense — cost is recognized when materials are issued).
                  Land + material issues are tracked per-project on the project detail page.
                  Net Profit = received revenue − project costs − operating expenses.
                  For full P&L (COGS, salaries, GL-based), see the Profit & Loss report.
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
                  <MobileRow icon={Building2} title="Project costs" subtitle="Explicit entries only (equipment, contractor, overhead)" meta={formatCurrency(totalProjectCosts)} />
                  <MobileRow icon={Wallet} title="Operating expenses" meta={formatCurrency(totalExpenses)} />
                  <MobileRow icon={Truck} title="Purchases" subtitle="PO totals (incl. GST)" meta={formatCurrency(purchaseSpend)} />
                </div>
              </div>
            );
          }
        }

        let content: React.ReactNode;
        if (activeTab === "financial") {
          content = (
            <div>
              <MobileSectionTitle>Finance & Tax</MobileSectionTitle>
              <div className="flex flex-col gap-1.5 mb-4">
                <ReportLink href="/m/reports/profit" icon={TrendingUp} label="Profit & Loss" sublabel="Revenue vs costs summary" />
                <ReportLink href="/m/reports/cash-flow" icon={Receipt} label="Cash Flow" sublabel="Inflows and outflows" />
                <ReportLink href="/m/reports/gst" icon={Percent} label="GST Report" sublabel="Input/output GST summary" />
                <ReportLink href="/m/reports/tds-certificates" icon={FileText} label="TDS Certificates" sublabel="TDS deducted by vendor" />
                <ReportLink href="/m/reports/payroll-expense" icon={Calendar} label="Payroll Expense" sublabel="Salary expense by month" />
                <ReportLink href="/m/reports/expenses" icon={Wallet} label="Expenses" sublabel="Operating expense breakdown" />
                <ReportLink href="/m/reports/comparative" icon={BarChart3} label="Comparative Analysis" sublabel="DPR, workforce, P&L per project" />
                <ReportLink href="/m/reports/pending-payments" icon={Wallet} label="Pending Payments" sublabel="Outstanding receivables" />
              </div>
            </div>
          );
        } else if (activeTab === "purchasing") {
          content = (
            <div>
              <MobileSectionTitle>Purchasing</MobileSectionTitle>
              <div className="flex flex-col gap-1.5 mb-4">
                <ReportLink href="/m/reports/purchase-register" icon={FileText} label="Purchase Register" sublabel="All POs by date, supplier" />
                <ReportLink href="/m/reports/purchase-trends" icon={TrendingUp} label="Purchase Trends" sublabel="Spend over time, top materials" />
                <ReportLink href="/m/reports/purchaser-performance" icon={Users} label="Purchaser Performance" sublabel="Quote selection metrics" />
              </div>
            </div>
          );
        } else if (activeTab === "inventory") {
          content = (
            <div>
              <MobileSectionTitle>Inventory</MobileSectionTitle>
              <div className="flex flex-col gap-1.5 mb-4">
                <ReportLink href="/m/reports/inventory-value" icon={Package} label="Inventory Value" sublabel="Stock value by location, Moving Average Cost" />
                <ReportLink href="/m/reports/stock-movement-summary" icon={Layers} label="Stock Movement" sublabel="In/out/transfer summary" />
                <ReportLink href="/m/reports/issue-register" icon={ClipboardCheck} label="Issue Register" sublabel="Material issues to projects" />
                <ReportLink href="/m/reports/department-consumption" icon={Building2} label="Dept Consumption" sublabel="Material usage by department" />
              </div>
            </div>
          );
        } else if (activeTab === "projects") {
          content = (
            <div>
              <MobileSectionTitle>Projects</MobileSectionTitle>
              <div className="flex flex-col gap-1.5 mb-4">
                <ReportLink href="/m/reports/project-progress" icon={Gauge} label="Project Progress" sublabel="Completion %, timeline status" />
                <ReportLink href="/m/reports/job-costing" icon={Building2} label="Job Costing" sublabel="Per-project cost breakdown" />
                <ReportLink href="/m/reports/real-estate-inventory" icon={Package} label="Real Estate Inventory" sublabel="Units available, sold, rented" />
                <ReportLink href="/m/reports/sales-revenue" icon={ShoppingCart} label="Sales Revenue" sublabel="Revenue by project, unit, period" />
              </div>
            </div>
          );
        } else {
          content = overviewData;
        }

        return (
          <MobileReportsHubTabs activeTab={activeTab}>
            {content}
          </MobileReportsHubTabs>
        );
      }}
    </MobileHubPage>
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
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  label: string;
  sublabel: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-2.5 rounded-[0.5rem] border p-2.5 text-m-body press active:scale-[0.99] transition-transform"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <span
        className="grid place-items-center size-8 rounded-[0.375rem] shrink-0"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        <Icon className="size-4" style={{ color: "var(--color-ink-600)" }} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-m-section font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
          {label}
        </p>
        <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
          {sublabel}
        </p>
      </div>
      <ArrowRight className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
    </a>
  );
}
