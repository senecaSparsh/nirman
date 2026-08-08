"use client";

import { Download, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import { AreaSeries, BarSeries } from "./charts";

export type MonthlyProfitRow = {
  label: string;
  revenue: number;
  cogs: number;
  operating: number;
  salaries: number;
  grossProfit: number;
  netProfit: number;
};

export function ProfitReport({
  monthly,
  totalRevenue,
  totalCogs,
  totalOperating,
  totalSalaries,
  grossProfit,
  netProfit,
}: {
  monthly: MonthlyProfitRow[];
  totalRevenue: number;
  totalCogs: number;
  totalOperating: number;
  totalSalaries: number;
  grossProfit: number;
  netProfit: number;
}) {
  const hasData = monthly.some((m) => m.revenue > 0 || m.cogs > 0 || m.operating > 0 || m.salaries > 0);

  const exportCSV = () => {
    const rows: Record<string, unknown>[] = monthly.map((m) => ({
      month: m.label,
      revenue: m.revenue,
      cogs: m.cogs,
      grossProfit: m.grossProfit,
      operating: m.operating,
      salaries: m.salaries,
      netProfit: m.netProfit,
    }));
    downloadCSV("profit-loss.csv", rows, [
      { key: "month", label: "Month" },
      { key: "revenue", label: "Revenue", format: (v) => formatCurrency(Number(v)) },
      { key: "cogs", label: "COGS", format: (v) => formatCurrency(Number(v)) },
      { key: "grossProfit", label: "Gross Profit", format: (v) => formatCurrency(Number(v)) },
      { key: "operating", label: "Operating", format: (v) => formatCurrency(Number(v)) },
      { key: "salaries", label: "Salaries", format: (v) => formatCurrency(Number(v)) },
      { key: "netProfit", label: "Net Profit", format: (v) => formatCurrency(Number(v)) },
    ]);
  };

  if (!hasData) {
    return (
      <EmptyState
        icon={<Download className="h-5 w-5" />}
        title="No financial activity in the last 12 months"
        description="Post sales, expenses, and payroll to see your P&L here."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Net profit trend */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-body font-semibold text-foreground">Net Profit Trend</h3>
        <p className="text-meta text-muted-foreground">Revenue minus all expenses (COGS + operating + salaries)</p>
        <div className="mt-3">
          <AreaSeries data={monthly.map((m) => ({ label: m.label, value: m.netProfit }))} name="Net Profit" color={netProfit >= 0 ? "var(--color-success)" : "var(--color-danger)"} height={280} />
        </div>
      </div>

      {/* Revenue vs Expenses */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-body font-semibold text-foreground">Revenue vs Expenses</h3>
        <p className="text-meta text-muted-foreground">Monthly comparison — green = revenue, red = total expenses</p>
        <div className="mt-3">
          <BarSeries
            data={monthly.map((m) => ({
              label: m.label,
              revenue: m.revenue,
              expenses: m.cogs + m.operating + m.salaries,
            }))}
            dataKey="revenue"
            name="Revenue"
            color="var(--color-success)"
            height={280}
          />
        </div>
      </div>

      {/* Summary table */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-body font-semibold text-foreground">Monthly P&L Breakdown</h3>
          <Button size="sm" variant="outline" onClick={exportCSV}>
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Month</TH>
                <TH className="text-right">Revenue</TH>
                <TH className="text-right">COGS</TH>
                <TH className="text-right">Gross Profit</TH>
                <TH className="text-right">Operating</TH>
                <TH className="text-right">Salaries</TH>
                <TH className="text-right">Net Profit</TH>
              </TR>
            </THead>
            <TBody>
              {monthly.map((m) => (
                <TR key={m.label}>
                  <TD className="font-medium">{m.label}</TD>
                  <TD className="text-right">{formatCurrency(m.revenue)}</TD>
                  <TD className="text-right">{formatCurrency(m.cogs)}</TD>
                  <TD className="text-right font-medium">{formatCurrency(m.grossProfit)}</TD>
                  <TD className="text-right">{formatCurrency(m.operating)}</TD>
                  <TD className="text-right">{formatCurrency(m.salaries)}</TD>
                  <TD className="text-right font-medium">
                    <span className={m.netProfit >= 0 ? "text-success" : "text-danger"}>
                      {formatCurrency(m.netProfit)}
                    </span>
                  </TD>
                </TR>
              ))}
              {/* Totals row */}
              <TR className="border-t-2 border-border bg-muted/30 font-semibold">
                <TD>Total (12mo)</TD>
                <TD className="text-right">{formatCurrency(totalRevenue)}</TD>
                <TD className="text-right">{formatCurrency(totalCogs)}</TD>
                <TD className="text-right">{formatCurrency(grossProfit)}</TD>
                <TD className="text-right">{formatCurrency(totalOperating)}</TD>
                <TD className="text-right">{formatCurrency(totalSalaries)}</TD>
                <TD className="text-right">
                  <span className={netProfit >= 0 ? "text-success" : "text-danger"}>
                    {formatCurrency(netProfit)}
                  </span>
                </TD>
              </TR>
            </TBody>
          </Table>
        </div>
        <div className="mt-3 flex items-center gap-2">
          {netProfit >= 0 ? (
            <Badge variant="success"><TrendingUp className="h-3 w-3" /> Profitable</Badge>
          ) : (
            <Badge variant="danger"><TrendingDown className="h-3 w-3" /> Loss</Badge>
          )}
          <span className="text-meta text-muted-foreground">
            Net margin: {totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : "0.0"}%
          </span>
        </div>
      </div>
    </div>
  );
}
