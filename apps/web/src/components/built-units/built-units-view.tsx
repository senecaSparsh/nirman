"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Home, Pencil, ArrowRight, Hammer, Pause, Trash2,
  Search, LayoutGrid, Table as TableIcon, RotateCcw, TrendingDown,
  ArrowDown, ArrowUp, CircleDollarSign, Building2, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { statusColor, StatusPill } from "@/components/page";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BuiltUnitFormDialog } from "./built-unit-form-dialog";
import { BuiltUnitEditDialog } from "./built-unit-edit-dialog";
import { UnitValuationDialog } from "./unit-valuation-dialog";
import { SellAssetDialog } from "@/components/sales/sell-asset-dialog";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
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

// Pipeline order — the funnel
const PIPELINE_ORDER: BuiltUnitStatus[] = [
  "PLANNED", "UNDER_CONSTRUCTION", "AVAILABLE", "HOLD", "SOLD",
];

const UNIT_TYPE_LABELS: Record<BuiltUnitType, string> = {
  BHK_1: "1 BHK", BHK_2: "2 BHK", BHK_3: "3 BHK", BHK_4: "4 BHK",
  SHOP: "Shop", OFFICE: "Office", WAREHOUSE_UNIT: "Warehouse", VILLA: "Villa", OTHER: "Other",
};

const ALL_TYPES: BuiltUnitType[] = ["BHK_1", "BHK_2", "BHK_3", "BHK_4", "SHOP", "OFFICE", "WAREHOUSE_UNIT", "VILLA", "OTHER"];

const VALID_TRANSITIONS: Record<BuiltUnitStatus, BuiltUnitStatus[]> = {
  PLANNED: ["UNDER_CONSTRUCTION"],
  UNDER_CONSTRUCTION: ["AVAILABLE", "PLANNED"],
  AVAILABLE: ["RESERVED", "HOLD", "UNDER_CONSTRUCTION"],
  RESERVED: ["AVAILABLE", "SOLD"],
  HOLD: ["AVAILABLE"],
  SOLD: [],
  RENTED: ["AVAILABLE"],
};

type SortKey = "unitNumber" | "area" | "askingPrice" | "currentValuation" | "productionCost";
type SortDir = "asc" | "desc";

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
  const canCreate = permissions?.canCreate ?? true;
  const canEdit = permissions?.canEdit ?? true;
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

  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"gallery" | "table">("gallery");
  const [sortKey, setSortKey] = useState<SortKey>("unitNumber");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [formOpen, setFormOpen] = useState(false);
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

  const hasActiveFilters = Boolean(projectFilter || statusFilter || typeFilter || search);

  function clearFilters() {
    setProjectFilter(""); setStatusFilter(""); setTypeFilter(""); setSearch("");
  }

  // ── Silent background sync — refreshes server data without layout shift ──
  // Uses router.refresh() but only when no dialog is open and no mutation is
  // in flight, so the user never sees a loading flash.
  const syncFromServer = useCallback(() => {
    router.refresh();
  }, [router]);

  // ── Pre-status-filter set (for pipeline bar distribution) ──
  const preStatusFiltered = useMemo(
    () => units.filter((u) => {
      if (projectFilter && u.projectId !== projectFilter) return false;
      if (typeFilter && u.unitType !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase().trim();
        const haystack = [
          u.unitNumber, u.wing ?? "", u.floor != null ? String(u.floor) : "",
          u.phaseName ?? "", u.projectName, UNIT_TYPE_LABELS[u.unitType],
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    }),
    [units, projectFilter, typeFilter, search],
  );

  const pipelineTotal = preStatusFiltered.length;

  // ── Portfolio metrics (from pre-status-filtered set) ──
  const portfolio = useMemo(() => {
    const available = preStatusFiltered.filter((u) => u.status === "AVAILABLE");
    const sold = preStatusFiltered.filter((u) => u.status === "SOLD");
    const sellableValue = available.reduce((s, u) => s + (u.askingPrice ?? 0), 0);
    const realizedRevenue = sold.reduce((s, u) => s + (u.askingPrice ?? u.currentValuation), 0);
    const avgPricePerSqft = available.length > 0
      ? available.reduce((s, u) => s + ((u.askingPrice ?? 0) / Math.max(u.area, 1)), 0) / available.length
      : 0;
    const salesVelocity = preStatusFiltered.length > 0
      ? (sold.length / preStatusFiltered.length) * 100
      : 0;
    return {
      availableCount: available.length,
      sellableValue,
      realizedRevenue,
      avgPricePerSqft,
      salesVelocity,
      soldCount: sold.length,
    };
  }, [preStatusFiltered]);

  // ── Full filtered + sorted set ──
  const filtered = useMemo(() => {
    let result = preStatusFiltered.filter((u) => {
      if (statusFilter && u.status !== statusFilter) return false;
      return true;
    });
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "unitNumber": cmp = a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }); break;
        case "area": cmp = a.area - b.area; break;
        case "askingPrice": cmp = (a.askingPrice ?? 0) - (b.askingPrice ?? 0); break;
        case "currentValuation": cmp = a.currentValuation - b.currentValuation; break;
        case "productionCost": cmp = a.productionCost - b.productionCost; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [preStatusFiltered, statusFilter, sortKey, sortDir]);

  // ── Group by project → by floor (spatial grouping) ──
  const grouped = useMemo(() => {
    const projectMap = new Map<string, { name: string; units: BuiltUnitRow[] }>();
    for (const u of filtered) {
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

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ── Helpers ──
  const margin = (u: BuiltUnitRow): number | null =>
    u.askingPrice != null ? u.askingPrice - u.productionCost : null;

  const pricePerSqft = (u: BuiltUnitRow): number | null =>
    u.askingPrice != null && u.area > 0 ? u.askingPrice / u.area : null;

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

  return (
    <div className="space-y-4">
      {/* ════════════════════════════════════════════════════════════
          1. Header row — title left, search + filters + controls right
          ════════════════════════════════════════════════════════════ */}
      <div className="border-b border-border pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Title */}
          <div className="min-w-0 shrink-0">
            <h1 className="text-title text-foreground">Built Units</h1>
            <p className="mt-0.5 text-meta text-muted-foreground">
              Sellable units within projects — status, valuation, and NRV write-downs.
            </p>
          </div>

          {/* Search + filters + controls — inline with heading on lg */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[150px] flex-1 lg:w-[200px] lg:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search unit, wing…"
                className="pl-8"
              />
            </div>
            <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="min-w-[120px] flex-1 lg:w-[150px] lg:flex-none">
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="min-w-[90px] flex-1 lg:w-[110px] lg:flex-none">
              <option value="">All types</option>
              {ALL_TYPES.map((t) => <option key={t} value={t}>{UNIT_TYPE_LABELS[t]}</option>)}
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-[100px] flex-1 lg:w-[120px] lg:flex-none">
              <option value="">All statuses</option>
              {PIPELINE_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                <RotateCcw className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
            {pipelineTotal > 0 && (
              <span className="hidden text-caption text-muted-foreground tnum lg:inline">
                <span className="font-medium text-foreground">{filtered.length}</span>
                {" / "}{pipelineTotal}
              </span>
            )}
            <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/80 bg-muted/50 p-1">
              <button type="button" onClick={() => setView("gallery")}
                className={cn("rounded-md p-1.5 transition-colors",
                  view === "gallery" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                title="Gallery view">
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setView("table")}
                className={cn("rounded-md p-1.5 transition-colors",
                  view === "table" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                title="Table view">
                <TableIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            {canCreate && (
              <Button onClick={() => setFormOpen(true)} disabled={projects.length === 0}>
                <Plus className="h-4 w-4" /> New Unit
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          2. Metrics strip — 4-col grid
          ════════════════════════════════════════════════════════════ */}
      {pipelineTotal > 0 && (
        <MetricsPipelineStrip
          portfolio={portfolio}
          total={pipelineTotal}
        />
      )}

      {/* ════════════════════════════════════════════════════════════
          4. Content
          ════════════════════════════════════════════════════════════ */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Home className="h-5 w-5" />}
          title={units.length === 0 ? "No built units yet" : "No units match the filters"}
          description={
            units.length === 0
              ? projects.length === 0
                ? "Create a project first, then add built units."
                : "Add your first built unit to start tracking inventory."
              : "Try a different project, type filter, or search query."
          }
          action={
            units.length === 0 && projects.length > 0 && canCreate ? (
              <Button onClick={() => setFormOpen(true)} size="sm"><Plus className="h-4 w-4" /> New Unit</Button>
            ) : hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}><RotateCcw className="h-3.5 w-3.5" /> Clear filters</Button>
            ) : undefined
          }
        />
      ) : view === "gallery" ? (
        /* ── Gallery: project → floor → cards (spatial grouping) ── */
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
                        marginVal={margin(u)}
                        pricePerSqftVal={pricePerSqft(u)}
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
      ) : (
        /* ── Table view ── */
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <SortTH label="Unit" sortKey="unitNumber" current={sortKey} dir={sortDir} onToggle={toggleSort} />
                  <TH>Type</TH>
                  <TH>Phase</TH>
                  <TH>Floor / Wing</TH>
                  <SortTH label="Area" sortKey="area" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right" />
                  <TH>Status</TH>
                  <SortTH label="Cost" sortKey="productionCost" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right" />
                  <SortTH label="Valuation" sortKey="currentValuation" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right" />
                  <SortTH label="Asking" sortKey="askingPrice" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right" />
                  <TH align="right">₹/Sq.Ft</TH>
                  <TH align="right">Margin</TH>
                  {canEdit && <TH align="right">Actions</TH>}
                </TR>
              </THead>
              <TBody>
                {filtered.map((u) => {
                  const m = margin(u);
                  const psf = pricePerSqft(u);
                  const isSold = u.status === "SOLD";
                  return (
                    <TR key={u.id} className={cn(isSold && "opacity-50")}>
                      <TD>
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor(u.status) }} />
                          <span className={cn("font-medium", isSold && "line-through decoration-danger/40")}>{u.unitNumber}</span>
                        </div>
                        <div className="text-caption text-muted-foreground">{u.projectName}</div>
                      </TD>
                      <TD className="text-muted-foreground">{UNIT_TYPE_LABELS[u.unitType]}</TD>
                      <TD className="text-muted-foreground">{u.phaseName ?? "—"}</TD>
                      <TD className="text-muted-foreground">
                        {u.floor != null || u.wing ? (
                          <span className="text-caption">
                            {u.floor != null ? `F${u.floor}` : ""}{u.floor != null && u.wing ? " · " : ""}{u.wing ?? ""}
                          </span>
                        ) : "—"}
                      </TD>
                      <TD align="right" className="tnum">{formatNumber(u.area, 0)} <span className="text-caption text-muted-foreground">{u.areaUnit}</span></TD>
                      <TD><StatusPill status={u.status} className="text-micro" /></TD>
                      <TD align="right" className="tnum text-muted-foreground">{u.productionCost > 0 ? formatCurrency(u.productionCost) : "—"}</TD>
                      <TD align="right" className="tnum">{formatCurrency(u.currentValuation)}</TD>
                      <TD align="right" className="tnum font-medium">{u.askingPrice != null ? formatCurrency(u.askingPrice) : <span className="italic text-muted-foreground/50">Not set</span>}</TD>
                      <TD align="right" className="tnum text-caption text-muted-foreground">{psf != null ? formatNumber(psf, 0) : "—"}</TD>
                      <TD align="right" className={cn("tnum text-caption", m == null ? "text-muted-foreground" : m >= 0 ? "text-success" : "text-danger")}>
                        {m != null ? `${m >= 0 ? "+" : ""}${formatCurrency(m)}` : "—"}
                      </TD>
                      {canEdit && (
                        <TD align="right">
                          <div className="flex items-center justify-end gap-0.5">
                            {renderTransitionButtons(u)}
                            {u.status === "AVAILABLE" && canSell && (
                              <Button variant="brand" size="sm" className="h-7" onClick={() => setSellTarget(u)} disabled={actingId === u.id} title="Sell unit">
                                <CircleDollarSign className="h-3.5 w-3.5" /> Sell
                              </Button>
                            )}
                            {(u.status === "PLANNED" || u.status === "UNDER_CONSTRUCTION") && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditTarget(u)} disabled={actingId === u.id} title="Edit unit">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {!isSold && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setValuating(u)} disabled={actingId === u.id} title="Edit valuation">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {u.status === "PLANNED" && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-danger" onClick={() => setDelTarget(u)} disabled={actingId === u.id} title="Delete">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
          {/* Count footer */}
          <div className="border-t border-border bg-muted/20 px-3 py-2 text-caption text-muted-foreground tnum">
            {filtered.length} unit{filtered.length !== 1 ? "s" : ""}
            {filtered.length !== pipelineTotal && ` of ${pipelineTotal}`}
            {" · "}{formatCurrency(filtered.reduce((s, u) => s + (u.askingPrice ?? 0), 0))} total asking
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          Dialogs
          ════════════════════════════════════════════════════════════ */}
      <BuiltUnitFormDialog open={formOpen} onOpenChange={setFormOpen} projects={projects} phases={phases} />
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
//  Metrics + Pipeline strip — two clean rows in one card
//  Row 1: 4-col metrics grid · Row 2: slim pipeline bar with labels
// ════════════════════════════════════════════════════════════════
function MetricsPipelineStrip({
  portfolio, total,
}: {
  portfolio: {
    availableCount: number;
    sellableValue: number;
    realizedRevenue: number;
    avgPricePerSqft: number;
    salesVelocity: number;
    soldCount: number;
  };
  total: number;
}) {
  if (total === 0) return null;

  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border lg:grid-cols-4 lg:divide-y-0">
      <MetricCell
        label="Sellable Value"
        value={formatCurrency(portfolio.sellableValue)}
        sub={`${portfolio.availableCount} available`}
        color="var(--color-stage-sell)"
      />
      <MetricCell
        label="Realized Revenue"
        value={formatCurrency(portfolio.realizedRevenue)}
        sub={`${portfolio.soldCount} sold`}
        color="var(--color-danger)"
      />
      <MetricCell
        label="Avg ₹/Sq.Ft"
        value={portfolio.avgPricePerSqft > 0 ? formatNumber(portfolio.avgPricePerSqft, 0) : "—"}
        sub="across available"
        color="var(--color-stage-manage)"
      />
      <MetricCell
        label="Sales Velocity"
        value={`${portfolio.salesVelocity.toFixed(0)}%`}
        sub={`${portfolio.soldCount} of ${total} sold`}
        color="var(--color-stage-build)"
      />
    </div>
  );
}

// ── Metric cell — one cell in the 4-col grid ──
function MetricCell({
  label, value, sub, color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="p-3">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-label text-muted-foreground/70">{label}</span>
      </div>
      <div className="mt-1 tnum text-body font-bold tracking-tight text-foreground">
        {value}
      </div>
      <div className="mt-0.5 text-micro text-muted-foreground/60">{sub}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Unit card — a property listing card
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
            <StatusPill status={u.status} className="shrink-0 text-micro px-1 py-0" />
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
          <span>{formatNumber(u.area, 0)} {u.areaUnit}</span>
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
//  Transition button config + Sortable TH
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

function SortTH({
  label, sortKey, current, dir, onToggle, align = "left",
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onToggle: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = current === sortKey;
  return (
    <TH align={align}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TH>
  );
}
