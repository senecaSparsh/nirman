"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound, Phone, AlertCircle, Calendar,
  Clock, ChevronRight, Plus,
  Eye, Share2, User, Home, IndianRupee,
} from "lucide-react";
import { formatCurrencyCompact, formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useLongPress } from "@/lib/use-long-press";
import {
  MobileOverviewSheet,
  type OverviewRow,
} from "@/components/mobile/v2/mobile-overview-sheet";
import type { ContextAction } from "@/components/mobile/v2/mobile-context-menu";
import { MobileNewTenancyDialog } from "./MobileNewTenancyDialog";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileNoResults,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

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
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: RentalListItem[];
  stats: Stats;
  canManage?: boolean;
  unitAssets?: { id: string; label: string }[];
  parcelAssets?: { id: string; label: string }[];
  customers?: { id: string; name: string }[];
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
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
            <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Monthly Rent
            </p>
            <p className="text-m-section font-bold tabular-nums leading-tight" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrencyCompact(stats.totalMonthlyRent)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Collected
            </p>
            <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {formatCurrencyCompact(stats.totalReceived)}
            </p>
          </div>
        </div>

        {/* Overdue alert */}
        {stats.totalOverdue > 0 ? (
          <div
            className="rounded-[0.375rem] px-2 py-1.5 flex items-center gap-1.5 text-m-caption font-bold"
            style={{ backgroundColor: `color-mix(in srgb, var(--color-signal) 8%, transparent)`, color: "var(--color-signal)" }}
          >
            <AlertCircle className="size-3" />
            {formatCurrencyCompact(stats.totalOverdue)} overdue across {overdueCount} {overdueCount === 1 ? "tenant" : "tenants"}
          </div>
        ) : null}

        {/* Mini stats */}
        <div className="flex items-center gap-3 text-m-caption font-semibold mt-1.5">
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

      {/* ── Search + filter + export ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search tenant, asset, phone…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={[
                { label: "All", value: "all" },
                { label: "Overdue", value: "overdue" },
                { label: "Expiring", value: "expiring" },
                { label: "Active", value: "active" },
                ...(stats.pendingCount > 0 ? [{ label: "Pending", value: "pending" as const }] : []),
              ]}
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

      {/* ── Tenancy cards ── */}
      {sorted.length === 0 ? (
        <MobileNoResults
          title={query ? "No matching rentals" : filter === "overdue" ? "No overdue rentals" : filter === "expiring" ? "No expiring leases" : "No rentals"}
          hint={query ? "Try a different search" : canManage ? "Tap + to create your first tenancy" : "Tenancies will appear here once created"}
        />
      ) : (
        <div>
          {(query || filter !== "all") && (
            <div className="flex items-center justify-end mb-1.5">
              <span
                className="text-m-label font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                {sorted.length} tenanc{sorted.length !== 1 ? "ies" : "y"}
              </span>
            </div>
          )}
        <div className="flex flex-col gap-2">
          {sorted.map((t) => (
            <TenancyCard key={t.id} tenancy={t} />
          ))}
        </div>
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
            color: "var(--color-paper)",
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

/* ─── Tenancy card ─── */
/* Long-press opens an overview sheet (data already in the list item — no fetch). */
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

  // ── Long-press overview sheet (data already in the list item — no fetch) ──
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [pressPoint, setPressPoint] = useState<{ x: number; y: number } | null>(null);
  const { bind: longPressBind } = useLongPress((x, y) => {
    setPressPoint({ x, y });
    setOverviewOpen(true);
  });

  const overviewRows: OverviewRow[] = [
    { icon: User, label: "Tenant", value: t.tenantName },
    { icon: Home, label: "Unit", value: t.assetLabel },
    {
      icon: IndianRupee,
      label: "Rent",
      value: `${formatCurrency(t.monthlyRent)}/mo`,
    },
    {
      icon: IndianRupee,
      label: "Deposit",
      value: formatCurrency(t.securityDeposit),
    },
    { icon: Calendar, label: "Start Date", value: formatDate(t.startDate) },
    { icon: Calendar, label: "End Date", value: formatDate(t.endDate) },
    {
      icon: KeyRound,
      label: "Status",
      value: meta.label,
      valueColor: meta.color,
    },
  ];

  const overviewActions: ContextAction[] = [
    {
      label: "View Full Details",
      icon: Eye,
      onPress: () => router.push(`/m/rentals/${t.id}`),
    },
    {
      label: "Share",
      icon: Share2,
      onPress: () => {
        const url = `${window.location.origin}/m/rentals/${t.id}`;
        if (navigator.share) {
          navigator.share({ title: t.tenantName, url }).catch(() => {});
        } else {
          navigator.clipboard?.writeText(url).catch(() => {});
          toast.success("Link copied");
        }
      },
    },
  ];

  const navigate = () => router.push(`/m/rentals/${t.id}`);

  return (
    <>
      <div {...longPressBind}>
        <div
          role="link"
          onClick={navigate}
          className="block rounded-[0.5rem] border overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
          style={{ borderColor, backgroundColor: "var(--color-paper)" }}
        >
          <div className="p-2.5">
            {/* ── Top: tenant name + status ── */}
            <div className="flex items-center justify-between mb-1">
              <p className="text-m-section font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
                {t.tenantName}
              </p>
              <span
                className="flex items-center gap-0.5 text-m-caption font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
                style={{ color: meta.color, backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
              >
                {meta.label}
              </span>
            </div>

            {/* ── Asset + phone ── */}
            <p className="text-m-caption truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>
              {t.assetLabel}{t.projectName ? ` · ${t.projectName}` : ""}
            </p>

            {/* ── Financial row ── */}
            <div className="flex items-center gap-3">
              <div>
                <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                  Rent
                </p>
                <p className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {formatCurrencyCompact(t.monthlyRent)}/mo
                </p>
              </div>

              <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />

              <div>
                <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                  Received
                </p>
                <p className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
                  {formatCurrencyCompact(t.totalReceived)}
                </p>
              </div>

              {t.tenantPhone ? (
                <>
                  <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
                  <a
                    href={`tel:${t.tenantPhone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-0.5 text-m-caption font-semibold text-m-body press"
                    style={{ color: "var(--color-ink-600)" }}
                  >
                    <Phone className="size-2.5" />
                    Call
                  </a>
                </>
              ) : null}

              {/* Lease end date */}
              <div className="ml-auto text-right">
                <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                  Until
                </p>
                <p
                  className="text-m-body font-bold tabular-nums"
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
                  <span className="text-m-caption font-semibold" style={{ color: "var(--color-signal)" }}>
                    {formatCurrencyCompact(t.overdueAmount)} overdue · {t.overdueCount} {t.overdueCount === 1 ? "payment" : "payments"}
                  </span>
                </>
              ) : t.expiringSoon ? (
                <>
                  <Calendar className="size-2.5" style={{ color: "var(--color-signal)" }} />
                  <span className="text-m-caption font-semibold" style={{ color: "var(--color-signal)" }}>
                    Expires in {t.daysToExpiry} {t.daysToExpiry === 1 ? "day" : "days"}
                  </span>
                </>
              ) : t.nextDueDate ? (
                <>
                  <Clock className="size-2.5" style={{ color: "var(--color-ink-500)" }} />
                  <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-500)" }}>
                    Next: {formatCurrencyCompact(t.nextDueAmount ?? 0)} due {formatDate(t.nextDueDate)}
                  </span>
                </>
              ) : null}

              <ChevronRight className="size-3 ml-auto" style={{ color: "var(--color-ink-500)" }} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Long-press overview sheet */}
      <MobileOverviewSheet
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        origin={pressPoint}
        title={t.tenantName}
        subtitle={t.assetLabel}
        accentColor={meta.color}
        rows={overviewRows}
        actions={overviewActions}
      />
    </>
  );
}
