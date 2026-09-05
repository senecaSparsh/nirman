"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  Plus, type LucideIcon,
} from "lucide-react";
import { formatNumber, formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileSummaryStrip,
  MobileNoResults,
  MobileFab,
  type SummaryStat,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewMaterialDialog } from "../materials/MobileNewMaterialDialog";

export type StockLocation = {
  id: string;
  name: string;
  type: string;
  itemCount: number;
  totalQty: number;
  totalValue: number;
};

export type StockMovementItem = {
  id: string;
  movementType: string;
  materialId: string;
  materialName: string;
  materialUnit: string;
  qty: number;
  fromLocationId: string | null;
  fromLocationName: string | null;
  toLocationId: string | null;
  toLocationName: string | null;
  timestamp: string;
};

export type MaterialStockItem = {
  locationId: string;
  locationName: string;
  qty: number;
  unit: string;
};

/* ── Movement type helpers ── */
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

type MovementFilter =
  | "ALL" | "RECEIPT" | "TRANSFER" | "ISSUE"
  | "SCRAP" | "ADJUSTMENT" | "SALE" | "RETURN";

const FILTER_CHIPS: { label: string; value: MovementFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Receipt", value: "RECEIPT" },
  { label: "Transfer", value: "TRANSFER" },
  { label: "Issue", value: "ISSUE" },
  { label: "Scrap", value: "SCRAP" },
  { label: "Adjustment", value: "ADJUSTMENT" },
  { label: "Sale", value: "SALE" },
  { label: "Return", value: "RETURN" },
];

const TYPE_TO_FILTER: Record<string, MovementFilter> = {
  PURCHASE_RECEIPT: "RECEIPT",
  TRANSFER_IN: "TRANSFER", TRANSFER_OUT: "TRANSFER",
  ISSUE_TO_PROJECT: "ISSUE", ISSUE_TO_DEPARTMENT: "ISSUE",
  SCRAP_GENERATED: "SCRAP",
  ADJUSTMENT_IN: "ADJUSTMENT", ADJUSTMENT_OUT: "ADJUSTMENT",
  SALE: "SALE", RETURN: "RETURN",
};

export function MobileStockMovementsList({
  locations,
  movements,
  totalInventoryValue,
  filterMaterialName,
  materialStockItems,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
  canManage = false,
  categories = [],
}: {
  locations: StockLocation[];
  movements: StockMovementItem[];
  totalInventoryValue: number;
  filterMaterialName: string | null;
  materialStockItems: MaterialStockItem[];
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
  canManage?: boolean;
  categories?: { id: string; name: string; unit: string }[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MovementFilter>("ALL");
  const fab = useFabModal();
  const showNewMaterial = fab.isOpen;

  const filtered = useMemo(() => {
    let result = movements;
    if (filter !== "ALL") {
      result = result.filter((m) => TYPE_TO_FILTER[m.movementType] === filter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (m) =>
          m.materialName.toLowerCase().includes(q) ||
          movementLabel(m.movementType).toLowerCase().includes(q) ||
          (m.fromLocationName?.toLowerCase().includes(q) ?? false) ||
          (m.toLocationName?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [movements, query, filter]);

  // Date grouping
  const grouped = useMemo(() => {
    const today = newDate();
    const yesterday = newDate(); yesterday.setDate(yesterday.getDate() - 1);
    const groups: { label: string; items: StockMovementItem[] }[] = [];
    const map = new Map<string, StockMovementItem[]>();
    for (const m of filtered) {
      const mDate = new Date(m.timestamp);
      const label = sameDay(mDate, today) ? "Today"
        : sameDay(mDate, yesterday) ? "Yesterday"
        : formatDate(m.timestamp);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(m);
    }
    for (const [label, items] of map) groups.push({ label, items });
    return groups;
  }, [filtered]);

  const summaryStats: SummaryStat[] = [
    { label: "Inventory Value", value: formatCurrency(totalInventoryValue) },
    { label: "Locations", value: String(locations.length) },
  ];

  return (
    <div>
      {/* ── Inventory summary strip (same position across all tabs) ── */}
      <MobileSummaryStrip stats={summaryStats} />

      {/* ── Sticky search header (same position across all tabs) ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search material, type, location…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_CHIPS}
              active={filter}
              defaultValue="ALL"
              onChange={setFilter}
            />
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
        showClear={filter !== "ALL" || !!query}
        onClear={() => { setQuery(""); setFilter("ALL"); }}
      />

      {/* ── Material filter label (when deep-linked) ── */}
      {filterMaterialName ? (
        <div
          className="rounded-[0.5rem] px-3 py-2 mb-3 text-m-section font-semibold"
          style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)" }}
        >
          Filtering by: {filterMaterialName}
        </div>
      ) : null}

      {/* ── Material stock by location (when deep-linked by material) ── */}
      {filterMaterialName && materialStockItems.length > 0 ? (
        <div className="mb-3">
          <p className="text-m-caption font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--color-steel)" }}>
            On Hand by Location
          </p>
          <div
            className="rounded-[0.5rem] border overflow-hidden"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            {materialStockItems.map((item, i) => (
              <Link
                key={item.locationId}
                href={`/m/stock?locationId=${item.locationId}`}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-m-body press"
                style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
              >
                <span className="text-m-label font-semibold truncate" style={{ color: "var(--color-ink-700)" }}>
                  {item.locationName}
                </span>
                <span className="text-m-label font-bold tabular-nums shrink-0" style={{ color: "var(--color-ink-950)" }}>
                  {formatNumber(item.qty, 0)} {item.unit}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Movement ledger ── */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title="No movements"
          hint={query || filter !== "ALL"
            ? "Try a different search or filter"
            : "Receipts, issues and transfers appear here"}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {grouped.map((group) => (
            <div key={group.label}>
              {/* Date header */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
                  {group.label}
                </span>
                <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-500)" }}>
                  {group.items.length} entr{group.items.length !== 1 ? "ies" : "y"}
                </span>
              </div>

              {/* Ledger rows */}
              <div
                className="rounded-[0.5rem] border overflow-hidden"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                {group.items.map((m, i) => {
                  const Icon = movementIcon(m.movementType);
                  const color = movementColor(m.movementType);
                  return (
                    <Link
                      key={m.id}
                      href={`/m/materials/${m.materialId}`}
                      className="flex items-center gap-2 px-2.5 py-2 active:opacity-70"
                      style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
                    >
                      {/* Direction icon */}
                      <div className="shrink-0 w-7 h-7 rounded-full grid place-items-center" style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                        <Icon className="size-3.5" style={{ color }} />
                      </div>

                      {/* Main content */}
                      <div className="min-w-0 flex-1">
                        <p className="text-m-body font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                          {formatNumber(m.qty, 0)} {m.materialUnit} {m.materialName}
                        </p>
                        <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                          {m.fromLocationName ?? "—"} → {m.toLocationName ?? "—"}
                        </p>
                      </div>

                      {/* Right: type + time */}
                      <div className="text-right shrink-0">
                        <p className="text-m-caption font-bold" style={{ color }}>
                          {movementLabel(m.movementType)}
                        </p>
                        <p className="text-m-caption tabular-nums" style={{ color: "var(--color-ink-400)" }}>
                          {formatTime(m.timestamp)}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── FAB: Add material (managers only) ── */}
      {canManage && (
        <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add Material" icon={Plus} />
      )}

      {/* ── New material dialog — springs from FAB ── */}
      {canManage && (
        <MobileNewMaterialDialog
          open={showNewMaterial}
          onClose={fab.close}
          categories={categories}
          onCreated={() => {
            fab.close();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/* ── Date/time helpers ── */
function newDate(): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
