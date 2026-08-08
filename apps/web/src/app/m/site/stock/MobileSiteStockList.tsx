"use client";

import { useState, useMemo } from "react";
import { Package, ArrowRight } from "lucide-react";
import { formatNumber, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileInfoRow,
  MobileSearchBar,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

export type StockLocationItem = {
  id: string;
  name: string;
  type: string;
  itemCount: number;
  totalQty: number;
  materialNames: string[];
};

export type StockMovementItem = {
  id: string;
  qty: number;
  materialName: string;
  materialUnit: string;
  fromLocationName: string | null;
  toLocationName: string | null;
  movementType: string;
  timestamp: string;
};

/**
 * Client component for the mobile site stock page. Handles client-side
 * search across location names and material names. Locations and recent
 * movements are both filtered by the same query.
 */
export function MobileSiteStockList({
  locations,
  movements,
}: {
  locations: StockLocationItem[];
  movements: StockMovementItem[];
}) {
  const [query, setQuery] = useState("");

  const filteredLocations = useMemo(() => {
    if (!query.trim()) return locations;
    const q = query.toLowerCase();
    return locations.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.materialNames.some((m) => m.toLowerCase().includes(q)),
    );
  }, [locations, query]);

  const filteredMovements = useMemo(() => {
    if (!query.trim()) return movements;
    const q = query.toLowerCase();
    return movements.filter(
      (m) =>
        m.materialName.toLowerCase().includes(q) ||
        (m.fromLocationName?.toLowerCase().includes(q) ?? false) ||
        (m.toLocationName?.toLowerCase().includes(q) ?? false),
    );
  }, [movements, query]);

  return (
    <div>
      {(locations.length > 0 || movements.length > 0) && (
        <MobileSearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search by location, material…"
        />
      )}

      <MobileSectionTitle>Locations</MobileSectionTitle>
      {filteredLocations.length === 0 ? (
        <MobileEmptyState
          icon={Package}
          title={query.trim() ? "No matching locations" : "No stock locations"}
          hint={query.trim() ? "Try a different search" : undefined}
        />
      ) : (
        <div>
          {filteredLocations.map((l) => (
            <MobileRow
              key={l.id}
              href={`/m/stock?locationId=${l.id}`}
              icon={Package}
              title={l.name}
              subtitle={`${l.itemCount} items`}
              meta={`${formatNumber(l.totalQty, 0)} units`}
            />
          ))}
        </div>
      )}

      <MobileSectionTitle>Recent Movements</MobileSectionTitle>
      {filteredMovements.length === 0 ? (
        <MobileEmptyState
          icon={ArrowRight}
          title={query.trim() ? "No matching movements" : "No stock movements"}
          hint={query.trim() ? "Try a different search" : undefined}
        />
      ) : (
        <div>
          {filteredMovements.map((m) => (
            <MobileInfoRow
              key={m.id}
              icon={ArrowRight}
              title={`${formatNumber(m.qty, 0)} ${m.materialUnit} ${m.materialName}`}
              subtitle={`${m.fromLocationName ?? "—"} → ${m.toLocationName ?? "—"}`}
              value={formatDate(m.timestamp)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
