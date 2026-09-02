"use client";

import { useState, useMemo } from "react";
import { MobileLink as Link } from "@/components/mobile/mobile-link";
import {
  Users, Phone,
  UserPlus,
  AlertCircle, ChevronRight,
} from "lucide-react";
import {formatCurrencyCompact} from "@/lib/utils";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileNoResults,
  MobileFab,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileCustomerForm } from "@/components/mobile/mobile-customer-form";

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
  canEdit = false,
  canDelete = false,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
  existingPhones = [],
}: {
  items: CustomerListItem[];
  stats: Stats;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
  /** Existing phone numbers for duplicate-check in the new-customer FAB modal. */
  existingPhones?: string[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const fab = useFabModal();

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
  const _clearCount = items.length - duesCount;

  const FILTER_OPTIONS: { label: string; value: Filter }[] = [
    { label: "All", value: "all" },
    { label: "Dues", value: "dues" },
    { label: "Clear", value: "clear" },
  ];

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Users}
        title="No customers yet"
        description={canCreate ? "Tap the + button below to add your first customer." : "Customers will appear here once added."}
      />
    );
  }

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
            <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Total Outstanding
            </p>
            <p
              className="text-m-section font-bold tabular-nums leading-tight"
              style={{ color: stats.totalOutstanding > 0 ? "var(--color-signal)" : "var(--color-ink-950)" }}
            >
              {formatCurrencyCompact(stats.totalOutstanding)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Pipeline
            </p>
            <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrencyCompact(stats.pipelineValue)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-m-caption font-semibold mt-1">
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

      {/* ── New Customer FAB ── */}
      {canCreate ? (
        <MobileFab onClick={fab.toggle} label="New customer" icon={UserPlus} isOpen={fab.isOpen} />
      ) : null}

      {canCreate ? (
        <MobileFabModal open={fab.isOpen} onClose={fab.close} originRect={fab.originRect} title="New Customer">
          <MobileCustomerForm
            existingPhones={existingPhones}
            onClose={fab.close}
            onCreated={() => window.location.reload()}
          />
        </MobileFabModal>
      ) : null}

      {/* ── Search + filter ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search name, phone, GSTIN…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_OPTIONS}
              active={filter}
              defaultValue="all"
              onChange={(v) => setFilter(v as Filter)}
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
        showClear={!!query || filter !== "all"}
        onClear={() => { setQuery(""); setFilter("all"); }}
      />

      {/* ── Result count ── */}
      {(query || filter !== "all") && filtered.length > 0 && (
        <div className="flex items-center justify-end mb-1.5">
          <span
            className="text-m-label font-semibold"
            style={{ color: "var(--color-ink-500)" }}
          >
            {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* ── Customer cards ── */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title={query ? "No matching customers" : filter === "dues" ? "No customers with dues" : filter === "clear" ? "No clear customers" : "No customers yet"}
          hint={query ? "Try a different search" : "Create a customer to start booking sales"}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((c) => (
            <CustomerCard key={c.id} customer={c} canEdit={canEdit} canDelete={canDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Customer card ─── */
function CustomerCard({
  customer: c,
  canEdit: _canEdit = false,
  canDelete: _canDelete = false,
}: {
  customer: CustomerListItem;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
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
          <p className="text-m-section font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
            {c.name}
          </p>
          <span
            className="flex items-center gap-0.5 text-m-caption font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
            style={{ color: badge.color, backgroundColor: `color-mix(in srgb, ${badge.color} 12%, transparent)` }}
          >
            {badge.label}
          </span>
        </div>

        {/* ── Phone ── */}
        {c.phone ? (
          <p className="text-m-caption flex items-center gap-0.5 mb-1.5" style={{ color: "var(--color-ink-500)" }}>
            <Phone className="size-2.5" />
            {c.phone}
          </p>
        ) : (
          <p className="text-m-caption mb-1.5" style={{ color: "var(--color-ink-400)" }}>
            No phone
          </p>
        )}

        {/* ── Financial row ── */}
        {hasSales ? (
          <div className="flex items-center gap-3">
            <div>
              <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                Sales
              </p>
              <p className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {formatCurrencyCompact(c.totalValue)}
              </p>
            </div>

            {c.outstanding > 0 ? (
              <>
                <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
                <div>
                  <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                    Outstanding
                  </p>
                  <p className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-signal)" }}>
                    {formatCurrencyCompact(c.outstanding)}
                  </p>
                </div>
              </>
            ) : null}

            <div className="ml-auto text-right">
              <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                Deals
              </p>
              <p className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {c.activeCount}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
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
          <span className="text-m-caption font-semibold" style={{ color: "var(--color-signal)" }}>
            {c.dueCount} {c.dueCount === 1 ? "sale" : "sales"} with dues
          </span>
          <ChevronRight className="size-3 ml-auto" style={{ color: "var(--color-ink-500)" }} />
        </div>
      ) : null}
    </Link>
  );
}
