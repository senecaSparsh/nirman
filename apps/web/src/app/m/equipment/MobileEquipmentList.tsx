"use client";

import { useState, useMemo } from "react";
import { Wrench } from "lucide-react";
import {
  MobileSectionTitle,
  MobileInfoRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

type EquipmentStatusFilter =
  | "ALL"
  | "AVAILABLE"
  | "ASSIGNED"
  | "IN_MAINTENANCE"
  | "RETIRED";

export type EquipmentListItem = {
  id: string;
  name: string;
  status: string;
  category: string | null;
  assetTag: string;
  assignedProjectName: string | null;
};

const FILTER_CHIPS: { label: string; value: EquipmentStatusFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Available", value: "AVAILABLE" },
  { label: "Assigned", value: "ASSIGNED" },
  { label: "In Maintenance", value: "IN_MAINTENANCE" },
  { label: "Retired", value: "RETIRED" },
];

/**
 * Client component for the mobile equipment list. Handles client-side
 * search (name / category / asset tag) + status filter chips. Flat list.
 *
 * Equipment records are not tappable — there is no mobile equipment
 * detail page, so they render as `MobileInfoRow` (non-navigable) with a
 * status badge.
 */
export function MobileEquipmentList({
  items,
}: {
  items: EquipmentListItem[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<EquipmentStatusFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((e) => e.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.category?.toLowerCase().includes(q) ?? false) ||
          e.assetTag.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  if (items.length === 0) return null;

  return (
    <div>
      <MobileSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search by name, category, asset tag…"
      />

      <MobileFilterChips
        chips={FILTER_CHIPS}
        active={statusFilter}
        onChange={setStatusFilter}
      />

      <MobileSectionTitle>
        {statusFilter === "ALL" && query.trim() === ""
          ? "All Equipment"
          : `Results (${filtered.length})`}
      </MobileSectionTitle>

      {filtered.length === 0 ? (
        <MobileEmptyState
          icon={Wrench}
          title="No matching equipment"
          hint="Try a different search or filter"
        />
      ) : (
        <div>
          {filtered.map((e) => (
            <MobileInfoRow
              key={e.id}
              icon={Wrench}
              title={e.name}
              subtitle={`${e.category ?? "—"} · ${e.assetTag}${e.assignedProjectName ? ` · ${e.assignedProjectName}` : ""}`}
              value=""
              badge={<MobileStatusBadge status={e.status} />}
            />
          ))}
        </div>
      )}
    </div>
  );
}
