"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MobileLink as Link } from "@/components/mobile/mobile-link";
import { Phone, Eye, Share2, FileText, Package, IndianRupee } from "lucide-react";
import { formatCurrencyCompact, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useLongPress } from "@/lib/use-long-press";
import {
  MobileOverviewSheet,
  type OverviewRow,
} from "@/components/mobile/v2/mobile-overview-sheet";
import type { ContextAction } from "@/components/mobile/v2/mobile-context-menu";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileCardGrid,
  MobileFab,
  MobileNoResults,
  MobileSummaryStrip,
  type SummaryStat,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewSupplierForm } from "./MobileNewSupplierDialog";

type DuesFilter = "ALL" | "DUE" | "CLEAR";

export type SupplierListItem = {
  id: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  poCount: number;
  balanceOwed: number;
};

const FILTER_OPTIONS: { label: string; value: DuesFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "With Dues", value: "DUE" },
  { label: "Clear", value: "CLEAR" },
];

/**
 * Supplier directory — "who do I owe, and how active are they?"
 * Procurement-style cards in a 2-col grid with dues accent.
 */
export function MobileSuppliersList({
  items,
  totalOwed,
  withDuesCount,
  canCreate,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: SupplierListItem[];
  totalOwed: number;
  withDuesCount: number;
  canCreate?: boolean;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [duesFilter, setDuesFilter] = useState<DuesFilter>("ALL");
  const fab = useFabModal();

  const filtered = useMemo(() => {
    let result = items;
    if (duesFilter === "DUE") {
      result = result.filter((s) => s.balanceOwed > 0);
    } else if (duesFilter === "CLEAR") {
      result = result.filter((s) => s.balanceOwed === 0);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.gstin?.toLowerCase().includes(q) ?? false) ||
          (s.phone?.toLowerCase().includes(q) ?? false),
      );
    }
    // Sort: dues first (by amount desc), then rest by name
    return [...result].sort((a, b) => {
      if (a.balanceOwed > 0 && b.balanceOwed === 0) return -1;
      if (a.balanceOwed === 0 && b.balanceOwed > 0) return 1;
      if (a.balanceOwed > 0 && b.balanceOwed > 0) return b.balanceOwed - a.balanceOwed;
      return a.name.localeCompare(b.name);
    });
  }, [items, query, duesFilter]);

  const summaryStats: SummaryStat[] = [
    { label: "Total Owed", value: formatCurrencyCompact(totalOwed), tone: totalOwed > 0 ? "stop" : "default" },
    { label: "With Dues", value: String(withDuesCount) },
    { label: "Suppliers", value: String(items.length) },
  ];

  return (
    <div>
      {/* ── Summary strip ── */}
      <MobileSummaryStrip stats={summaryStats} />

      {/* ── Sticky search header ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search supplier, GSTIN, phone…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_OPTIONS}
              active={duesFilter}
              defaultValue="ALL"
              onChange={setDuesFilter}
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
        showClear={duesFilter !== "ALL" || !!query}
        onClear={() => { setQuery(""); setDuesFilter("ALL"); }}
      />

      {/* ── Supplier cards grid ── */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title={query || duesFilter !== "ALL" ? "No matching suppliers" : "No suppliers"}
          hint={query || duesFilter !== "ALL"
            ? "Try a different search or filter"
            : canCreate
              ? "Tap + to add your first supplier"
              : "Suppliers will appear here once added"}
        />
      ) : (
        <MobileCardGrid cols={2}>
          {filtered.map((s) => (
            <SupplierCard key={s.id} s={s} />
          ))}
        </MobileCardGrid>
      )}

      {/* ── New supplier FAB ── */}
      {canCreate ? (
        <>
          <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add supplier" />
          <MobileFabModal
            open={fab.isOpen}
            onClose={fab.close}
            originRect={fab.originRect}
            title="Add Supplier"
          >
            <MobileNewSupplierForm onClose={fab.close} />
          </MobileFabModal>
        </>
      ) : null}
    </div>
  );
}

/* ─── Supplier card — procurement-style with dues accent ─── */
/* Long-press opens an overview sheet with full details fetched from the API. */
function SupplierCard({ s }: { s: SupplierListItem }) {
  const router = useRouter();
  const hasDues = s.balanceOwed > 0;
  const accentColor = hasDues ? "var(--color-stop)" : "var(--color-steel)";

  // ── Long-press overview sheet ──
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [details, setDetails] = useState<SupplierOverview | null>(null);
  const [pressPoint, setPressPoint] = useState<{ x: number; y: number } | null>(null);

  async function loadOverview() {
    if (details) return;
    setOverviewLoading(true);
    try {
      const res = await fetch(`/api/suppliers/${s.id}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as SupplierOverview;
      setDetails(data);
    } catch {
      toast.error("Could not load supplier details");
      setOverviewOpen(false);
    } finally {
      setOverviewLoading(false);
    }
  }

  const { bind: longPressBind } = useLongPress((x, y) => {
    setPressPoint({ x, y });
    setOverviewOpen(true);
    void loadOverview();
  });

  const overviewRows: OverviewRow[] = details
    ? [
        ...(details.gstin
          ? [{ icon: FileText, label: "GSTIN", value: details.gstin, mono: true }]
          : []),
        ...(details.phone
          ? [{ icon: Phone, label: "Phone", value: details.phone, mono: true }]
          : []),
        ...(details.email
          ? [{ icon: FileText, label: "Email", value: details.email }]
          : []),
        ...(details.address
          ? [{ icon: FileText, label: "Address", value: details.address }]
          : []),
        { icon: Package, label: "Active POs", value: String(details._count?.purchaseOrders ?? 0) },
        { icon: Package, label: "Returns", value: String(details._count?.supplierReturns ?? 0) },
        { icon: Package, label: "Rate Contracts", value: String(details._count?.rateContracts ?? 0) },
        {
          icon: IndianRupee,
          label: "Balance Owed",
          value: formatCurrency(s.balanceOwed),
          valueColor: hasDues ? "var(--color-stop)" : "var(--color-ink-950)",
        },
      ]
    : [
        ...(s.gstin ? [{ icon: FileText, label: "GSTIN", value: s.gstin, mono: true }] : []),
        ...(s.phone ? [{ icon: Phone, label: "Phone", value: s.phone, mono: true }] : []),
        { icon: Package, label: "Purchase Orders", value: String(s.poCount) },
        {
          icon: IndianRupee,
          label: "Balance Owed",
          value: formatCurrencyCompact(s.balanceOwed),
          valueColor: hasDues ? "var(--color-stop)" : "var(--color-ink-950)",
        },
      ];

  const overviewActions: ContextAction[] = [
    {
      label: "View Full Details",
      icon: Eye,
      onPress: () => router.push(`/m/suppliers/${s.id}`),
    },
    {
      label: "Share",
      icon: Share2,
      onPress: () => {
        const url = `${window.location.origin}/m/suppliers/${s.id}`;
        if (navigator.share) {
          navigator.share({ title: s.name, url }).catch(() => {});
        } else {
          navigator.clipboard?.writeText(url).catch(() => {});
          toast.success("Link copied");
        }
      },
    },
  ];

  return (
    <>
      <div {...longPressBind}>
        <Link
          href={`/m/suppliers/${s.id}`}
          className="flex flex-col rounded-[0.625rem] border text-m-body overflow-hidden active:scale-[0.98] transition-transform"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper)",
          }}
        >
          {/* Top accent strip */}
          <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />

          <div className="p-2 flex flex-col gap-1 flex-1">
            {/* Row 1: Name + dues badge */}
            <div className="flex items-center justify-between gap-1">
              <p className="text-m-label font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
                {s.name}
              </p>
              <span
                className="text-m-caption font-bold uppercase shrink-0"
                style={{ color: accentColor }}
              >
                {hasDues ? "Due" : "Clear"}
              </span>
            </div>

            {/* Row 2: PO count + phone */}
            <div className="flex items-center gap-1.5">
              <span className="text-m-caption font-semibold tabular-nums" style={{ color: "var(--color-ink-700)" }}>
                {s.poCount} PO{s.poCount !== 1 ? "s" : ""}
              </span>
              {s.phone ? (
                <>
                  <span style={{ color: "var(--color-line)" }}>·</span>
                  <span className="text-m-caption truncate flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
                    <Phone className="size-2" />
                    {s.phone}
                  </span>
                </>
              ) : null}
            </div>

            {/* Row 3: Bottom area — fixed height for equal card sizes */}
            <div className="mt-auto pt-1 h-[1rem] flex items-center">
              {hasDues ? (
                <span className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-stop)" }}>
                  {formatCurrencyCompact(s.balanceOwed)}
                </span>
              ) : (
                <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-500)" }}>
                  No dues
                </span>
              )}
            </div>
          </div>
        </Link>
      </div>

      {/* Long-press overview sheet */}
      <MobileOverviewSheet
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        origin={pressPoint}
        title={s.name}
        subtitle={hasDues ? "Outstanding dues" : "No outstanding dues"}
        accentColor={accentColor}
        loading={overviewLoading}
        rows={overviewRows}
        actions={overviewActions}
      />
    </>
  );
}

/* ─── Types for the overview fetch (matches GET /api/suppliers/[id]) ─── */
interface SupplierOverview {
  id: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  email?: string | null;
  address?: string | null;
  _count?: {
    purchaseOrders: number;
    supplierReturns: number;
    rateContracts: number;
  };
}
