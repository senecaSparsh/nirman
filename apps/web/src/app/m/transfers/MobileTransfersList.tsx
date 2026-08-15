"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight, Plus, Search, Package,
  CheckCircle2, Clock, AlertTriangle, X,
} from "lucide-react";
import { formatNumber, formatDate } from "@/lib/utils";
import { MobileStatusBadge, MobileEmptyState } from "@/components/mobile/v2/primitives";

export interface TransferItem {
  id: string;
  fromLocationName: string;
  fromLocationType: string;
  fromCompanyName: string | null;
  toLocationName: string;
  toLocationType: string;
  toCompanyName: string | null;
  status: string;
  transferDate: string;
  createdAt: string;
  notes: string | null;
  lineCount: number;
  totalQty: number;
  materials: string[];
  isInterCompany: boolean;
  transferPriceTotal: number | null;
}

type TransferFilter = "ALL" | "PENDING" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";

const FILTERS: { label: string; value: TransferFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "In Transit", value: "IN_TRANSIT" },
  { label: "Received", value: "RECEIVED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  PENDING: Clock,
  IN_TRANSIT: ArrowRight,
  RECEIVED: CheckCircle2,
  CANCELLED: AlertTriangle,
};

export function MobileTransfersList({
  items,
  canCreate,
}: {
  items: TransferItem[];
  canCreate: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TransferFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "ALL") result = result.filter((t) => t.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (t) =>
          t.fromLocationName.toLowerCase().includes(q) ||
          t.toLocationName.toLowerCase().includes(q) ||
          t.materials.some((m) => m.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [items, query, filter]);

  const counts = {
    total: items.length,
    pending: items.filter((t) => t.status === "PENDING").length,
    inTransit: items.filter((t) => t.status === "IN_TRANSIT").length,
    received: items.filter((t) => t.status === "RECEIVED").length,
  };

  return (
    <div className="pb-6">
      {/* ── Summary ── */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div
            className="grid place-items-center size-8 rounded-full shrink-0"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <ArrowRight className="size-4" style={{ color: "var(--color-ink-600)" }} />
          </div>
          <div>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              {items.length} {items.length === 1 ? "transfer" : "transfers"}
            </p>
            <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
              {counts.pending} pending · {counts.inTransit} in transit · {counts.received} received
            </p>
          </div>
        </div>
      </div>

      {/* ── Create button ── */}
      {canCreate && (
        <Link
          href="/m/transfers/new"
          className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] border-2 border-dashed py-2.5 text-[0.6875rem] font-bold press mb-3"
          style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
        >
          <Plus className="size-3.5" />
          New Stock Transfer
        </Link>
      )}

      {/* ── Search ── */}
      <div className="relative mb-3">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
          style={{ color: "var(--color-ink-400)" }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by location or material…"
          className="w-full h-9 rounded-[0.5rem] border pl-8 pr-3 text-[0.6875rem] outline-none"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper)",
            color: "var(--color-ink-950)",
          }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-ink-400)" }}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* ── Filter chips ── */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className="shrink-0 h-7 px-2.5 rounded-full text-[0.5625rem] font-semibold press"
              style={{
                color: active ? "#fff" : "var(--color-ink-600)",
                backgroundColor: active ? "var(--color-ink-950)" : "var(--color-paper)",
                border: active ? "none" : "1px solid var(--color-line)",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* ── Transfer cards ── */}
      <div className="flex flex-col gap-2">
        {filtered.map((t) => {
          const StatusIcon = STATUS_ICON[t.status] ?? Package;
          return (
            <Link
              key={t.id}
              href={`/m/transfers/${t.id}`}
              className="block rounded-[0.625rem] border overflow-hidden active:opacity-80 transition-opacity"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            >
              {/* Header: from → to */}
              <div className="p-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.5625rem] font-semibold truncate" style={{ color: "var(--color-ink-500)" }}>
                      {t.fromLocationName}
                    </p>
                    {t.isInterCompany && t.fromCompanyName && (
                      <p className="text-[0.4375rem] truncate" style={{ color: "var(--color-steel)" }}>
                        {t.fromCompanyName}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />
                  <div className="min-w-0 flex-1 text-right">
                    <p className="text-[0.5625rem] font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>
                      {t.toLocationName}
                    </p>
                    {t.isInterCompany && t.toCompanyName && (
                      <p className="text-[0.4375rem] truncate" style={{ color: "var(--color-steel)" }}>
                        {t.toCompanyName}
                      </p>
                    )}
                  </div>
                </div>

                {/* Status + date */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon
                      className="size-3"
                      style={{
                        color:
                          t.status === "RECEIVED" ? "var(--color-go)" :
                          t.status === "CANCELLED" ? "var(--color-stop)" :
                          "var(--color-signal-dark)",
                      }}
                    />
                    <MobileStatusBadge status={t.status} />
                  </div>
                  <span className="text-[0.4375rem]" style={{ color: "var(--color-ink-400)" }}>
                    {formatDate(t.transferDate)}
                  </span>
                </div>
              </div>

              {/* Footer: materials + qty */}
              <div
                className="px-2.5 py-1.5 flex items-center justify-between"
                style={{ backgroundColor: "var(--color-paper-2)", borderTop: "1px solid var(--color-line)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                    {t.lineCount} {t.lineCount === 1 ? "item" : "items"}
                  </p>
                  <p className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-700)" }}>
                    {t.materials.slice(0, 3).join(", ")}
                    {t.materials.length > 3 ? ` +${t.materials.length - 3} more` : ""}
                  </p>
                </div>
                <span className="text-[0.625rem] font-bold tabular-nums shrink-0" style={{ color: "var(--color-ink-950)" }}>
                  {formatNumber(t.totalQty, 2)} units
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <MobileEmptyState
          icon={ArrowRight}
          title={query || filter !== "ALL" ? "No transfers found" : "No stock transfers yet"}
          hint={query || filter !== "ALL" ? "Try a different search or filter" : "Move stock between warehouses or project sites"}
          action={canCreate && !query && filter === "ALL" ? (
            <Link
              href="/m/transfers/new"
              className="flex items-center gap-1.5 rounded-[0.5rem] px-3 py-2 text-[0.6875rem] font-bold press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
            >
              <Plus className="size-3.5" />
              New Transfer
            </Link>
          ) : undefined}
        />
      )}
    </div>
  );
}
