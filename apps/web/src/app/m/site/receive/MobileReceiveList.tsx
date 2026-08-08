"use client";

import { useState, useMemo } from "react";
import { Truck, AlertTriangle } from "lucide-react";
import { formatNumber, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

type ReceiveFilter = "ALL" | "ORDERED" | "PARTIAL";

export type ReceiveListItem = {
  id: string;
  poNumber: string;
  status: string;
  supplierName: string;
  expectedDate: string | null;
  qtyOrdered: number;
  qtyReceived: number;
  isOverdue: boolean;
};

const FILTER_CHIPS: { label: string; value: ReceiveFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Ordered", value: "ORDERED" },
  { label: "Partial", value: "PARTIAL" },
];

/**
 * Client component for the mobile receive (in-transit POs) list.
 * Handles client-side search (supplier name / PO number) + status
 * filter chips (All / Ordered / Partial). When no filter/search is
 * active, POs are shown grouped: Overdue first, then the rest. When
 * a filter or search is active, a flat result list is shown instead.
 */
export function MobileReceiveList({ items }: { items: ReceiveListItem[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReceiveFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((p) => p.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (p) =>
          p.poNumber.toLowerCase().includes(q) ||
          p.supplierName.toLowerCase().includes(q),
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
        placeholder="Search by PO no, supplier…"
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
function FlatList({ items }: { items: ReceiveListItem[] }) {
  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Truck}
        title="No matching POs"
        hint="Try a different search or filter"
      />
    );
  }
  return (
    <div>
      <MobileSectionTitle>Results ({items.length})</MobileSectionTitle>
      <div>
        {items.map((po) => (
          <MobileRow
            key={po.id}
            href={`/m/site/field?po=${po.id}`}
            icon={po.isOverdue ? AlertTriangle : Truck}
            title={po.supplierName}
            subtitle={`PO ${po.poNumber} · ${formatNumber(po.qtyReceived, 0)}/${formatNumber(po.qtyOrdered, 0)} received`}
            meta={po.expectedDate ? formatDate(po.expectedDate) : undefined}
            badge={<MobileStatusBadge status={po.status} />}
          />
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
 * Grouped list — the default view: overdue first, then in-transit.
 * ---------------------------------------------------------------- */
function GroupedList({ items }: { items: ReceiveListItem[] }) {
  const overdue = items.filter((p) => p.isOverdue);
  const onTime = items.filter((p) => !p.isOverdue);

  return (
    <div>
      {overdue.length > 0 && (
        <>
          <MobileSectionTitle>Overdue</MobileSectionTitle>
          <div>
            {overdue.map((po) => (
              <MobileRow
                key={po.id}
                href={`/m/site/field?po=${po.id}`}
                icon={AlertTriangle}
                title={po.supplierName}
                subtitle={`PO ${po.poNumber} · due ${po.expectedDate ? formatDate(po.expectedDate) : "—"}`}
                badge={<MobileStatusBadge status={po.status} />}
              />
            ))}
          </div>
        </>
      )}

      <MobileSectionTitle>Awaiting Receipt</MobileSectionTitle>
      {onTime.length === 0 ? (
        <MobileEmptyState icon={Truck} title="Nothing in transit" hint="Ordered POs appear here" />
      ) : (
        <div>
          {onTime.map((po) => (
            <MobileRow
              key={po.id}
              href={`/m/site/field?po=${po.id}`}
              icon={Truck}
              title={po.supplierName}
              subtitle={`PO ${po.poNumber} · ${formatNumber(po.qtyReceived, 0)}/${formatNumber(po.qtyOrdered, 0)} received`}
              meta={po.expectedDate ? formatDate(po.expectedDate) : undefined}
              badge={<MobileStatusBadge status={po.status} />}
            />
          ))}
        </div>
      )}
    </div>
  );
}
