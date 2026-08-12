"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search, X, Users, Phone,
  UserPlus,
  AlertCircle, ChevronRight,
} from "lucide-react";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";

/* ─── Types ─── */

export type CustomerListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  activeCount: number;
  totalValue: number;
  totalPaid: number;
  outstanding: number;
  dueCount: number;
  paymentStatus: string;
};

interface Stats {
  customerCount: number;
  withDues: number;
  totalOutstanding: number;
  pipelineValue: number;
}

type Filter = "all" | "dues" | "clear";

const PAYMENT_BADGE: Record<string, { color: string; label: string }> = {
  PENDING: { color: "var(--color-signal)", label: "Unpaid" },
  PARTIAL: { color: "var(--color-signal)", label: "Partial" },
  PAID: { color: "var(--color-go)", label: "Clear" },
  NONE: { color: "var(--color-ink-400)", label: "No sales" },
};

/**
 * Customer directory — search, filter by payment status, and a list
 * of customer cards. The outstanding banner at top shows total money
 * owed across all customers — the #1 thing a sales manager cares about.
 */
export function MobileCustomersList({
  items,
  stats,
}: {
  items: CustomerListItem[];
  stats: Stats;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    let result = items;
    if (filter === "dues") result = result.filter((c) => c.dueCount > 0);
    else if (filter === "clear") result = result.filter((c) => c.dueCount === 0);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone?.toLowerCase().includes(q) ?? false) ||
          (c.gstin?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [items, query, filter]);

  const duesCount = items.filter((c) => c.dueCount > 0).length;
  const clearCount = items.length - duesCount;

  return (
    <div>
      {/* ── Outstanding banner — the money you're owed ── */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{
          borderColor: stats.totalOutstanding > 0 ? "var(--color-signal)" : "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Total Outstanding
            </p>
            <p
              className="text-[1.25rem] font-bold tabular-nums leading-tight"
              style={{ color: stats.totalOutstanding > 0 ? "var(--color-signal)" : "var(--color-ink-950)" }}
            >
              {formatCurrency(stats.totalOutstanding)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Pipeline
            </p>
            <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrencyCompact(stats.pipelineValue)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[0.5rem] font-semibold mt-1">
          <span className="flex items-center gap-0.5" style={{ color: "var(--color-ink-600)" }}>
            <Users className="size-2.5" />
            {stats.customerCount} customers
          </span>
          <span className="flex items-center gap-0.5" style={{ color: "var(--color-signal)" }}>
            <AlertCircle className="size-2.5" />
            {stats.withDues} with dues
          </span>
        </div>
      </div>

      {/* ── New Customer button ── */}
      <Link
        href="/m/customers/new"
        className="flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] mb-3 text-[0.625rem] font-bold press"
        style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
      >
        <UserPlus className="size-3.5" />
        New Customer
      </Link>

      {/* ── Search ── */}
      <div className="mb-2.5">
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
            style={{ color: "var(--color-ink-500)" }}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone, GSTIN…"
            className="w-full h-9 rounded-[0.5rem] border pl-8 pr-8 text-[0.75rem] outline-none"
            style={{
              borderColor: query ? "var(--color-ink-950)" : "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-950)",
            }}
          />
          {query ? (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 press">
              <X className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Filter chips ── */}
      <div className="flex items-center gap-1 mb-3">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" count={items.length} />
        <FilterChip active={filter === "dues"} onClick={() => setFilter("dues")} label="Dues" count={duesCount} color="var(--color-signal)" />
        <FilterChip active={filter === "clear"} onClick={() => setFilter("clear")} label="Clear" count={clearCount} color="var(--color-go)" />
      </div>

      {/* ── Customer cards ── */}
      {filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-10 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <Users className="size-7 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            {query ? "No matching customers" : filter === "dues" ? "No customers with dues" : filter === "clear" ? "No clear customers" : "No customers yet"}
          </p>
          <p className="text-[0.625rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
            {query ? "Try a different search" : "Create a customer to start booking sales"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((c) => (
            <CustomerCard key={c.id} customer={c} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Filter chip ─── */
function FilterChip({
  active, onClick, label, count, color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 h-7 px-2.5 rounded-full text-[0.5625rem] font-bold transition-colors press"
      style={{
        backgroundColor: active ? (color ?? "var(--color-ink-950)") : "var(--color-paper-2)",
        color: active ? "var(--color-paper)" : "var(--color-ink-500)",
        border: `1px solid ${active ? (color ?? "var(--color-ink-950)") : "var(--color-line)"}`,
      }}
    >
      {label}
      <span className="text-[0.4375rem] tabular-nums" style={{ opacity: active ? 0.7 : 0.5 }}>
        {count}
      </span>
    </button>
  );
}

/* ─── Customer card ─── */
function CustomerCard({ customer: c }: { customer: CustomerListItem }) {
  const badge = PAYMENT_BADGE[c.paymentStatus] ?? { color: "var(--color-ink-400)", label: "Unknown" };
  const hasDues = c.dueCount > 0;
  const hasSales = c.activeCount > 0;

  return (
    <Link
      href={`/m/customers/${c.id}`}
      className="block rounded-[0.5rem] border overflow-hidden active:scale-[0.99] transition-transform"
      style={{
        borderColor: hasDues ? "var(--color-signal)" : "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <div className="p-2.5">
        {/* ── Top: name + badge ── */}
        <div className="flex items-center justify-between mb-1">
          <p className="text-[0.75rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
            {c.name}
          </p>
          <span
            className="flex items-center gap-0.5 text-[0.375rem] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
            style={{ color: badge.color, backgroundColor: `color-mix(in srgb, ${badge.color} 12%, transparent)` }}
          >
            {badge.label}
          </span>
        </div>

        {/* ── Phone ── */}
        {c.phone ? (
          <p className="text-[0.5rem] flex items-center gap-0.5 mb-1.5" style={{ color: "var(--color-ink-500)" }}>
            <Phone className="size-2.5" />
            {c.phone}
          </p>
        ) : (
          <p className="text-[0.5rem] mb-1.5" style={{ color: "var(--color-ink-400)" }}>
            No phone
          </p>
        )}

        {/* ── Financial row ── */}
        {hasSales ? (
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                Sales
              </p>
              <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrencyCompact(c.totalValue)}
              </p>
            </div>

            {c.outstanding > 0 ? (
              <>
                <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
                <div>
                  <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                    Outstanding
                  </p>
                  <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-signal)" }}>
                    {formatCurrencyCompact(c.outstanding)}
                  </p>
                </div>
              </>
            ) : null}

            <div className="ml-auto text-right">
              <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                Deals
              </p>
              <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {c.activeCount}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[0.5rem]" style={{ color: "var(--color-ink-400)" }}>
            No sales yet
          </p>
        )}
      </div>

      {/* ── Outstanding accent bar ── */}
      {hasDues ? (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1"
          style={{ borderTop: "1px solid var(--color-line)", backgroundColor: `color-mix(in srgb, var(--color-signal) 5%, transparent)` }}
        >
          <AlertCircle className="size-2.5" style={{ color: "var(--color-signal)" }} />
          <span className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-signal)" }}>
            {c.dueCount} {c.dueCount === 1 ? "sale" : "sales"} with dues
          </span>
          <ChevronRight className="size-3 ml-auto" style={{ color: "var(--color-ink-500)" }} />
        </div>
      ) : null}
    </Link>
  );
}
