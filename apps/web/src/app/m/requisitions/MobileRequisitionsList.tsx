"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, X, Plus, CheckCircle2, ShoppingCart } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";

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
  projectName: string | null;
  createdAt: string;
  neededByDate: string | null;
  lineCount: number;
  quoteCount: number;
  minQuotesRequired: number;
  quotesWaived: boolean;
  convertedToPo: boolean;
  rejectReason: string | null;
  requestedByName: string | null;
};

const FILTER_CHIPS: { label: string; value: ReqStatus }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Converted", value: "CONVERTED" },
];

/* ── Status → accent color + label ── */
const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  DRAFT:     { color: "var(--color-ink-500)",  label: "Draft" },
  SUBMITTED: { color: "var(--color-signal)",   label: "Submitted" },
  APPROVED:  { color: "var(--color-steel)",    label: "Approved" },
  REJECTED:  { color: "var(--color-stop)",     label: "Rejected" },
  CONVERTED: { color: "var(--color-go)",       label: "Converted" },
};

export function MobileRequisitionsList({
  items,
  canCreate,
}: {
  items: RequisitionListItem[];
  canCreate?: boolean;
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
          r.projectName?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  if (items.length === 0) {
    // Still render the New Req button even when there are no requisitions
    return (
      <div>
        {canCreate ? (
          <div className="mb-3">
            <Link
              href="/m/requisitions/new"
              className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] border-2 border-dashed py-2.5 text-[0.6875rem] font-bold press"
              style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
            >
              <Plus className="size-3.5" />
              New Material Indent
            </Link>
          </div>
        ) : null}
        <MobileEmptyState
          icon={ShoppingCart}
          title="No material indents"
          hint={canCreate ? "Tap above to create your first indent" : "Material indents will appear here"}
        />
      </div>
    );
  }

  return (
    <div>
      {/* ── Sticky search header ── */}
      <div
        className="sticky top-0 z-20 border-b backdrop-blur-sm -mx-3.5 px-3.5 py-2 mb-2"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-paper) 95%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        {/* Search + New Req row */}
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4"
              style={{ color: "var(--color-ink-500)" }}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search req no, project…"
              className="w-full h-9 rounded-[0.625rem] border-2 pl-9 pr-3 text-[0.8125rem] focus:outline-none"
              style={{
                borderColor: query ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: "var(--color-paper)",
                color: "var(--color-ink-950)",
              }}
            />
          </div>
          {canCreate ? (
            <Link
              href="/m/requisitions/new"
              className="flex items-center gap-1 h-9 px-3 rounded-[0.625rem] text-[0.75rem] font-bold whitespace-nowrap press active:scale-95 shrink-0"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "#fff",
              }}
            >
              <Plus className="size-3.5" />
              New Requisition
            </Link>
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
                  className="press rounded-full px-2.5 py-1 shrink-0 text-[0.6875rem] font-semibold border transition-colors"
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

        {/* Result count + clear */}
        <div className="flex items-center justify-between mt-2">
          <span
            className="text-[0.6875rem] font-semibold"
            style={{ color: "var(--color-ink-500)" }}
          >
            {filtered.length} requisition{filtered.length !== 1 ? "s" : ""}
          </span>
          {(statusFilter !== "ALL" || query) && filtered.length > 0 ? (
            <button
              onClick={() => {
                setQuery("");
                setStatusFilter("ALL");
              }}
              className="text-[0.6875rem] font-semibold flex items-center gap-1"
              style={{ color: "var(--color-steel)" }}
            >
              <X className="size-3" /> Clear
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Results ── */}
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
            No requisitions found
          </p>
          <p
            className="text-[0.6875rem] mt-1"
            style={{ color: "var(--color-ink-500)" }}
          >
            {query
              ? `Nothing matches "${query}"`
              : "No requisitions match the selected filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((r) => (
            <ReqCard key={r.id} req={r} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   REQ CARD — distinct from PO cards. Left accent bar, requester-focused,
   needed-by badge, approval workflow context.
   ═══════════════════════════════════════════════════════════════════════════ */
function ReqCard({ req }: { req: RequisitionListItem }) {
  const style = STATUS_STYLE[req.status] ?? STATUS_STYLE.DRAFT!;
  const accentColor = style.color;

  // Needed-by date context
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let neededText = "";
  let neededColor = "var(--color-ink-500)";
  let neededUrgent = false;
  if (req.neededByDate) {
    const needed = new Date(req.neededByDate);
    needed.setHours(0, 0, 0, 0);
    const diffDays = Math.round((needed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      neededText = `${Math.abs(diffDays)}d overdue`;
      neededColor = "var(--color-stop)";
      neededUrgent = true;
    } else if (diffDays === 0) {
      neededText = "today";
      neededColor = "var(--color-stop)";
      neededUrgent = true;
    } else if (diffDays <= 3) {
      neededText = `${diffDays}d left`;
      neededColor = "var(--color-signal)";
      neededUrgent = true;
    } else {
      neededText = formatDate(req.neededByDate);
    }
  }

  // Quote gate status for approved reqs
  const quotesMet = req.quoteCount >= req.minQuotesRequired || req.quotesWaived;

  return (
    <Link
      href={`/m/requisitions/${req.id}`}
      className="flex rounded-[0.625rem] border overflow-hidden active:scale-[0.98] transition-transform"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Left accent bar — distinct from PO's top strip */}
      <div className="w-1 shrink-0" style={{ backgroundColor: accentColor }} />

      <div className="p-2 flex flex-col gap-1 flex-1 min-w-0">
        {/* Row 1: Req number + needed-by badge */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-[0.5625rem] font-mono font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {req.reqNumber}
          </span>
          {neededText ? (
            <span
              className="text-[0.5625rem] font-bold tabular-nums px-2 py-0.5 rounded-[0.375rem] shrink-0"
              style={{
                backgroundColor: neededUrgent ? neededColor : "var(--color-concrete)",
                color: neededUrgent ? "#fff" : "var(--color-ink-500)",
              }}
            >
              {neededText}
            </span>
          ) : null}
        </div>

        {/* Row 2: Project name */}
        <p className="text-[0.625rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
          {req.projectName ?? "No project"}
        </p>

        {/* Row 3: Requester + line count */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-[0.4375rem] truncate" style={{ color: "var(--color-ink-500)" }}>
            {req.requestedByName ?? "—"}
          </span>
          <span className="text-[0.4375rem] font-semibold tabular-nums shrink-0" style={{ color: "var(--color-ink-700)" }}>
            {req.lineCount} item{req.lineCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Row 4: Bottom area — fixed height, status-specific action context */}
        <div className="mt-auto pt-1 h-[1.5rem] flex items-center">
          {req.status === "SUBMITTED" ? (
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--color-signal)" }} />
              <span className="text-[0.375rem] font-semibold" style={{ color: "var(--color-signal)" }}>
                Needs approval
              </span>
            </div>
          ) : req.status === "APPROVED" ? (
            quotesMet ? (
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--color-go)" }} />
                <span className="text-[0.375rem] font-semibold" style={{ color: "var(--color-go)" }}>
                  Convert to Purchase Order
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--color-signal)" }} />
                <span className="text-[0.375rem] font-semibold" style={{ color: "var(--color-signal)" }}>
                  {req.quoteCount}/{req.minQuotesRequired} quotes
                </span>
              </div>
            )
          ) : req.status === "CONVERTED" ? (
            <div className="flex items-center gap-1">
              <CheckCircle2 className="size-2.5" style={{ color: "var(--color-go)" }} />
              <span className="text-[0.375rem] font-semibold" style={{ color: "var(--color-go)" }}>
                Purchase Order created
              </span>
            </div>
          ) : req.status === "REJECTED" ? (
            <span className="text-[0.375rem] font-semibold truncate" style={{ color: "var(--color-stop)" }}>
              {req.rejectReason ?? "Rejected"}
            </span>
          ) : req.status === "DRAFT" ? (
            <span className="text-[0.375rem]" style={{ color: "var(--color-ink-500)" }}>
              {formatDate(req.createdAt)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
