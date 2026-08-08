"use client";

import { useState, useMemo } from "react";
import { CalendarCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileInfoRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

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
  date: string;
  status: string;
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
}: {
  items: AttendanceListItem[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<AttendanceStatusFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((r) => r.status === statusFilter);
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
  }, [items, query, statusFilter]);

  if (items.length === 0) return null;

  return (
    <div>
      <MobileSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search by employee, project…"
      />

      <MobileFilterChips
        chips={FILTER_CHIPS}
        active={statusFilter}
        onChange={setStatusFilter}
      />

      <MobileSectionTitle>
        {statusFilter === "ALL" && query.trim() === ""
          ? "Recent"
          : `Results (${filtered.length})`}
      </MobileSectionTitle>

      {filtered.length === 0 ? (
        <MobileEmptyState
          icon={CalendarCheck}
          title="No matching records"
          hint="Try a different search or filter"
        />
      ) : (
        <div>
          {filtered.map((r) => (
            <MobileInfoRow
              key={r.id}
              icon={CalendarCheck}
              title={r.employeeName ?? "Worker"}
              subtitle={`${r.projectName ?? "—"} · ${formatDate(r.date)}`}
              value=""
              badge={<MobileStatusBadge status={r.status} />}
            />
          ))}
        </div>
      )}
    </div>
  );
}
