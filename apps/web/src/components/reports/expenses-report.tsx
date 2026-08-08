"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Calendar, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import { BarSeries, AreaSeries } from "./charts";

export type MonthlyExpenseRow = { label: string; operating: number; project: number };
export type CategoryRow = { category: string; amount: number; count: number };
export type ProjectRow = { project: string; amount: number };

export function ExpensesReport({
  from,
  to,
  monthly,
  categoryRows,
  projectRows,
  totalOperating,
  totalProject,
}: {
  from: string;
  to: string;
  monthly: MonthlyExpenseRow[];
  categoryRows: CategoryRow[];
  projectRows: ProjectRow[];
  totalOperating: number;
  totalProject: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fromState, setFrom] = useState(searchParams.get("from") ?? from);
  const [toState, setTo] = useState(searchParams.get("to") ?? to);

  function applyRange(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (fromState) params.set("from", fromState);
    if (toState) params.set("to", toState);
    router.push(`/reports/expenses?${params.toString()}`);
  }

  const hasData = monthly.some((m) => m.operating > 0 || m.project > 0);
  const combined = monthly.map((m) => ({ label: m.label, operating: m.operating, project: m.project, total: m.operating + m.project }));

  const exportCSV = () => {
    const rows: Record<string, unknown>[] = categoryRows.map((c) => ({
      category: c.category,
      count: c.count,
      amount: c.amount,
    }));
    downloadCSV(`expenses-by-category-${from}_to_${to}.csv`, rows, [
      { key: "category", label: "Category" },
      { key: "count", label: "Entries" },
      { key: "amount", label: "Amount", format: (v) => formatCurrency(Number(v)) },
    ]);
  };

  return (
    <div className="space-y-5">
      {/* Date range filter */}
      <form
        onSubmit={applyRange}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3"
      >
        <div className="space-y-1">
          <label className="text-caption text-muted-foreground">From</label>
          <Input type="date" value={fromState} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
        </div>
        <div className="space-y-1">
          <label className="text-caption text-muted-foreground">To</label>
          <Input type="date" value={toState} onChange={(e) => setTo(e.target.value)} className="w-auto" />
        </div>
        <Button type="submit" size="sm">
          <Calendar className="h-4 w-4" /> Apply
        </Button>
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportCSV}
            disabled={categoryRows.length === 0}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            disabled={!hasData}
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </form>

      {!hasData ? (
        <EmptyState
          icon={<Download className="h-5 w-5" />}
          title="No expenses in this period"
          description="Record operating expenses or project costs to see them here."
        />
      ) : (
        <>
      {/* Monthly trend — stacked area */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-body font-semibold text-foreground">Monthly Expense Trend</h3>
        <p className="text-meta text-muted-foreground">Operating expenses + project costs over the selected period</p>
        <div className="mt-3">
          <AreaSeries data={combined} dataKey="total" name="Total Expenses" color="var(--color-stage-account)" height={280} />
        </div>
      </div>

      {/* By category */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-body font-semibold text-foreground">Operating Expenses by Category</h3>
            <p className="text-meta text-muted-foreground">{categoryRows.length} categories · {formatCurrency(totalOperating)} total</p>
          </div>
          <Button size="sm" variant="outline" onClick={exportCSV}>
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
        </div>
        {categoryRows.length > 0 ? (
          <>
            <div className="mt-3">
              <BarSeries data={categoryRows.map((c) => ({ label: c.category, value: c.amount }))} name="Amount" color="var(--color-stage-procure)" horizontal height={Math.max(200, categoryRows.length * 36)} />
            </div>
            <div className="mt-3 overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Category</TH>
                    <TH className="text-right">Entries</TH>
                    <TH className="text-right">Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {categoryRows.map((c) => (
                    <TR key={c.category}>
                      <TD>{c.category}</TD>
                      <TD className="text-right">{c.count}</TD>
                      <TD className="text-right font-medium">{formatCurrency(c.amount)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </>
        ) : (
          <p className="mt-3 text-meta text-muted-foreground">No operating expenses recorded.</p>
        )}
      </div>

      {/* By project */}
      {projectRows.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-body font-semibold text-foreground">Project Costs</h3>
          <p className="text-meta text-muted-foreground">{projectRows.length} projects · {formatCurrency(totalProject)} total</p>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Project</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {projectRows.map((p) => (
                  <TR key={p.project}>
                    <TD>{p.project}</TD>
                    <TD className="text-right font-medium">{formatCurrency(p.amount)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
