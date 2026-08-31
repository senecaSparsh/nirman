"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Building } from "lucide-react";
import { formatNumber, formatCurrencyCompact } from "@/lib/utils";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileCardGrid,
  MobileNoResults,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

type UnitStatusFilter =
  | "ALL"
  | "AVAILABLE"
  | "UNDER_CONSTRUCTION"
  | "PLANNED"
  | "SOLD"
  | "HOLD"
  | "RENTED"
  | "RESERVED";

export type UnitListItem = {
  id: string;
  unitNumber: string;
  unitType: string;
  status: string;
  area: number;
  areaUnit: string;
  askingPrice: number | null;
  projectId: string;
  projectName: string;
};

const FILTER_CHIPS: { label: string; value: UnitStatusFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Available", value: "AVAILABLE" },
  { label: "U/C", value: "UNDER_CONSTRUCTION" },
  { label: "Planned", value: "PLANNED" },
  { label: "Sold", value: "SOLD" },
  { label: "Reserved", value: "RESERVED" },
  { label: "On Hold", value: "HOLD" },
  { label: "Rented", value: "RENTED" },
];

const STATUS_TONE: Record<string, string> = {
  AVAILABLE: "var(--color-go)",
  UNDER_CONSTRUCTION: "var(--color-signal)",
  PLANNED: "var(--color-signal-dark)",
  SOLD: "var(--color-steel)",
  HOLD: "var(--color-stop)",
  RENTED: "var(--color-ink-500)",
  RESERVED: "var(--color-signal-dark)",
};

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Available",
  UNDER_CONSTRUCTION: "U/C",
  PLANNED: "Planned",
  SOLD: "Sold",
  HOLD: "Hold",
  RENTED: "Rented",
  RESERVED: "Reserved",
};

/**
 * Client component for the mobile built-unit list. Handles client-side
 * search (unit number / project name) + status filter chips. When no
 * filter/search is active, units are shown grouped by availability
 * (Available → Sold → On Hold → Rented). When a filter or search is
 * active, a flat result list is shown instead.
 */
export function MobileUnitsList({
  items,
  projectFiltered = false,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: UnitListItem[];
  projectFiltered?: boolean;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<UnitStatusFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((u) => u.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (u) =>
          u.unitNumber.toLowerCase().includes(q) ||
          u.projectName.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  const isFiltering = query.trim() !== "" || statusFilter !== "ALL";

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Building}
        title="No units"
        hint="Built units will appear here once created"
      />
    );
  }

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder={projectFiltered ? "Search unit number..." : "Search unit or project..."}
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_CHIPS}
              active={statusFilter}
              defaultValue="ALL"
              onChange={(v) => setStatusFilter(v as UnitStatusFilter)}
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
        showClear={isFiltering}
        onClear={() => { setQuery(""); setStatusFilter("ALL"); }}
      />

      {isFiltering ? (
        <FlatList items={filtered} projectFiltered={projectFiltered} />
      ) : (
        <GroupedList items={items} projectFiltered={projectFiltered} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
 * Unit card — shared between flat and grouped views
 * ---------------------------------------------------------------- */
function UnitCard({ u, showProject }: { u: UnitListItem; showProject: boolean }) {
  const tone = STATUS_TONE[u.status] ?? "var(--color-ink-500)";
  const typeLabel = u.unitType.replace(/_/g, " ").toLowerCase();

  return (
    <Link
      href={`/m/units/${u.id}`}
      className="flex flex-col rounded-[0.5rem] border p-2.5 text-m-body press overflow-hidden"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      {/* Top accent strip */}
      <div className="h-0.5 -mx-2.5 -mt-2.5 mb-2" style={{ backgroundColor: tone }} />
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-m-section font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
          {u.unitNumber}
        </p>
        <span
          className="text-m-caption font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
          style={{ backgroundColor: tone, color: "var(--color-paper)" }}
        >
          {STATUS_LABEL[u.status] ?? u.status}
        </span>
      </div>
      <p className="text-m-caption mb-1.5 truncate" style={{ color: "var(--color-ink-500)" }}>
        {typeLabel} · {formatNumber(u.area, 0)} {u.areaUnit}
        {showProject ? ` · ${u.projectName}` : ""}
      </p>
      <div className="flex items-baseline justify-between mt-auto">
        <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          Price
        </span>
        <span
          className="text-m-label font-bold tabular-nums"
          style={{ color: u.askingPrice != null ? "var(--color-steel)" : "var(--color-stop)" }}
        >
          {u.askingPrice != null ? formatCurrencyCompact(u.askingPrice) : "—"}
        </span>
      </div>
    </Link>
  );
}

/* ----------------------------------------------------------------
 * Flat list — shown when a search or filter is active.
 * ---------------------------------------------------------------- */
function FlatList({ items, projectFiltered }: { items: UnitListItem[]; projectFiltered: boolean }) {
  if (items.length === 0) {
    return (
      <MobileNoResults
        title="No matching units"
        hint="Try a different search or filter"
      />
    );
  }
  return (
    <div>
      <h3 className="text-m-body font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
        Results ({items.length})
      </h3>
      <MobileCardGrid cols={2}>
        {items.map((u) => (
          <UnitCard key={u.id} u={u} showProject={!projectFiltered} />
        ))}
      </MobileCardGrid>
    </div>
  );
}

/* ----------------------------------------------------------------
 * Grouped list — the default status-sectioned view.
 * ---------------------------------------------------------------- */
function GroupedList({ items, projectFiltered }: { items: UnitListItem[]; projectFiltered: boolean }) {
  const byStatus = (s: string) => items.filter((u) => u.status === s);
  const available = byStatus("AVAILABLE");
  const underConstruction = byStatus("UNDER_CONSTRUCTION");
  const planned = byStatus("PLANNED");
  const sold = byStatus("SOLD");
  const reserved = byStatus("RESERVED");
  const hold = byStatus("HOLD");
  const rented = byStatus("RENTED");

  const pipeline = [...available, ...underConstruction, ...planned];

  return (
    <div className="space-y-3">
      {/* Available + pipeline — the sellable units */}
      {pipeline.length > 0 ? (
        <div>
          <h3 className="text-m-body font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
            Sellable ({pipeline.length})
          </h3>
          <MobileCardGrid cols={2}>
            {pipeline.map((u) => (
              <UnitCard key={u.id} u={u} showProject={!projectFiltered} />
            ))}
          </MobileCardGrid>
        </div>
      ) : null}

      {/* Sold */}
      {sold.length > 0 ? (
        <div>
          <h3 className="text-m-body font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
            Sold ({sold.length})
          </h3>
          <MobileCardGrid cols={2}>
            {sold.map((u) => (
              <UnitCard key={u.id} u={u} showProject={!projectFiltered} />
            ))}
          </MobileCardGrid>
        </div>
      ) : null}

      {/* Reserved */}
      {reserved.length > 0 ? (
        <div>
          <h3 className="text-m-body font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
            Reserved ({reserved.length})
          </h3>
          <MobileCardGrid cols={2}>
            {reserved.map((u) => (
              <UnitCard key={u.id} u={u} showProject={!projectFiltered} />
            ))}
          </MobileCardGrid>
        </div>
      ) : null}

      {/* Hold */}
      {hold.length > 0 ? (
        <div>
          <h3 className="text-m-body font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
            On Hold ({hold.length})
          </h3>
          <MobileCardGrid cols={2}>
            {hold.map((u) => (
              <UnitCard key={u.id} u={u} showProject={!projectFiltered} />
            ))}
          </MobileCardGrid>
        </div>
      ) : null}

      {/* Rented */}
      {rented.length > 0 ? (
        <div>
          <h3 className="text-m-body font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
            Rented ({rented.length})
          </h3>
          <MobileCardGrid cols={2}>
            {rented.map((u) => (
              <UnitCard key={u.id} u={u} showProject={!projectFiltered} />
            ))}
          </MobileCardGrid>
        </div>
      ) : null}
    </div>
  );
}
