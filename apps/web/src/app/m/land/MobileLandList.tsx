"use client";

import { useState, useMemo } from "react";
import { LandPlot } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

type ParcelStatus = "ALL" | "AVAILABLE" | "SOLD" | "HOLD" | "PARTITIONED";

export type LandListItem = {
  id: string;
  number: string;
  status: string;
  sellerName: string;
  projectName: string | null;
  landPurchaseId: string;
  askingPrice: number | null;
  currentValuation: number;
  childCount: number;
};

const FILTER_CHIPS: { label: string; value: ParcelStatus }[] = [
  { label: "All", value: "ALL" },
  { label: "Available", value: "AVAILABLE" },
  { label: "Sold", value: "SOLD" },
  { label: "Hold", value: "HOLD" },
  { label: "Partitioned", value: "PARTITIONED" },
];

/**
 * Client component for the mobile land-parcel list. Handles client-side
 * search (seller name / location / parcel number) + status filter chips.
 * When no filter/search is active, parcels are shown grouped by status
 * section (Available → On Hold → Partitioned → Sold), matching the
 * original layout. When a filter or search is active, a flat result list
 * is shown instead.
 */
export function MobileLandList({ items }: { items: LandListItem[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ParcelStatus>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((p) => p.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (p) =>
          p.sellerName.toLowerCase().includes(q) ||
          p.number.toLowerCase().includes(q) ||
          (p.projectName?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  const isFiltering = query.trim() !== "" || statusFilter !== "ALL";

  if (items.length === 0) return null;

  return (
    <div>
      <MobileSectionTitle>Parcels</MobileSectionTitle>

      <MobileSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search seller, parcel no, project…"
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
function FlatList({ items }: { items: LandListItem[] }) {
  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={LandPlot}
        title="No matching parcels"
        hint="Try a different search or filter"
      />
    );
  }
  return (
    <div>
      <MobileSectionTitle>Results ({items.length})</MobileSectionTitle>
      <div>
        {items.map((p) => (
          <ParcelRow key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
 * Grouped list — the default status-sectioned view.
 * ---------------------------------------------------------------- */
function GroupedList({ items }: { items: LandListItem[] }) {
  const byStatus = (s: string) => items.filter((p) => p.status === s);
  const available = byStatus("AVAILABLE");
  const hold = byStatus("HOLD");
  const partitioned = byStatus("PARTITIONED");
  const sold = byStatus("SOLD");

  return (
    <div>
      {available.length > 0 && (
        <>
          <MobileSectionTitle>Available ({available.length})</MobileSectionTitle>
          <div>
            {available.slice(0, 20).map((p) => (
              <ParcelRow key={p.id} p={p} />
            ))}
          </div>
        </>
      )}

      {hold.length > 0 && (
        <>
          <MobileSectionTitle>On Hold ({hold.length})</MobileSectionTitle>
          <div>
            {hold.map((p) => (
              <ParcelRow key={p.id} p={p} />
            ))}
          </div>
        </>
      )}

      {partitioned.length > 0 && (
        <>
          <MobileSectionTitle>Partitioned ({partitioned.length})</MobileSectionTitle>
          <div>
            {partitioned.slice(0, 10).map((p) => (
              <ParcelRow key={p.id} p={p} />
            ))}
          </div>
        </>
      )}

      {sold.length > 0 && (
        <>
          <MobileSectionTitle>Sold ({sold.length})</MobileSectionTitle>
          <div>
            {sold.slice(0, 10).map((p) => (
              <ParcelRow key={p.id} p={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** A single parcel row with a status badge and valuation meta. */
function ParcelRow({ p }: { p: LandListItem }) {
  const price = p.askingPrice != null ? p.askingPrice : p.currentValuation;
  const subtitle =
    p.status === "PARTITIONED"
      ? `${p.sellerName} · ${p.childCount} sub-parcels${p.projectName ? ` · ${p.projectName}` : ""}`
      : `${p.sellerName}${p.projectName ? ` · ${p.projectName}` : ""}`;
  return (
    <MobileRow
      href={`/land/${p.landPurchaseId}`}
      icon={LandPlot}
      title={`Parcel ${p.number}`}
      subtitle={subtitle}
      meta={formatCurrency(price)}
      badge={<MobileStatusBadge status={p.status} />}
    />
  );
}
