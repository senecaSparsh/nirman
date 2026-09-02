"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Package,
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  ArrowRight, Truck,
  type LucideIcon,
} from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { MobileSearchHeader, MobileNoResults, MobileSummaryStrip, MobileCardGrid } from "@/components/mobile/v2/scaffold";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/* ── Time helper ── */
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export type StockItemEntry = {
  materialId: string;
  materialName: string;
  unit: string;
  qty: number;
};

export type StockLocationItem = {
  id: string;
  name: string;
  type: string;
  itemCount: number;
  totalQty: number;
  items: StockItemEntry[];
};

export type StockMovementItem = {
  id: string;
  qty: number;
  materialName: string;
  materialUnit: string;
  fromLocationName: string | null;
  toLocationName: string | null;
  movementType: string;
  timestamp: string;
};

/* ── Location type helpers ── */
const TYPE_LABELS: Record<string, string> = {
  COMPANY_WAREHOUSE: "Warehouse",
  PROJECT_SITE: "Site",
  DEPARTMENT: "Dept",
};

const TYPE_COLORS: Record<string, string> = {
  COMPANY_WAREHOUSE: "var(--color-steel)",
  PROJECT_SITE: "var(--color-go)",
  DEPARTMENT: "var(--color-signal)",
};

const typeLabel = (type: string): string => TYPE_LABELS[type] ?? type.replace(/_/g, " ");
const typeColor = (type: string): string => TYPE_COLORS[type] ?? "var(--color-steel)";

/* ── Movement direction helpers ── */
const IN_TYPES = ["PURCHASE_RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN", "RETURN", "SCRAP_GENERATED"];
const OUT_TYPES = ["ISSUE_TO_PROJECT", "ISSUE_TO_DEPARTMENT", "ADJUSTMENT_OUT", "SALE"];

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE_RECEIPT: "Receipt",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
  ISSUE_TO_PROJECT: "Issue",
  ISSUE_TO_DEPARTMENT: "Issue",
  ADJUSTMENT_IN: "Adjustment +",
  ADJUSTMENT_OUT: "Adjustment −",
  RETURN: "Return",
  SALE: "Sale",
  SCRAP_GENERATED: "Scrap Gen",
};

const movementLabel = (type: string): string =>
  MOVEMENT_LABELS[type] ?? type.replace(/_/g, " ");

const movementIcon = (type: string): LucideIcon =>
  IN_TYPES.includes(type) ? ArrowDownToLine : OUT_TYPES.includes(type) ? ArrowUpFromLine : ArrowLeftRight;

const movementColor = (type: string): string =>
  IN_TYPES.includes(type) ? "var(--color-go)" : OUT_TYPES.includes(type) ? "var(--color-stop)" : "var(--color-steel)";

/**
 * Field inventory view — "what's on the ground".
 * Shows location bin cards with material breakdowns, quick actions,
 * and a compact recent activity strip.
 */
export function MobileSiteStockList({
  locations,
  movements,
  totalItems,
  totalUnits,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  locations: StockLocationItem[];
  movements: StockMovementItem[];
  totalItems: number;
  totalUnits: number;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");

  const filteredLocations = useMemo(() => {
    if (!query.trim()) return locations;
    const q = query.toLowerCase();
    return locations.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.items.some((i) => i.materialName.toLowerCase().includes(q)),
    );
  }, [locations, query]);

  const filteredMovements = useMemo(() => {
    if (!query.trim()) return movements;
    const q = query.toLowerCase();
    return movements.filter(
      (m) =>
        m.materialName.toLowerCase().includes(q) ||
        (m.fromLocationName?.toLowerCase().includes(q) ?? false) ||
        (m.toLocationName?.toLowerCase().includes(q) ?? false),
    );
  }, [movements, query]);

  return (
    <div>
      {/* ── Summary strip ── */}
      <MobileSummaryStrip
        stats={[
          { label: "Locations", value: formatNumber(locations.length, 0) },
          { label: "Items", value: formatNumber(totalItems, 0) },
          { label: "Units", value: formatNumber(totalUnits, 0) },
        ]}
      />

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Link
          href="/m/stock-out?mode=issue"
          className="flex items-center gap-2 rounded-[0.5rem] border px-3 py-2 text-m-body press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <span
            className="grid place-items-center size-7 rounded-[0.375rem] shrink-0"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <ArrowUpFromLine className="size-3.5" style={{ color: "var(--color-stop)" }} />
          </span>
          <div className="min-w-0">
            <p className="text-m-body font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
              Issue Material
            </p>
            <p className="text-m-caption leading-tight" style={{ color: "var(--color-ink-500)" }}>
              Material challan out
            </p>
          </div>
        </Link>
        <Link
          href="/m/site/receive"
          className="flex items-center gap-2 rounded-[0.5rem] border px-3 py-2 text-m-body press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <span
            className="grid place-items-center size-7 rounded-[0.375rem] shrink-0"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <Truck className="size-3.5" style={{ color: "var(--color-go)" }} />
          </span>
          <div className="min-w-0">
            <p className="text-m-body font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
              Receive Stock
            </p>
            <p className="text-m-caption leading-tight" style={{ color: "var(--color-ink-500)" }}>
              PO / gate entry
            </p>
          </div>
        </Link>
      </div>

      {/* ── Sticky search header ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search location or material…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            {exportTitle && exportRows && exportColumns ? (
              <MobileExportShareIcons
                title={exportTitle}
                rows={exportRows}
                columns={exportColumns}
                summary={exportSummary}
              />
            ) : null}
          </div>
        }
        showClear={!!query}
        onClear={() => setQuery("")}
      />

      {/* ── Location bin cards ── */}
      {filteredLocations.length === 0 ? (
        query.trim() ? (
          <MobileNoResults title="No matching locations" hint="Try a different search" />
        ) : (
          <MobileEmptyState
            icon={Package}
            title="No stock locations"
            hint="Stock locations will appear here"
          />
        )
      ) : (
        <div className="mb-4">
          {query && (
            <div className="flex items-center justify-end mb-1.5">
              <span
                className="text-m-label font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                {filteredLocations.length} location{filteredLocations.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          <MobileCardGrid>
            {filteredLocations.map((loc) => (
              <LocationBinCard key={loc.id} loc={loc} />
            ))}
          </MobileCardGrid>
        </div>
      )}

      {/* ── Recent activity ── */}
      {filteredMovements.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
              Recent Activity
            </span>
            <Link
              href="/m/stock"
              className="flex items-center gap-0.5 text-m-caption font-semibold"
              style={{ color: "var(--color-ink-500)" }}
            >
              View ledger <ArrowRight className="size-2.5" />
            </Link>
          </div>
          <div
            className="rounded-[0.5rem] border overflow-hidden"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            {filteredMovements.map((m, i) => {
              const Icon = movementIcon(m.movementType);
              const color = movementColor(m.movementType);
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-2 px-2.5 py-1.5"
                  style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
                >
                  <span
                    className="grid place-items-center size-6 rounded-full shrink-0"
                    style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
                  >
                    <Icon className="size-3" style={{ color }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                      {formatNumber(m.qty, 0)} {m.materialUnit} {m.materialName}
                    </p>
                    <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                      {m.fromLocationName ?? "—"} → {m.toLocationName ?? "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-m-caption font-semibold" style={{ color }}>
                      {movementLabel(m.movementType)}
                    </p>
                    <p className="text-m-caption tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                      {formatTime(m.timestamp)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Location bin card — procurement-style card with type accent + material list ─── */
function LocationBinCard({ loc }: { loc: StockLocationItem }) {
  const accentColor = typeColor(loc.type);
  const visibleItems = loc.items.slice(0, 3);
  const remaining = loc.items.length - visibleItems.length;

  return (
    <Link
      href={`/m/stock?locationId=${loc.id}`}
      className="flex flex-col rounded-[0.625rem] border text-m-body overflow-hidden active:scale-[0.98] transition-transform"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Top accent strip */}
      <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />

      <div className="p-2 flex flex-col gap-1 flex-1">
        {/* Row 1: Location name + type label */}
        <div className="flex items-center justify-between gap-1">
          <p className="text-m-label font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
            {loc.name}
          </p>
          <span
            className="text-m-caption font-bold uppercase shrink-0"
            style={{ color: accentColor }}
          >
            {typeLabel(loc.type)}
          </span>
        </div>

        {/* Row 2: Material rows — fixed height for equal card sizes */}
        <div className="flex flex-col gap-0.5 h-[2.625rem]">
          {visibleItems.length > 0 ? (
            visibleItems.map((item) => (
              <div key={item.materialId} className="flex items-baseline justify-between gap-1">
                <span className="text-m-caption truncate" style={{ color: "var(--color-ink-700)" }}>
                  {item.materialName}
                </span>
                <span className="text-m-caption font-bold tabular-nums shrink-0" style={{ color: "var(--color-ink-950)" }}>
                  {formatNumber(item.qty, 0)}
                  <span className="font-normal ml-0.5" style={{ color: "var(--color-ink-500)" }}>
                    {item.unit}
                  </span>
                </span>
              </div>
            ))
          ) : (
            <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              Empty
            </p>
          )}
        </div>

        {/* Row 3: Bottom area — fixed height for equal card sizes */}
        <div className="mt-auto pt-1 h-[0.875rem] flex items-center">
          {remaining > 0 ? (
            <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-500)" }}>
              +{remaining} more item{remaining > 1 ? "s" : ""}
            </span>
          ) : loc.items.length > 0 ? (
            <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-500)" }}>
              {loc.itemCount} item{loc.itemCount !== 1 ? "s" : ""} · {formatNumber(loc.totalQty, 0)} units
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
