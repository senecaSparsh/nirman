"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { MetricGrid, Metric } from "@/components/page";
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
  const router = useRouter();
  const [locationFilter, setLocationFilter] = useState("");
  const filtered = useMemo(
    () => (locationFilter ? stock.filter((s) => s.locationId === locationFilter) : stock),
    [stock, locationFilter],
  );
  const totalValue = filtered.reduce((s, r) => s + r.value, 0);
  const totalQty = filtered.reduce((s, r) => s + r.qty, 0);
  const lowStockCount = filtered.filter((r) => r.qty <= 0).length;

  return (
    <div className="space-y-4">
      <MetricGrid cols={3}>
        <Metric label="Line Items" value={filtered.length} icon={<Boxes />} />
        <Metric label="Total Qty" value={formatNumber(totalQty, 3)} sub={`${locations.length} locations`} />
        <Metric label="Total Value" value={formatCurrency(totalValue)} tone="brand" sub={lowStockCount > 0 ? `${lowStockCount} out of stock` : undefined} />
      </MetricGrid>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="sm:max-w-xs"
          >
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.type === "COMPANY_WAREHOUSE" ? "Warehouse" : "Site"})
              </option>
            ))}
          </Select>
          <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-body text-muted-foreground">
          {filtered.length} line item{filtered.length !== 1 ? "s" : ""} · {formatCurrency(totalValue)}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-5 w-5" />}
          title="No stock recorded"
          description="Stock appears here once goods are received against purchase orders."
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
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
