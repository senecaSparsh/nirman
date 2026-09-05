"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MobileLink as Link } from "@/components/mobile/mobile-link";
import { Phone, Hammer, Eye, Share2, FileText, ClipboardList, Package } from "lucide-react";
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
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileNewSubcontractorClient } from "./new/MobileNewSubcontractorClient";

type TradeFilter = "ALL" | "PLUMBING" | "ELECTRICAL" | "MASONRY" | "OTHER";

export type SubcontractorListItem = {
  id: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  trade: string | null;
  workOrderCount: number;
  materialIssueCount: number;
  projectCostCount: number;
};

const FILTER_OPTIONS: { label: string; value: TradeFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Plumbing", value: "PLUMBING" },
  { label: "Electrical", value: "ELECTRICAL" },
  { label: "Masonry", value: "MASONRY" },
  { label: "Other", value: "OTHER" },
];

function tradeToFilter(trade: string | null): TradeFilter {
  if (!trade) return "OTHER";
  const t = trade.toLowerCase();
  if (t.includes("plumb")) return "PLUMBING";
  if (t.includes("electr")) return "ELECTRICAL";
  if (t.includes("mason") || t.includes("brick")) return "MASONRY";
  return "OTHER";
}

/**
 * Subcontractor directory — "who can do this trade, and how active are they?"
 * Trade-grouped cards in a 2-col grid with work order accent.
 */
export function MobileSubcontractorsList({
  items,
  totalWorkOrders,
  activeTrades,
  canCreate,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: SubcontractorListItem[];
  totalWorkOrders: number;
  activeTrades: number;
  canCreate?: boolean;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>("ALL");
  const fab = useFabModal();

  const filtered = useMemo(() => {
    let result = items;
    if (tradeFilter !== "ALL") {
      result = result.filter((s) => tradeToFilter(s.trade) === tradeFilter);
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
    // Sort: most work orders first, then by name
    return [...result].sort((a, b) => {
      if (a.workOrderCount !== b.workOrderCount) return b.workOrderCount - a.workOrderCount;
      return a.name.localeCompare(b.name);
    });
  }, [items, query, tradeFilter]);

  const summaryStats: SummaryStat[] = [
    { label: "Subcontractors", value: String(items.length) },
    { label: "Active Trades", value: String(activeTrades) },
    { label: "Work Orders", value: String(totalWorkOrders) },
  ];

  return (
    <div>
      {/* ── Summary strip ── */}
      <MobileSummaryStrip stats={summaryStats} />

      {/* ── Sticky search header ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search subcontractor, GSTIN, phone…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_OPTIONS}
              active={tradeFilter}
              defaultValue="ALL"
              onChange={setTradeFilter}
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
        showClear={tradeFilter !== "ALL" || !!query}
        onClear={() => { setQuery(""); setTradeFilter("ALL"); }}
      />

      {/* ── Subcontractor cards grid ── */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title={query || tradeFilter !== "ALL" ? "No matching subcontractors" : "No subcontractors"}
          hint={query || tradeFilter !== "ALL"
            ? "Try a different search or filter"
            : canCreate
              ? "Tap + to add your first subcontractor"
              : "Subcontractors will appear here once added"}
        />
      ) : (
        <MobileCardGrid cols={2}>
          {filtered.map((s) => (
            <SubcontractorCard key={s.id} s={s} />
          ))}
        </MobileCardGrid>
      )}

      {/* ── New subcontractor FAB ── */}
      {canCreate ? (
        <MobileFab onClick={fab.toggle} label="Add subcontractor" isOpen={fab.isOpen} />
      ) : null}

      {canCreate ? (
        <MobileFabModal open={fab.isOpen} onClose={fab.close} originRect={fab.originRect} title="New Subcontractor">
          <MobileNewSubcontractorClient
            onClose={fab.close}
            onCreated={() => window.location.reload()}
          />
        </MobileFabModal>
      ) : null}
    </div>
  );
}

/* ─── Subcontractor card — trade-style with work order accent ─── */
/* Long-press opens an overview sheet (data already in the list item — no fetch). */
function SubcontractorCard({ s }: { s: SubcontractorListItem }) {
  const router = useRouter();
  const hasWork = s.workOrderCount > 0;
  const accentColor = hasWork ? "var(--color-go)" : "var(--color-steel)";
  const tradeLabel = s.trade ?? "General";

  // ── Long-press overview sheet (data already in the list item — no fetch) ──
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [pressPoint, setPressPoint] = useState<{ x: number; y: number } | null>(null);
  const { bind: longPressBind } = useLongPress((x, y) => {
    setPressPoint({ x, y });
    setOverviewOpen(true);
  });

  const overviewRows: OverviewRow[] = [
    { icon: Hammer, label: "Trade / Specialty", value: tradeLabel },
    ...(s.phone ? [{ icon: Phone, label: "Phone", value: s.phone, mono: true }] : []),
    ...(s.gstin ? [{ icon: FileText, label: "GSTIN", value: s.gstin, mono: true }] : []),
    { icon: ClipboardList, label: "Active Work Orders", value: String(s.workOrderCount) },
    { icon: Package, label: "Material Issues", value: String(s.materialIssueCount) },
    { icon: Package, label: "Project Costs", value: String(s.projectCostCount) },
  ];

  const overviewActions: ContextAction[] = [
    {
      label: "View Full Details",
      icon: Eye,
      onPress: () => router.push(`/m/subcontractors/${s.id}`),
    },
    {
      label: "Share",
      icon: Share2,
      onPress: () => {
        const url = `${window.location.origin}/m/subcontractors/${s.id}`;
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
          href={`/m/subcontractors/${s.id}`}
          className="flex flex-col rounded-[0.625rem] border text-m-body overflow-hidden active:scale-[0.98] transition-transform"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper)",
          }}
        >
          {/* Top accent strip */}
          <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />

          <div className="p-2 flex flex-col gap-1 flex-1">
            {/* Row 1: Name + trade badge */}
            <div className="flex items-center justify-between gap-1">
              <p className="text-m-label font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
                {s.name}
              </p>
              <span
                className="text-m-caption font-bold uppercase shrink-0"
                style={{ color: accentColor }}
              >
                {hasWork ? "Active" : "Idle"}
              </span>
            </div>

            {/* Row 2: Trade + phone */}
            <div className="flex items-center gap-1.5">
              <span className="text-m-caption font-semibold truncate flex items-center gap-0.5" style={{ color: "var(--color-ink-700)" }}>
                <Hammer className="size-2" />
                {tradeLabel}
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
              {hasWork ? (
                <span className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
                  {s.workOrderCount} Work Order{s.workOrderCount !== 1 ? "s" : ""}
                </span>
              ) : (
                <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-500)" }}>
                  No work orders yet
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
        subtitle={tradeLabel}
        accentColor={accentColor}
        rows={overviewRows}
        actions={overviewActions}
      />
    </>
  );
}
