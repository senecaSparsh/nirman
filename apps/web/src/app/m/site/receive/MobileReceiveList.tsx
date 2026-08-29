"use client";

import { useState, useMemo } from "react";
import { Truck, AlertTriangle, PackageOpen } from "lucide-react";
import { formatNumber, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileSearchHeader, MobileFilterIcon, MobileNoResults } from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

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
export function MobileReceiveList({
  items,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: ReceiveListItem[];
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
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

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={PackageOpen}
        title="No pending receipts"
        hint="Ordered POs awaiting delivery will appear here"
      />
    );
  }

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search by PO no, supplier…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_CHIPS}
              active={statusFilter}
              defaultValue="ALL"
              onChange={setStatusFilter}
            />
            {exportTitle && exportRows && exportColumns ? (
              <MobileExportShareIcons
                title={exportTitle}
                rows={exportRows}
                columns={exportColumns}
                summary={exportSummary}
              />
            ) : null}
          </div>
        }
        showClear={!!query || statusFilter !== "ALL"}
        onClear={() => { setQuery(""); setStatusFilter("ALL"); }}
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
      <MobileNoResults title="No matching POs" hint="Try a different search or filter" />
    );
  }
  return (
    <div>
      <MobileSectionTitle
        right={
          <span
            className="text-m-label font-semibold"
            style={{ color: "var(--color-ink-500)" }}
          >
            {items.length} PO{items.length !== 1 ? "s" : ""}
          </span>
        }
      >
        Results
      </MobileSectionTitle>
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
