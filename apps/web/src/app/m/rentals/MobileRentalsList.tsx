"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search, X, KeyRound, Phone, AlertCircle, Calendar,
  Clock, ChevronRight, Plus,
} from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/utils";
import { MobileNewTenancyDialog } from "./MobileNewTenancyDialog";

/* ─── Types ─── */

export type RentalListItem = {
  id: string;
  tenantName: string;
  tenantPhone: string | null;
  tenantEmail: string | null;
  status: string;
  assetLabel: string;
  projectName: string | null;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  securityDeposit: number;
  rentAgreementNo: string | null;
  totalReceived: number;
  overdueAmount: number;
  overdueCount: number;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  daysToExpiry: number;
  expiringSoon: boolean;
  expired: boolean;
  paymentCount: number;
};

interface Stats {
  totalMonthlyRent: number;
  totalReceived: number;
  totalOverdue: number;
  activeCount: number;
  pendingCount: number;
  expiringCount: number;
}

type Filter = "all" | "active" | "pending" | "overdue" | "expiring";

const STATUS_META: Record<string, { color: string; label: string }> = {
  ACTIVE: { color: "var(--color-go)", label: "Active" },
  PENDING: { color: "var(--color-signal)", label: "Pending" },
  EXPIRED: { color: "var(--color-stop)", label: "Expired" },
  TERMINATED: { color: "var(--color-stop)", label: "Terminated" },
};

/**
 * Rentals list — organized around rent collection and lease lifecycle.
 * The income banner shows monthly rent + overdue. Cards are grouped
 * by urgency: overdue first, then expiring, then normal active, then pending.
 */
export function MobileRentalsList({
  items,
  stats,
  canManage = false,
  unitAssets = [],
  parcelAssets = [],
  customers = [],
}: {
  items: RentalListItem[];
  stats: Stats;
  canManage?: boolean;
  unitAssets?: { id: string; label: string }[];
  parcelAssets?: { id: string; label: string }[];
  customers?: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showNew, setShowNew] = useState(false);

  const filtered = useMemo(() => {
    let result = items;
    if (filter === "active") result = result.filter((t) => t.status === "ACTIVE");
    else if (filter === "pending") result = result.filter((t) => t.status === "PENDING");
    else if (filter === "overdue") result = result.filter((t) => t.overdueCount > 0);
    else if (filter === "expiring") result = result.filter((t) => t.expiringSoon);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (t) =>
          t.tenantName.toLowerCase().includes(q) ||
          t.assetLabel.toLowerCase().includes(q) ||
          (t.tenantPhone?.toLowerCase().includes(q) ?? false) ||
          (t.rentAgreementNo?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [items, query, filter]);

  // Sort by urgency: overdue → expiring → active → pending
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aUrgency = a.overdueCount > 0 ? 0 : a.expiringSoon ? 1 : a.status === "ACTIVE" ? 2 : 3;
      const bUrgency = b.overdueCount > 0 ? 0 : b.expiringSoon ? 1 : b.status === "ACTIVE" ? 2 : 3;
      if (aUrgency !== bUrgency) return aUrgency - bUrgency;
      return a.daysToExpiry - b.daysToExpiry;
    });
  }, [filtered]);

  const overdueCount = items.filter((t) => t.overdueCount > 0).length;

  return (
    <div>
      {/* ── Income banner — monthly rent is the headline ── */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{
          borderColor: stats.totalOverdue > 0 ? "var(--color-signal)" : "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Monthly Rent
            </p>
            <p className="text-[1.25rem] font-bold tabular-nums leading-tight" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrency(stats.totalMonthlyRent)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Collected
            </p>
            <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {formatCurrencyCompact(stats.totalReceived)}
            </p>
          </div>
        </div>

        {/* Overdue alert */}
        {stats.totalOverdue > 0 ? (
          <div
            className="rounded-[0.375rem] px-2 py-1.5 flex items-center gap-1.5 text-[0.5rem] font-bold"
            style={{ backgroundColor: `color-mix(in srgb, var(--color-signal) 8%, transparent)`, color: "var(--color-signal)" }}
          >
            <AlertCircle className="size-3" />
            {formatCurrency(stats.totalOverdue)} overdue across {overdueCount} {overdueCount === 1 ? "tenant" : "tenants"}
          </div>
        ) : null}

        {/* Mini stats */}
        <div className="flex items-center gap-3 text-[0.5rem] font-semibold mt-1.5">
          <span className="flex items-center gap-0.5" style={{ color: "var(--color-go)" }}>
            <KeyRound className="size-2.5" />
            {stats.activeCount} active
          </span>
          {stats.pendingCount > 0 ? (
            <span className="flex items-center gap-0.5" style={{ color: "var(--color-signal)" }}>
              <Clock className="size-2.5" />
              {stats.pendingCount} pending
            </span>
          ) : null}
          {stats.expiringCount > 0 ? (
            <span className="flex items-center gap-0.5" style={{ color: "var(--color-signal)" }}>
              <Calendar className="size-2.5" />
              {stats.expiringCount} expiring
            </span>
          ) : null}
        </div>
      </div>

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
            placeholder="Search tenant, asset, phone…"
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
      <div className="flex items-center gap-1 mb-3 overflow-x-auto">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" count={items.length} />
        <FilterChip active={filter === "overdue"} onClick={() => setFilter("overdue")} label="Overdue" count={overdueCount} color="var(--color-signal)" />
        <FilterChip active={filter === "expiring"} onClick={() => setFilter("expiring")} label="Expiring" count={stats.expiringCount} color="var(--color-signal)" />
        <FilterChip active={filter === "active"} onClick={() => setFilter("active")} label="Active" count={stats.activeCount} color="var(--color-go)" />
        {stats.pendingCount > 0 ? (
          <FilterChip active={filter === "pending"} onClick={() => setFilter("pending")} label="Pending" count={stats.pendingCount} color="var(--color-steel)" />
        ) : null}
      </div>

      {/* ── Tenancy cards ── */}
      {sorted.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-10 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <KeyRound className="size-7 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            {query ? "No matching rentals" : filter === "overdue" ? "No overdue rentals" : filter === "expiring" ? "No expiring leases" : "No rentals"}
          </p>
          <p className="text-[0.625rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
            {query ? "Try a different search" : canManage ? "Tap + to create your first tenancy" : "Tenancies will appear here once created"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((t) => (
            <TenancyCard key={t.id} tenancy={t} />
          ))}
        </div>
      )}

      {/* ── FAB: New Tenancy ── */}
      {canManage && (unitAssets.length > 0 || parcelAssets.length > 0) && (
        <button
          onClick={() => setShowNew(true)}
          className="fixed right-3 z-30 grid place-items-center size-12 rounded-full shadow-lg press"
          style={{
            bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px) + 0.75rem)",
            backgroundColor: "var(--color-ink-950)",
            color: "#fff",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}
          aria-label="Add new tenancy"
        >
          <Plus className="size-5" />
        </button>
      )}

      {/* ── New Tenancy Dialog ── */}
      {showNew && (
        <MobileNewTenancyDialog
          open={showNew}
          onClose={() => setShowNew(false)}
          units={unitAssets}
          parcels={parcelAssets}
          projects={[]}
          customers={customers}
        />
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
      className="flex items-center gap-1 h-7 px-2.5 rounded-full text-[0.5625rem] font-bold transition-colors press whitespace-nowrap"
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

/* ─── Tenancy card ─── */
function TenancyCard({ tenancy: t }: { tenancy: RentalListItem }) {
  const router = useRouter();
  const meta = STATUS_META[t.status] ?? { color: "var(--color-ink-500)", label: t.status };
  const hasOverdue = t.overdueCount > 0;
  const isPending = t.status === "PENDING";

  // Border color by urgency
  const borderColor = hasOverdue
    ? "var(--color-signal)"
    : t.expiringSoon
      ? "var(--color-signal)"
      : "var(--color-line)";

  const navigate = () => router.push(`/m/rentals/${t.id}`);

  return (
    <div
      role="link"
      onClick={navigate}
      className="block rounded-[0.5rem] border overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
      style={{ borderColor, backgroundColor: "var(--color-paper)" }}
    >
      <div className="p-2.5">
        {/* ── Top: tenant name + status ── */}
        <div className="flex items-center justify-between mb-1">
          <p className="text-[0.75rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
            {t.tenantName}
          </p>
          <span
            className="flex items-center gap-0.5 text-[0.375rem] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
            style={{ color: meta.color, backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
          >
            {meta.label}
          </span>
        </div>

        {/* ── Asset + phone ── */}
        <p className="text-[0.5rem] truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>
          {t.assetLabel}{t.projectName ? ` · ${t.projectName}` : ""}
        </p>

        {/* ── Financial row ── */}
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Rent
            </p>
            <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrencyCompact(t.monthlyRent)}/mo
            </p>
          </div>

          <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />

          <div>
            <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Received
            </p>
            <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {formatCurrencyCompact(t.totalReceived)}
            </p>
          </div>

          {t.tenantPhone ? (
            <>
              <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
              <a
                href={`tel:${t.tenantPhone}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-0.5 text-[0.4375rem] font-semibold press"
                style={{ color: "var(--color-ink-600)" }}
              >
                <Phone className="size-2.5" />
                Call
              </a>
            </>
          ) : null}

          {/* Lease end date */}
          <div className="ml-auto text-right">
            <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Until
            </p>
            <p
              className="text-[0.6875rem] font-bold tabular-nums"
              style={{ color: t.expiringSoon ? "var(--color-signal)" : "var(--color-ink-950)" }}
            >
              {formatDate(t.endDate)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Urgency footer ── */}
      {hasOverdue || t.expiringSoon || (t.nextDueDate && !isPending) ? (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1"
          style={{
            borderTop: "1px solid var(--color-line)",
            backgroundColor: hasOverdue
              ? `color-mix(in srgb, var(--color-signal) 5%, transparent)`
              : t.expiringSoon
                ? `color-mix(in srgb, var(--color-signal) 5%, transparent)`
                : "var(--color-paper-2)",
          }}
        >
          {hasOverdue ? (
            <>
              <AlertCircle className="size-2.5" style={{ color: "var(--color-signal)" }} />
              <span className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-signal)" }}>
                {formatCurrency(t.overdueAmount)} overdue · {t.overdueCount} {t.overdueCount === 1 ? "payment" : "payments"}
              </span>
            </>
          ) : t.expiringSoon ? (
            <>
              <Calendar className="size-2.5" style={{ color: "var(--color-signal)" }} />
              <span className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-signal)" }}>
                Expires in {t.daysToExpiry} {t.daysToExpiry === 1 ? "day" : "days"}
              </span>
            </>
          ) : t.nextDueDate ? (
            <>
              <Clock className="size-2.5" style={{ color: "var(--color-ink-500)" }} />
              <span className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
                Next: {formatCurrencyCompact(t.nextDueAmount ?? 0)} due {formatDate(t.nextDueDate)}
              </span>
            </>
          ) : null}

          <ChevronRight className="size-3 ml-auto" style={{ color: "var(--color-ink-500)" }} />
        </div>
      ) : null}
    </div>
  );
}
