"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Home, Search, X } from "lucide-react";
import { formatNumber, formatCurrency } from "@/lib/utils";
import {
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";

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
}: {
  items: UnitListItem[];
  projectFiltered?: boolean;
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

  if (items.length === 0) return null;

  return (
    <div>
      {/* Search bar */}
      <div className="mb-2.5">
        <div
          className="flex items-center gap-2 rounded-[0.625rem] border px-3 h-10"
          style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
        >
          <Search className="size-4 shrink-0" style={{ color: "var(--color-ink-300)" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={projectFiltered ? "Search unit number..." : "Search unit or project..."}
            className="flex-1 bg-transparent text-[0.875rem] outline-none placeholder:text-[var(--color-ink-300)]"
            style={{ color: "var(--color-ink-900)" }}
          />
          {query ? (
            <button onClick={() => setQuery("")} className="press">
              <X className="size-4" style={{ color: "var(--color-ink-300)" }} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {FILTER_CHIPS.map((chip) => {
          const active = statusFilter === chip.value;
          return (
            <button
              key={chip.value}
              onClick={() => setStatusFilter(chip.value)}
              className="press rounded-[0.375rem] px-3 py-1 text-[0.6875rem] font-semibold whitespace-nowrap transition-colors"
              style={{
                backgroundColor: active ? "var(--color-ink-950)" : "var(--color-concrete)",
                color: active ? "#fff" : "var(--color-ink-500)",
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

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
      className="flex flex-col rounded-[0.5rem] border p-2.5 press overflow-hidden"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      {/* Top accent strip */}
      <div className="h-0.5 -mx-2.5 -mt-2.5 mb-2" style={{ backgroundColor: tone }} />
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-[0.75rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
          {u.unitNumber}
        </p>
        <span
          className="text-[0.4375rem] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
          style={{ backgroundColor: tone, color: "#fff" }}
        >
          {STATUS_LABEL[u.status] ?? u.status}
        </span>
      </div>
      <p className="text-[0.5625rem] mb-1.5 truncate" style={{ color: "var(--color-ink-500)" }}>
        {typeLabel} · {formatNumber(u.area, 0)} {u.areaUnit}
        {showProject ? ` · ${u.projectName}` : ""}
      </p>
      <div className="flex items-baseline justify-between mt-auto">
        <span className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>
          Price
        </span>
        <span
          className="text-[0.625rem] font-bold tabular-nums"
          style={{ color: u.askingPrice != null ? "var(--color-steel)" : "var(--color-stop)" }}
        >
          {u.askingPrice != null ? formatCurrency(u.askingPrice) : "—"}
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
      <MobileEmptyState
        icon={Home}
        title="No matching units"
        hint="Try a different search or filter"
      />
    );
  }
  return (
    <div>
      <h3 className="text-[0.6875rem] font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
        Results ({items.length})
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {items.map((u) => (
          <UnitCard key={u.id} u={u} showProject={!projectFiltered} />
        ))}
      </div>
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
          <h3 className="text-[0.6875rem] font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
            Sellable ({pipeline.length})
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {pipeline.map((u) => (
              <UnitCard key={u.id} u={u} showProject={!projectFiltered} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Sold */}
      {sold.length > 0 ? (
        <div>
          <h3 className="text-[0.6875rem] font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
            Sold ({sold.length})
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {sold.map((u) => (
              <UnitCard key={u.id} u={u} showProject={!projectFiltered} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Reserved */}
      {reserved.length > 0 ? (
        <div>
          <h3 className="text-[0.6875rem] font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
            Reserved ({reserved.length})
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {reserved.map((u) => (
              <UnitCard key={u.id} u={u} showProject={!projectFiltered} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Hold */}
      {hold.length > 0 ? (
        <div>
          <h3 className="text-[0.6875rem] font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
            On Hold ({hold.length})
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {hold.map((u) => (
              <UnitCard key={u.id} u={u} showProject={!projectFiltered} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Rented */}
      {rented.length > 0 ? (
        <div>
          <h3 className="text-[0.6875rem] font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
            Rented ({rented.length})
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {rented.map((u) => (
              <UnitCard key={u.id} u={u} showProject={!projectFiltered} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
