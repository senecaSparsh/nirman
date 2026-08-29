"use client";

import { useState, useMemo } from "react";
import { CalendarCheck, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileNoResults,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

type AttendanceStatusFilter =
  | "ALL"
  | "PRESENT"
  | "LATE"
  | "ABSENT"
  | "HALF_DAY"
  | "LEAVE"
  | "PAID_LEAVE"
  | "NON_PAID_LEAVE";

export type AttendanceListItem = {
  id: string;
  employeeName: string | null;
  projectName: string | null;
  projectId: string | null;
  date: string;
  status: string;
  /** Traffic-light tier: RED = absent, YELLOW = present+DPR pending, GREEN = present+DPR approved */
  tier?: "RED" | "YELLOW" | "GREEN";
  dprApproved?: boolean;
  checkIn: string | null;
  checkOut: string | null;
};

export type ProjectOption = {
  id: string;
  name: string;
};

const FILTER_CHIPS: { label: string; value: AttendanceStatusFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Present", value: "PRESENT" },
  { label: "Late", value: "LATE" },
  { label: "Absent", value: "ABSENT" },
  { label: "Half Day", value: "HALF_DAY" },
  { label: "Leave", value: "LEAVE" },
  { label: "PL", value: "PAID_LEAVE" },
  { label: "NPL", value: "NON_PAID_LEAVE" },
];

/**
 * Client component for the mobile attendance list. Handles client-side
 * search (employee name / project) + status filter chips. Flat list
 * since attendance records are chronological.
 *
 * Attendance records are not tappable — there is no mobile attendance
 * detail page, so they render as `MobileInfoRow` (non-navigable) with a
 * status badge.
 */
export function MobileAttendanceList({
  items,
  projects = [],
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: AttendanceListItem[];
  projects?: ProjectOption[];
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<AttendanceStatusFilter>("ALL");
  const [dateFilter, setDateFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (projectFilter) {
      result = result.filter((r) => r.projectId === projectFilter);
    }
    if (dateFilter) {
      result = result.filter((r) => r.date.slice(0, 10) === dateFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (r) =>
          (r.employeeName?.toLowerCase().includes(q) ?? false) ||
          (r.projectName?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [items, query, statusFilter, dateFilter, projectFilter]);

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={CalendarCheck}
        title="No attendance records"
        hint="Attendance records will appear here"
      />
    );
  }

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search..."
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
        showClear={!!query || statusFilter !== "ALL" || !!dateFilter || !!projectFilter}
        onClear={() => { setQuery(""); setStatusFilter("ALL"); setDateFilter(""); setProjectFilter(""); }}
      />

      {/* ── Date + project filters ── */}
      <div className="flex gap-2 mb-4">
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="flex-1 rounded-[0.5rem] border px-2.5 py-1.5 text-m-body font-medium outline-none"
          style={{
            borderColor: dateFilter ? "var(--color-ink-950)" : "var(--color-line)",
            backgroundColor: "var(--color-paper)",
            color: "var(--color-ink-950)",
          }}
        />
        {projects.length > 0 ? (
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="flex-1 rounded-[0.5rem] border px-2.5 py-1.5 text-m-body font-medium outline-none"
            style={{
              borderColor: projectFilter ? "var(--color-ink-950)" : "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-950)",
            }}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : null}
        {(dateFilter || projectFilter) ? (
          <button
            onClick={() => { setDateFilter(""); setProjectFilter(""); }}
            className="text-m-body press rounded-[0.375rem] px-2.5 py-1.5 text-m-label font-semibold"
            style={{ color: "var(--color-steel)" }}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <MobileSectionTitle
        right={
          (statusFilter !== "ALL" || query.trim() !== "" || dateFilter || projectFilter) ? (
            <span
              className="text-m-label font-semibold"
              style={{ color: "var(--color-ink-500)" }}
            >
              {filtered.length} record{filtered.length !== 1 ? "s" : ""}
            </span>
          ) : undefined
        }
      >
        {statusFilter === "ALL" && query.trim() === "" && !dateFilter && !projectFilter
          ? "Recent"
          : "Results"}
      </MobileSectionTitle>

      {filtered.length === 0 ? (
        <MobileNoResults title="No matching records" hint="Try a different search or filter" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((r) => (
            <MobileRow
              key={r.id}
              icon={CalendarCheck}
              title={r.employeeName ?? "Worker"}
              subtitle={`${r.projectName ?? "—"} · ${formatDate(r.date)}${r.checkIn ? ` · ${r.checkIn}${r.checkOut ? `–${r.checkOut}` : ""}` : ""}`}
              meta=""
              badge={
                <div className="flex items-center gap-1.5">
                  {r.tier && <TierDot tier={r.tier} />}
                  <MobileStatusBadge status={r.status} />
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Traffic-light tier dot — 🔴 RED / 🟡 YELLOW / 🟢 GREEN */
function TierDot({ tier }: { tier: "RED" | "YELLOW" | "GREEN" }) {
  const colors: Record<string, string> = {
    RED: "var(--color-stop)",
    YELLOW: "var(--color-signal)",
    GREEN: "var(--color-go)",
  };
  return (
    <span
      className="inline-block h-2 w-2 rounded-full shrink-0"
      style={{ backgroundColor: colors[tier] }}
      title={tier === "RED" ? "Absent" : tier === "YELLOW" ? "Present — DPR pending" : "Present — DPR approved"}
    />
  );
}
