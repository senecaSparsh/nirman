"use client";

import { useState, useEffect } from "react";
import { useFetch } from "@/lib/use-fetch";
import { toast } from "sonner";
import { Select } from "@/components/ui/input";
import { MetricGrid, Metric } from "@/components/page";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency } from "@/lib/utils";
import { Wallet } from "lucide-react";

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
  const { data: pc, loading, error } = useFetch<ProfitCenter>(
    projectId ? `/api/profit-center?projectId=${projectId}` : null,
  );

  useEffect(() => {
    if (error) toast.error("Failed to load profit center");
  }, [error]);

  if (projects.length === 0) {
    return <EmptyState icon={<Wallet />} title="No projects" description="Create a project to see its profit center." />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-7 w-auto min-w-[180px] text-caption" aria-label="Project">
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </header>

      {loading ? (
        <PageLoading label="Loading profit center…" variant="default" />
      ) : pc ? (
        <>
          {/* Summary cards */}
          <MetricGrid cols={4}>
            <Metric
              label="Total Revenue"
              value={formatCurrency(pc.totalRevenue)}
              sub={`+ ${formatCurrency(pc.costRecovery)} cost recovery`}
            />
            <Metric
              label="Total Cost"
              value={formatCurrency(pc.totalCost)}
              sub={`${formatCurrency(pc.costPerSqft)}/sqft`}
            />
            <Metric
              label="Gross Profit"
              value={formatCurrency(pc.grossProfit)}
              tone={pc.grossProfit >= 0 ? "success" : "danger"}
              sub={`Margin: ${pc.marginPct.toFixed(1)}%`}
            />
            <Metric
              label="Revenue / sqft"
              value={formatCurrency(pc.revenuePerSqft)}
              sub={`${pc.totalSellableArea.toFixed(0)} sqft sellable`}
            />
          </MetricGrid>

          {/* Cost breakdown */}
          <div className="space-y-3">
            <h3 className="text-label text-muted-foreground">Cost Breakdown</h3>
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
              <table className="w-full text-body">
                <thead className="border-b border-border bg-subtle">
                  <tr>
                    <th className="px-3 py-2 text-left text-label text-muted-foreground">Cost Component</th>
                    <th className="px-3 py-2 text-right text-label text-muted-foreground">Amount</th>
                    <th className="px-3 py-2 text-right text-label text-muted-foreground">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  <CostRow label="Land" amount={pc.landCost} total={pc.totalCost} />
                  <CostRow label="Materials" amount={pc.materialCost} total={pc.totalCost} />
                  <CostRow label="Labour" amount={pc.labourCost} total={pc.totalCost} />
                  <CostRow label="Equipment" amount={pc.equipmentCost} total={pc.totalCost} />
                  <CostRow label="Subcontractor" amount={pc.subcontractorCost} total={pc.totalCost} />
                  <CostRow label="Overhead" amount={pc.overheadCost} total={pc.totalCost} />
                  <tr className="border-t border-border bg-subtle/40 font-semibold">
                    <td className="px-3 py-2.5">Total Cost</td>
                    <td className="px-3 py-2.5 text-right tnum">{formatCurrency(pc.totalCost)}</td>
                    <td className="px-3 py-2.5 text-right tnum">100%</td>
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
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3 py-2.5 font-medium text-foreground">{label}</td>
      <td className="px-3 py-2.5 text-right tnum">{formatCurrency(amount)}</td>
      <td className="px-3 py-2.5 text-right tnum text-muted-foreground">{pct.toFixed(1)}%</td>
    </tr>
  );
}
