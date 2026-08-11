"use client";

import { TrendingUp, TrendingDown, SearchX } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, cn } from "@/lib/utils";
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

  if (!hasData) {
    return (
      <EmptyState
        icon={<TrendingUp className="h-5 w-5" />}
        title="No financial activity in the last 12 months"
        description="Post sales, expenses, and payroll to see your P&L here."
      />
    );
  }

  const columns: Column<MonthlyProfitRow>[] = [
    {
      key: "label",
      label: "Month",
      sortable: true,
      render: (m) => <span className="font-medium text-foreground">{m.label}</span>,
      exportValue: (m) => m.label,
    },
    {
      key: "revenue",
      label: "Revenue",
      align: "right",
      sortable: true,
      render: (m) => <span className="tnum">{formatCurrency(m.revenue)}</span>,
      exportValue: (m) => m.revenue,
    },
    {
      key: "cogs",
      label: "COGS",
      align: "right",
      sortable: true,
      render: (m) => <span className="tnum">{formatCurrency(m.cogs)}</span>,
      exportValue: (m) => m.cogs,
    },
    {
      key: "grossProfit",
      label: "Gross Profit",
      align: "right",
      sortable: true,
      render: (m) => <span className="tnum font-medium">{formatCurrency(m.grossProfit)}</span>,
      exportValue: (m) => m.grossProfit,
    },
    {
      key: "operating",
      label: "Operating",
      align: "right",
      sortable: true,
      render: (m) => <span className="tnum">{formatCurrency(m.operating)}</span>,
      exportValue: (m) => m.operating,
    },
    {
      key: "salaries",
      label: "Salaries",
      align: "right",
      sortable: true,
      render: (m) => <span className="tnum">{formatCurrency(m.salaries)}</span>,
      exportValue: (m) => m.salaries,
    },
    {
      key: "netProfit",
      label: "Net Profit",
      align: "right",
      sortable: true,
      render: (m) => (
        <span className={cn("tnum font-medium", m.netProfit >= 0 ? "text-success" : "text-danger")}>
          {formatCurrency(m.netProfit)}
        </span>
      ),
      exportValue: (m) => m.netProfit,
    },
  ];

  const noMatch = (
    <EmptyState
      size="compact"
      icon={<SearchX />}
      title="No matches"
      description="Adjust the search or column filters."
    />
  );

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
        <h3 className="mb-3 text-body font-semibold text-foreground">Monthly P&L Breakdown</h3>
        <div className="overflow-hidden rounded-lg border border-border">
          <DataTable
            data={monthly}
            columns={columns}
            storageKey="profit-loss"
            hideable
            exportFileName="profit-loss"
            initialSort={{ key: "label", direction: "asc" }}
            searchable
            searchPlaceholder="Search month…"
            showTotals
            sumColumns={["revenue", "cogs", "grossProfit", "operating", "salaries", "netProfit"]}
            totalFormat={(key, _sum) => {
              const totals: Record<string, number> = {
                revenue: totalRevenue,
                cogs: totalCogs,
                grossProfit,
                operating: totalOperating,
                salaries: totalSalaries,
                netProfit,
              };
              return formatCurrency(totals[key] ?? 0);
            }}
            rowTone={(m) => (m.netProfit < 0 ? "danger" : null)}
            emptyState={noMatch}
          />
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
