"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, X, Plus, ClipboardList } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";

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

/* ── Approval status → color + label + step index ── */
const STATUS_INFO: Record<string, { color: string; label: string; step: number }> = {
  SUBMITTED:          { color: "var(--color-signal)", label: "Submitted",      step: 1 },
  SUB_ADMIN_APPROVED: { color: "var(--color-steel)",  label: "Sub-Admin OK",   step: 2 },
  APPROVED:           { color: "var(--color-go)",     label: "Approved",       step: 3 },
  REJECTED:           { color: "var(--color-stop)",   label: "Rejected",       step: 0 },
};

export function MobileDprsList({
  items,
  canSubmit,
}: {
  items: DprListItem[];
  canSubmit?: boolean;
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

  // Group by date label
  const grouped = useMemo(() => {
    const today = newDate();
    const yesterday = newDate(); yesterday.setDate(yesterday.getDate() - 1);
    const groups: { label: string; items: DprListItem[] }[] = [];
    const map = new Map<string, DprListItem[]>();

    for (const d of filtered) {
      const dDate = new Date(d.date);
      const label = sameDay(dDate, today)
        ? "Today"
        : sameDay(dDate, yesterday)
          ? "Yesterday"
          : formatDate(d.date);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(d);
    }
    for (const [label, items] of map) {
      groups.push({ label, items });
    }
    return groups;
  }, [filtered]);

  if (items.length === 0) {
    // Still render the "Today" (New DPR) button even when there are no DPRs
    return (
      <div>
        {canSubmit ? (
          <div className="mb-3">
            <a
              href="/m/site/dpr"
              className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] border-2 border-dashed py-2.5 text-[0.6875rem] font-bold press"
              style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
            >
              <Plus className="size-3.5" />
              Submit Today's DPR
            </a>
          </div>
        ) : null}
        <MobileEmptyState
          icon={ClipboardList}
          title="No DPRs yet"
          hint={canSubmit ? "Tap above to submit your first DPR" : "Daily progress reports will appear here"}
        />
      </div>
    );
  }

  return (
    <div>
      {/* ── Sticky search header ── */}
      <div
        className="sticky top-0 z-20 border-b backdrop-blur-sm -mx-3.5 px-3.5 py-1.5 mb-2"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-paper) 95%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        {/* Search + Submit Today row */}
        <div className="flex items-center gap-2 mb-1.5">
          <div className="relative flex-1">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
              style={{ color: "var(--color-ink-500)" }}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search project, submitter…"
              className="w-full h-8 rounded-[0.5rem] border pl-8 pr-3 text-[0.75rem] focus:outline-none"
              style={{
                borderColor: query ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: "var(--color-paper)",
                color: "var(--color-ink-950)",
              }}
            />
          </div>
          {canSubmit ? (
            <a
              href="/m/site/dpr"
              className="flex items-center gap-1 h-8 px-2.5 rounded-[0.5rem] text-[0.6875rem] font-bold whitespace-nowrap press active:scale-95 shrink-0"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "#fff",
              }}
            >
              <Plus className="size-3" />
              Today
            </a>
          ) : null}
        </div>

        {/* Filter chips */}
        <div className="-mx-3.5 px-3.5 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1.5 w-max items-center">
            {FILTER_CHIPS.map((chip) => {
              const active = statusFilter === chip.value;
              return (
                <button
                  key={chip.value}
                  onClick={() => setStatusFilter(chip.value)}
                  className="press rounded-full px-2 py-0.5 shrink-0 text-[0.625rem] font-semibold border transition-colors"
                  style={
                    active
                      ? { backgroundColor: "var(--color-ink-950)", borderColor: "var(--color-ink-950)", color: "#fff" }
                      : { color: "var(--color-ink-700)", borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }
                  }
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Clear button (only when filtering) */}
        {(statusFilter !== "ALL" || query) && filtered.length > 0 ? (
          <button
            onClick={() => {
              setQuery("");
              setStatusFilter("ALL");
            }}
            className="text-[0.625rem] font-semibold flex items-center gap-1 mt-1"
            style={{ color: "var(--color-steel)" }}
          >
            <X className="size-2.5" /> Clear
          </button>
        ) : null}
      </div>

      {/* ── Date-grouped sections ── */}
      {filtered.length === 0 ? (
        <div
          className="rounded-[0.875rem] border p-5 text-center"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper)",
          }}
        >
          <p
            className="font-semibold text-[0.875rem]"
            style={{ color: "var(--color-ink-950)" }}
          >
            No DPRs found
          </p>
          <p
            className="text-[0.6875rem] mt-1"
            style={{ color: "var(--color-ink-500)" }}
          >
            {query
              ? `Nothing matches "${query}"`
              : "No DPRs match the selected filter."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map((group) => (
            <div key={group.label}>
              {/* Date section header */}
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-[0.6875rem] font-bold"
                  style={{ color: "var(--color-ink-950)" }}
                >
                  {group.label}
                </span>
                <span
                  className="text-[0.5625rem] font-semibold"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  {group.items.length} report{group.items.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* DPR strips */}
              <div className="flex flex-col gap-2">
                {group.items.map((d) => (
                  <DprStrip key={d.id} dpr={d} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DPR STRIP — full-width horizontal card with progress ring + approval dots.
   ═══════════════════════════════════════════════════════════════════════════ */
function DprStrip({ dpr }: { dpr: DprListItem }) {
  const info = STATUS_INFO[dpr.approvalStatus] ?? STATUS_INFO.SUBMITTED!;
  const isRejected = dpr.approvalStatus === "REJECTED";
  const pct = Math.min(dpr.progressPct, 100);

  return (
    <Link
      href={`/m/dprs/${dpr.id}`}
      className="flex items-stretch rounded-[0.625rem] border overflow-hidden active:scale-[0.98] transition-transform"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Left edge — colored by status */}
      <div className="w-1 shrink-0" style={{ backgroundColor: info.color }} />

      {/* Main content */}
      <div className="flex-1 min-w-0 p-2.5">
        {/* Row 1: Project + status label */}
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {dpr.projectName}
          </p>
          <span
            className="text-[0.5625rem] font-bold uppercase shrink-0"
            style={{ color: info.color }}
          >
            {info.label}
          </span>
        </div>

        {/* Row 2: Submitter + work type */}
        <p className="text-[0.5625rem] truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>
          {dpr.submittedByName ?? "—"}
          {dpr.workType ? ` · ${dpr.workType}` : ""}
        </p>

        {/* Row 3: Progress bar */}
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="h-1.5 rounded-full overflow-hidden flex-1"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor: isRejected ? "var(--color-stop)" : info.color,
              }}
            />
          </div>
        </div>

        {/* Row 4: 3-dot approval step indicator */}
        <div className="flex items-center gap-1.5">
          <ApprovalDot active={info.step >= 1} color={info.color} label="Submit" />
          <ApprovalConnector active={info.step >= 2} color={info.color} />
          <ApprovalDot active={info.step >= 2} color={info.color} label="Sub-Admin" />
          <ApprovalConnector active={info.step >= 3} color={info.color} />
          <ApprovalDot active={info.step >= 3} color={info.color} label="Admin" />
          {isRejected ? (
            <span
              className="text-[0.5rem] font-bold ml-1"
              style={{ color: "var(--color-stop)" }}
            >
              Rejected
            </span>
          ) : null}
        </div>
      </div>

      {/* Right — circular progress ring */}
      <div
        className="grid place-items-center w-14 shrink-0"
        style={{ backgroundColor: "var(--color-paper-2)" }}
      >
        <ProgressRing pct={pct} color={isRejected ? "var(--color-stop)" : info.color} />
      </div>
    </Link>
  );
}

/* ── Approval step dot ── */
function ApprovalDot({ active, color, label }: { active: boolean; color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div
        className="w-2 h-2 rounded-full"
        style={{
          backgroundColor: active ? color : "var(--color-concrete)",
        }}
      />
      <span
        className="text-[0.4375rem] font-semibold"
        style={{ color: active ? "var(--color-ink-700)" : "var(--color-ink-400)" }}
      >
        {label}
      </span>
    </div>
  );
}

/* ── Connector line between dots ── */
function ApprovalConnector({ active, color }: { active: boolean; color: string }) {
  return (
    <div
      className="h-px w-3"
      style={{ backgroundColor: active ? color : "var(--color-concrete)" }}
    />
  );
}

/* ── Circular progress ring (SVG arc) ── */
function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const size = 36;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-concrete)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-300"
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90"
        style={{
          transformOrigin: "center",
          fontSize: "9px",
          fontWeight: 700,
          fill: "var(--color-ink-950)",
          fontFamily: "system-ui",
        }}
      >
        {Math.round(pct)}
      </text>
    </svg>
  );
}

/* ── Date helpers ── */
function newDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}
