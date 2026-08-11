"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, Printer, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency } from "@/lib/utils";
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

  const categoryColumns: Column<CategoryRow>[] = [
    {
      key: "category",
      label: "Category",
      sortable: true,
      filterable: true,
      render: (c) => <span className="font-medium text-foreground">{c.category}</span>,
      filterValue: (c) => c.category,
      exportValue: (c) => c.category,
    },
    {
      key: "count",
      label: "Entries",
      align: "right",
      sortable: true,
      render: (c) => <span className="tnum">{c.count}</span>,
      exportValue: (c) => c.count,
    },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      sortable: true,
      render: (c) => <span className="tnum font-medium">{formatCurrency(c.amount)}</span>,
      exportValue: (c) => c.amount,
    },
  ];

  const projectColumns: Column<ProjectRow>[] = [
    {
      key: "project",
      label: "Project",
      sortable: true,
      filterable: true,
      render: (p) => <span className="font-medium text-foreground">{p.project}</span>,
      filterValue: (p) => p.project,
      exportValue: (p) => p.project,
    },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      sortable: true,
      render: (p) => <span className="tnum font-medium">{formatCurrency(p.amount)}</span>,
      exportValue: (p) => p.amount,
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
            onClick={() => window.print()}
            disabled={!hasData}
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </form>

      {!hasData ? (
        <EmptyState
          icon={<Calendar className="h-5 w-5" />}
          title="No expenses in this period"
          description="Record operating expenses or project costs to see them here."
        />
      ) : (
        <Tabs defaultValue="trend">
          <TabsList>
            <TabsTrigger value="trend">Trend</TabsTrigger>
            <TabsTrigger value="category" count={categoryRows.length}>By Category</TabsTrigger>
            {projectRows.length > 0 && (
              <TabsTrigger value="project" count={projectRows.length}>By Project</TabsTrigger>
            )}
          </TabsList>

          {/* ── Monthly trend ──────────────────────────────────────── */}
          <TabsContent value="trend">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-body font-semibold text-foreground">Monthly Expense Trend</h3>
              <p className="text-meta text-muted-foreground">Operating expenses + project costs over the selected period</p>
              <div className="mt-3">
                <AreaSeries data={combined} dataKey="total" name="Total Expenses" color="var(--color-stage-account)" height={280} />
              </div>
            </div>
          </TabsContent>

          {/* ── By category ────────────────────────────────────────── */}
          <TabsContent value="category">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-body font-semibold text-foreground">Operating Expenses by Category</h3>
                  <p className="text-meta text-muted-foreground">{categoryRows.length} categories · {formatCurrency(totalOperating)} total</p>
                </div>
              </div>
              {categoryRows.length > 0 ? (
                <>
                  <div className="mt-3">
                    <BarSeries data={categoryRows.map((c) => ({ label: c.category, value: c.amount }))} name="Amount" color="var(--color-stage-procure)" horizontal height={Math.max(200, categoryRows.length * 36)} />
                  </div>
                  <div className="mt-3 overflow-hidden rounded-lg border border-border">
                    <DataTable
                      data={categoryRows}
                      columns={categoryColumns}
                      storageKey="expenses-by-category"
                      hideable
                      exportFileName="expenses-by-category"
                      initialSort={{ key: "amount", direction: "desc" }}
                      searchable
                      searchPlaceholder="Search category…"
                      showTotals
                      sumColumns={["amount"]}
                      totalFormat={(_k, sum) => formatCurrency(sum)}
                      emptyState={noMatch}
                    />
                  </div>
                </>
              ) : (
                <p className="mt-3 text-meta text-muted-foreground">No operating expenses recorded.</p>
              )}
            </div>
          </TabsContent>

          {/* ── By project ─────────────────────────────────────────── */}
          {projectRows.length > 0 && (
            <TabsContent value="project">
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-body font-semibold text-foreground">Project Costs</h3>
                <p className="text-meta text-muted-foreground">{projectRows.length} projects · {formatCurrency(totalProject)} total</p>
                <div className="mt-3 overflow-hidden rounded-lg border border-border">
                  <DataTable
                    data={projectRows}
                    columns={projectColumns}
                    storageKey="expenses-by-project"
                    hideable
                    exportFileName="expenses-by-project"
                    initialSort={{ key: "amount", direction: "desc" }}
                    searchable
                    searchPlaceholder="Search project…"
                    showTotals
                    sumColumns={["amount"]}
                    totalFormat={(_k, sum) => formatCurrency(sum)}
                    emptyState={noMatch}
                  />
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
