"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { Search, X, Plus, ChevronDown, Wrench, CheckCircle2, MapPin, Settings, Archive } from "lucide-react";
import { formatCurrencyCompact } from "@/lib/utils";

type EquipmentFilter = "ALL" | "AVAILABLE" | "ASSIGNED" | "IN_MAINTENANCE" | "RETIRED";

export type EquipmentItem = {
  id: string;
  name: string;
  status: string;
  category: string | null;
  assetTag: string;
  model: string | null;
  currentValue: number;
  assignmentId: string | null;
  assignedProjectName: string | null;
  assignedLocationName: string | null;
};

const FILTER_OPTIONS: { label: string; value: EquipmentFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Available", value: "AVAILABLE" },
  { label: "Assigned", value: "ASSIGNED" },
  { label: "Maintenance", value: "IN_MAINTENANCE" },
  { label: "Retired", value: "RETIRED" },
];

/**
 * Equipment list — "where is my equipment, and what's it doing?"
 * Procurement-style cards in a 2-col grid with status accent.
 * Smart sort: available first (ready to deploy), then assigned (in use),
 * then maintenance (needs attention), then retired.
 */
export function MobileEquipmentList({
  items,
  counts,
  canCreate,
}: {
  items: EquipmentItem[];
  counts: { total: number; available: number; assigned: number; inMaintenance: number; retired: number; totalValue: number };
  canCreate: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<EquipmentFilter>("ALL");
  const [showFilter, setShowFilter] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showFilter) return;
    const handler = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setShowFilter(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFilter]);

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "ALL") result = result.filter((e) => e.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.category?.toLowerCase().includes(q) ?? false) ||
          e.assetTag.toLowerCase().includes(q) ||
          (e.assignedProjectName?.toLowerCase().includes(q) ?? false),
      );
    }
    // Smart sort: AVAILABLE > ASSIGNED > IN_MAINTENANCE > RETIRED, then by name
    const statusOrder: Record<string, number> = { AVAILABLE: 0, ASSIGNED: 1, IN_MAINTENANCE: 2, RETIRED: 3 };
    return [...result].sort((a, b) => {
      const so = (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
      if (so !== 0) return so;
      return a.name.localeCompare(b.name);
    });
  }, [items, query, filter]);

  return (
    <div>
      {/* ── Summary strip ── */}
      <div
        className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2 mb-2"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div>
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Available
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
            {counts.available}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            In Use
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: counts.assigned > 0 ? "var(--color-steel)" : "var(--color-ink-950)" }}>
            {counts.assigned}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Maint.
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: counts.inMaintenance > 0 ? "var(--color-signal)" : "var(--color-ink-950)" }}>
            {counts.inMaintenance}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Value
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrencyCompact(counts.totalValue)}
          </p>
        </div>
      </div>

      {/* ── Sticky search header ── */}
      <div
        ref={headerRef}
        className="sticky top-0 z-20 border-b backdrop-blur-sm -mx-3.5 px-3.5 py-1.5 mb-2"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-paper) 95%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
              style={{ color: "var(--color-ink-500)" }}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, tag, category…"
              className="w-full h-8 rounded-[0.5rem] border pl-8 pr-2 text-[0.75rem] focus:outline-none"
              style={{
                borderColor: query ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: "var(--color-paper)",
                color: "var(--color-ink-950)",
              }}
            />
          </div>

          {/* Filter selector */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowFilter(v => !v)}
              className="h-8 rounded-[0.5rem] border pl-2 pr-5 text-[0.625rem] font-semibold focus:outline-none cursor-pointer truncate max-w-[5.5rem] flex items-center"
              style={{
                borderColor: filter !== "ALL" ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: "var(--color-paper)",
                color: "var(--color-ink-950)",
              }}
            >
              <span className="truncate">
                {FILTER_OPTIONS.find(f => f.value === filter)?.label ?? "All"}
              </span>
            </button>
            <ChevronDown
              className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 size-3"
              style={{ color: "var(--color-ink-500)" }}
            />
            {showFilter ? (
              <div
                className="absolute top-9 right-0 z-30 rounded-[0.5rem] border shadow-lg overflow-hidden min-w-[7rem]"
                style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
              >
                {FILTER_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.value}
                    onClick={() => { setFilter(opt.value); setShowFilter(false); }}
                    className="w-full text-left px-2.5 py-1.5 text-[0.625rem] font-semibold"
                    style={
                      filter === opt.value
                        ? { backgroundColor: "var(--color-ink-950)", color: "#fff" }
                        : { color: "var(--color-ink-700)", ...(i > 0 ? { borderTop: "1px solid var(--color-line)" } : {}) }
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {canCreate ? (
            <Link
              href="/m/equipment/new"
              className="h-8 shrink-0 rounded-[0.5rem] px-2.5 flex items-center gap-1 text-[0.625rem] font-bold press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
            >
              <Plus className="size-3" />
              New
            </Link>
          ) : null}
        </div>

        {(filter !== "ALL" || query) ? (
          <button
            onClick={() => { setQuery(""); setFilter("ALL"); }}
            className="text-[0.625rem] font-semibold flex items-center gap-1 mt-1"
            style={{ color: "var(--color-steel)" }}
          >
            <X className="size-2.5" /> Clear
          </button>
        ) : null}
      </div>

      {/* ── Equipment cards grid ── */}
      {filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <Wrench className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            {query || filter !== "ALL" ? "No matching equipment" : "No equipment"}
          </p>
          <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
            {query || filter !== "ALL" ? "Try a different search or filter" : "Add equipment to track assets"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((e) => (
            <EquipmentCard key={e.id} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Equipment card — procurement-style with status accent ─── */
function EquipmentCard({ e }: { e: EquipmentItem }) {
  const isAvailable = e.status === "AVAILABLE";
  const isAssigned = e.status === "ASSIGNED";
  const isMaintenance = e.status === "IN_MAINTENANCE";
  const isRetired = e.status === "RETIRED";

  // Accent: go=available, steel=assigned, signal=maintenance, stop=retired
  const accentColor = isRetired
    ? "var(--color-stop)"
    : isMaintenance
      ? "var(--color-signal)"
      : isAssigned
        ? "var(--color-steel)"
        : "var(--color-go)";

  const StatusIcon = isAvailable ? CheckCircle2 : isAssigned ? MapPin : isMaintenance ? Settings : Archive;
  const statusLabel = isAvailable ? "Available" : isAssigned ? "Assigned" : isMaintenance ? "Maintenance" : "Retired";

  return (
    <Link
      href={`/m/equipment/${e.id}`}
      className="flex flex-col rounded-[0.625rem] border overflow-hidden active:scale-[0.98] transition-transform"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
        ...(isRetired ? { opacity: 0.6 } : {}),
      }}
    >
      {/* Top accent strip */}
      <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />

      <div className="p-2 flex flex-col gap-1 flex-1">
        {/* Row 1: Status badge */}
        <div className="flex items-center justify-between gap-1">
          <span
            className="flex items-center gap-0.5 text-[0.4375rem] font-bold uppercase shrink-0"
            style={{ color: accentColor }}
          >
            <StatusIcon className="size-2.5" />
            {statusLabel}
          </span>
          <span className="text-[0.4375rem] font-mono" style={{ color: "var(--color-ink-500)" }}>
            {e.assetTag}
          </span>
        </div>

        {/* Row 2: Equipment name */}
        <p className="text-[0.5625rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
          {e.name}
        </p>

        {/* Row 3: Category or model */}
        <span className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>
          {e.category ?? "Uncategorized"}
        </span>

        {/* Row 4: Assignment or value (fixed height) */}
        <div className="mt-auto pt-1 h-[1.625rem] flex flex-col justify-end">
          {isAssigned && e.assignedProjectName ? (
            <div className="flex items-center gap-0.5">
              <MapPin className="size-2 shrink-0" style={{ color: "var(--color-steel)" }} />
              <span className="text-[0.4375rem] font-semibold truncate" style={{ color: "var(--color-steel)" }}>
                {e.assignedProjectName}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
                Value
              </span>
              <span className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrencyCompact(e.currentValue)}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
