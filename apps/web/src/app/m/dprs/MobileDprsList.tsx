"use client";

import { useState, useMemo } from "react";
import { ClipboardList } from "lucide-react";
import { formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileInfoRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

type DprApprovalFilter =
  | "ALL"
  | "SUBMITTED"
  | "SUB_ADMIN_APPROVED"
  | "APPROVED"
  | "REJECTED";

export type DprListItem = {
  id: string;
  date: string;
  projectName: string;
  projectId: string;
  submittedByName: string | null;
  approvalStatus: string;
  progressPct: number;
  workType: string | null;
};

const FILTER_CHIPS: { label: string; value: DprApprovalFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Sub-Admin", value: "SUB_ADMIN_APPROVED" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
];

/**
 * Client component for the mobile DPR list. Handles client-side search
 * (project name / submitter) + approval-status filter chips. When no
 * filter/search is active, DPRs are shown grouped by approval status
 * (Submitted → Sub-Admin Approved → Approved → Rejected). When a filter
 * or search is active, a flat result list is shown instead.
 *
 * DPRs are not tappable — there is no mobile DPR detail page, so they
 * render as `MobileInfoRow` (non-navigable) with a status badge.
 */
export function MobileDprsList({
  items,
}: {
  items: DprListItem[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DprApprovalFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((d) => d.approvalStatus === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (d) =>
          d.projectName.toLowerCase().includes(q) ||
          (d.submittedByName?.toLowerCase().includes(q) ?? false),
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
        placeholder="Search by project, submitter…"
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
function FlatList({ items }: { items: DprListItem[] }) {
  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={ClipboardList}
        title="No matching DPRs"
        hint="Try a different search or filter"
      />
    );
  }
  return (
    <div>
      <MobileSectionTitle>Results ({items.length})</MobileSectionTitle>
      <div>
        {items.map((d) => (
          <DprRow key={d.id} d={d} />
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
 * Grouped list — the default status-sectioned view.
 * ---------------------------------------------------------------- */
function GroupedList({ items }: { items: DprListItem[] }) {
  const byStatus = (s: string) => items.filter((d) => d.approvalStatus === s);
  const submitted = byStatus("SUBMITTED");
  const subAdmin = byStatus("SUB_ADMIN_APPROVED");
  const approved = byStatus("APPROVED");
  const rejected = byStatus("REJECTED");

  return (
    <div>
      <MobileSectionTitle>Submitted ({submitted.length})</MobileSectionTitle>
      {submitted.length === 0 ? (
        <MobileEmptyState icon={ClipboardList} title="No pending DPRs" hint="Submitted DPRs await Sub-Admin approval" />
      ) : (
        <div>
          {submitted.map((d) => (
            <DprRow key={d.id} d={d} />
          ))}
        </div>
      )}

      {subAdmin.length > 0 && (
        <>
          <MobileSectionTitle>Sub-Admin Approved ({subAdmin.length})</MobileSectionTitle>
          <div>
            {subAdmin.map((d) => (
              <DprRow key={d.id} d={d} />
            ))}
          </div>
        </>
      )}

      {approved.length > 0 && (
        <>
          <MobileSectionTitle>Approved ({approved.length})</MobileSectionTitle>
          <div>
            {approved.slice(0, 15).map((d) => (
              <DprRow key={d.id} d={d} />
            ))}
          </div>
        </>
      )}

      {rejected.length > 0 && (
        <>
          <MobileSectionTitle>Rejected ({rejected.length})</MobileSectionTitle>
          <div>
            {rejected.map((d) => (
              <DprRow key={d.id} d={d} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** A single DPR row — non-navigable (no mobile detail page) with badge. */
function DprRow({ d }: { d: DprListItem }) {
  return (
    <MobileInfoRow
      icon={ClipboardList}
      title={d.projectName}
      subtitle={`${formatDate(d.date)} · ${d.submittedByName ?? "—"}${d.workType ? ` · ${d.workType}` : ""}`}
      value={`${d.progressPct}%`}
      badge={<MobileStatusBadge status={d.approvalStatus} />}
    />
  );
}
