"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Home, Pencil, ArrowRight, Hammer, Pause, Trash2,
  LayoutGrid, Rows3, TrendingDown,
  CircleDollarSign, Building2, Layers, SearchX,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { IdentityCell, MoneyCell, QtyCell } from "@/components/ui/cells";
import { EmptyState } from "@/components/empty-state";
import {
  statusColor, StatusPill,
} from "@/components/page";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BuiltUnitFormDialog } from "./built-unit-form-dialog";
import { PurchaseUnitDialog } from "./purchase-unit-dialog";
import { BuiltUnitEditDialog } from "./built-unit-edit-dialog";
import { UnitValuationDialog } from "./unit-valuation-dialog";
import { SellAssetDialog } from "@/components/sales/sell-asset-dialog";
import { formatCurrency, formatNumber, formatDate, cn } from "@/lib/utils";
import type {
  BuiltUnitRow, BuiltUnitType, BuiltUnitStatus,
  ProjectOption, PhaseOption, SellableAssetRow,
} from "@/lib/types";

// ════════════════════════════════════════════════════════════════
//  Constants
// ════════════════════════════════════════════════════════════════

const STATUS_LABELS: Record<BuiltUnitStatus, string> = {
  PLANNED: "Planned",
  UNDER_CONSTRUCTION: "Construction",
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  HOLD: "Hold",
  SOLD: "Sold",
  RENTED: "Rented",
};

const UNIT_TYPE_LABELS: Record<BuiltUnitType, string> = {
  BHK_1: "1 BHK", BHK_2: "2 BHK", BHK_3: "3 BHK", BHK_4: "4 BHK",
  SHOP: "Shop", OFFICE: "Office", WAREHOUSE_UNIT: "Warehouse", VILLA: "Villa", OTHER: "Other",
};

const VALID_TRANSITIONS: Record<BuiltUnitStatus, BuiltUnitStatus[]> = {
  PLANNED: ["UNDER_CONSTRUCTION"],
  UNDER_CONSTRUCTION: ["AVAILABLE", "PLANNED"],
  AVAILABLE: ["RESERVED", "HOLD", "UNDER_CONSTRUCTION"],
  RESERVED: ["AVAILABLE", "SOLD"],
  HOLD: ["AVAILABLE"],
  SOLD: [],
  RENTED: ["AVAILABLE"],
};

// ── Derived figures, defined once ──────────────────────────────────
// Every one of these is a question a sales manager asks of the whole
// list ("which unit has the thinnest margin?"), so they have to be
// sortable columns rather than facts buried in a card.

const marginOf = (u: BuiltUnitRow): number | null =>
  u.askingPrice != null ? u.askingPrice - u.productionCost : null;

const pricePerSqftOf = (u: BuiltUnitRow): number | null => {
  // RERA: use superBuiltUpArea (saleable area) for pricing, fall back to area
  const pricingArea = u.superBuiltUpArea ?? u.area;
  return u.askingPrice != null && pricingArea > 0 ? u.askingPrice / pricingArea : null;
};

/**
 * Unit numbers are strings that people read as numbers — "A-10" must
 * sort after "A-9". The table sorts with plain `<`, so we hand it a
 * zero-padded key instead of the raw label.
 */
const unitSortKey = (u: BuiltUnitRow): string =>
  u.unitNumber.replace(/\d+/g, (d) => d.padStart(8, "0"));

/** The spatial detail that disambiguates two units of the same type. */
const placeOf = (u: BuiltUnitRow): string =>
  [u.floor != null ? `Floor ${u.floor}` : null, u.wing ? `Wing ${u.wing}` : null]
    .filter(Boolean)
    .join(" · ");

// ════════════════════════════════════════════════════════════════
//  Main component
// ════════════════════════════════════════════════════════════════

export function BuiltUnitsView({
  units: serverUnits,
  projects,
  phases,
  customers,
  permissions,
}: {
  units: BuiltUnitRow[];
  projects: ProjectOption[];
  phases: PhaseOption[];
  customers?: { id: string; name: string }[];
  permissions?: { canCreate?: boolean; canEdit?: boolean; canSell?: boolean };
}) {
  const canCreate = permissions?.canCreate ?? false;
  const canEdit = permissions?.canEdit ?? false;
  const canSell = permissions?.canSell ?? false;
  const router = useRouter();

  // ── Optimistic local state — mirrors server data, updates instantly ──
  const [units, setUnits] = useState<BuiltUnitRow[]>(serverUnits);
  const [actingId, setActingId] = useState<string | null>(null);

  // Sync from server when the server data changes (e.g. navigation, revalidation)
  // but DON'T overwrite during an active mutation (actingId) to avoid flicker.
  useEffect(() => {
    if (actingId === null) setUnits(serverUnits);
  }, [serverUnits, actingId]);

  /**
   * The table is the default. A grid of unit cards cannot answer the
   * questions this page exists for — which units are still unsold, what
   * each is worth against what it cost, which one is being sold below
   * cost — because those are comparisons down a column. The gallery
   * survives for the one job it does better: sitting beside a buyer and
   * walking a floor.
   */
  const [view, setView] = useState<"table" | "gallery">("table");

  const [formOpen, setFormOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BuiltUnitRow | null>(null);
  const [valuating, setValuating] = useState<BuiltUnitRow | null>(null);
  const [delTarget, setDelTarget] = useState<BuiltUnitRow | null>(null);
  const [sellTarget, setSellTarget] = useState<BuiltUnitRow | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<{ unit: BuiltUnitRow; target: BuiltUnitStatus } | null>(null);

  // Auto-open dialog when navigated with ?unit={id}&action=valuate|sell
  const searchParams = useSearchParams();
  useEffect(() => {
    const unitId = searchParams.get("unit");
    const action = searchParams.get("action");
    if (unitId && units.length > 0) {
      const unit = units.find((u) => u.id === unitId);
      if (unit) {
        if (action === "sell" && canSell) setSellTarget(unit);
        else if (action === "valuate") setValuating(unit);
      }
    }
  }, [searchParams, units, canSell]);

  // ── Silent background sync — refreshes server data without layout shift ──
  // Uses router.refresh() but only when no dialog is open and no mutation is
  // in flight, so the user never sees a loading flash.
  const syncFromServer = useCallback(() => {
    router.refresh();
  }, [router]);

  // ── Full set — filtering is now handled inside the DataTable ──
  const filtered = units;

  // ── Portfolio metrics ──
  const portfolio = useMemo(() => {
    const available = units.filter((u) => u.status === "AVAILABLE");
    // "Sold" = has an active sale (unit may be RESERVED during staged sale flow)
    const sold = units.filter((u) => u.saleId != null);
    const sellableValue = available.reduce((s, u) => s + (u.askingPrice ?? 0), 0);
    const realizedRevenue = sold.reduce((s, u) => s + (u.askingPrice ?? u.currentValuation), 0);
    const avgPricePerSqft = available.length > 0
      ? available.reduce((s, u) => s + ((u.askingPrice ?? 0) / Math.max(u.area, 1)), 0) / available.length
      : 0;
    const salesVelocity = units.length > 0
      ? (sold.length / units.length) * 100
      : 0;
    return {
      availableCount: available.length,
      sellableValue,
      realizedRevenue,
      avgPricePerSqft,
      salesVelocity,
      soldCount: sold.length,
    };
  }, [units]);

  /**
   * Summing area is only honest when every row measures in the same
   * unit — a total of "1,200 SQFT + 90 SQM" is a lie. So the footer
   * total for area appears only when the filtered set agrees.
   */
  const uniformAreaUnit = useMemo(() => {
    const units_ = new Set(filtered.map((u) => u.areaUnit));
    return units_.size === 1 ? [...units_][0] : null;
  }, [filtered]);

  const sumColumns = useMemo(
    () => [
      ...(uniformAreaUnit ? ["area"] : []),
      "productionCost", "currentValuation", "askingPrice", "margin", "nrvWriteDown",
    ],
    [uniformAreaUnit],
  );

  // ── Group by project → by floor (spatial grouping, gallery only) ──
  const grouped = useMemo(() => {
    const projectMap = new Map<string, { name: string; units: BuiltUnitRow[] }>();
    // The gallery reads as a walkthrough, so units keep their natural
    // building order rather than whatever the table was last sorted by.
    const ordered = [...filtered].sort((a, b) =>
      a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }),
    );
    for (const u of ordered) {
      const existing = projectMap.get(u.projectId);
      if (existing) existing.units.push(u);
      else projectMap.set(u.projectId, { name: u.projectName, units: [u] });
    }
    return Array.from(projectMap.entries()).map(([id, g]) => {
      // Sub-group by floor within project
      const floorMap = new Map<string, BuiltUnitRow[]>();
      for (const u of g.units) {
        const floorKey = u.floor != null ? `Floor ${u.floor}` : "Unassigned";
        const arr = floorMap.get(floorKey);
        if (arr) arr.push(u);
        else floorMap.set(floorKey, [u]);
      }
      const floors = Array.from(floorMap.entries())
        .sort(([a], [b]) => {
          if (a === "Unassigned") return 1;
          if (b === "Unassigned") return -1;
          const na = parseInt(a.replace(/\D/g, ""));
          const nb = parseInt(b.replace(/\D/g, ""));
          return na - nb;
        })
        .map(([floorLabel, floorUnits]) => ({ floorLabel, units: floorUnits }));

      const gStatusCounts: Record<BuiltUnitStatus, number> = {
        PLANNED: 0, UNDER_CONSTRUCTION: 0, AVAILABLE: 0, RESERVED: 0, HOLD: 0, SOLD: 0, RENTED: 0,
      };
      for (const u of g.units) gStatusCounts[u.status]++;
      return {
        id,
        name: g.name,
        units: g.units,
        floors,
        statusCounts: gStatusCounts,
        value: g.units.reduce((s, u) => s + (u.askingPrice ?? 0), 0),
      };
    });
  }, [filtered]);

  // ── Status change ──
  async function changeStatus(unit: BuiltUnitRow, newStatus: BuiltUnitStatus) {
    setActingId(unit.id);
    // Optimistic: update local state immediately
    setUnits((prev) => prev.map((u) =>
      u.id === unit.id ? { ...u, status: newStatus } : u
    ));
    try {
      const res = await fetch(`/api/built-units/${unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Status change failed");
      toast.success(`Unit ${unit.unitNumber} → ${STATUS_LABELS[newStatus]}`);
      // Silent background sync — no layout shift
      syncFromServer();
    } catch (err: unknown) {
      // Revert on failure
      setUnits((prev) => prev.map((u) =>
        u.id === unit.id ? { ...u, status: unit.status } : u
      ));
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setActingId(null);
    }
  }

  // Convert a BuiltUnitRow into the SellableAssetRow shape the SellAssetDialog expects.
  function toSellableAsset(u: BuiltUnitRow): SellableAssetRow {
    return {
      assetType: "BUILT_UNIT",
      assetId: u.id,
      label: `Unit ${u.unitNumber} (${UNIT_TYPE_LABELS[u.unitType]}) — ${formatNumber(u.area, 0)} ${u.areaUnit}`,
      projectId: u.projectId,
      projectName: u.projectName,
      costBasis: u.productionCost,
      askingPrice: u.askingPrice,
      currentValuation: u.currentValuation,
    };
  }

  function renderTransitionButtons(unit: BuiltUnitRow) {
    return (VALID_TRANSITIONS[unit.status] ?? []).map((target) => {
      const config = TRANSITION_BUTTON_CONFIG[target];
      if (!config) return null;
      return (
        <Button
          key={target}
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            if (target === "SOLD" || target === "RENTED") {
              setStatusConfirm({ unit, target });
            } else {
              changeStatus(unit, target);
            }
          }}
          disabled={actingId === unit.id}
          title={config.title}
          aria-label={config.title}
        >
          <config.icon className="h-3.5 w-3.5" />
        </Button>
      );
    });
  }

  /**
   * Per-row actions. Identical set to the card footer — transitions,
   * sell, edit, re-valuate, delete — so nothing is lost by defaulting
   * to the table.
   */
  function rowActions(u: BuiltUnitRow) {
    const isSold = u.status === "SOLD";
    return (
      <>
        {canEdit && !isSold && renderTransitionButtons(u)}
        {u.status === "AVAILABLE" && canSell && (
          <Button
            variant="brand"
            size="sm"
            className="h-7"
            onClick={() => setSellTarget(u)}
            disabled={actingId === u.id}
            title="Sell unit"
          >
            <CircleDollarSign className="h-3.5 w-3.5" /> Sell
          </Button>
        )}
        {canEdit && (u.status === "PLANNED" || u.status === "UNDER_CONSTRUCTION") && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditTarget(u)} disabled={actingId === u.id} title="Edit unit">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {canEdit && !isSold && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setValuating(u)} disabled={actingId === u.id} title="Edit valuation">
            <CircleDollarSign className="h-3.5 w-3.5" />
          </Button>
        )}
        {canEdit && u.status === "PLANNED" && (
          <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-danger" onClick={() => setDelTarget(u)} disabled={actingId === u.id} title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
        {isSold && u.saleId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => { window.location.href = `/sales`; }}
            title="View sale"
          >
            Sale <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </>
    );
  }

  // ── Extracted toolbar pieces (reused by both table and gallery views) ──
  const viewToggle = (
    <Segmented
      value={view}
      onChange={setView}
      iconOnly
      options={[
        { value: "table", label: "Table", icon: <Rows3 /> },
        { value: "gallery", label: "Gallery", icon: <LayoutGrid /> },
      ]}
    />
  );

  const trailingButtons = (
    <>
      {canCreate && units.length > 0 && (
        <>
          <Button variant="outline" onClick={() => setPurchaseOpen(true)} disabled={projects.length === 0}>
            <ShoppingCart className="h-4 w-4" /> Purchase unit
          </Button>
          <Button onClick={() => setFormOpen(true)} disabled={projects.length === 0}>
            <Plus className="h-4 w-4" /> New unit
          </Button>
        </>
      )}
    </>
  );

  const noMatch = (
    <EmptyState
      size="compact"
      icon={<SearchX />}
      title="No units match these filters"
      description="Widen the search, or clear the column filters to see the whole inventory again."
    />
  );

  return (
    <div className="space-y-4">
      {/* ════════════════════════════════════════════════════════════
          1. Title
          ════════════════════════════════════════════════════════════ */}
      <div className="min-w-0">
        <h1 className="text-title text-foreground">Built Units</h1>
        <p className="mt-0.5 text-meta text-muted-foreground">
          Sellable units within projects — status, valuation, and NRV write-downs.
        </p>
      </div>

      {/* ════════════════════════════════════════════════════════════
          4. Content
          ════════════════════════════════════════════════════════════ */}
      {units.length === 0 ? (
        <EmptyState
          icon={<Home />}
          title="No built units yet"
          description={
            projects.length === 0
              ? "A unit lives inside a project. Create a project first, then add the flats, shops or villas that will be sold from it."
              : "Add the flats, shops or villas this project will sell. Each one carries its own cost, valuation and margin."
          }
          hint="Production cost is allocated per sq ft from project spend, so a unit's margin appears as soon as materials are issued."
          action={
            projects.length > 0 && canCreate ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPurchaseOpen(true)}>
                  <ShoppingCart className="h-4 w-4" /> Purchase unit
                </Button>
                <Button onClick={() => setFormOpen(true)}>
                  <Plus className="h-4 w-4" /> New unit
                </Button>
              </div>
            ) : undefined
          }
          contactHint={
            canCreate
              ? "Create a project first — units are added inside one."
              : "Ask a manager to add built units."
          }
        />
      ) : view === "table" ? (
        /*
         * The register. Sorted by margin so the units losing money — the
         * ones priced under what they cost to build — are the first thing
         * a sales manager sees, not something they'd have to hunt for by
         * opening twenty cards.
         */
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={filtered}
            storageKey="built-units"
            hideable
            freezeFirstColumn
            exportFileName="built-units"
            initialSort={{ key: "margin", direction: "desc" }}
            onRowClick={(u) => setValuating(u)}
            searchable
            searchPlaceholder="Search unit, wing, phase…"
            toolbarLeading={viewToggle}
            toolbarTrailing={trailingButtons}
            showTotals
            sumColumns={sumColumns}
            totalFormat={(key, sum) => (key === "area" ? formatNumber(sum, 0) : formatCurrency(sum))}
            groupBy={{ key: "projectId", label: (u) => u.projectName }}
            rowTone={(u) => {
              // A write-down or a below-cost price is real money lost;
              // an available unit with no asking price cannot be sold at
              // all, which is the cheapest of the three to fix.
              if (u.nrvWriteDown > 0) return "danger";
              const m = marginOf(u);
              if (m != null && m < 0) return "danger";
              if (u.status === "AVAILABLE" && u.askingPrice == null) return "warning";
              return null;
            }}
            rowActions={rowActions}
            emptyState={noMatch}
            columns={[
              {
                key: "unitNumber",
                label: "Unit",
                sortable: true,
                width: "220px",
                sortValue: unitSortKey,
                render: (u) => (
                  <IdentityCell
                    name={u.unitNumber}
                    sub={[UNIT_TYPE_LABELS[u.unitType], placeOf(u)].filter(Boolean).join(" · ")}
                    dot={statusColor(u.status)}
                  />
                ),
                exportValue: (u) => u.unitNumber,
              },
              {
                key: "projectName",
                label: "Project",
                sortable: true,
                filterable: true,
                width: "180px",
                render: (u) => (
                  <IdentityCell name={u.projectName} sub={u.phaseName ?? undefined} icon={<Building2 />} />
                ),
                filterValue: (u) => u.projectName,
              },
              {
                key: "status",
                label: "Status",
                sortable: true,
                filterable: true,
                render: (u) => (
                  <div className="flex items-center gap-1.5">
                    <StatusPill status={u.status} />
                    {u.originType === "PURCHASED" && (
                      <span className="text-micro px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                        Purchased
                      </span>
                    )}
                  </div>
                ),
                filterValue: (u) => `${STATUS_LABELS[u.status]}${u.originType === "PURCHASED" ? " Purchased" : ""}`,
              },
              {
                key: "unitType",
                label: "Type",
                sortable: true,
                filterable: true,
                defaultHidden: true,
                render: (u) => UNIT_TYPE_LABELS[u.unitType],
                exportValue: (u) => UNIT_TYPE_LABELS[u.unitType],
                filterValue: (u) => UNIT_TYPE_LABELS[u.unitType],
              },
              {
                key: "phaseName",
                label: "Phase",
                sortable: true,
                defaultHidden: true,
                sortValue: (u) => u.phaseName ?? "",
                render: (u) => u.phaseName ?? <span className="text-faint">—</span>,
              },
              {
                key: "place",
                label: "Floor / wing",
                sortable: true,
                defaultHidden: true,
                // Unassigned floors sort last rather than as "floor zero".
                sortValue: (u) => u.floor ?? Number.MAX_SAFE_INTEGER,
                render: (u) => placeOf(u) || <span className="text-faint">—</span>,
                exportValue: (u) => placeOf(u),
              },
              {
                key: "area",
                label: "Area",
                align: "right",
                sortable: true,
                hint: "Sellable area. This is the basis on which project cost is allocated to the unit.",
                render: (u) => <QtyCell value={formatNumber(u.area, 0)} unit={u.areaUnit} />,
                exportValue: (u) => u.area,
              },
              {
                key: "productionCost",
                label: "Cost to build",
                align: "right",
                sortable: true,
                hint: "Allocated project cost (₹ per sq ft × area) plus anything issued directly to this unit.",
                render: (u) =>
                  u.productionCost > 0
                    ? <MoneyCell value={u.productionCost} formatted={formatCurrency(u.productionCost)} neutral />
                    : <span className="text-faint">—</span>,
                exportValue: (u) => u.productionCost,
              },
              {
                key: "currentValuation",
                label: "Valuation",
                align: "right",
                sortable: true,
                hint: "Latest carrying value. A write-down means the market moved below cost.",
                render: (u) => (
                  <MoneyCell
                    value={u.currentValuation}
                    formatted={formatCurrency(u.currentValuation)}
                    neutral
                    sub={u.nrvWriteDown > 0 ? `${formatCurrency(u.nrvWriteDown)} written down` : undefined}
                  />
                ),
                exportValue: (u) => u.currentValuation,
              },
              {
                key: "askingPrice",
                label: "Asking",
                align: "right",
                sortable: true,
                hint: "The price quoted to a buyer. An available unit without one cannot be sold.",
                sortValue: (u) => u.askingPrice ?? 0,
                render: (u) =>
                  u.askingPrice != null ? (
                    <MoneyCell value={u.askingPrice} formatted={formatCurrency(u.askingPrice)} neutral />
                  ) : (
                    <span className="italic text-faint">Not set</span>
                  ),
                exportValue: (u) => u.askingPrice ?? "",
              },
              {
                key: "salePrice",
                label: "Sold Price",
                align: "right",
                sortable: true,
                sortValue: (u) => u.salePrice ?? 0,
                render: (u) =>
                  u.salePrice != null ? (
                    <MoneyCell value={u.salePrice} formatted={formatCurrency(u.salePrice)} />
                  ) : (
                    <span className="text-faint">—</span>
                  ),
                exportValue: (u) => u.salePrice ?? "",
              },
              {
                key: "saleProfit",
                label: "Profit",
                align: "right",
                sortable: true,
                sortValue: (u) => u.saleProfit ?? 0,
                render: (u) =>
                  u.saleProfit != null ? (
                    <MoneyCell value={u.saleProfit} formatted={`${u.saleProfit >= 0 ? "+" : ""}${formatCurrency(u.saleProfit)}`} showSign />
                  ) : (
                    <span className="text-faint">—</span>
                  ),
                exportValue: (u) => u.saleProfit ?? "",
              },
              {
                key: "customerName",
                label: "Buyer",
                render: (u) =>
                  u.customerName ? (
                    <span className="text-foreground">{u.customerName}</span>
                  ) : (
                    <span className="text-faint">—</span>
                  ),
                exportValue: (u) => u.customerName ?? "",
              },
              {
                key: "saleDate",
                label: "Sale Date",
                sortable: true,
                sortValue: (u) => (u.saleDate ? new Date(u.saleDate).getTime() : 0),
                render: (u) =>
                  u.saleDate ? (
                    <span className="tnum text-muted-foreground">{formatDate(u.saleDate)}</span>
                  ) : (
                    <span className="text-faint">—</span>
                  ),
                exportValue: (u) => (u.saleDate ? formatDate(u.saleDate) : ""),
              },
              {
                key: "margin",
                label: "Margin",
                align: "right",
                sortable: true,
                bar: true,
                hint: "Asking price less cost to build. The percentage is on cost.",
                // Unpriced units sort as zero rather than as a huge
                // negative, so they don't drown the genuinely loss-making
                // ones at the bottom of the list — and so the footer total
                // stays a real number.
                sortValue: (u) => marginOf(u) ?? 0,
                render: (u) => {
                  const m = marginOf(u);
                  if (m == null) return <span className="text-faint">—</span>;
                  return (
                    <MoneyCell
                      value={m}
                      formatted={formatCurrency(m)}
                      showSign
                      sub={u.productionCost > 0 ? `${((m / u.productionCost) * 100).toFixed(0)}% on cost` : undefined}
                    />
                  );
                },
                exportValue: (u) => marginOf(u) ?? "",
              },
              {
                key: "pricePerSqft",
                label: "₹ / sq ft",
                align: "right",
                sortable: true,
                hint: "Asking price ÷ area — the rate a buyer actually negotiates on.",
                sortValue: (u) => pricePerSqftOf(u) ?? 0,
                render: (u) => {
                  const psf = pricePerSqftOf(u);
                  return psf != null
                    ? <QtyCell value={formatNumber(psf, 0)} unit={`/${u.areaUnit.toLowerCase()}`} />
                    : <span className="text-faint">—</span>;
                },
                exportValue: (u) => pricePerSqftOf(u) ?? "",
              },
              {
                key: "nrvWriteDown",
                label: "NRV write-down",
                align: "right",
                sortable: true,
                defaultHidden: true,
                hint: "Impairment booked because net realisable value fell below cost.",
                render: (u) =>
                  u.nrvWriteDown > 0
                    ? <span className="font-semibold text-danger">{formatCurrency(u.nrvWriteDown)}</span>
                    : <span className="text-faint">—</span>,
                exportValue: (u) => u.nrvWriteDown,
              },
            ]}
          />
        </div>
      ) : filtered.length === 0 ? (
        noMatch
      ) : (
        /* ── Gallery: project → floor → cards ──
           Kept because it answers one thing a table can't: standing in
           front of a buyer, pointing at the floor they're asking about. */
        <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {viewToggle}
          </div>
          <div className="flex items-center gap-1.5">
            {trailingButtons}
          </div>
        </div>
        <div className="space-y-5">
          {grouped.map((group) => {
            return (
            <div key={group.id} className="space-y-3">
              {/* Project header */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border pb-2.5">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-body font-semibold text-foreground">{group.name}</h2>
                  <span className="text-caption text-muted-foreground tnum">{group.units.length} units</span>
                </div>
                {group.value > 0 && (
                  <span className="ml-auto text-caption text-muted-foreground">
                    <span className="tnum font-medium text-foreground">{formatCurrency(group.value)}</span> total asking
                  </span>
                )}
              </div>

              {/* Floor sections */}
              {group.floors.map((floor) => (
                <div key={floor.floorLabel} className="space-y-2">
                  {/* Floor label — always show for spatial context */}
                  <div className="flex items-center gap-2 px-1">
                    <Layers className="h-3 w-3 text-muted-foreground/60" />
                    <span className="text-label text-muted-foreground/70">{floor.floorLabel}</span>
                    <span className="text-micro text-muted-foreground/50 tnum">{floor.units.length}</span>
                    <div className="ml-1 h-px flex-1 bg-border/40" />
                  </div>

                  {/* Unit cards */}
                  <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {floor.units.map((u) => (
                      <UnitCard
                        key={u.id}
                        unit={u}
                        canEdit={canEdit}
                        canSell={canSell}
                        acting={actingId === u.id}
                        marginVal={marginOf(u)}
                        pricePerSqftVal={pricePerSqftOf(u)}
                        onValuate={setValuating}
                        onEdit={setEditTarget}
                        onDelete={setDelTarget}
                        onSell={setSellTarget}
                        renderTransitions={renderTransitionButtons}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            );
          })}
        </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════
          Dialogs
          ════════════════════════════════════════════════════════════ */}
      <BuiltUnitFormDialog open={formOpen} onOpenChange={setFormOpen} projects={projects} phases={phases} />
      <PurchaseUnitDialog open={purchaseOpen} onOpenChange={setPurchaseOpen} projects={projects} onPurchased={() => window.location.reload()} />
      <BuiltUnitEditDialog
        open={editTarget !== null}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        unit={editTarget}
        onUpdated={(unitId, updates) => {
          // Optimistic: update local state immediately
          setUnits((prev) => prev.map((u) =>
            u.id === unitId
              ? {
                ...u,
                unitType: updates.unitType,
                unitNumber: updates.unitNumber,
                floor: updates.floor,
                wing: updates.wing,
                area: updates.area,
                areaUnit: updates.areaUnit,
                askingPrice: updates.askingPrice,
              }
              : u
          ));
          setEditTarget(null);
        }}
      />
      <UnitValuationDialog
        open={valuating !== null}
        onOpenChange={(o) => !o && setValuating(null)}
        unit={valuating}
        canEdit={canEdit}
        onValuationUpdated={(unitId, updates) => {
          // Optimistic: update local state immediately
          setUnits((prev) => prev.map((u) =>
            u.id === unitId
              ? { ...u, askingPrice: updates.askingPrice, currentValuation: updates.currentValuation }
              : u
          ));
          setValuating(null);
        }}
        onStatusChanged={(unitId, newStatus) => {
          // Optimistic: update local state immediately
          setUnits((prev) => prev.map((u) =>
            u.id === unitId ? { ...u, status: newStatus } : u
          ));
          setValuating(null);
        }}
      />
      {delTarget && (
        <DeleteConfirmDialog
          open={Boolean(delTarget)}
          onOpenChange={(o) => { if (!o) setDelTarget(null); }}
          endpoint={`/api/built-units/${delTarget.id}`}
          title="Delete built unit"
          description={`Delete unit "${delTarget.unitNumber}"? Only units in PLANNED status can be deleted.`}
          successMessage="Unit deleted"
          onSuccess={() => {
            // Optimistic: remove from local state immediately
            const targetId = delTarget.id;
            setUnits((prev) => prev.filter((u) => u.id !== targetId));
            setDelTarget(null);
          }}
        />
      )}
      <ConfirmDialog
        open={statusConfirm !== null}
        onOpenChange={(o) => { if (!o) setStatusConfirm(null); }}
        title={statusConfirm?.target === "SOLD" ? "Mark unit as sold?" : "Mark unit as rented?"}
        description={
          statusConfirm?.target === "SOLD"
            ? `This will mark unit "${statusConfirm.unit.unitNumber}" as SOLD. This should only be done after a sale is recorded. Continue?`
            : `This will mark unit "${statusConfirm?.unit.unitNumber}" as RENTED. This should only be done after a tenancy is created. Continue?`
        }
        confirmLabel={statusConfirm?.target === "SOLD" ? "Mark Sold" : "Mark Rented"}
        onConfirm={() => {
          if (statusConfirm) changeStatus(statusConfirm.unit, statusConfirm.target);
        }}
      />
      {canSell && sellTarget && (
        <SellAssetDialog
          open={sellTarget !== null}
          onOpenChange={(o) => { if (!o) setSellTarget(null); }}
          customers={customers ?? []}
          presetAsset={toSellableAsset(sellTarget)}
          onSold={(assetId) => {
            // Optimistic: the sellAsset service already marks the unit SOLD,
            // so we mirror that locally. saleId will be set on server refresh.
            setUnits((prev) => prev.map((u) =>
              u.id === assetId ? { ...u, status: "SOLD" as BuiltUnitStatus } : u
            ));
            setSellTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Unit card — a property listing card, for the gallery view
// ════════════════════════════════════════════════════════════════
function UnitCard({
  unit: u, canEdit, canSell, acting, marginVal, pricePerSqftVal,
  onValuate, onEdit, onDelete, onSell, renderTransitions,
}: {
  unit: BuiltUnitRow;
  canEdit: boolean;
  canSell: boolean;
  acting: boolean;
  marginVal: number | null;
  pricePerSqftVal: number | null;
  onValuate: (u: BuiltUnitRow) => void;
  onEdit: (u: BuiltUnitRow) => void;
  onDelete: (u: BuiltUnitRow) => void;
  onSell: (u: BuiltUnitRow) => void;
  renderTransitions: (u: BuiltUnitRow) => React.ReactNode[];
}) {
  const isSold = u.status === "SOLD";
  const isAvailable = u.status === "AVAILABLE";
  const hasTransitions = (VALID_TRANSITIONS[u.status] ?? []).length > 0;
  const canEditUnit = u.status === "PLANNED" || u.status === "UNDER_CONSTRUCTION";

  return (
    <div
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-card transition-all hover:shadow-md hover:shadow-foreground/5",
        isSold
          ? "opacity-55 hover:opacity-75"
          : "hover:border-foreground/20 hover:-translate-y-0.5",
      )}
      onClick={() => onValuate(u)}
    >
      {/* Status accent — left edge */}
      <div className="absolute left-0 top-0 h-full w-1 shrink-0" style={{ backgroundColor: statusColor(u.status) }} />

      <div className="flex flex-1 flex-col px-2.5 py-2 pl-3.5">
        {/* Header: unit number + status badge */}
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <div className={cn("text-caption font-bold text-foreground", isSold && "line-through decoration-danger/40")}>
              {u.unitNumber}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-micro text-muted-foreground">
              <span>{UNIT_TYPE_LABELS[u.unitType]}</span>
              {(u.floor != null || u.wing) && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{u.floor != null ? `F${u.floor}` : ""}{u.floor != null && u.wing ? " " : ""}{u.wing ? `W${u.wing}` : ""}</span>
                </>
              )}
            </div>
          </div>
          {!isSold && (
            <div className="flex items-center gap-1">
              <StatusPill status={u.status} className="shrink-0 text-micro px-1 py-0" />
              {u.originType === "PURCHASED" && (
                <span className="text-micro px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                  Purchased
                </span>
              )}
            </div>
          )}
        </div>

        {/* Asking price — the hero number, compact */}
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-label text-muted-foreground/60">Asking</span>
          {u.askingPrice != null ? (
            <span className="tnum text-body font-bold tracking-tight text-foreground">
              {formatCurrency(u.askingPrice)}
            </span>
          ) : (
            <span className="text-micro italic text-muted-foreground/40">Not set</span>
          )}
        </div>

        {/* Rate + Area — inline row */}
        <div className="mt-1 flex items-center justify-between text-micro text-muted-foreground tnum">
          {pricePerSqftVal != null ? (
            <span>{formatNumber(pricePerSqftVal, 0)} ₹/{u.areaUnit.toLowerCase()}</span>
          ) : <span>—</span>}
          <span>
            {formatNumber(u.superBuiltUpArea ?? u.area, 0)} {u.areaUnit}
            {u.superBuiltUpArea != null && u.carpetArea != null && (
              <span className="ml-1 text-faint" title="RERA carpet area">
                (carpet: {formatNumber(u.carpetArea, 0)})
              </span>
            )}
          </span>
        </div>

        {/* Margin — compact, only if available */}
        {marginVal != null && u.productionCost > 0 && (
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-micro text-muted-foreground/60">Margin</span>
            <span className={cn("tnum text-micro font-semibold", marginVal >= 0 ? "text-success" : "text-danger")}>
              {marginVal >= 0 ? "+" : ""}{formatCurrency(marginVal)}
              <span className="ml-0.5 opacity-70">({((marginVal / u.productionCost) * 100).toFixed(0)}%)</span>
            </span>
          </div>
        )}

        {/* NRV write-down — compact */}
        {u.nrvWriteDown > 0 && (
          <div className="mt-1.5 flex items-center gap-1 rounded bg-danger/10 px-1.5 py-1 text-micro text-danger">
            <TrendingDown className="h-2.5 w-2.5 shrink-0" />
            NRV: <span className="tnum font-medium">{formatCurrency(u.nrvWriteDown)}</span>
          </div>
        )}

        {/* Footer — pinned to bottom */}
        <div className="mt-auto pt-2" onClick={(e) => e.stopPropagation()}>
          {/* Sell button — the primary action on an available unit */}
          {isAvailable && canSell && (
            <Button
              variant="brand"
              size="sm"
              className="mb-1.5 w-full"
              onClick={() => onSell(u)}
              disabled={acting}
            >
              <CircleDollarSign className="h-3.5 w-3.5" /> Sell
            </Button>
          )}
          {!isSold && canEdit && (
            <div className="flex items-center gap-0.5 border-t border-border/50 pt-1.5 opacity-50 transition-opacity group-hover:opacity-100">
              {renderTransitions(u)}
              <div className="flex-1" />
              {canEditUnit && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(u)} disabled={acting} title="Edit unit">
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onValuate(u)} disabled={acting} title="Edit valuation">
                <Pencil className="h-3 w-3" />
              </Button>
              {u.status === "PLANNED" && (
                <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-danger" onClick={() => onDelete(u)} disabled={acting} title="Delete">
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
          {isSold && (
            <div className="flex items-center justify-between border-t border-border/50 pt-1.5 text-micro text-muted-foreground">
              <span>Sold</span>
              {u.saleId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-micro"
                  onClick={() => { window.location.href = `/sales`; }}
                  title="View sale"
                >
                  View <ArrowRight className="ml-0.5 h-2.5 w-2.5" />
                </Button>
              )}
            </div>
          )}
          {isAvailable && canEdit && !hasTransitions && (
            <div className="border-t border-border/50 pt-1.5 text-micro text-muted-foreground/50">
              Ready to sell
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Transition button config
// ════════════════════════════════════════════════════════════════

const TRANSITION_BUTTON_CONFIG: Record<BuiltUnitStatus, { icon: typeof Hammer; title: string }> = {
  PLANNED: { icon: CircleDollarSign, title: "Revert to Planned" },
  UNDER_CONSTRUCTION: { icon: Hammer, title: "Start Construction" },
  AVAILABLE: { icon: ArrowRight, title: "Mark Available" },
  RESERVED: { icon: CircleDollarSign, title: "Reserved" },
  HOLD: { icon: Pause, title: "Put on Hold" },
  SOLD: { icon: ArrowRight, title: "Sold" },
  RENTED: { icon: ArrowRight, title: "Rented" },
};
