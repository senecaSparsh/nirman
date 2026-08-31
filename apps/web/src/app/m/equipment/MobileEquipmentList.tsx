"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Wrench, CheckCircle2, MapPin, Settings, Archive, Plus } from "lucide-react";
import { formatCurrencyCompact } from "@/lib/utils";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileCardGrid,
  MobileNoResults,
  MobileSummaryStrip,
} from "@/components/mobile/v2/scaffold";
import {
  MobileExportShareIcons,
  type MobileColumnSpec,
} from "@/components/mobile/v2/export-share-bar";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";

type EquipmentFilter =
  | "ALL"
  | "AVAILABLE"
  | "ASSIGNED"
  | "IN_MAINTENANCE"
  | "RETIRED";

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
  canEdit = false,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: EquipmentItem[];
  counts: {
    total: number;
    available: number;
    assigned: number;
    inMaintenance: number;
    retired: number;
    totalValue: number;
  };
  canCreate: boolean;
  canEdit?: boolean;
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
    const statusOrder: Record<string, number> = {
      AVAILABLE: 0,
      ASSIGNED: 1,
      IN_MAINTENANCE: 2,
      RETIRED: 3,
    };
    return [...result].sort((a, b) => {
      const so = (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
      if (so !== 0) return so;
      return a.name.localeCompare(b.name);
    });
  }, [items, query, filter]);

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Wrench}
        title="No equipment yet"
        hint="Add equipment to track assignments and maintenance"
        action={
          canCreate ? (
            <Link
              href="/m/equipment/new"
              className="inline-flex items-center gap-1.5 rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <Plus className="size-3.5" /> Add Equipment
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div>
      {/* ── Summary strip ── */}
      <MobileSummaryStrip
        stats={[
          { label: "Available", value: String(counts.available), tone: "go" },
          { label: "In Use", value: String(counts.assigned), tone: "default" },
          {
            label: "Maint.",
            value: String(counts.inMaintenance),
            tone: "signal",
          },
          {
            label: "Value",
            value: formatCurrencyCompact(counts.totalValue),
            tone: "default",
          },
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
          </div>
        }
        showClear={filter !== "ALL" || query !== ""}
        onClear={() => {
          setQuery("");
          setFilter("ALL");
        }}
      />

      {/* ── Equipment cards grid ── */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title="No matching equipment"
          hint="Try a different search or filter"
        />
      ) : (
        <MobileCardGrid>
          {filtered.map((e) => (
            <EquipmentCard key={e.id} e={e} canEdit={canEdit} />
          ))}
        </MobileCardGrid>
      )}
    </div>
  );
}

/* ─── Equipment card — procurement-style with status accent ─── */
function EquipmentCard({ e, _canEdit = false }: { e: EquipmentItem; canEdit?: boolean }) {
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

  const StatusIcon = isAvailable
    ? CheckCircle2
    : isAssigned
      ? MapPin
      : isMaintenance
        ? Settings
        : Archive;
  const statusLabel = isAvailable
    ? "Available"
    : isAssigned
      ? "Assigned"
      : isMaintenance
        ? "Maintenance"
        : "Retired";

  return (
    <Link
      href={`/m/equipment/${e.id}`}
      className="flex flex-col rounded-[0.625rem] border text-m-body overflow-hidden active:scale-[0.98] transition-transform"
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
            className="flex items-center gap-0.5 text-m-caption font-bold uppercase shrink-0"
            style={{ color: accentColor }}
          >
            <StatusIcon className="size-2.5" />
            {statusLabel}
          </span>
          <span
            className="text-m-caption font-mono"
            style={{ color: "var(--color-ink-500)" }}
          >
            {e.assetTag}
          </span>
        </div>

        {/* Row 2: Equipment name */}
        <p
          className="text-m-caption font-bold leading-tight truncate"
          style={{ color: "var(--color-ink-950)" }}
        >
          {e.name}
        </p>

        {/* Row 3: Category or model */}
        <span
          className="text-m-caption truncate"
          style={{ color: "var(--color-ink-500)" }}
        >
          {e.category ?? "Uncategorized"}
        </span>

        {/* Row 4: Assignment or value (fixed height) */}
        <div className="mt-auto pt-1 h-[1.625rem] flex flex-col justify-end">
          {isAssigned && e.assignedProjectName ? (
            <div className="flex items-center gap-0.5">
              <MapPin
                className="size-2 shrink-0"
                style={{ color: "var(--color-steel)" }}
              />
              <span
                className="text-m-caption font-semibold truncate"
                style={{ color: "var(--color-steel)" }}
              >
                {e.assignedProjectName}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span
                className="text-m-caption font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                Value
              </span>
              <span
                className="text-m-caption font-bold tabular-nums"
                style={{ color: "var(--color-ink-950)" }}
              >
                {formatCurrencyCompact(e.currentValue)}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
