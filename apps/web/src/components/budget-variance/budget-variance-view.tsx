"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Select } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, cn } from "@/lib/utils";
import { BarChart3 } from "lucide-react";

type Project = { id: string; name: string };

type VarianceItem = {
  boqItemId: string; serialNo: string; description: string; category: string;
  budgetedAmount: number; actualAmount: number; variance: number;
  variancePct: number; status: "UNDER" | "ON_TRACK" | "OVER";
};

type VarianceData = {
  items: VarianceItem[];
  totalBudget: number; totalActual: number; totalVariance: number; totalVariancePct: number;
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

  return (
    <div className="space-y-6">
      <Field label="Project">
        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="max-w-sm">
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>

      {loading ? (
        <PageLoading label="Loading budget variance…" variant="default" />
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4 space-y-1">
              <span className="text-xs text-muted-foreground">Total Budget</span>
              <div className="text-xl font-semibold">{formatCurrency(data.totalBudget)}</div>
            </Card>
            <Card className="p-4 space-y-1">
              <span className="text-xs text-muted-foreground">Total Actual</span>
              <div className="text-xl font-semibold">{formatCurrency(data.totalActual)}</div>
            </Card>
            <Card className={cn("p-4 space-y-1", data.totalVariance < 0 ? "border-danger/30" : "border-success/30")}>
              <span className="text-xs text-muted-foreground">Total Variance</span>
              <div className={cn("text-xl font-semibold", data.totalVariance < 0 ? "text-danger" : "text-success")}>
                {formatCurrency(data.totalVariance)}
              </div>
              <span className="text-xs text-muted-foreground">{data.totalVariancePct.toFixed(1)}% {data.totalVariance < 0 ? "over budget" : "under budget"}</span>
            </Card>
          </div>

          {data.items.length > 0 ? (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">BOQ Item</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Category</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Budget</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Actual</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Variance</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">%</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.boqItemId} className="border-b border-border/50">
                      <td className="px-3 py-2">
                        <span className="text-xs text-muted-foreground">{item.serialNo}</span>
                        <div className="truncate max-w-xs">{item.description}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{item.category}</td>
                      <td className="text-right px-3 py-2">{formatCurrency(item.budgetedAmount)}</td>
                      <td className="text-right px-3 py-2">{formatCurrency(item.actualAmount)}</td>
                      <td className={cn("text-right px-3 py-2 font-medium", item.variance < 0 ? "text-danger" : "text-success")}>
                        {formatCurrency(item.variance)}
                      </td>
                      <td className="text-right px-3 py-2 text-muted-foreground">{item.variancePct.toFixed(1)}%</td>
                      <td className="px-3 py-2">
                        <Badge variant={item.status === "OVER" ? "danger" : item.status === "UNDER" ? "success" : "muted"}>
                          {item.status === "OVER" ? "Over" : item.status === "UNDER" ? "Under" : "On Track"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<BarChart3 />} title="No BOQ data" description="Create BOQ line items and record RA bills to see budget variance." />
          )}
        </>
      ) : (
        <EmptyState icon={<BarChart3 />} title="No data" description="No budget variance data available." />
      )}
    </div>
  );
}
