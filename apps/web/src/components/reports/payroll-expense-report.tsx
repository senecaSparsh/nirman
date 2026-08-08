"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusPill } from "@/components/page";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import { BarSeries, AreaSeries } from "./charts";

export type MonthlyRow = {
  label: string;
  gross: number;
  overtime: number;
  deductions: number;
  net: number;
  employees: number;
  status: string;
};
export type TradeRow = { trade: string; gross: number; net: number; employees: number };
export type CrewRow = { crew: string; gross: number; net: number; employees: number };

export function PayrollExpenseReport({
  monthly,
  tradeRows,
  crewRows,
  totalGross,
  totalNet,
  totalOvertime,
}: {
  monthly: MonthlyRow[];
  tradeRows: TradeRow[];
  crewRows: CrewRow[];
  totalGross: number;
  totalNet: number;
  totalOvertime: number;
}) {
  const hasData = monthly.length > 0;

  const exportCSV = () => {
    const rows: Record<string, unknown>[] = tradeRows.map((t) => ({
      trade: t.trade,
      employees: t.employees,
      gross: t.gross,
      net: t.net,
    }));
    downloadCSV("payroll-by-trade.csv", rows, [
      { key: "trade", label: "Trade" },
      { key: "employees", label: "Employees" },
      { key: "gross", label: "Gross", format: (v) => formatCurrency(Number(v)) },
      { key: "net", label: "Net", format: (v) => formatCurrency(Number(v)) },
    ]);
  };

  if (!hasData) {
    return (
      <EmptyState
        icon={<Download className="h-5 w-5" />}
        title="No payroll periods in the last 12 months"
        description="Generate payroll from the Payroll page to see salary spend here."
      />
    );
  }

  const monthlyChart = monthly.map((m) => ({ label: m.label, value: m.net }));
  const tradeChart = tradeRows.slice(0, 10).map((t) => ({ label: t.trade, value: t.gross }));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-body font-semibold">Monthly Net Pay</h3>
            <span className="text-caption text-muted-foreground tnum">{formatCurrency(totalNet)} / 12mo</span>
          </div>
          <AreaSeries data={monthlyChart} name="Net pay" color="var(--color-stage-workforce)" />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-body font-semibold">Cost by Trade (comparative)</h3>
            <span className="text-caption text-muted-foreground">{tradeRows.length} trades</span>
          </div>
          <BarSeries data={tradeChart} name="Gross" color="var(--color-stage-workforce)" horizontal />
        </div>
      </div>

      {/* Monthly breakdown */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-body font-semibold">Monthly Payroll</h3>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Period</TH>
              <TH className="text-right">Employees</TH>
              <TH className="text-right">Gross</TH>
              <TH className="text-right">Overtime</TH>
              <TH className="text-right">Deductions</TH>
              <TH className="text-right">Net</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {monthly.map((m) => (
              <TR key={m.label}>
                <TD className="font-medium">{m.label}</TD>
                <TD className="text-right tnum">{formatNumber(m.employees, 0)}</TD>
                <TD className="text-right tnum">{formatCurrency(m.gross)}</TD>
                <TD className="text-right tnum text-muted-foreground">{formatCurrency(m.overtime)}</TD>
                <TD className="text-right tnum text-danger">{formatCurrency(m.deductions)}</TD>
                <TD className="text-right tnum font-semibold">{formatCurrency(m.net)}</TD>
                <TD><StatusPill status={m.status} /></TD>
              </TR>
            ))}
            <TR>
              <TD className="font-bold">Total</TD>
              <TD />
              <TD className="text-right tnum font-bold">{formatCurrency(totalGross)}</TD>
              <TD className="text-right tnum font-bold">{formatCurrency(totalOvertime)}</TD>
              <TD />
              <TD className="text-right tnum font-bold">{formatCurrency(totalNet)}</TD>
              <TD />
            </TR>
          </TBody>
        </Table>
      </div>

      {/* Comparative analysis — by trade & by crew */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-body font-semibold">By Trade</h3>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Trade</TH>
                <TH className="text-right">Workers</TH>
                <TH className="text-right">Gross</TH>
                <TH className="text-right">Net</TH>
              </TR>
            </THead>
            <TBody>
              {tradeRows.map((t) => (
                <TR key={t.trade}>
                  <TD className="font-medium">{t.trade}</TD>
                  <TD className="text-right tnum">{formatNumber(t.employees, 0)}</TD>
                  <TD className="text-right tnum">{formatCurrency(t.gross)}</TD>
                  <TD className="text-right tnum font-semibold">{formatCurrency(t.net)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-body font-semibold">By Crew</h3>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Crew</TH>
                <TH className="text-right">Workers</TH>
                <TH className="text-right">Gross</TH>
                <TH className="text-right">Net</TH>
              </TR>
            </THead>
            <TBody>
              {crewRows.map((c) => (
                <TR key={c.crew}>
                  <TD className="font-medium">{c.crew}</TD>
                  <TD className="text-right tnum">{formatNumber(c.employees, 0)}</TD>
                  <TD className="text-right tnum">{formatCurrency(c.gross)}</TD>
                  <TD className="text-right tnum font-semibold">{formatCurrency(c.net)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
