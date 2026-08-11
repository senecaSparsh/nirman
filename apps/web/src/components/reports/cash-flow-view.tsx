"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Wallet, Calendar } from "lucide-react";
import { Select } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Card } from "@/components/ui/card";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

type Project = { id: string; name: string };

type ScheduledPayment = {
  saleNumber: string;
  customerName: string;
  amount: number;
  dueDate: string;
};

type CashFlowData = {
  inflows: {
    scheduledPayments: ScheduledPayment[];
    totalInflow: number;
  };
  outflows: {
    commitments: number;
    pendingRaBills: number;
    payrollDue: number;
    totalOutflow: number;
  };
  netCashFlow: number;
};

export function CashFlowView({ projects }: { projects: Project[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/cash-flow?projectId=${projectId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => toast.error("Failed to load cash flow forecast"))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<Wallet className="h-5 w-5" />}
        title="No projects"
        description="Create a project to see its cash flow forecast."
      />
    );
  }

  const projectSelector = (
    <Field label="Project" className="max-w-xs">
      <Select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        className="h-9"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </Select>
    </Field>
  );

  if (!projectId) {
    return (
      <div className="space-y-4">
        {projectSelector}
        <EmptyState
          icon={<Calendar className="h-5 w-5" />}
          title="Select a project"
          description="Choose a project to view its cash flow forecast."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {projectSelector}

      {loading && !data ? (
        <PageLoading label="Loading cash flow forecast…" variant="default" />
      ) : data ? (
        <div className={cn("space-y-4", loading && "pointer-events-none opacity-60 transition-opacity")}>
          {/* KPI cards */}
          <div className="grid gap-2 sm:grid-cols-3">
            <Card className="p-3 space-y-0.5">
              <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-success" />
                Total Inflow
              </div>
              <div className="text-body font-semibold tnum text-success">
                {formatCurrency(data.inflows.totalInflow)}
              </div>
            </Card>
            <Card className="p-3 space-y-0.5">
              <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5 text-danger" />
                Total Outflow
              </div>
              <div className="text-body font-semibold tnum text-danger">
                {formatCurrency(data.outflows.totalOutflow)}
              </div>
            </Card>
            <Card className={cn("p-3 space-y-0.5", data.netCashFlow >= 0 ? "border-success/30" : "border-danger/30")}>
              <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" />
                Net Cash Flow
              </div>
              <div className={cn("text-body font-semibold tnum", data.netCashFlow >= 0 ? "text-success" : "text-danger")}>
                {data.netCashFlow >= 0 ? "+" : ""}{formatCurrency(data.netCashFlow)}
              </div>
            </Card>
          </div>

          {/* Outflow breakdown */}
          <Card className="p-4 space-y-3">
            <h3 className="text-body font-semibold">Outflow Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-meta">
                <thead>
                  <tr className="border-b border-border text-left text-caption text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Category</th>
                    <th className="py-2 pr-4 text-right font-medium">Amount</th>
                    <th className="py-2 text-right font-medium">% of Outflow</th>
                  </tr>
                </thead>
                <tbody>
                  <OutflowRow label="Commitments" amount={data.outflows.commitments} total={data.outflows.totalOutflow} />
                  <OutflowRow label="Pending RA Bills" amount={data.outflows.pendingRaBills} total={data.outflows.totalOutflow} />
                  <OutflowRow label="Payroll Due" amount={data.outflows.payrollDue} total={data.outflows.totalOutflow} />
                  <tr className="border-t border-border">
                    <td className="py-2 pr-4 font-semibold text-foreground">Total Outflow</td>
                    <td className="py-2 pr-4 text-right font-semibold tnum text-foreground">{formatCurrency(data.outflows.totalOutflow)}</td>
                    <td className="py-2 text-right tnum text-muted-foreground">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Scheduled payment inflows */}
          <Card className="p-4 space-y-3">
            <h3 className="text-body font-semibold">Scheduled Payment Inflows</h3>
            {data.inflows.scheduledPayments.length === 0 ? (
              <EmptyState
                icon={<Calendar className="h-5 w-5" />}
                title="No scheduled payments"
                description="There are no scheduled payment inflows for this project."
                size="compact"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-meta">
                  <thead>
                    <tr className="border-b border-border text-left text-caption text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Sale Number</th>
                      <th className="py-2 pr-4 font-medium">Customer</th>
                      <th className="py-2 pr-4 text-right font-medium">Amount</th>
                      <th className="py-2 text-right font-medium">Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.inflows.scheduledPayments.map((p, i) => (
                      <tr key={i} className="border-b border-border/60">
                        <td className="py-2 pr-4 font-medium text-foreground">{p.saleNumber}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{p.customerName}</td>
                        <td className="py-2 pr-4 text-right tnum text-foreground">{formatCurrency(p.amount)}</td>
                        <td className="py-2 text-right tnum text-muted-foreground">{formatDate(p.dueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : (
        <EmptyState
          icon={<Wallet className="h-5 w-5" />}
          title="No data available"
          description="No cash flow data could be loaded for this project."
        />
      )}
    </div>
  );
}

function OutflowRow({ label, amount, total }: { label: string; amount: number; total: number }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <tr className="border-b border-border/60">
      <td className="py-2 pr-4 text-foreground">{label}</td>
      <td className="py-2 pr-4 text-right tnum text-foreground">{formatCurrency(amount)}</td>
      <td className="py-2 text-right tnum text-muted-foreground">{pct.toFixed(1)}%</td>
    </tr>
  );
}
