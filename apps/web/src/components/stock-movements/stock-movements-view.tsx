"use client";

import { useMemo, useState } from "react";
import { Package, Download, FileSpreadsheet, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
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
  const canIssue = permissions?.canIssue ?? false;
  const [typeFilter, setTypeFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [selected, setSelected] = useState<StockMovementRow | null>(null);

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      if (typeFilter && m.movementType !== typeFilter) return false;
      if (locationFilter && m.fromLocationId !== locationFilter && m.toLocationId !== locationFilter) return false;
      return true;
    });
  }, [movements, typeFilter, locationFilter]);

  // Extract the type + location filters so they can be reused in the
  // DataTable toolbar without TypeScript narrowing issues.
  const typeSelect = (
    <div className="relative shrink-0" style={{ width: 150 }}>
      <select
        value={typeFilter}
        onChange={(e) => setTypeFilter(e.target.value)}
        style={{ width: 150 }}
        className="h-8 shrink-0 appearance-none rounded-md border border-input bg-card pl-2.5 pr-7 text-[13px] text-foreground transition-[border-color,box-shadow] hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
      >
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
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
    </div>
  );
  const locationSelect = (
    <div className="relative shrink-0" style={{ width: 160 }}>
      <select
        value={locationFilter}
        onChange={(e) => setLocationFilter(e.target.value)}
        style={{ width: 160 }}
        className="h-8 shrink-0 appearance-none rounded-md border border-input bg-card pl-2.5 pr-7 text-[13px] text-foreground transition-[border-color,box-shadow] hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
      >
        <option value="">All locations</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
    </div>
  );
  const trailingButtons = (
    <>
      {/* Export CSV (icon-only) */}
      <div className="group relative">
        <button
          onClick={() => downloadCSV(`stock-movements-${new Date().toISOString().slice(0,10)}.csv`, filtered as unknown as Record<string, unknown>[], [
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
          ])}
          disabled={filtered.length === 0}
          className="inline-flex h-7 items-center justify-center rounded-md border border-input bg-card px-2 text-caption font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Download className="size-3.5" />
        </button>
        <span className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] text-background opacity-0 transition-opacity group-hover:opacity-100 z-50">
          Export CSV
        </span>
      </div>
      {/* Export Excel (icon-only) */}
      <div className="group relative">
        <button
          onClick={() => downloadExcel("stock-movements")}
          disabled={filtered.length === 0}
          className="inline-flex h-7 items-center justify-center rounded-md border border-input bg-card px-2 text-caption font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <FileSpreadsheet className="size-3.5" />
        </button>
        <span className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] text-background opacity-0 transition-opacity group-hover:opacity-100 z-50">
          Export Excel
        </span>
      </div>
    </>
  );

  return (
    <div className="space-y-5">
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
        <div className="rounded-lg border border-border overflow-hidden">
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
            onAddRow={canIssue && locations.length > 0 && (projects.length > 0 || departments.length > 0) ? () => setIssueOpen(true) : undefined}
            addRowLabel="Issue Materials"
            toolbarLeading={
              <div className="flex w-fit shrink-0 items-center gap-2">
                {typeSelect}
                {locationSelect}
              </div>
            }
            toolbarTrailing={trailingButtons}
          />
        </div>
      )}

      {selected && (
        <Dialog
          open={!!selected}
          onOpenChange={(o) => { if (!o) setSelected(null); }}
          title={selected.materialName}
          description={selected.materialCode}
          size="md"
        >
          <MovementDetailPanel movement={selected} />
        </Dialog>
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
