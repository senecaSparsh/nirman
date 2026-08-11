"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Card } from "@/components/ui/card";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { formatNumber, cn } from "@/lib/utils";
import { ClipboardCheck, AlertTriangle, ChevronDown } from "lucide-react";

type Project = { id: string; name: string };

type ReconItem = {
  boqItemId: string; serialNo: string; description: string;
  materialCode: string; materialName: string; unit: string;
  requiredQty: number; issuedQty: number; consumedQty: number; currentStock: number;
  issueVariance: number; consumptionVariance: number; stockVariance: number;
  wastagePct: number; isOverTolerance: boolean; tolerancePct: number;
  alertLevel: "OK" | "WARNING" | "CRITICAL";
};

type ReconData = {
  items: ReconItem[];
  totalRequired: number; totalIssued: number; totalConsumed: number;
  totalWastage: number; overToleranceCount: number;
};

/** Column definitions for the reconciliation DataTable. */
const reconColumns: Column<ReconItem>[] = [
  {
    key: "serialNo",
    label: "BOQ Item",
    sortable: true,
    sortValue: (item) => item.serialNo,
    render: (item) => (
      <div>
        <span className="text-caption text-muted-foreground">{item.serialNo}</span>
        <div className="truncate max-w-xs">{item.description}</div>
      </div>
    ),
  },
  {
    key: "materialCode",
    label: "Material",
    sortable: true,
    sortValue: (item) => item.materialCode,
    render: (item) => (
      <div>
        <span className="text-caption text-muted-foreground">{item.materialCode}</span>
        <div className="truncate max-w-xs text-caption">{item.materialName}</div>
      </div>
    ),
  },
  {
    key: "requiredQty",
    label: "Required",
    align: "right",
    sortable: true,
    render: (item) => <span className="tnum">{formatNumber(item.requiredQty, 3)} {item.unit}</span>,
  },
  {
    key: "issuedQty",
    label: "Issued",
    align: "right",
    sortable: true,
    render: (item) => <span className="tnum">{formatNumber(item.issuedQty, 3)}</span>,
  },
  {
    key: "consumedQty",
    label: "Consumed",
    align: "right",
    sortable: true,
    render: (item) => <span className="tnum">{formatNumber(item.consumedQty, 3)}</span>,
  },
  {
    key: "currentStock",
    label: "Stock",
    align: "right",
    sortable: true,
    render: (item) => <span className="tnum text-muted-foreground">{formatNumber(item.currentStock, 3)}</span>,
  },
  {
    key: "wastagePct",
    label: "Wastage",
    align: "right",
    sortable: true,
    render: (item) => (
      <span className={cn("tnum font-medium", item.wastagePct > 0 ? "text-danger" : "text-muted-foreground")}>
        {item.wastagePct > 0 ? "+" : ""}{item.wastagePct.toFixed(1)}%
      </span>
    ),
  },
  {
    key: "alertLevel",
    label: "Alert",
    sortable: true,
    render: (item) => {
      if (item.alertLevel === "CRITICAL") {
        return <Badge variant="danger"><AlertTriangle className="mr-1 h-3 w-3" /> Critical</Badge>;
      }
      if (item.alertLevel === "WARNING") {
        return <Badge variant="warning">Warning</Badge>;
      }
      return <Badge variant="muted">OK</Badge>;
    },
  },
];

export function MaterialReconciliationView({ projects }: { projects: Project[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [data, setData] = useState<ReconData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/material-reconciliation?projectId=${projectId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => toast.error("Failed to load reconciliation"))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (projects.length === 0) {
    return <EmptyState icon={<ClipboardCheck />} title="No projects" description="Create a project to see material reconciliation." />;
  }

  const projectSelect = (
    <div className="relative shrink-0" style={{ width: 200 }}>
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        style={{ width: 200 }}
        className="h-8 shrink-0 appearance-none rounded-md border border-input bg-card pl-2.5 pr-7 text-[13px] text-foreground transition-[border-color,box-shadow] hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
      >
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
    </div>
  );

  return (
    <div className="space-y-6">
      {loading ? (
        <PageLoading label="Loading reconciliation…" variant="default" />
      ) : data ? (
        <>
          {/* Summary */}
          <div className="grid gap-3 sm:grid-cols-4">
            <Card className="p-4 space-y-1">
              <span className="text-xs text-muted-foreground">Total Required (BOQ)</span>
              <div className="text-xl font-semibold">{formatNumber(data.totalRequired, 3)}</div>
            </Card>
            <Card className="p-4 space-y-1">
              <span className="text-xs text-muted-foreground">Total Issued</span>
              <div className="text-xl font-semibold">{formatNumber(data.totalIssued, 3)}</div>
            </Card>
            <Card className="p-4 space-y-1">
              <span className="text-xs text-muted-foreground">Total Consumed (MB)</span>
              <div className="text-xl font-semibold">{formatNumber(data.totalConsumed, 3)}</div>
            </Card>
            <Card className={cn("p-4 space-y-1", data.overToleranceCount > 0 ? "border-warning/30" : "")}>
              <span className="text-xs text-muted-foreground">Over Tolerance</span>
              <div className={cn("text-xl font-semibold", data.overToleranceCount > 0 ? "text-warning" : "")}>
                {data.overToleranceCount} items
              </div>
            </Card>
          </div>

          {data.items.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
              <DataTable
                data={data.items}
                initialSort={{ key: "wastagePct", direction: "desc" }}
                columns={reconColumns}
                searchable
                searchPlaceholder="Search by BOQ item, material…"
                showTotals
                sumColumns={["requiredQty", "issuedQty", "consumedQty"]}
                totalFormat={(_key, sum) => formatNumber(sum, 3)}
                hideable
                pageSize={50}
                toolbarLeading={projectSelect}
              />
            </div>
          ) : (
            <EmptyState icon={<ClipboardCheck />} title="No BOQ data" description="Create BOQ line items linked to materials to see reconciliation." />
          )}
        </>
      ) : (
        <EmptyState icon={<ClipboardCheck />} title="No data" description="No reconciliation data available." />
      )}
    </div>
  );
}
