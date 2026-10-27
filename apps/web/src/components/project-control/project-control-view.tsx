"use client";

import { useState, useEffect } from "react";
import { useFetch } from "@/lib/use-fetch";
import { toast } from "sonner";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MetricGrid, Metric } from "@/components/page";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import { Gauge } from "lucide-react";

type Project = { id: string; name: string };

type EvmMetrics = {
  pv: number; ev: number; ac: number;
  cv: number; sv: number;
  cpi: number; spi: number;
  eac: number; vac: number;
  pctComplete: number;
};

type Commitments = {
  openRequisitions: { count: number; totalEstimated: number };
  openPurchaseOrders: { count: number; totalCommitted: number };
  totalCommitted: number;
};

type OverrunItem = {
  boqItemId: string; serialNo: string; description: string;
  materialCode: string; materialName: string; unit: string;
  budgetedQty: number; budgetedAmount: number;
  actualQty: number; actualCost: number;
  committedQty: number; committedCost: number;
  pendingReqQty: number;
  projectedQty: number; projectedCost: number;
  overrun: number; overrunPct: number;
};

type MtoItem = {
  materialId: string; materialCode: string; materialName: string; unit: string;
  boqQty: number; consumedQty: number; remainingQty: number;
  currentStock: number; openRequisitionQty: number; procurementGap: number;
};

export function ProjectControlView({ projects }: { projects: Project[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const skip = !projectId;
  const evmQ = useFetch<EvmMetrics>(skip ? null : `/api/evm?projectId=${projectId}`);
  const comQ = useFetch<Commitments>(skip ? null : `/api/project-commitments?projectId=${projectId}`);
  const ovrQ = useFetch<OverrunItem[]>(skip ? null : `/api/cost-overrun?projectId=${projectId}`);
  const mtoQ = useFetch<MtoItem[]>(skip ? null : `/api/material-take-off?projectId=${projectId}`);
  const evm = evmQ.data ?? null;
  const commitments = comQ.data ?? null;
  const overruns = ovrQ.data ?? [];
  const mto = mtoQ.data ?? [];
  const loading = evmQ.loading || comQ.loading || ovrQ.loading || mtoQ.loading;
  const error = evmQ.error || comQ.error || ovrQ.error || mtoQ.error;

  useEffect(() => {
    if (error) toast.error("Failed to load project control data");
  }, [error]);

  if (projects.length === 0) {
    return <EmptyState icon={<Gauge />} title="No projects" description="Create a project to see project control metrics." />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-7 w-auto min-w-[180px] text-caption" aria-label="Project">
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </header>

      {loading ? (
        <PageLoading label="Loading project control…" variant="cards" />
      ) : (
        <>
          {/* EVM Metrics */}
          {evm && (
            <div className="space-y-3">
              <h2 className="text-label text-muted-foreground">Earned Value Management</h2>
              <MetricGrid cols={4}>
                <Metric label="Planned Value (PV)" value={formatCurrency(evm.pv)} />
                <Metric label="Earned Value (EV)" value={formatCurrency(evm.ev)} />
                <Metric label="Actual Cost (AC)" value={formatCurrency(evm.ac)} />
                <Metric label="% Complete" value={`${evm.pctComplete}%`} />
                <Metric
                  label="Cost Variance (CV)"
                  value={formatCurrency(evm.cv)}
                  tone={evm.cv >= 0 ? "success" : "danger"}
                  sub={`CPI: ${evm.cpi.toFixed(2)} ${evm.cpi >= 1 ? "(under budget)" : "(over budget)"}`}
                />
                <Metric
                  label="Schedule Variance (SV)"
                  value={formatCurrency(evm.sv)}
                  tone={evm.sv >= 0 ? "success" : "danger"}
                  sub={`SPI: ${evm.spi.toFixed(2)} ${evm.spi >= 1 ? "(ahead of schedule)" : "(behind schedule)"}`}
                />
                <Metric
                  label="Estimate at Completion"
                  value={formatCurrency(evm.eac)}
                  sub={`BAC: ${formatCurrency(evm.pv)}`}
                />
                <Metric
                  label="Variance at Completion"
                  value={formatCurrency(evm.vac)}
                  tone={evm.vac >= 0 ? "success" : "danger"}
                  sub={evm.vac >= 0 ? "Under budget forecast" : "Over budget forecast"}
                />
              </MetricGrid>
            </div>
          )}

          {/* Commitments */}
          {commitments && (
            <div className="space-y-3">
              <h2 className="text-label text-muted-foreground">Commitments</h2>
              <MetricGrid cols={3}>
                <Metric
                  label="Open Indents"
                  value={formatCurrency(commitments.openRequisitions.totalEstimated)}
                  sub={`${commitments.openRequisitions.count} indents pending`}
                />
                <Metric
                  label="Open Purchase Orders"
                  value={formatCurrency(commitments.openPurchaseOrders.totalCommitted)}
                  sub={`${commitments.openPurchaseOrders.count} POs in progress`}
                />
                <Metric
                  label="Total Committed"
                  value={formatCurrency(commitments.totalCommitted)}
                  sub="Indents + POs"
                />
              </MetricGrid>
            </div>
          )}

          {/* Cost Overrun Forecast */}
          {overruns.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Cost Overrun Forecast</h2>
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">BOQ Item</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Material</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Budget</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Actual</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Committed</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Projected</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Overrun</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overruns.filter((o) => o.overrun > 0).map((o) => (
                      <tr key={o.boqItemId} className="border-b border-border/50">
                        <td className="px-3 py-2">
                          <span className="text-xs text-muted-foreground">{o.serialNo}</span>
                          <div className="truncate max-w-xs">{o.description}</div>
                        </td>
                        <td className="px-3 py-2 text-xs">{o.materialCode}</td>
                        <td className="text-right px-3 py-2">{formatCurrency(o.budgetedAmount)}</td>
                        <td className="text-right px-3 py-2">{formatCurrency(o.actualCost)}</td>
                        <td className="text-right px-3 py-2">{formatCurrency(o.committedCost)}</td>
                        <td className="text-right px-3 py-2 font-medium">{formatCurrency(o.projectedCost)}</td>
                        <td className="text-right px-3 py-2">
                          <span className={cn("font-medium", o.overrun > 0 ? "text-destructive" : "text-muted-foreground")}>
                            {formatCurrency(o.overrun)}
                          </span>
                          {o.overrunPct > 0 && (
                            <Badge variant="danger" className="ml-1 text-xs">+{o.overrunPct.toFixed(0)}%</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Material Take-Off */}
          {mto.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Material Take-Off & Procurement Gap</h2>
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Material</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">BOQ Qty</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Consumed</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Remaining</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Stock</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Open Reqs</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Procurement Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mto.filter((m) => m.procurementGap > 0).map((m) => (
                      <tr key={m.materialId} className="border-b border-border/50">
                        <td className="px-3 py-2">
                          <span className="text-xs text-muted-foreground">{m.materialCode}</span>
                          <div className="truncate max-w-xs">{m.materialName}</div>
                        </td>
                        <td className="text-right px-3 py-2">{formatNumber(m.boqQty, 3)} {m.unit}</td>
                        <td className="text-right px-3 py-2">{formatNumber(m.consumedQty, 3)}</td>
                        <td className="text-right px-3 py-2">{formatNumber(m.remainingQty, 3)}</td>
                        <td className="text-right px-3 py-2">{formatNumber(m.currentStock, 3)}</td>
                        <td className="text-right px-3 py-2">{formatNumber(m.openRequisitionQty, 3)}</td>
                        <td className="text-right px-3 py-2 font-medium text-destructive">
                          {formatNumber(m.procurementGap, 3)} {m.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {overruns.length === 0 && mto.length === 0 && !loading && (
            <EmptyState
              icon={<Gauge />}
              title="No material-linked BOQ items"
              description="Link BOQ line items to materials to see cost overrun forecasts and material take-off for this project."
            />
          )}
        </>
      )}
    </div>
  );
}
