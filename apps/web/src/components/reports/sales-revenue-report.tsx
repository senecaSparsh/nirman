"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusPill } from "@/components/page";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { downloadCSV, downloadExcel } from "@/lib/export";
import { AreaSeries, BarSeries } from "./charts";

export type MonthlyRow = { label: string; sales: number; collected: number; count: number };
export type CustomerRow = { name: string; sales: number; collected: number; count: number };

export function SalesRevenueReport({
  monthly,
  topCustomers,
  totalSales,
  totalCollected,
  totalOutstanding,
}: {
  monthly: MonthlyRow[];
  topCustomers: CustomerRow[];
  totalSales: number;
  totalCollected: number;
  totalOutstanding: number;
}) {
  const hasData = totalSales > 0;

  const exportCSV = () => {
    const rows: Record<string, unknown>[] = topCustomers.map((c) => ({
      customer: c.name,
      deals: c.count,
      sales: c.sales,
      collected: c.collected,
      outstanding: c.sales - c.collected,
    }));
    downloadCSV("sales-revenue-by-customer.csv", rows, [
      { key: "customer", label: "Customer" },
      { key: "deals", label: "Deals" },
      { key: "sales", label: "Sales", format: (v) => formatCurrency(Number(v)) },
      { key: "collected", label: "Collected", format: (v) => formatCurrency(Number(v)) },
      { key: "outstanding", label: "Outstanding", format: (v) => formatCurrency(Number(v)) },
    ]);
  };

  if (!hasData) {
    return (
      <EmptyState
        icon={<Download className="h-5 w-5" />}
        title="No sales in the last 12 months"
        description="Record asset sales from the Sales page to see revenue trends here."
      />
    );
  }

  const chartData = monthly.map((m) => ({ label: m.label, sales: m.sales, collected: m.collected }));
  const customerChartData = topCustomers.slice(0, 8).map((c) => ({ label: c.name, value: c.sales }));
  const collectionPct = totalSales > 0 ? (totalCollected / totalSales) * 100 : 0;

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-micro text-muted-foreground">Total Sales</div>
          <div className="tnum text-body font-bold">{formatCurrency(totalSales)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-micro text-muted-foreground">Collected</div>
          <div className="tnum text-body font-bold text-success">{formatCurrency(totalCollected)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-micro text-muted-foreground">Outstanding</div>
          <div className="tnum text-body font-bold text-warning">{formatCurrency(totalOutstanding)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-micro text-muted-foreground">Collection %</div>
          <div className="tnum text-body font-bold">{collectionPct.toFixed(1)}%</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-body font-semibold">Sales vs Collections</h3>
            <span className="text-caption text-muted-foreground">last 12 months</span>
          </div>
          <AreaSeries data={chartData} dataKey="sales" name="Sales" color="var(--color-stage-sell)" />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-body font-semibold">Top Customers by Sales</h3>
            <span className="text-caption text-muted-foreground">{topCustomers.length} customers</span>
          </div>
          <BarSeries data={customerChartData} name="Sales" color="var(--color-stage-sell)" horizontal />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-body font-semibold">Customer Breakdown</h3>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Customer</TH>
              <TH className="text-right">Deals</TH>
              <TH className="text-right">Sales</TH>
              <TH className="text-right">Collected</TH>
              <TH className="text-right">Outstanding</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {topCustomers.map((c) => {
              const out = c.sales - c.collected;
              const status = out <= 0 ? "PAID" : c.collected > 0 ? "PARTIAL" : "PENDING";
              return (
                <TR key={c.name}>
                  <TD className="font-medium">{c.name}</TD>
                  <TD className="text-right tnum">{formatNumber(c.count, 0)}</TD>
                  <TD className="text-right tnum">{formatCurrency(c.sales)}</TD>
                  <TD className="text-right tnum text-success">{formatCurrency(c.collected)}</TD>
                  <TD className="text-right tnum text-warning">{formatCurrency(out)}</TD>
                  <TD>
                    <StatusPill status={status} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
