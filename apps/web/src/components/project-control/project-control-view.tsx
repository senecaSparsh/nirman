"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Select } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, AlertTriangle, DollarSign, Package, Gauge } from "lucide-react";

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
  const [evm, setEvm] = useState<EvmMetrics | null>(null);
  const [commitments, setCommitments] = useState<Commitments | null>(null);
  const [overruns, setOverruns] = useState<OverrunItem[]>([]);
  const [mto, setMto] = useState<MtoItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/evm?projectId=${projectId}`).then((r) => r.json()),
      fetch(`/api/project-commitments?projectId=${projectId}`).then((r) => r.json()),
      fetch(`/api/cost-overrun?projectId=${projectId}`).then((r) => r.json()),
      fetch(`/api/material-take-off?projectId=${projectId}`).then((r) => r.json()),
    ])
      .then(([e, c, o, m]) => {
        setEvm(e);
        setCommitments(c);
        setOverruns(o ?? []);
        setMto(m ?? []);
      })
      .catch(() => toast.error("Failed to load project control data"))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (projects.length === 0) {
    return <EmptyState icon={<Gauge />} title="No projects" description="Create a project to see project control metrics." />;
  }

  return (
    <div className="space-y-6">
      <Field label="Project">
        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="max-w-sm">
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>

      {loading ? (
        <PageLoading label="Loading project control…" variant="cards" />
      ) : (
        <>
          {/* EVM Metrics */}
          {evm && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Earned Value Management</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Planned Value (PV)" value={formatCurrency(evm.pv)} icon={DollarSign} />
                <MetricCard label="Earned Value (EV)" value={formatCurrency(evm.ev)} icon={TrendingUp} />
                <MetricCard label="Actual Cost (AC)" value={formatCurrency(evm.ac)} icon={DollarSign} />
                <MetricCard label="% Complete" value={`${evm.pctComplete}%`} icon={Gauge} />
                <MetricCard
                  label="Cost Variance (CV)"
                  value={formatCurrency(evm.cv)}
                  icon={evm.cv >= 0 ? TrendingUp : TrendingDown}
                  tone={evm.cv >= 0 ? "positive" : "negative"}
                  sub={`CPI: ${evm.cpi.toFixed(2)} ${evm.cpi >= 1 ? "(under budget)" : "(over budget)"}`}
                />
                <MetricCard
                  label="Schedule Variance (SV)"
                  value={formatCurrency(evm.sv)}
                  icon={evm.sv >= 0 ? TrendingUp : TrendingDown}
                  tone={evm.sv >= 0 ? "positive" : "negative"}
                  sub={`SPI: ${evm.spi.toFixed(2)} ${evm.spi >= 1 ? "(ahead of schedule)" : "(behind schedule)"}`}
                />
                <MetricCard
                  label="Estimate at Completion"
                  value={formatCurrency(evm.eac)}
                  icon={DollarSign}
                  sub={`BAC: ${formatCurrency(evm.pv)}`}
                />
                <MetricCard
                  label="Variance at Completion"
                  value={formatCurrency(evm.vac)}
                  icon={evm.vac >= 0 ? TrendingUp : TrendingDown}
                  tone={evm.vac >= 0 ? "positive" : "negative"}
                  sub={evm.vac >= 0 ? "Under budget forecast" : "Over budget forecast"}
                />
              </div>
            </div>
          )}

          {/* Commitments */}
          {commitments && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Commitments</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard
                  label="Open Requisitions"
                  value={formatCurrency(commitments.openRequisitions.totalEstimated)}
                  sub={`${commitments.openRequisitions.count} requisitions pending`}
                  icon={Package}
                />
                <MetricCard
                  label="Open Purchase Orders"
                  value={formatCurrency(commitments.openPurchaseOrders.totalCommitted)}
                  sub={`${commitments.openPurchaseOrders.count} POs in progress`}
                  icon={Package}
                />
                <MetricCard
                  label="Total Committed"
                  value={formatCurrency(commitments.totalCommitted)}
                  sub="Requisitions + POs"
                  icon={DollarSign}
                />
              </div>
            </div>
          )}

          {/* Cost Overrun Forecast */}
          {overruns.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Cost Overrun Forecast</h3>
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
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Material Take-Off & Procurement Gap</h3>
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
              title="No BOQ data"
              description="Create a BOQ with line items linked to materials to see cost overrun forecasts and material take-off."
            />
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "positive" | "negative";
}) {
  return (
    <Card className="p-4 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4", tone === "positive" && "text-emerald-500", tone === "negative" && "text-destructive")} />
      </div>
      <div className={cn("text-xl font-semibold", tone === "positive" && "text-emerald-600", tone === "negative" && "text-destructive")}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
