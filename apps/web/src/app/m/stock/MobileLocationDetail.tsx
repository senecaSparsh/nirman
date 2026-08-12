"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft, Search, X,
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  Package,
  type LucideIcon,
} from "lucide-react";
import { formatNumber, formatCurrency, formatDate } from "@/lib/utils";

export type DetailStockItem = {
  materialId: string;
  materialName: string;
  materialCode: string;
  unit: string;
  qty: number;
  mac: number;
};

export type DetailMovement = {
  id: string;
  movementType: string;
  materialId: string;
  materialName: string;
  materialUnit: string;
  qty: number;
  fromLocationName: string | null;
  toLocationName: string | null;
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

const typeLabel = (t: string) => TYPE_LABELS[t] ?? t.replace(/_/g, " ");
const typeColor = (t: string) => TYPE_COLORS[t] ?? "var(--color-steel)";

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

const movementLabel = (type: string) => MOVEMENT_LABELS[type] ?? type.replace(/_/g, " ");
const movementIcon = (type: string): LucideIcon =>
  IN_TYPES.includes(type) ? ArrowDownToLine : OUT_TYPES.includes(type) ? ArrowUpFromLine : ArrowLeftRight;
const movementColor = (type: string) =>
  IN_TYPES.includes(type) ? "var(--color-go)" : OUT_TYPES.includes(type) ? "var(--color-stop)" : "var(--color-steel)";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Location Detail — "what's at this location, and what's been happening here?"
 * Rendered when /m/stock?locationId=X is visited.
 * Completely different from the company-wide ledger view.
 */
export function MobileLocationDetail({
  locationName,
  locationType,
  items,
  movements,
  totalValue,
}: {
  locationName: string;
  locationType: string;
  items: DetailStockItem[];
  movements: DetailMovement[];
  totalValue: number;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"inventory" | "activity">("inventory");

  const accentColor = typeColor(locationType);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (i) => i.materialName.toLowerCase().includes(q) || i.materialCode.toLowerCase().includes(q),
    );
  }, [items, query]);

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

  // Date-group movements
  const groupedMovements = useMemo(() => {
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const map = new Map<string, DetailMovement[]>();
    for (const m of filteredMovements) {
      const mDate = new Date(m.timestamp);
      const label = sameDay(mDate, today) ? "Today" : sameDay(mDate, yesterday) ? "Yesterday" : formatDate(m.timestamp);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(m);
    }
    return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
  }, [filteredMovements]);

  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-2">
        <Link href="/m/site/stock" className="shrink-0">
          <ChevronLeft className="size-5" style={{ color: "var(--color-ink-700)" }} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
            <p className="text-[0.875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
              {locationName}
            </p>
          </div>
        </div>
        <span
          className="text-[0.5rem] font-bold uppercase tracking-wide shrink-0 px-1.5 py-0.5 rounded-full"
          style={{ color: accentColor, backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)` }}
        >
          {typeLabel(locationType)}
        </span>
      </div>

      {/* ── Summary strip ── */}
      <div
        className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2 mb-2"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div>
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Items
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatNumber(items.length, 0)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Total Qty
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatNumber(totalQty, 0)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Value
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrency(totalValue)}
          </p>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <Link
          href="/m/site/issue"
          className="flex flex-col items-center rounded-[0.5rem] border py-1.5 press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <ArrowUpFromLine className="size-3.5 mb-0.5" style={{ color: "var(--color-stop)" }} />
          <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Issue</span>
        </Link>
        <Link
          href="/m/site/receive"
          className="flex flex-col items-center rounded-[0.5rem] border py-1.5 press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <ArrowDownToLine className="size-3.5 mb-0.5" style={{ color: "var(--color-go)" }} />
          <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Receive</span>
        </Link>
        <Link
          href="/m/stock"
          className="flex flex-col items-center rounded-[0.5rem] border py-1.5 press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <ArrowLeftRight className="size-3.5 mb-0.5" style={{ color: "var(--color-steel)" }} />
          <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Transfer</span>
        </Link>
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setTab("inventory")}
          className="flex-1 rounded-[0.375rem] py-1.5 text-[0.625rem] font-bold transition-colors"
          style={
            tab === "inventory"
              ? { backgroundColor: "var(--color-ink-950)", color: "#fff" }
              : { backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)", border: "1px solid var(--color-line)" }
          }
        >
          Inventory ({items.length})
        </button>
        <button
          onClick={() => setTab("activity")}
          className="flex-1 rounded-[0.375rem] py-1.5 text-[0.625rem] font-bold transition-colors"
          style={
            tab === "activity"
              ? { backgroundColor: "var(--color-ink-950)", color: "#fff" }
              : { backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)", border: "1px solid var(--color-line)" }
          }
        >
          Activity ({movements.length})
        </button>
      </div>

      {/* ── Sticky search ── */}
      <div
        className="sticky top-0 z-20 border-b backdrop-blur-sm -mx-3.5 px-3.5 py-1.5 mb-2"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-paper) 95%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
            style={{ color: "var(--color-ink-500)" }}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "inventory" ? "Search material…" : "Search movement…"}
            className="w-full h-8 rounded-[0.5rem] border pl-8 pr-8 text-[0.75rem] focus:outline-none"
            style={{
              borderColor: query ? "var(--color-ink-950)" : "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-950)",
            }}
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center size-5"
            >
              <X className="size-3" style={{ color: "var(--color-ink-500)" }} />
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Tab content ── */}
      {tab === "inventory" ? (
        <InventoryTab items={filteredItems} />
      ) : (
        <ActivityTab groups={groupedMovements} />
      )}
    </div>
  );
}

/* ─── Inventory tab — material list with qty + value ─── */
function InventoryTab({ items }: { items: DetailStockItem[] }) {
  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
      >
        <Package className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
        <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
          No materials in stock
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-[0.5rem] border overflow-hidden"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      {items.map((item, i) => (
        <Link
          key={item.materialId}
          href={`/m/materials/${item.materialId}`}
          className="flex items-center justify-between gap-2 px-2.5 py-2 press"
          style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[0.6875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
              {item.materialName}
            </p>
            <p className="text-[0.5rem] font-mono" style={{ color: "var(--color-ink-500)" }}>
              {item.materialCode} · MAC {formatCurrency(item.mac)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatNumber(item.qty, 0)}
            </p>
            <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
              {item.unit}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ─── Activity tab — date-grouped movement ledger ─── */
function ActivityTab({ groups }: { groups: { label: string; items: DetailMovement[] }[] }) {
  if (groups.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
      >
        <ArrowLeftRight className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
        <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
          No movements yet
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1 px-0.5" style={{ color: "var(--color-steel)" }}>
            {group.label}
          </p>
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
                  className="flex items-center gap-2 px-2.5 py-1.5 press"
                  style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
                >
                  <span
                    className="grid place-items-center size-6 rounded-full shrink-0"
                    style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
                  >
                    <Icon className="size-3" style={{ color }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.625rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                      {formatNumber(m.qty, 0)} {m.materialUnit} {m.materialName}
                    </p>
                    <p className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                      {m.fromLocationName ?? "—"} → {m.toLocationName ?? "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[0.5rem] font-semibold" style={{ color }}>
                      {movementLabel(m.movementType)}
                    </p>
                    <p className="text-[0.5rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
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
  );
}
