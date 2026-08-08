"use client";

import { useState, useMemo } from "react";
import { Truck, AlertTriangle } from "lucide-react";
import { formatNumber, formatDate, formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

type PoStatus =
  | "ALL"
  | "DRAFT"
  | "APPROVED"
  | "ORDERED"
  | "PARTIAL"
  | "RECEIVED"
  | "CANCELLED";

export type ProcurementListItem = {
  id: string;
  poNumber: string;
  status: string;
  supplierName: string;
  expectedDate: string | null;
  createdAt: string;
  total: number;
  qtyOrdered: number;
  qtyReceived: number;
  isOverdue: boolean;
};

const FILTER_CHIPS: { label: string; value: PoStatus }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Approved", value: "APPROVED" },
  { label: "Ordered", value: "ORDERED" },
  { label: "Partial", value: "PARTIAL" },
  { label: "Received", value: "RECEIVED" },
  { label: "Cancelled", value: "CANCELLED" },
];

/**
 * Client component for the mobile purchase-order list. Handles
 * client-side search (PO number / supplier name) + status filter
 * chips. When no filter/search is active, POs are shown grouped by
 * status section (Overdue → In Transit → Draft → Approved → Received
 * → Cancelled), matching the original layout. When a filter or search
 * is active, a flat result list is shown instead.
 */
export function MobileProcurementList({
  items,
}: {
  items: ProcurementListItem[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PoStatus>("ALL");

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
function FlatList({ items }: { items: ProcurementListItem[] }) {
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
            href={`/m/procurement/${po.id}`}
            icon={po.isOverdue ? AlertTriangle : Truck}
            title={po.supplierName}
            subtitle={`PO ${po.poNumber} · ${formatCurrency(po.total)}`}
            meta={po.expectedDate ? formatDate(po.expectedDate) : undefined}
            badge={<MobileStatusBadge status={po.status} />}
          />
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
 * Grouped list — the default status-sectioned view.
 * ---------------------------------------------------------------- */
function GroupedList({ items }: { items: ProcurementListItem[] }) {
  const byStatus = (s: string) => items.filter((p) => p.status === s);
  const drafts = byStatus("DRAFT");
  const approved = byStatus("APPROVED");
  const ordered = byStatus("ORDERED");
  const partial = byStatus("PARTIAL");
  const received = byStatus("RECEIVED");
  const cancelled = byStatus("CANCELLED");
  const inTransit = [...ordered, ...partial];
  const overdue = inTransit.filter((p) => p.isOverdue);

  return (
    <div>
      {overdue.length > 0 && (
        <>
          <MobileSectionTitle>Overdue</MobileSectionTitle>
          <div>
            {overdue.map((po) => (
              <MobileRow
                key={po.id}
                href={`/m/procurement/${po.id}`}
                icon={AlertTriangle}
                title={po.supplierName}
                subtitle={`PO ${po.poNumber} · due ${po.expectedDate ? formatDate(po.expectedDate) : "—"}`}
                badge={<MobileStatusBadge status={po.status} />}
              />
            ))}
          </div>
        </>
      )}

      <MobileSectionTitle>In Transit</MobileSectionTitle>
      {inTransit.length === 0 ? (
        <MobileEmptyState icon={Truck} title="Nothing in transit" hint="Approved POs appear here once ordered" />
      ) : (
        <div>
          {inTransit.map((po) => (
            <MobileRow
              key={po.id}
              href={`/m/procurement/${po.id}`}
              icon={Truck}
              title={po.supplierName}
              subtitle={`PO ${po.poNumber} · ${formatNumber(po.qtyReceived, 0)}/${formatNumber(po.qtyOrdered, 0)} received`}
              badge={<MobileStatusBadge status={po.status} />}
            />
          ))}
        </div>
      )}

      <MobileSectionTitle>Draft ({drafts.length})</MobileSectionTitle>
      {drafts.length === 0 ? (
        <MobileEmptyState icon={Truck} title="No draft POs" />
      ) : (
        <div>
          {drafts.map((po) => (
            <MobileRow
              key={po.id}
              href={`/m/procurement/${po.id}`}
              icon={Truck}
              title={po.supplierName}
              subtitle={`PO ${po.poNumber} · ${formatDate(po.createdAt)}`}
              badge={<MobileStatusBadge status={po.status} />}
            />
          ))}
        </div>
      )}

      {approved.length > 0 && (
        <>
          <MobileSectionTitle>Approved — not yet ordered ({approved.length})</MobileSectionTitle>
          <div>
            {approved.map((po) => (
              <MobileRow
                key={po.id}
                href={`/m/procurement/${po.id}`}
                icon={Truck}
                title={po.supplierName}
                subtitle={`PO ${po.poNumber}`}
                badge={<MobileStatusBadge status={po.status} />}
              />
            ))}
          </div>
        </>
      )}

      {received.length > 0 && (
        <>
          <MobileSectionTitle>Received ({received.length})</MobileSectionTitle>
          <div>
            {received.slice(0, 10).map((po) => (
              <MobileRow
                key={po.id}
                href={`/m/procurement/${po.id}`}
                icon={Truck}
                title={po.supplierName}
                subtitle={`PO ${po.poNumber}`}
                badge={<MobileStatusBadge status={po.status} />}
              />
            ))}
          </div>
        </>
      )}

      {cancelled.length > 0 && (
        <>
          <MobileSectionTitle>Cancelled ({cancelled.length})</MobileSectionTitle>
          <div>
            {cancelled.slice(0, 10).map((po) => (
              <MobileRow
                key={po.id}
                href={`/m/procurement/${po.id}`}
                icon={Truck}
                title={po.supplierName}
                subtitle={`PO ${po.poNumber}`}
                badge={<MobileStatusBadge status={po.status} />}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
