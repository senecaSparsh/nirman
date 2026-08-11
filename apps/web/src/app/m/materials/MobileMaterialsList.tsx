"use client";

import { useState, useMemo } from "react";
import { Package, AlertTriangle } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";
import { VirtualizedList } from "@/components/mobile/virtualized-list";

type MaterialFilter = "ALL" | "LOW" | "OK";

export type MaterialItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  categoryName: string;
  totalQty: number;
  minStock: number | null;
  reorderPoint: number | null;
  isLow: boolean;
};

const FILTER_CHIPS: { label: string; value: MaterialFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Low Stock", value: "LOW" },
  { label: "In Stock", value: "OK" },
];

/**
 * Client component for the materials list. Handles client-side
 * search by name/code/category + filter chips for low-stock vs all.
 */
export function MobileMaterialsList({ items }: { items: MaterialItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MaterialFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (filter === "LOW") result = result.filter((m) => m.isLow);
    else if (filter === "OK") result = result.filter((m) => !m.isLow);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.code.toLowerCase().includes(q) ||
          m.categoryName.toLowerCase().includes(q),
      );
    }
    // Sort: low stock first, then alphabetical
    return [...result].sort(
      (a, b) => Number(b.isLow) - Number(a.isLow) || a.name.localeCompare(b.name),
    );
  }, [items, query, filter]);

  if (items.length === 0) return null;

  return (
    <div>
      <MobileSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search by name, code, category…"
      />

      <MobileFilterChips
        chips={FILTER_CHIPS}
        active={filter}
        onChange={setFilter}
      />

      <MobileSectionTitle>
        {query || filter !== "ALL"
          ? `Results (${filtered.length})`
          : "All Materials"}
      </MobileSectionTitle>

      {filtered.length === 0 ? (
        <MobileEmptyState
          icon={Package}
          title="No matching materials"
          hint="Try a different search or filter"
        />
      ) : filtered.length > 100 ? (
        <VirtualizedList
          items={filtered}
          estimateSize={68}
          renderItem={(m) => (
            <MobileRow
              href={`/m/materials/${m.id}`}
              icon={m.isLow ? AlertTriangle : Package}
              title={m.name}
              subtitle={`${m.code} · ${m.categoryName}`}
              meta={`${formatNumber(m.totalQty, 0)} ${m.unit}`}
              tone={m.isLow ? "danger" : "default"}
              badge={
                m.isLow ? (
                  <MobileStatusBadge status="DRAFT" label="Low" />
                ) : undefined
              }
            />
          )}
        />
      ) : (
        <div>
          {filtered.map((m) => (
            <MobileRow
              key={m.id}
              href={`/m/materials/${m.id}`}
              icon={m.isLow ? AlertTriangle : Package}
              title={m.name}
              subtitle={`${m.code} · ${m.categoryName}`}
              meta={`${formatNumber(m.totalQty, 0)} ${m.unit}`}
              tone={m.isLow ? "danger" : "default"}
              badge={
                m.isLow ? (
                  <MobileStatusBadge status="DRAFT" label="Low" />
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
