"use client";

import { useState, useMemo } from "react";
import { MobileLink as Link } from "@/components/mobile/mobile-link";
import {
  Users, Phone,
  UserPlus,
  AlertCircle, ChevronRight,
} from "lucide-react";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import {
  MobileFilterChips,
  MobileNoResults,
  type FilterChip,
} from "@/components/mobile/v2/scaffold";

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
  canCreate = false,
}: {
  items: CustomerListItem[];
  stats: Stats;
  canCreate?: boolean;
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
      {canCreate ? (
        <Link
          href="/m/customers/new"
          className="flex items-center justify-center gap-1.5 h-9 rounded-[0.625rem] mb-3 text-[0.75rem] font-bold press"
          style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
        >
          <UserPlus className="size-3.5" />
          New Customer
        </Link>
      ) : null}

      {/* ── Search ── */}
      <div className="mb-2.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, GSTIN…"
          className="w-full h-9 rounded-[0.625rem] border-2 px-3 text-[0.8125rem] outline-none"
          style={{
            borderColor: query ? "var(--color-ink-950)" : "var(--color-line)",
            backgroundColor: "var(--color-paper)",
            color: "var(--color-ink-950)",
          }}
        />
      </div>

      {/* ── Filter chips ── */}
      <div className="mb-3">
        <MobileFilterChips
          chips={[
            { label: "All", value: "all", count: items.length },
            { label: "Dues", value: "dues", count: duesCount },
            { label: "Clear", value: "clear", count: clearCount },
          ] as FilterChip<Filter>[]}
          active={filter}
          onChange={setFilter}
        />
      </div>

      {/* ── Customer cards ── */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title={query ? "No matching customers" : filter === "dues" ? "No customers with dues" : filter === "clear" ? "No clear customers" : "No customers yet"}
          hint={query ? "Try a different search" : "Create a customer to start booking sales"}
        />
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
