"use client";

import { useState, useMemo } from "react";
import { Truck, AlertTriangle, Search, X } from "lucide-react";
import { formatNumber, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";

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
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--color-ink-300)" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by PO no, supplier…"
            className="w-full h-11 rounded-[0.625rem] border pl-9 pr-9 text-[0.875rem] outline-none placeholder:text-[var(--color-ink-300)]"
            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)", color: "var(--color-ink-950)" }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center size-7"
              aria-label="Clear search"
            >
              <X className="size-4" style={{ color: "var(--color-ink-300)" }} />
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.value}
            onClick={() => setStatusFilter(chip.value)}
            className="shrink-0 h-9 px-3 rounded-[0.5rem] border text-[0.75rem] font-semibold transition-colors"
            style={statusFilter === chip.value
              ? { backgroundColor: "var(--color-ink-950)", color: "#fff", borderColor: "var(--color-ink-950)" }
              : { backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)", borderColor: "var(--color-concrete)" }
            }
          >
            {chip.label}
          </button>
        ))}
      </div>

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
      <div className="flex flex-col gap-2.5">
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
          <div className="flex flex-col gap-2.5">
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
        <div className="flex flex-col gap-2.5">
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
