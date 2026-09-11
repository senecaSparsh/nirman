"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Boxes, ChevronDown, AlertTriangle, SlidersHorizontal, ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { AdjustStockDialog } from "@/components/materials/adjust-stock-dialog";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";

import { DataTable, type Column } from "@/components/ui/data-table";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { StockLocationRow, StockRow } from "@/lib/types";

/**
 * On Hand tab — current stock levels with MAC and value.
 *
 * Previously grouped by location with divided lists. Now a flat
 * DataTable with a Location column — you can sort by value across
 * all locations, compare MAC between locations, and filter by
 * location with the dropdown. This is the enterprise pattern:
 * one dense, sortable grid instead of N separate lists.
 */
export function OnHandTab({ stock, locations, canManage = false }: { stock: StockRow[]; locations: StockLocationRow[]; canManage?: boolean }) {
  const router = useRouter();
  const [locationFilter, setLocationFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [lowStockIds, setLowStockIds] = useState<Set<string>>(new Set());

  // Adjust-stock dialog state
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustRow, setAdjustRow] = useState<StockRow | null>(null);

  // Fetch low-stock material IDs when the toggle is enabled
  useEffect(() => {
    if (!lowStockOnly) { setLowStockIds(new Set()); return; }
    fetch("/api/low-stock")
      .then((r) => r.json())
      .then((data: { id: string }[]) => {
        setLowStockIds(new Set(data.map((d) => d.id)));
      })
      .catch(() => setLowStockIds(new Set()));
  }, [lowStockOnly]);

  // Derive unique categories from stock data for the category filter
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of stock) {
      if (s.categoryName && !seen.has(s.categoryName)) {
        seen.set(s.categoryName, s.categoryName);
      }
    }
    return Array.from(seen.keys()).sort();
  }, [stock]);

  const filtered = useMemo(() => {
    let result = stock;
    if (locationFilter) result = result.filter((s) => s.locationId === locationFilter);
    if (categoryFilter) result = result.filter((s) => s.categoryName === categoryFilter);
    if (lowStockOnly) result = result.filter((s) => lowStockIds.has(s.materialId));
    return result;
  }, [stock, locationFilter, categoryFilter, lowStockOnly, lowStockIds]);

  const locationSelect = (
    <div className="shrink-0" style={{ width: 180 }}>
      <MobileSelectWithCreate
        label="Location"
        value={locationFilter}
        onChange={setLocationFilter}
        options={locations.map((l) => ({
          value: l.id,
          label: l.name,
          sub: l.type === "COMPANY_WAREHOUSE" ? "Warehouse" : "Site",
        }))}
        placeholder="All locations"
      />
    </div>
  );

  const categorySelect = (
    <div className="relative shrink-0" style={{ width: 160 }}>
      <select
        value={categoryFilter}
        onChange={(e) => setCategoryFilter(e.target.value)}
        style={{ width: 160 }}
        className="h-8 shrink-0 appearance-none rounded-md border border-input bg-card pl-2.5 pr-7 text-[13px] text-foreground transition-[border-color,box-shadow] hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
    </div>
  );

  const lowStockToggle = (
    <button
      type="button"
      onClick={() => setLowStockOnly(!lowStockOnly)}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-colors ${
        lowStockOnly
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-input bg-card text-muted-foreground hover:text-foreground"
      }`}
      title="Show only materials below their reorder point"
    >
      <AlertTriangle className="h-3.5 w-3.5" /> Low stock only
    </button>
  );

  return (
    <div className="space-y-4">
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-5 w-5" />}
          title="No stock recorded"
          description="Stock appears here once goods are received against purchase orders."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={filtered}
            initialSort={{ key: "value", direction: "desc" }}
            columns={stockColumns({
              onAdjust: (r) => { setAdjustRow(r); setAdjustOpen(true); },
              onCount: (r) => { router.push(`/stock?tab=counts&materialId=${r.materialId}&locationId=${r.locationId}`); },
              canManage,
            })}
            searchable
            searchPlaceholder="Search by code, material, location…"
            showTotals
            sumColumns={["qty", "value"]}
            totalFormat={(key, sum) => key === "value" ? formatCurrency(sum) : formatNumber(sum, 3)}
            hideable
            pageSize={50}
            toolbarLeading={<div className="flex items-center gap-2">{locationSelect}{categorySelect}{lowStockToggle}</div>}
          />
        </div>
      )}
      {adjustRow && (
        <AdjustStockDialog
          open={adjustOpen}
          onOpenChange={(o) => { setAdjustOpen(o); if (!o) setAdjustRow(null); }}
          material={{
            id: adjustRow.materialId,
            code: adjustRow.materialCode,
            name: adjustRow.materialName,
            unit: adjustRow.unit,
            currentCost: adjustRow.mac,
            isLotTracked: false,
          }}
          stockItems={[
            {
              locationId: adjustRow.locationId,
              locationName: adjustRow.locationName,
              locationType: adjustRow.locationType,
              qty: adjustRow.qty,
              movingAvgCost: adjustRow.mac,
            },
          ]}
          locations={locations.map((l) => ({
            id: l.id,
            name: l.name,
            type: l.type,
            projectName: l.projectName,
          }))}
        />
      )}
    </div>
  );
}

/** Column definitions for the stock on-hand DataTable. */
function stockColumns(actions: {
  onAdjust: (row: StockRow) => void;
  onCount: (row: StockRow) => void;
  canManage: boolean;
}): Column<StockRow>[] {
  return [
  {
    key: "materialCode",
    label: "Code",
    sortable: true,
    render: (r) => <span className="font-mono text-caption text-muted-foreground">{r.materialCode}</span>,
  },
  {
    key: "materialName",
    label: "Material",
    sortable: true,
    render: (r) => (
      <div>
        <div className="font-medium text-foreground">{r.materialName}</div>
        <div className="text-caption text-muted-foreground">{r.categoryName}</div>
      </div>
    ),
  },
  {
    key: "locationName",
    label: "Location",
    sortable: true,
    render: (r) => (
      <div className="flex items-center gap-2">
        <span>{r.locationName}</span>
        <Badge variant={r.locationType === "COMPANY_WAREHOUSE" ? "default" : "muted"} className="px-1 py-0 text-micro">
          {r.locationType === "COMPANY_WAREHOUSE" ? "WH" : "Site"}
        </Badge>
      </div>
    ),
  },
  {
    key: "qty",
    label: "Qty",
    align: "right",
    sortable: true,
    render: (r) => (
      <span className="tnum">
        {formatNumber(r.qty, 3)} <span className="text-caption font-normal text-muted-foreground">{r.unit}</span>
      </span>
    ),
  },
  {
    key: "mac",
    label: "MAC",
    align: "right",
    sortable: true,
    render: (r) => <span className="tnum text-muted-foreground">{formatCurrency(r.mac)}</span>,
  },
  {
    key: "value",
    label: "Value",
    align: "right",
    sortable: true,
    render: (r) => <span className="tnum font-semibold text-foreground">{formatCurrency(r.value)}</span>,
  },
  {
    key: "actions",
    label: "Actions",
    align: "right",
    sortable: false,
    render: (r) => (
      <div className="flex items-center justify-end gap-1">
        {actions.canManage && (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-caption font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            title="Adjust stock for this material at this location"
            onClick={(e) => {
              e.stopPropagation();
              actions.onAdjust(r);
            }}
          >
            <SlidersHorizontal className="size-3" /> Adjust
          </button>
        )}
        {actions.canManage && (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-caption font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            title="Start a stock count for this material at this location"
            onClick={(e) => {
              e.stopPropagation();
              actions.onCount(r);
            }}
          >
            <ClipboardCheck className="size-3" /> Count
          </button>
        )}
      </div>
    ),
  },
];
}
