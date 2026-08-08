"use client";

import { useState, useMemo } from "react";
import { ClipboardList } from "lucide-react";
import { formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

type ReqStatus =
  | "ALL"
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "CONVERTED";

export type RequisitionListItem = {
  id: string;
  reqNumber: string;
  status: string;
  projectName: string;
  createdAt: string;
  lineCount: number;
};

const FILTER_CHIPS: { label: string; value: ReqStatus }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Converted", value: "CONVERTED" },
];

/**
 * Client component for the mobile requisition list. Handles
 * client-side search (req number / project name) + status filter
 * chips. When no filter/search is active, requisitions are shown
 * grouped by status section (Awaiting Approval → Draft → Approved →
 * Converted → Rejected). When a filter or search is active, a flat
 * result list is shown instead.
 */
export function MobileRequisitionsList({
  items,
}: {
  items: RequisitionListItem[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReqStatus>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (r) =>
          r.reqNumber.toLowerCase().includes(q) ||
          r.projectName.toLowerCase().includes(q),
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
        placeholder="Search by req no, project…"
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
function FlatList({ items }: { items: RequisitionListItem[] }) {
  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={ClipboardList}
        title="No matching requisitions"
        hint="Try a different search or filter"
      />
    );
  }
  return (
    <div>
      <MobileSectionTitle>Results ({items.length})</MobileSectionTitle>
      <div>
        {items.map((r) => (
          <MobileRow
            key={r.id}
            href={`/m/requisitions/${r.id}`}
            icon={ClipboardList}
            title={r.projectName}
            subtitle={`Req ${r.reqNumber} · ${formatDate(r.createdAt)}`}
            badge={<MobileStatusBadge status={r.status} />}
          />
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
 * Grouped list — the default status-sectioned view.
 * ---------------------------------------------------------------- */
function GroupedList({ items }: { items: RequisitionListItem[] }) {
  const byStatus = (s: string) => items.filter((r) => r.status === s);
  const submitted = byStatus("SUBMITTED");
  const drafts = byStatus("DRAFT");
  const approved = byStatus("APPROVED");
  const rejected = byStatus("REJECTED");
  const converted = byStatus("CONVERTED");

  return (
    <div>
      <MobileSectionTitle>Awaiting Approval ({submitted.length})</MobileSectionTitle>
      {submitted.length === 0 ? (
        <MobileEmptyState icon={ClipboardList} title="No requisitions awaiting approval" />
      ) : (
        <div>
          {submitted.map((r) => (
            <MobileRow
              key={r.id}
              href={`/m/requisitions/${r.id}`}
              icon={ClipboardList}
              title={r.projectName}
              subtitle={`Req ${r.reqNumber} · ${formatDate(r.createdAt)}`}
              badge={<MobileStatusBadge status={r.status} />}
            />
          ))}
        </div>
      )}

      {drafts.length > 0 && (
        <>
          <MobileSectionTitle>Draft ({drafts.length})</MobileSectionTitle>
          <div>
            {drafts.map((r) => (
              <MobileRow
                key={r.id}
                href={`/m/requisitions/${r.id}`}
                icon={ClipboardList}
                title={r.projectName}
                subtitle={`Req ${r.reqNumber}`}
                badge={<MobileStatusBadge status={r.status} />}
              />
            ))}
          </div>
        </>
      )}

      {approved.length > 0 && (
        <>
          <MobileSectionTitle>Approved — convert to PO ({approved.length})</MobileSectionTitle>
          <div>
            {approved.map((r) => (
              <MobileRow
                key={r.id}
                href={`/m/requisitions/${r.id}`}
                icon={ClipboardList}
                title={r.projectName}
                subtitle={`Req ${r.reqNumber}`}
                badge={<MobileStatusBadge status={r.status} />}
              />
            ))}
          </div>
        </>
      )}

      {converted.length > 0 && (
        <>
          <MobileSectionTitle>Converted ({converted.length})</MobileSectionTitle>
          <div>
            {converted.slice(0, 10).map((r) => (
              <MobileRow
                key={r.id}
                href={`/m/requisitions/${r.id}`}
                icon={ClipboardList}
                title={r.projectName}
                subtitle={`Req ${r.reqNumber}`}
                badge={<MobileStatusBadge status={r.status} />}
              />
            ))}
          </div>
        </>
      )}

      {rejected.length > 0 && (
        <>
          <MobileSectionTitle>Rejected ({rejected.length})</MobileSectionTitle>
          <div>
            {rejected.slice(0, 10).map((r) => (
              <MobileRow
                key={r.id}
                href={`/m/requisitions/${r.id}`}
                icon={ClipboardList}
                title={r.projectName}
                subtitle={`Req ${r.reqNumber}`}
                badge={<MobileStatusBadge status={r.status} />}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
