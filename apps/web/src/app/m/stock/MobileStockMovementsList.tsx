"use client";

import { useState, useMemo } from "react";
import { ArrowLeftRight, type LucideIcon } from "lucide-react";
import { formatNumber, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

export type StockMovementItem = {
  id: string;
  movementType: string;
  materialId: string;
  materialName: string;
  materialUnit: string;
  qty: number;
  fromLocationName: string | null;
  toLocationName: string | null;
  timestamp: string;
};

/**
 * Movement type filter chips. Groups the raw enum values into
 * user-friendly categories:
 *   Receipt    → PURCHASE_RECEIPT
 *   Transfer   → TRANSFER_IN, TRANSFER_OUT
 *   Issue      → ISSUE_TO_PROJECT, ISSUE_TO_DEPARTMENT
 *   Scrap      → SCRAP_GENERATED
 *   Adjustment → ADJUSTMENT_IN, ADJUSTMENT_OUT
 *   Sale       → SALE
 *   Return     → RETURN
 */
type MovementFilter =
  | "ALL"
  | "RECEIPT"
  | "TRANSFER"
  | "ISSUE"
  | "SCRAP"
  | "ADJUSTMENT"
  | "SALE"
  | "RETURN";

const FILTER_CHIPS: { label: string; value: MovementFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Receipt", value: "RECEIPT" },
  { label: "Transfer", value: "TRANSFER" },
  { label: "Issue", value: "ISSUE" },
  { label: "Scrap", value: "SCRAP" },
  { label: "Adjustment", value: "ADJUSTMENT" },
  { label: "Sale", value: "SALE" },
  { label: "Return", value: "RETURN" },
];

/** Map a raw movement type to its filter category. */
const TYPE_TO_FILTER: Record<string, MovementFilter> = {
  PURCHASE_RECEIPT: "RECEIPT",
  TRANSFER_IN: "TRANSFER",
  TRANSFER_OUT: "TRANSFER",
  ISSUE_TO_PROJECT: "ISSUE",
  ISSUE_TO_DEPARTMENT: "ISSUE",
  SCRAP_GENERATED: "SCRAP",
  ADJUSTMENT_IN: "ADJUSTMENT",
  ADJUSTMENT_OUT: "ADJUSTMENT",
  SALE: "SALE",
  RETURN: "RETURN",
};

/**
 * Client component for the stock movements feed. Handles
 * client-side search by material name, movement type, or location,
 * plus filter chips that group movement types into categories.
 */
export function MobileStockMovementsList({
  items,
  movementIcon,
  movementTone,
  movementLabel,
}: {
  items: StockMovementItem[];
  movementIcon: (type: string) => LucideIcon;
  movementTone: (type: string) => "success" | "danger" | "default";
  movementLabel: (type: string) => string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MovementFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "ALL") {
      result = result.filter((m) => TYPE_TO_FILTER[m.movementType] === filter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (m) =>
          m.materialName.toLowerCase().includes(q) ||
          m.movementType.toLowerCase().includes(q) ||
          movementLabel(m.movementType).toLowerCase().includes(q) ||
          (m.fromLocationName?.toLowerCase().includes(q) ?? false) ||
          (m.toLocationName?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [items, query, filter, movementLabel]);

  return (
    <div>
      <MobileSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search movements by material, type, location…"
      />

      <MobileFilterChips
        chips={FILTER_CHIPS}
        active={filter}
        onChange={setFilter}
      />

      <MobileSectionTitle>
        {query || filter !== "ALL"
          ? `Results (${filtered.length})`
          : "Recent Movements"}
      </MobileSectionTitle>

      {filtered.length === 0 ? (
        <MobileEmptyState
          icon={ArrowLeftRight}
          title={query || filter !== "ALL" ? "No matching movements" : "No stock movements"}
          hint={query || filter !== "ALL" ? "Try a different search or filter" : "Receipts, issues and transfers appear here"}
        />
      ) : (
        <div>
          {filtered.map((m) => (
            <MobileRow
              key={m.id}
              href={`/m/materials/${m.materialId}`}
              icon={movementIcon(m.movementType)}
              title={`${formatNumber(m.qty, 0)} ${m.materialUnit} ${m.materialName}`}
              subtitle={`${m.fromLocationName ?? "—"} → ${m.toLocationName ?? "—"} · ${formatDate(new Date(m.timestamp))}`}
              meta={movementLabel(m.movementType)}
              tone={movementTone(m.movementType)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
