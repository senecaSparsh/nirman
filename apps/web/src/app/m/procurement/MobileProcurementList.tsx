"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, X, AlertTriangle, Plus, FileText } from "lucide-react";
import { formatNumber, formatDate, formatCurrency } from "@/lib/utils";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";

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

/* ── Status → accent color + label ── */
const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  DRAFT:     { color: "var(--color-ink-500)",   label: "Draft" },
  APPROVED:  { color: "var(--color-signal)",    label: "Approved" },
  ORDERED:   { color: "var(--color-steel)",     label: "Ordered" },
  PARTIAL:   { color: "var(--color-signal)",    label: "Partial" },
  RECEIVED:  { color: "var(--color-go)",        label: "Received" },
  CANCELLED: { color: "var(--color-stop)",      label: "Cancelled" },
};

export function MobileProcurementList({
  items,
  canCreate,
}: {
  items: ProcurementListItem[];
  canCreate?: boolean;
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

  if (items.length === 0) {
    // Still render the New PO button even when there are no POs
    return (
      <div>
        {canCreate ? (
          <div className="mb-3">
            <Link
              href="/m/procurement/new"
              className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] border-2 border-dashed py-2.5 text-[0.6875rem] font-bold press"
              style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
            >
              <Plus className="size-3.5" />
              New Purchase Order
            </Link>
          </div>
        ) : null}
        <MobileEmptyState
          icon={FileText}
          title="No purchase orders"
          hint={canCreate ? "Tap above to create your first PO" : "Purchase orders will appear here"}
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
        {/* Search + New PO row */}
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
              placeholder="Search PO no, supplier…"
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
              href="/m/procurement/new"
              className="flex items-center gap-1 h-9 px-3 rounded-[0.625rem] text-[0.75rem] font-bold whitespace-nowrap press active:scale-95 shrink-0"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "#fff",
              }}
            >
              <Plus className="size-3.5" />
              New PO
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
            {filtered.length} PO{filtered.length !== 1 ? "s" : ""}
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
            No POs found
          </p>
          <p
            className="text-[0.6875rem] mt-1"
            style={{ color: "var(--color-ink-500)" }}
          >
            {query
              ? `Nothing matches "${query}"`
              : "No POs match the selected filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((po) => (
            <PoCard key={po.id} po={po} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PO CARD — compact 2-col grid card with status accent + context info.
   ═══════════════════════════════════════════════════════════════════════════ */
function PoCard({ po }: { po: ProcurementListItem }) {
  const style = STATUS_STYLE[po.status] ?? STATUS_STYLE.DRAFT!;
  const isOverdue = po.isOverdue;
  const accentColor = isOverdue ? "var(--color-stop)" : style.color;

  // Receiving progress for ordered/partial
  const showProgress = po.status === "ORDERED" || po.status === "PARTIAL";
  const recvPct = po.qtyOrdered > 0 ? (po.qtyReceived / po.qtyOrdered) * 100 : 0;

  // Days until/overdue delivery
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let deliveryText = "";
  let deliveryColor = "var(--color-ink-500)";
  if (po.expectedDate) {
    const expected = new Date(po.expectedDate);
    expected.setHours(0, 0, 0, 0);
    const diffDays = Math.round((expected.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (isOverdue) {
      deliveryText = `${Math.abs(diffDays)}d late`;
      deliveryColor = "var(--color-stop)";
    } else if (diffDays === 0) {
      deliveryText = "today";
      deliveryColor = "var(--color-signal)";
    } else if (diffDays === 1) {
      deliveryText = "tomorrow";
      deliveryColor = "var(--color-signal)";
    } else if (diffDays > 0) {
      deliveryText = `${diffDays}d`;
    } else {
      deliveryText = formatDate(po.expectedDate);
    }
  }

  return (
    <Link
      href={`/m/procurement/${po.id}`}
      className="flex flex-col rounded-[0.625rem] border overflow-hidden active:scale-[0.98] transition-transform"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Top accent strip */}
      <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />

      <div className="p-2 flex flex-col gap-1 flex-1">
        {/* Row 1: PO number + status label */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-[0.5625rem] font-mono font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {po.poNumber}
          </span>
          <span
            className="text-[0.4375rem] font-bold uppercase shrink-0"
            style={{ color: accentColor }}
          >
            {isOverdue ? "Overdue" : style.label}
          </span>
        </div>

        {/* Row 2: Supplier name */}
        <p className="text-[0.625rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
          {po.supplierName}
        </p>

        {/* Row 3: Total + delivery */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrency(po.total)}
          </span>
          {deliveryText ? (
            <span className="text-[0.4375rem] font-bold tabular-nums" style={{ color: deliveryColor }}>
              {deliveryText}
            </span>
          ) : po.status === "DRAFT" ? (
            <span className="text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>
              {formatDate(po.createdAt)}
            </span>
          ) : null}
        </div>

        {/* Row 4: Bottom area — fixed height for equal card sizes */}
        <div className="mt-auto pt-1 h-[1.5rem] flex items-center">
          {showProgress ? (
            <div className="w-full">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[0.375rem]" style={{ color: "var(--color-ink-500)" }}>
                  Received
                </span>
                <span className="text-[0.375rem] font-bold tabular-nums" style={{ color: "var(--color-ink-700)" }}>
                  {formatNumber(po.qtyReceived, 0)}/{formatNumber(po.qtyOrdered, 0)}
                </span>
              </div>
              <div
                className="h-1 rounded-full overflow-hidden"
                style={{ backgroundColor: "var(--color-concrete)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(recvPct, 100)}%`,
                    backgroundColor: po.status === "PARTIAL" ? "var(--color-signal)" : "var(--color-steel)",
                  }}
                />
              </div>
            </div>
          ) : isOverdue ? (
            <div className="flex items-center gap-1">
              <AlertTriangle className="size-2.5" style={{ color: "var(--color-stop)" }} />
              <span className="text-[0.375rem] font-semibold" style={{ color: "var(--color-stop)" }}>
                Awaiting receipt
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
