"use client";

import { useState, useMemo } from "react";
import { Home } from "lucide-react";
import { formatNumber, formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

type UnitStatusFilter =
  | "ALL"
  | "AVAILABLE"
  | "UNDER_CONSTRUCTION"
  | "PLANNED"
  | "SOLD"
  | "HOLD"
  | "RENTED";

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
  { label: "On Hold", value: "HOLD" },
  { label: "Rented", value: "RENTED" },
];

/**
 * Client component for the mobile built-unit list. Handles client-side
 * search (unit number / project name) + status filter chips. When no
 * filter/search is active, units are shown grouped by availability
 * (Available → Sold → On Hold → Rented). When a filter or search is
 * active, a flat result list is shown instead.
 */
export function MobileUnitsList({
  items,
}: {
  items: UnitListItem[];
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
      <MobileSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search by unit no, project…"
      />

      <MobileFilterChips
        chips={FILTER_CHIPS}
        active={statusFilter}
        onChange={setStatusFilter}
      />

      {isFiltering ? (
        <FlatList items={filtered} />
      ) : (
        <GroupedList items={items} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
 * Flat list — shown when a search or filter is active.
 * ---------------------------------------------------------------- */
function FlatList({ items }: { items: UnitListItem[] }) {
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
      <MobileSectionTitle>Results ({items.length})</MobileSectionTitle>
      <div>
        {items.map((u) => (
          <MobileRow
            key={u.id}
            href={`/m/units/${u.id}`}
            icon={Home}
            title={`${u.unitNumber} · ${u.unitType.replace(/_/g, " ")}`}
            subtitle={`${u.projectName} · ${formatNumber(u.area, 0)} ${u.areaUnit}`}
            meta={u.askingPrice != null ? formatCurrency(u.askingPrice) : undefined}
            badge={<MobileStatusBadge status={u.status} />}
          />
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
 * Grouped list — the default status-sectioned view.
 * ---------------------------------------------------------------- */
function GroupedList({ items }: { items: UnitListItem[] }) {
  const byStatus = (s: string) => items.filter((u) => u.status === s);
  const available = [
    ...byStatus("AVAILABLE"),
    ...byStatus("PLANNED"),
    ...byStatus("UNDER_CONSTRUCTION"),
  ];
  const sold = byStatus("SOLD");
  const hold = byStatus("HOLD");
  const rented = byStatus("RENTED");

  return (
    <div>
      <MobileSectionTitle>Available ({available.length})</MobileSectionTitle>
      {available.length === 0 ? (
        <MobileEmptyState
          icon={Home}
          title="No available units"
          hint="Units show here once marked AVAILABLE"
        />
      ) : (
        <div>
          {available.map((u) => (
            <MobileRow
              key={u.id}
              href={`/m/units/${u.id}`}
              icon={Home}
              title={`${u.unitNumber} · ${u.unitType.replace(/_/g, " ")}`}
              subtitle={`${u.projectName} · ${formatNumber(u.area, 0)} ${u.areaUnit}`}
              meta={u.askingPrice != null ? formatCurrency(u.askingPrice) : "—"}
              badge={<MobileStatusBadge status={u.status} />}
            />
          ))}
        </div>
      )}

      {sold.length > 0 && (
        <>
          <MobileSectionTitle>Sold ({sold.length})</MobileSectionTitle>
          <div>
            {sold.slice(0, 15).map((u) => (
              <MobileRow
                key={u.id}
                href={`/m/units/${u.id}`}
                icon={Home}
                title={`${u.unitNumber} · ${u.unitType.replace(/_/g, " ")}`}
                subtitle={u.projectName}
                meta={u.askingPrice != null ? formatCurrency(u.askingPrice) : undefined}
                badge={<MobileStatusBadge status={u.status} />}
              />
            ))}
          </div>
        </>
      )}

      {hold.length > 0 && (
        <>
          <MobileSectionTitle>On Hold ({hold.length})</MobileSectionTitle>
          <div>
            {hold.map((u) => (
              <MobileRow
                key={u.id}
                href={`/m/units/${u.id}`}
                icon={Home}
                title={`${u.unitNumber} · ${u.unitType.replace(/_/g, " ")}`}
                subtitle={u.projectName}
                meta={u.askingPrice != null ? formatCurrency(u.askingPrice) : undefined}
                badge={<MobileStatusBadge status={u.status} />}
              />
            ))}
          </div>
        </>
      )}

      {rented.length > 0 && (
        <>
          <MobileSectionTitle>Rented ({rented.length})</MobileSectionTitle>
          <div>
            {rented.map((u) => (
              <MobileRow
                key={u.id}
                href={`/m/units/${u.id}`}
                icon={Home}
                title={`${u.unitNumber} · ${u.unitType.replace(/_/g, " ")}`}
                subtitle={u.projectName}
                meta={u.askingPrice != null ? formatCurrency(u.askingPrice) : undefined}
                badge={<MobileStatusBadge status={u.status} />}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
