"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { downloadCSV, downloadExcel } from "@/lib/export";
import { AreaSeries, BarSeries } from "./charts";

export type MonthlyRow = { label: string; subtotal: number; gst: number; total: number; count: number };
export type SupplierRow = { name: string; total: number; count: number };

export function PurchaseTrendsReport({
  monthly,
  topSuppliers,
  grandTotal,
}: {
  monthly: MonthlyRow[];
  topSuppliers: SupplierRow[];
  grandTotal: number;
}) {
  const hasData = monthly.some((m) => m.count > 0);

  const exportCSV = () => {
    const rows: Record<string, unknown>[] = monthly.map((m) => ({
      month: m.label,
      orders: m.count,
      subtotal: m.subtotal,
      gst: m.gst,
      total: m.total,
    }));
    downloadCSV("purchase-trends-12mo.csv", rows, [
      { key: "month", label: "Month" },
      { key: "orders", label: "Orders" },
      { key: "subtotal", label: "Subtotal", format: (v) => formatCurrency(Number(v)) },
      { key: "gst", label: "GST", format: (v) => formatCurrency(Number(v)) },
      { key: "total", label: "Total", format: (v) => formatCurrency(Number(v)) },
    ]);
  };

  if (!hasData) {
    return (
      <EmptyState
        icon={<Download className="h-5 w-5" />}
        title="No purchases in the last 12 months"
        description="Create and approve purchase orders to see procurement trends here."
      />
    );
  }

  const chartData = monthly.map((m) => ({ label: m.label, value: m.total }));
  const supplierChartData = topSuppliers.slice(0, 8).map((s) => ({ label: s.name, value: s.total }));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-body font-semibold">Monthly Spend</h3>
            <span className="text-caption text-muted-foreground tnum">{formatCurrency(grandTotal)} / 12mo</span>
          </div>
          <AreaSeries data={chartData} name="Spend" color="var(--color-stage-procure)" />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-body font-semibold">Top Suppliers by Spend</h3>
            <span className="text-caption text-muted-foreground">{topSuppliers.length} suppliers</span>
          </div>
          <BarSeries data={supplierChartData} name="Spend" color="var(--color-stage-procure)" horizontal />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-body font-semibold">Monthly Breakdown</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadExcel("purchase-trends")}>
              <Download className="h-4 w-4" /> Export Excel
            </Button>
          </div>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Month</TH>
              <TH className="text-right">Orders</TH>
              <TH className="text-right">Subtotal</TH>
              <TH className="text-right">GST</TH>
              <TH className="text-right">Total</TH>
            </TR>
          </THead>
          <TBody>
            {monthly.map((m) => (
              <TR key={m.label}>
                <TD className="font-medium">{m.label}</TD>
                <TD className="text-right tnum">{formatNumber(m.count, 0)}</TD>
                <TD className="text-right tnum">{formatCurrency(m.subtotal)}</TD>
                <TD className="text-right tnum text-muted-foreground">{formatCurrency(m.gst)}</TD>
                <TD className="text-right tnum font-semibold">{formatCurrency(m.total)}</TD>
              </TR>
            ))}
            <TR>
              <TD className="font-bold">Total</TD>
              <TD className="text-right tnum font-bold">{formatNumber(monthly.reduce((s, m) => s + m.count, 0), 0)}</TD>
              <TD className="text-right tnum font-bold">{formatCurrency(monthly.reduce((s, m) => s + m.subtotal, 0))}</TD>
              <TD className="text-right tnum font-bold">{formatCurrency(monthly.reduce((s, m) => s + m.gst, 0))}</TD>
              <TD className="text-right tnum font-bold">{formatCurrency(grandTotal)}</TD>
            </TR>
          </TBody>
        </Table>
      </div>
    </div>
  );
}
