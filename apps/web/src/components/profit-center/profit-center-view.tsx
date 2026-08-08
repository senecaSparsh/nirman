"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Select } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Card } from "@/components/ui/card";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, cn } from "@/lib/utils";
import { Wallet, TrendingUp, TrendingDown, Building2 } from "lucide-react";

type Project = { id: string; name: string };

type ProfitCenter = {
  totalRevenue: number; costRecovery: number; totalInflow: number;
  landCost: number; materialCost: number; labourCost: number;
  equipmentCost: number; subcontractorCost: number; overheadCost: number;
  totalCost: number; grossProfit: number; marginPct: number;
  totalSellableArea: number; costPerSqft: number; revenuePerSqft: number;
};

export function ProfitCenterView({ projects }: { projects: Project[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [pc, setPc] = useState<ProfitCenter | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/profit-center?projectId=${projectId}`)
      .then((r) => r.json())
      .then(setPc)
      .catch(() => toast.error("Failed to load profit center"))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (projects.length === 0) {
    return <EmptyState icon={<Wallet />} title="No projects" description="Create a project to see its profit center." />;
  }

  return (
    <div className="space-y-6">
      <Field label="Project">
        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="max-w-sm">
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>

      {loading ? (
        <PageLoading label="Loading profit center…" variant="default" />
      ) : pc ? (
        <>
          {/* Summary cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total Revenue</span>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-xl font-semibold">{formatCurrency(pc.totalRevenue)}</div>
              <div className="text-xs text-muted-foreground">+ {formatCurrency(pc.costRecovery)} cost recovery</div>
            </Card>
            <Card className="p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total Cost</span>
                <TrendingDown className="h-4 w-4 text-destructive" />
              </div>
              <div className="text-xl font-semibold">{formatCurrency(pc.totalCost)}</div>
              <div className="text-xs text-muted-foreground">{formatCurrency(pc.costPerSqft)}/sqft</div>
            </Card>
            <Card className={cn("p-4 space-y-1", pc.grossProfit >= 0 ? "border-emerald-500/30" : "border-destructive/30")}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Gross Profit</span>
                <Wallet className={cn("h-4 w-4", pc.grossProfit >= 0 ? "text-emerald-500" : "text-destructive")} />
              </div>
              <div className={cn("text-xl font-semibold", pc.grossProfit >= 0 ? "text-emerald-600" : "text-destructive")}>
                {formatCurrency(pc.grossProfit)}
              </div>
              <div className="text-xs text-muted-foreground">Margin: {pc.marginPct.toFixed(1)}%</div>
            </Card>
            <Card className="p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Revenue/sqft</span>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-xl font-semibold">{formatCurrency(pc.revenuePerSqft)}</div>
              <div className="text-xs text-muted-foreground">{pc.totalSellableArea.toFixed(0)} sqft sellable</div>
            </Card>
          </div>

          {/* Cost breakdown */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Cost Breakdown</h3>
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Cost Component</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  <CostRow label="Land" amount={pc.landCost} total={pc.totalCost} />
                  <CostRow label="Materials" amount={pc.materialCost} total={pc.totalCost} />
                  <CostRow label="Labour" amount={pc.labourCost} total={pc.totalCost} />
                  <CostRow label="Equipment" amount={pc.equipmentCost} total={pc.totalCost} />
                  <CostRow label="Subcontractor" amount={pc.subcontractorCost} total={pc.totalCost} />
                  <CostRow label="Overhead" amount={pc.overheadCost} total={pc.totalCost} />
                  <tr className="border-t border-border font-semibold">
                    <td className="px-3 py-2">Total Cost</td>
                    <td className="text-right px-3 py-2">{formatCurrency(pc.totalCost)}</td>
                    <td className="text-right px-3 py-2">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <EmptyState icon={<Wallet />} title="No data" description="No profit center data available for this project." />
      )}
    </div>
  );
}

function CostRow({ label, amount, total }: { label: string; amount: number; total: number }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <tr className="border-b border-border/50">
      <td className="px-3 py-2">{label}</td>
      <td className="text-right px-3 py-2">{formatCurrency(amount)}</td>
      <td className="text-right px-3 py-2 text-muted-foreground">{pct.toFixed(1)}%</td>
    </tr>
  );
}
