"use client";

import { useMemo, useState } from "react";
import { Boxes, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";

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
export function OnHandTab({ stock, locations }: { stock: StockRow[]; locations: StockLocationRow[] }) {
  const [locationFilter, setLocationFilter] = useState("");
  const filtered = useMemo(
    () => (locationFilter ? stock.filter((s) => s.locationId === locationFilter) : stock),
    [stock, locationFilter],
  );

  const locationSelect = (
    <div className="relative shrink-0" style={{ width: 180 }}>
      <select
        value={locationFilter}
        onChange={(e) => setLocationFilter(e.target.value)}
        style={{ width: 180 }}
        className="h-8 shrink-0 appearance-none rounded-md border border-input bg-card pl-2.5 pr-7 text-[13px] text-foreground transition-[border-color,box-shadow] hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
      >
        <option value="">All locations</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} ({l.type === "COMPANY_WAREHOUSE" ? "Warehouse" : "Site"})
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
    </div>
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
            columns={stockColumns}
            searchable
            searchPlaceholder="Search by code, material, location…"
            showTotals
            sumColumns={["qty", "value"]}
            totalFormat={(key, sum) => key === "value" ? formatCurrency(sum) : formatNumber(sum, 3)}
            hideable
            pageSize={50}
            toolbarLeading={locationSelect}
          />
        </div>
      )}
    </div>
  );
}

/** Column definitions for the stock on-hand DataTable. */
const stockColumns: Column<StockRow>[] = [
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
];
