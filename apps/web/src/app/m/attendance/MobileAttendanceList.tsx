"use client";

import { useState, useMemo } from "react";
import { CalendarCheck, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileStatusBadge,
} from "@/components/mobile/v2/primitives";
import {
  MobileSearchHeader,
  MobileFilterChips,
  MobileNoResults,
} from "@/components/mobile/v2/scaffold";

type AttendanceStatusFilter =
  | "ALL"
  | "PRESENT"
  | "ABSENT"
  | "HALF_DAY"
  | "LEAVE";

export type AttendanceListItem = {
  id: string;
  employeeName: string | null;
  projectName: string | null;
  projectId: string | null;
  date: string;
  status: string;
};

export type ProjectOption = {
  id: string;
  name: string;
};

const FILTER_CHIPS: { label: string; value: AttendanceStatusFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Present", value: "PRESENT" },
  { label: "Absent", value: "ABSENT" },
  { label: "Half Day", value: "HALF_DAY" },
  { label: "Leave", value: "LEAVE" },
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
}: {
  items: AttendanceListItem[];
  projects?: ProjectOption[];
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

  if (items.length === 0) return null;

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search..."
        filterChips={
          <MobileFilterChips
            chips={FILTER_CHIPS}
            active={statusFilter}
            onChange={setStatusFilter}
          />
        }
        showClear={!!query}
        onClear={() => setQuery("")}
      />

      {/* ── Date + project filters ── */}
      <div className="flex gap-2 mb-4">
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="flex-1 rounded-[0.5rem] border px-2.5 py-1.5 text-[0.6875rem] font-medium outline-none"
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
            className="flex-1 rounded-[0.5rem] border px-2.5 py-1.5 text-[0.6875rem] font-medium outline-none"
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
            className="press rounded-[0.375rem] px-2.5 py-1.5 text-[0.625rem] font-semibold"
            style={{ color: "var(--color-steel)" }}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <MobileSectionTitle>
        {statusFilter === "ALL" && query.trim() === "" && !dateFilter && !projectFilter
          ? "Recent"
          : `Results (${filtered.length})`}
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
              subtitle={`${r.projectName ?? "—"} · ${formatDate(r.date)}`}
              meta=""
              badge={<MobileStatusBadge status={r.status} />}
            />
          ))}
        </div>
      )}
    </div>
  );
}
