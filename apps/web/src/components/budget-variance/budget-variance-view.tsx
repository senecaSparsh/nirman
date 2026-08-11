"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { DataTable } from "@/components/ui/data-table";
import { formatCurrency, cn } from "@/lib/utils";
import { BarChart3 } from "lucide-react";

type Project = { id: string; name: string };

type VarianceItem = {
  id: string;
  serialNo: string;
  description: string;
  category: string;
  source: "BOQ" | "LAND" | "MATERIAL" | "PROJECT_COST";
  budgetedAmount: number;
  actualAmount: number;
  variance: number;
  variancePct: number;
  status: "UNDER" | "ON_TRACK" | "OVER" | "UNBUDGETED";
};

type VarianceData = {
  items: VarianceItem[];
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  totalVariancePct: number;
  boqBudget: number;
  nonBoqBudget: number;
};

const STATUS_VARIANT: Record<VarianceItem["status"], "danger" | "success" | "muted" | "warning"> = {
  OVER: "danger",
  UNDER: "success",
  ON_TRACK: "muted",
  UNBUDGETED: "warning",
};

const STATUS_LABEL: Record<VarianceItem["status"], string> = {
  OVER: "Over",
  UNDER: "Under",
  ON_TRACK: "On Track",
  UNBUDGETED: "Unbudgeted",
};

const SOURCE_LABEL: Record<VarianceItem["source"], string> = {
  BOQ: "BOQ",
  LAND: "Land",
  MATERIAL: "Materials",
  PROJECT_COST: "Project Cost",
};

export function BudgetVarianceView({ projects }: { projects: Project[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [data, setData] = useState<VarianceData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/budget-variance?projectId=${projectId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => toast.error("Failed to load budget variance"))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (projects.length === 0) {
    return <EmptyState icon={<BarChart3 />} title="No projects" description="Create a project with a BOQ to see budget variance." />;
  }

  const isOverBudget = data && data.totalVariance < 0;

  const projectSelector = (
    <div className="shrink-0">
      <Select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        className="h-7 w-auto min-w-[180px] text-caption"
      >
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
    </div>
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-title text-foreground">Budget Variance</h1>
        </div>
        <dl className="flex items-start gap-x-6 gap-y-2 no-print">
          <div className="min-w-0">
            <dt className="text-label leading-none text-muted-foreground">Projects</dt>
            <dd className="mt-1 text-[13px] font-semibold leading-none tnum text-foreground">{projects.length}</dd>
          </div>
        </dl>
      </header>

      {loading && !data ? (
        <PageLoading label="Loading budget variance…" variant="default" />
      ) : data ? (
        <div className={cn("space-y-4", loading && "pointer-events-none opacity-60 transition-opacity")}>
          {/* Summary cards — overall budget vs actual */}
          <div className="grid gap-2 sm:grid-cols-4">
            <Card className="p-3 space-y-0.5">
              <span className="text-caption text-muted-foreground">Total Budget</span>
              <div className="text-body font-semibold tnum">{formatCurrency(data.totalBudget)}</div>
            </Card>
            <Card className="p-3 space-y-0.5">
              <span className="text-caption text-muted-foreground">Total Actual</span>
              <div className="text-body font-semibold tnum">{formatCurrency(data.totalActual)}</div>
            </Card>
            <Card className={cn("p-3 space-y-0.5", isOverBudget ? "border-danger/30" : "border-success/30")}>
              <span className="text-caption text-muted-foreground">Variance</span>
              <div className={cn("text-body font-semibold tnum", isOverBudget ? "text-danger" : "text-success")}>
                {data.totalVariance >= 0 ? "+" : ""}{formatCurrency(data.totalVariance)}
              </div>
              <span className="text-caption text-muted-foreground">
                {data.totalVariancePct.toFixed(1)}% {isOverBudget ? "over" : "under"}
              </span>
            </Card>
            <Card className="p-3 space-y-0.5">
              <span className="text-caption text-muted-foreground">Budget Split</span>
              <div className="text-caption font-medium text-foreground">
                BOQ: <span className="tnum">{formatCurrency(data.boqBudget)}</span>
              </div>
              <div className="text-caption font-medium text-muted-foreground">
                Other: <span className="tnum">{formatCurrency(data.nonBoqBudget)}</span>
              </div>
            </Card>
          </div>

          {/* Side-by-side budget vs actual bar comparison */}
          {data.items.length > 0 && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-body font-semibold">Budget vs Actual — Side by Side</h3>
                <div className="flex items-center gap-3 text-caption">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-brand/40" /> Budget
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-brand" /> Actual
                  </span>
                </div>
              </div>
              <div className="space-y-2.5 max-h-80 overflow-y-auto">
                {data.items
                  .filter((i) => i.budgetedAmount > 0 || i.actualAmount > 0)
                  .slice(0, 15)
                  .map((i) => {
                    const maxVal = Math.max(i.budgetedAmount, i.actualAmount, 1);
                    const budgetPct = (i.budgetedAmount / maxVal) * 100;
                    const actualPct = (i.actualAmount / maxVal) * 100;
                    const isOver = i.actualAmount > i.budgetedAmount && i.budgetedAmount > 0;
                    return (
                      <div key={i.id} className="space-y-1">
                        <div className="flex items-center justify-between text-caption">
                          <span className="truncate pr-2 text-foreground">{i.description}</span>
                          <span className={cn("shrink-0 tnum font-medium", isOver ? "text-danger" : "text-success")}>
                            {i.variance >= 0 ? "+" : ""}{formatCurrency(i.variance)}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {/* Budget bar */}
                          <div className="flex items-center gap-2">
                            <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
                              <div
                                className="h-full rounded-sm bg-brand/40"
                                style={{ width: `${budgetPct}%` }}
                              />
                            </div>
                            <span className="w-24 shrink-0 text-right text-micro tnum text-muted-foreground">
                              {formatCurrency(i.budgetedAmount)}
                            </span>
                          </div>
                          {/* Actual bar */}
                          <div className="flex items-center gap-2">
                            <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
                              <div
                                className={cn("h-full rounded-sm", isOver ? "bg-danger" : "bg-brand")}
                                style={{ width: `${actualPct}%` }}
                              />
                            </div>
                            <span className={cn("w-24 shrink-0 text-right text-micro tnum", isOver ? "text-danger font-medium" : "text-foreground")}>
                              {formatCurrency(i.actualAmount)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
              {data.items.filter((i) => i.budgetedAmount > 0 || i.actualAmount > 0).length > 15 && (
                <p className="text-center text-caption text-muted-foreground">
                  Showing top 15 items — see table below for all {data.items.length} items
                </p>
              )}
            </Card>
          )}

          {/* Variance DataTable */}
          {data.items.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
              <DataTable
                data={data.items}
                storageKey="budget-variance"
                searchable
                searchPlaceholder="Search items…"
                hideable
                exportFileName="budget-variance"
                initialSort={{ key: "variancePct", direction: "desc" }}
                showTotals
                sumColumns={["budgetedAmount", "actualAmount", "variance"]}
                totalFormat={(key, sum) => {
                  if (key === "variance") {
                    return `${sum >= 0 ? "+" : ""}${formatCurrency(sum)}`;
                  }
                  return formatCurrency(sum);
                }}
                toolbarLeading={projectSelector}
                columns={[
                  {
                    key: "serialNo",
                    label: "S.No",
                    sortable: true,
                    render: (i) => <span className="text-micro text-muted-foreground">{i.serialNo}</span>,
                    defaultHidden: true,
                  },
                  {
                    key: "description",
                    label: "Item",
                    sortable: true,
                    render: (i) => (
                      <div className="truncate max-w-xs">
                        <span className="text-micro text-muted-foreground block">{i.serialNo}</span>
                        {i.description}
                      </div>
                    ),
                  },
                  {
                    key: "category",
                    label: "Category",
                    sortable: true,
                    render: (i) => <span className="text-caption text-muted-foreground">{i.category}</span>,
                  },
                  {
                    key: "source",
                    label: "Source",
                    sortable: true,
                    render: (i) => (
                      <Badge variant={i.source === "BOQ" ? "default" : "muted"}>
                        {SOURCE_LABEL[i.source]}
                      </Badge>
                    ),
                  },
                  {
                    key: "budgetedAmount",
                    label: "Budget",
                    align: "right",
                    sortable: true,
                    render: (i) => (
                      <span className="tnum">{i.budgetedAmount > 0 ? formatCurrency(i.budgetedAmount) : "—"}</span>
                    ),
                    exportValue: (i) => i.budgetedAmount,
                  },
                  {
                    key: "actualAmount",
                    label: "Actual",
                    align: "right",
                    sortable: true,
                    render: (i) => <span className="tnum">{formatCurrency(i.actualAmount)}</span>,
                    exportValue: (i) => i.actualAmount,
                  },
                  {
                    key: "variance",
                    label: "Variance",
                    align: "right",
                    sortable: true,
                    render: (i) => (
                      <span className={cn("tnum font-medium", i.variance < 0 ? "text-danger" : "text-success")}>
                        {i.variance >= 0 ? "+" : ""}{formatCurrency(i.variance)}
                      </span>
                    ),
                    exportValue: (i) => i.variance,
                  },
                  {
                    key: "variancePct",
                    label: "%",
                    align: "right",
                    sortable: true,
                    render: (i) => (
                      <span className="tnum text-muted-foreground">
                        {i.budgetedAmount > 0 ? `${i.variancePct.toFixed(1)}%` : "—"}
                      </span>
                    ),
                    exportValue: (i) => i.variancePct,
                  },
                  {
                    key: "status",
                    label: "Status",
                    sortable: true,
                    render: (i) => (
                      <Badge variant={STATUS_VARIANT[i.status]}>
                        {STATUS_LABEL[i.status]}
                      </Badge>
                    ),
                  },
                ]}
              />
            </div>
          ) : (
            <EmptyState icon={<BarChart3 />} title="No data" description="Add BOQ line items, record material issues, or log project costs to see budget variance." />
          )}
        </div>
      ) : (
        <EmptyState icon={<BarChart3 />} title="No data" description="No budget variance data available." />
      )}
    </div>
  );
}
