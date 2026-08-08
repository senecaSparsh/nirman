"use client";

import { useState, useMemo } from "react";
import { ScanLine } from "lucide-react";
import { formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

type CountStatus = "ALL" | "DRAFT" | "COUNTED" | "RECONCILED";

export type StockCountItem = {
  id: string;
  status: string;
  countDate: string;
  locationName: string;
  lineCount: number;
};

const FILTER_CHIPS: { label: string; value: CountStatus }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Counted", value: "COUNTED" },
  { label: "Reconciled", value: "RECONCILED" },
];

/**
 * Client component for the stock counts list. Handles
 * client-side search + status filter chips.
 */
export function MobileStockCountsList({ items }: { items: StockCountItem[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CountStatus>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((c) => c.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (c) =>
          c.locationName.toLowerCase().includes(q) ||
          c.status.toLowerCase().includes(q),
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
        placeholder="Search by location, status…"
      />

      <MobileFilterChips
        chips={FILTER_CHIPS}
        active={statusFilter}
        onChange={setStatusFilter}
      />

      <MobileSectionTitle>
        {query || statusFilter !== "ALL"
          ? `Results (${filtered.length})`
          : "Recent"}
      </MobileSectionTitle>

      {filtered.length === 0 ? (
        <MobileEmptyState
          icon={ScanLine}
          title="No matching counts"
          hint="Try a different search or filter"
        />
      ) : (
        <div>
          {filtered.map((c) => (
            <MobileRow
              key={c.id}
              href={`/m/stock-counts/${c.id}`}
              icon={ScanLine}
              title={c.locationName}
              subtitle={`${formatDate(new Date(c.countDate))} · ${c.lineCount} items`}
              badge={<MobileStatusBadge status={c.status} />}
            />
          ))}
        </div>
      )}
    </div>
  );
}
