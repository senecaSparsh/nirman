"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Wrench, CheckCircle2, MapPin, Settings, Archive } from "lucide-react";
import { formatCurrencyCompact } from "@/lib/utils";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileHeaderAction,
  MobileCardGrid,
  MobileNoResults,
  MobileSummaryStrip,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

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
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: EquipmentItem[];
  counts: { total: number; available: number; assigned: number; inMaintenance: number; retired: number; totalValue: number };
  canCreate: boolean;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<EquipmentFilter>("ALL");

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
      <MobileSummaryStrip
        stats={[
          { label: "Available", value: String(counts.available), tone: "go" },
          { label: "In Use", value: String(counts.assigned), tone: "default" },
          { label: "Maint.", value: String(counts.inMaintenance), tone: "signal" },
          { label: "Value", value: formatCurrencyCompact(counts.totalValue), tone: "default" },
        ]}
      />

      {/* ── Sticky search header ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search name, tag, category…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_OPTIONS}
              active={filter}
              defaultValue="ALL"
              onChange={(v) => setFilter(v as EquipmentFilter)}
            />
            {exportTitle && exportRows && exportColumns ? (
              <MobileExportShareIcons
                title={exportTitle}
                rows={exportRows}
                columns={exportColumns}
                summary={exportSummary}
              />
            ) : null}
            {canCreate && <MobileHeaderAction href="/m/equipment/new">New</MobileHeaderAction>}
          </div>
        }
        showClear={filter !== "ALL" || query !== ""}
        onClear={() => { setQuery(""); setFilter("ALL"); }}
      />

      {/* ── Equipment cards grid ── */}
      {filtered.length === 0 ? (
        (query || filter !== "ALL") ? (
          <MobileNoResults title="No matching equipment" hint="Try a different search or filter" />
        ) : (
          <div
            className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
          >
            <Wrench className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
            <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
              No equipment
            </p>
            <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
              Add equipment to track assets
            </p>
          </div>
        )
      ) : (
        <MobileCardGrid>
          {filtered.map((e) => (
            <EquipmentCard key={e.id} e={e} />
          ))}
        </MobileCardGrid>
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
