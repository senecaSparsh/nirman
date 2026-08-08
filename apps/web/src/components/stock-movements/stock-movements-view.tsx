"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Package, Download, RefreshCw, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { MetricGrid, Metric } from "@/components/page";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SplitView } from "@/components/ui/split-view";
import { IssueMaterialsDialog } from "./issue-materials-dialog";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { downloadCSV, downloadExcel } from "@/lib/export";
import type { ProjectOption, StockLocationRow, StockMovementRow, DepartmentOption } from "@/lib/types";

const MOVEMENT_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  PURCHASE_RECEIPT: "success",
  TRANSFER_IN: "default",
  TRANSFER_OUT: "warning",
  ISSUE_TO_PROJECT: "warning",
  ISSUE_TO_DEPARTMENT: "warning",
  ADJUSTMENT_IN: "success",
  ADJUSTMENT_OUT: "danger",
  RETURN: "muted",
  SALE: "default",
};

export function StockMovementsView({
  movements,
  locations,
  projects,
  departments,
  permissions,
}: {
  movements: StockMovementRow[];
  locations: StockLocationRow[];
  projects: ProjectOption[];
  departments: DepartmentOption[];
  permissions?: { canTransfer?: boolean; canIssue?: boolean };
}) {
  const canIssue = permissions?.canIssue ?? true;
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [query, setQuery] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [selected, setSelected] = useState<StockMovementRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return movements.filter((m) => {
      if (typeFilter && m.movementType !== typeFilter) return false;
      if (locationFilter && m.fromLocationId !== locationFilter && m.toLocationId !== locationFilter) return false;
      if (!q) return true;
      return (
        m.materialName.toLowerCase().includes(q) ||
        m.materialCode.toLowerCase().includes(q)
      );
    });
  }, [movements, typeFilter, locationFilter, query]);

  const receiptCount = movements.filter((m) => m.movementType === "PURCHASE_RECEIPT").length;
  const issueCount = movements.filter((m) => m.movementType.startsWith("ISSUE")).length;
  const transferCount = movements.filter((m) => m.movementType.startsWith("TRANSFER")).length;

  return (
    <div className="space-y-5">
      <MetricGrid cols={4}>
        <Metric label="Total Movements" value={movements.length} icon={<ScrollText />} />
        <Metric label="Receipts" value={receiptCount} tone="success" />
        <Metric label="Issues" value={issueCount} tone="warning" />
        <Metric label="Transfers" value={transferCount} tone="muted" />
      </MetricGrid>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search material…" className="pl-8" />
          </div>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All types</option>
            <option value="PURCHASE_RECEIPT">Receipt</option>
            <option value="TRANSFER_IN">Transfer In</option>
            <option value="TRANSFER_OUT">Transfer Out</option>
            <option value="ISSUE_TO_PROJECT">Issue to Project</option>
            <option value="ISSUE_TO_DEPARTMENT">Issue to Dept</option>
            <option value="ADJUSTMENT_IN">Adjustment (+)</option>
            <option value="ADJUSTMENT_OUT">Adjustment (−)</option>
            <option value="RETURN">Return</option>
            <option value="SALE">Sale</option>
          </Select>
          <Select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => downloadCSV(`stock-movements-${new Date().toISOString().slice(0,10)}.csv`, filtered as unknown as Record<string, unknown>[], [
            { key: "timestamp", label: "Date", format: (v) => formatDate(String(v)) },
            { key: "movementLabel", label: "Type" },
            { key: "materialName", label: "Material" },
            { key: "materialCode", label: "Code" },
            { key: "fromLocationName", label: "From" },
            { key: "toLocationName", label: "To" },
            { key: "qty", label: "Qty" },
            { key: "unit", label: "Unit" },
            { key: "unitCost", label: "Unit Cost", format: (v) => formatCurrency(Number(v)) },
            { key: "balanceAfter", label: "Balance After" },
            { key: "reason", label: "Reason" },
          ])} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => downloadExcel("stock-movements")} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Export Excel
          </Button>
          {canIssue && (
            <Button onClick={() => setIssueOpen(true)} disabled={locations.length === 0 || (projects.length === 0 && departments.length === 0)}>
              <Plus className="h-4 w-4" /> Issue Materials
            </Button>
          )}
        </div>
      </div>

      <div className="text-body text-muted-foreground">
        {filtered.length} movements
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title={movements.length === 0 ? "No stock movements yet" : "No movements match the filters"}
          description={
            movements.length === 0
              ? "Receipts, transfers and issues will be logged here automatically as you use the procurement module."
              : "Try different filters."
          }
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden h-[calc(100vh-22rem)] min-h-[400px]">
          <SplitView
            storageKey="split-view-stock-movements"
            defaultListSize={55}
            list={
              <DataTable
                data={filtered}
                onRowClick={(m) => setSelected(m)}
                initialSort={{ key: "timestamp", direction: "desc" }}
                columns={movementColumns}
                searchable
                searchPlaceholder="Search by material, type, reference…"
                showTotals
                sumColumns={["qty"]}
                totalFormat={(_k, sum) => formatNumber(sum, 3)}
                hideable
                pageSize={50}
              />
            }
            detail={selected ? <MovementDetailPanel movement={selected} /> : null}
          />
        </div>
      )}

      <IssueMaterialsDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        locations={locations}
        projects={projects}
        departments={departments}
      />
    </div>
  );
}

/** Column definitions for the stock movements DataTable. */
const movementColumns: Column<StockMovementRow>[] = [
  {
    key: "timestamp",
    label: "Date",
    sortable: true,
    sortValue: (m) => new Date(m.timestamp),
    render: (m) => <span className="tnum text-muted-foreground">{formatDate(m.timestamp)}</span>,
  },
  {
    key: "materialName",
    label: "Material",
    sortable: true,
    render: (m) => (
      <div>
        <span className="font-medium text-foreground">{m.materialName}</span>
        <span className="ml-2 font-mono text-micro text-muted-foreground">{m.materialCode}</span>
      </div>
    ),
  },
  {
    key: "movementLabel",
    label: "Type",
    sortable: true,
    sortValue: (m) => m.movementType,
    render: (m) => (
      <Badge variant={MOVEMENT_VARIANT[m.movementType] ?? "muted"}>{m.movementLabel}</Badge>
    ),
  },
  {
    key: "fromLocationName",
    label: "From",
    sortable: true,
    render: (m) => <span className="text-muted-foreground">{m.fromLocationName ?? "—"}</span>,
  },
  {
    key: "toLocationName",
    label: "To",
    sortable: true,
    render: (m) => <span className="text-muted-foreground">{m.toLocationName ?? "—"}</span>,
  },
  {
    key: "qty",
    label: "Qty",
    align: "right",
    sortable: true,
    render: (m) => {
      const isIn = ["PURCHASE_RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN", "RETURN"].includes(m.movementType);
      const isOut = ["TRANSFER_OUT", "ISSUE_TO_PROJECT", "ISSUE_TO_DEPARTMENT", "ADJUSTMENT_OUT", "SALE"].includes(m.movementType);
      return (
        <span className={`tnum font-semibold ${isIn ? "text-success" : isOut ? "text-foreground" : "text-muted-foreground"}`}>
          {isIn ? "+" : isOut ? "−" : ""}{formatNumber(m.qty, 3)}
          <span className="ml-1 text-caption font-normal text-muted-foreground">{m.unit}</span>
        </span>
      );
    },
  },
  {
    key: "unitCost",
    label: "Unit Cost",
    align: "right",
    sortable: true,
    render: (m) => <span className="tnum text-muted-foreground">{formatCurrency(m.unitCost)}</span>,
  },
  {
    key: "balanceAfter",
    label: "Balance",
    align: "right",
    sortable: true,
    render: (m) => <span className="tnum text-muted-foreground">{formatNumber(m.balanceAfter, 3)}</span>,
  },
];

/** Inline detail panel for a single stock movement. */
function MovementDetailPanel({ movement }: { movement: StockMovementRow }) {
  const isIn = ["PURCHASE_RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN", "RETURN"].includes(movement.movementType);
  const isOut = ["TRANSFER_OUT", "ISSUE_TO_PROJECT", "ISSUE_TO_DEPARTMENT", "ADJUSTMENT_OUT", "SALE"].includes(movement.movementType);

  return (
    <div className="space-y-4 p-4">
      <div className="border-b border-border pb-3">
        <h2 className="text-title font-bold text-foreground">{movement.materialName}</h2>
        <p className="mt-0.5 font-mono text-caption text-muted-foreground">{movement.materialCode}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={MOVEMENT_VARIANT[movement.movementType] ?? "muted"}>{movement.movementLabel}</Badge>
        <span className="text-meta text-muted-foreground">{formatDate(movement.timestamp)}</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between border-b border-border/60 pb-1.5">
          <span className="text-label text-muted-foreground/70">Quantity</span>
          <span className={`tnum text-body font-semibold ${isIn ? "text-success" : isOut ? "text-foreground" : "text-muted-foreground"}`}>
            {isIn ? "+" : isOut ? "−" : ""}{formatNumber(movement.qty, 3)} {movement.unit}
          </span>
        </div>
        <div className="flex items-baseline justify-between border-b border-border/60 pb-1.5">
          <span className="text-label text-muted-foreground/70">Unit Cost</span>
          <span className="tnum text-body font-semibold text-foreground">{formatCurrency(movement.unitCost)}</span>
        </div>
        <div className="flex items-baseline justify-between border-b border-border/60 pb-1.5">
          <span className="text-label text-muted-foreground/70">Total Value</span>
          <span className="tnum text-body font-semibold text-foreground">{formatCurrency(movement.unitCost * movement.qty)}</span>
        </div>
        <div className="flex items-baseline justify-between border-b border-border/60 pb-1.5">
          <span className="text-label text-muted-foreground/70">From Location</span>
          <span className="text-body text-foreground">{movement.fromLocationName ?? "—"}</span>
        </div>
        <div className="flex items-baseline justify-between border-b border-border/60 pb-1.5">
          <span className="text-label text-muted-foreground/70">To Location</span>
          <span className="text-body text-foreground">{movement.toLocationName ?? "—"}</span>
        </div>
        <div className="flex items-baseline justify-between border-b border-border/60 pb-1.5">
          <span className="text-label text-muted-foreground/70">Balance After</span>
          <span className="tnum text-body font-semibold text-foreground">{formatNumber(movement.balanceAfter, 3)} {movement.unit}</span>
        </div>
        {movement.reason && (
          <div className="flex items-baseline justify-between border-b border-border/60 pb-1.5">
            <span className="text-label text-muted-foreground/70">Reason</span>
            <span className="text-body text-foreground">{movement.reason}</span>
          </div>
        )}
        {movement.refType && (
          <div className="flex items-baseline justify-between border-b border-border/60 pb-1.5">
            <span className="text-label text-muted-foreground/70">Reference</span>
            <span className="text-body text-foreground">{movement.refType}</span>
          </div>
        )}
        {movement.userName && (
          <div className="flex items-baseline justify-between border-b border-border/60 pb-1.5">
            <span className="text-label text-muted-foreground/70">Recorded By</span>
            <span className="text-body text-foreground">{movement.userName}</span>
          </div>
        )}
      </div>
    </div>
  );
}
