"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Wallet, Calculator, Download } from "lucide-react";
import { Select } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, cn } from "@/lib/utils";
import { downloadCSV, type ColumnDef } from "@/lib/export";

type Project = { id: string; name: string };

type JobCostingData = {
  directCosts: {
    materials: number;
    labour: number;
    subcontractor: number;
    equipment: number;
    total: number;
  };
  indirectCosts: {
    overhead: number;
    adminAllocated: number;
    total: number;
  };
  totalCost: number;
  absorbedOverheadRate: number;
};

export function JobCostingView({ projects }: { projects: Project[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [data, setData] = useState<JobCostingData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/job-costing?projectId=${projectId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => toast.error("Failed to load job costing"))
      .finally(() => setLoading(false));
  }, [projectId]);

  function handleExport() {
    if (!data) return;
    const rows: Record<string, unknown>[] = [
      { category: "Materials", type: "Direct", amount: data.directCosts.materials },
      { category: "Labour", type: "Direct", amount: data.directCosts.labour },
      { category: "Subcontractor", type: "Direct", amount: data.directCosts.subcontractor },
      { category: "Equipment", type: "Direct", amount: data.directCosts.equipment },
      { category: "Total Direct", type: "Direct", amount: data.directCosts.total },
      { category: "Overhead", type: "Indirect", amount: data.indirectCosts.overhead },
      { category: "Admin Allocated", type: "Indirect", amount: data.indirectCosts.adminAllocated },
      { category: "Total Indirect", type: "Indirect", amount: data.indirectCosts.total },
      { category: "Total Cost", type: "Total", amount: data.totalCost },
    ];
    const cols: ColumnDef[] = [
      { key: "category", label: "Category" },
      { key: "type", label: "Type" },
      { key: "amount", label: "Amount" },
    ];
    downloadCSV("job-costing.csv", rows, cols);
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<Calculator className="h-5 w-5" />}
        title="No projects"
        description="Create a project to see its job costing breakdown."
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
          icon={<Calculator className="h-5 w-5" />}
          title="Select a project"
          description="Choose a project to view its job costing breakdown."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        {projectSelector}
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!data} className="h-9">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      {loading && !data ? (
        <PageLoading label="Loading job costing…" variant="default" />
      ) : data ? (
        <div className={cn("space-y-4", loading && "pointer-events-none opacity-60 transition-opacity")}>
          {/* KPI cards */}
          <div className="grid gap-2 sm:grid-cols-4">
            <Card className="p-3 space-y-0.5">
              <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" />
                Total Direct Cost
              </div>
              <div className="text-body font-semibold tnum text-foreground">
                {formatCurrency(data.directCosts.total)}
              </div>
            </Card>
            <Card className="p-3 space-y-0.5">
              <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5" />
                Total Indirect Cost
              </div>
              <div className="text-body font-semibold tnum text-foreground">
                {formatCurrency(data.indirectCosts.total)}
              </div>
            </Card>
            <Card className="p-3 space-y-0.5">
              <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" />
                Total Cost
              </div>
              <div className="text-body font-semibold tnum text-foreground">
                {formatCurrency(data.totalCost)}
              </div>
            </Card>
            <Card className="p-3 space-y-0.5">
              <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
                <Calculator className="h-3.5 w-3.5" />
                Overhead Absorption Rate
              </div>
              <div className="text-body font-semibold tnum text-foreground">
                {data.absorbedOverheadRate.toFixed(1)}%
              </div>
            </Card>
          </div>

          {/* Direct cost breakdown */}
          <Card className="p-4 space-y-3">
            <h3 className="text-body font-semibold">Direct Cost Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-meta">
                <thead>
                  <tr className="border-b border-border text-left text-caption text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Category</th>
                    <th className="py-2 pr-4 text-right font-medium">Amount</th>
                    <th className="py-2 text-right font-medium">% of Direct</th>
                  </tr>
                </thead>
                <tbody>
                  <CostRow label="Materials" amount={data.directCosts.materials} total={data.directCosts.total} />
                  <CostRow label="Labour" amount={data.directCosts.labour} total={data.directCosts.total} />
                  <CostRow label="Subcontractor" amount={data.directCosts.subcontractor} total={data.directCosts.total} />
                  <CostRow label="Equipment" amount={data.directCosts.equipment} total={data.directCosts.total} />
                  <tr className="border-t border-border">
                    <td className="py-2 pr-4 font-semibold text-foreground">Total Direct Cost</td>
                    <td className="py-2 pr-4 text-right font-semibold tnum text-foreground">{formatCurrency(data.directCosts.total)}</td>
                    <td className="py-2 text-right tnum text-muted-foreground">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Indirect cost breakdown */}
          <Card className="p-4 space-y-3">
            <h3 className="text-body font-semibold">Indirect Cost Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-meta">
                <thead>
                  <tr className="border-b border-border text-left text-caption text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Category</th>
                    <th className="py-2 pr-4 text-right font-medium">Amount</th>
                    <th className="py-2 text-right font-medium">% of Indirect</th>
                  </tr>
                </thead>
                <tbody>
                  <CostRow label="Overhead" amount={data.indirectCosts.overhead} total={data.indirectCosts.total} />
                  <CostRow label="Admin Allocated" amount={data.indirectCosts.adminAllocated} total={data.indirectCosts.total} />
                  <tr className="border-t border-border">
                    <td className="py-2 pr-4 font-semibold text-foreground">Total Indirect Cost</td>
                    <td className="py-2 pr-4 text-right font-semibold tnum text-foreground">{formatCurrency(data.indirectCosts.total)}</td>
                    <td className="py-2 text-right tnum text-muted-foreground">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <EmptyState
          icon={<Calculator className="h-5 w-5" />}
          title="No data available"
          description="No job costing data could be loaded for this project."
        />
      )}
    </div>
  );
}

function CostRow({ label, amount, total }: { label: string; amount: number; total: number }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <tr className="border-b border-border/60">
      <td className="py-2 pr-4 text-foreground">{label}</td>
      <td className="py-2 pr-4 text-right tnum text-foreground">{formatCurrency(amount)}</td>
      <td className="py-2 text-right tnum text-muted-foreground">{pct.toFixed(1)}%</td>
    </tr>
  );
}
