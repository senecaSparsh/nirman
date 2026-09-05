"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Recycle, Zap, Hand, Eye, Share2, Calendar, Package, Boxes, IndianRupee, MapPin } from "lucide-react";
import {formatCurrency, formatCurrencyCompact, formatDate} from "@/lib/utils";
import { toast } from "sonner";
import { useLongPress } from "@/lib/use-long-press";
import {
  MobileOverviewSheet,
  type OverviewRow,
} from "@/components/mobile/v2/mobile-overview-sheet";
import type { ContextAction } from "@/components/mobile/v2/mobile-context-menu";
import {
  MobileSearchHeader,
  MobileCardGrid,
  MobileNoResults,
  MobileSummaryStrip,
} from "@/components/mobile/v2/scaffold";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import {
  MobileExportShareIcons,
  type MobileColumnSpec,
} from "@/components/mobile/v2/export-share-bar";

export type ScrapGenerationItem = {
  id: string;
  scrapNumber: string;
  generationDate: string;
  notes: string | null;
  toLocationName: string;
  projectName: string | null;
  isAuto: boolean;
  lineCount: number;
  totalValue: number;
  materials: string[];
};

/**
 * Scrap generation list — "what scrap was generated, and what's it worth?"
 * Procurement-style cards in a 2-col grid, with auto/manual distinction.
 */
export function MobileScrapGenerationsList({
  items,
  totalValue,
  canCreate: _canCreate,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: ScrapGenerationItem[];
  totalValue: number;
  canCreate: boolean;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (sc) =>
        sc.scrapNumber.toLowerCase().includes(q) ||
        sc.toLocationName.toLowerCase().includes(q) ||
        (sc.projectName?.toLowerCase().includes(q) ?? false) ||
        sc.materials.some((m) => m.toLowerCase().includes(q)),
    );
  }, [items, query]);

  return (
    <div>
      {/* ── Summary strip ── */}
      <MobileSummaryStrip
        stats={[
          {
            label: "Scrap Value",
            value: formatCurrencyCompact(totalValue),
            tone: "go",
          },
          { label: "Slips", value: String(items.length), tone: "default" },
          {
            label: "Auto",
            value: String(items.filter((s) => s.isAuto).length),
            tone: "default",
          },
        ]}
      />

      {/* ── Sticky search header ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search slip, location, material…"
        action={
          <div className="flex items-center gap-1 shrink-0">
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
        showClear={query !== ""}
        onClear={() => setQuery("")}
      />

      {/* ── Scrap cards grid ── */}
      {filtered.length === 0 ? (
        query ? (
          <MobileNoResults
            title="No matching scrap slips"
            hint="Try a different search"
          />
        ) : (
          <MobileEmptyState
            icon={Recycle}
            title="No scrap generated"
            hint="Auto-detected from Daily Progress Report variance or added manually"
          />
        )
      ) : (
        <div>
          {query && (
            <div className="flex items-center justify-end mb-1.5">
              <span
                className="text-m-label font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                {filtered.length} slip{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          <MobileCardGrid>
            {filtered.map((sc) => (
              <ScrapCard key={sc.id} sc={sc} />
            ))}
          </MobileCardGrid>
        </div>
      )}
    </div>
  );
}

/* ─── Scrap card — procurement-style with source accent ─── */
function ScrapCard({ sc }: { sc: ScrapGenerationItem }) {
  const router = useRouter();
  const accentColor = sc.isAuto ? "var(--color-signal)" : "var(--color-steel)";
  const SourceIcon = sc.isAuto ? Zap : Hand;

  // ── Long-press overview sheet (data already in the list item — no fetch) ──
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [pressPoint, setPressPoint] = useState<{ x: number; y: number } | null>(null);
  const { bind: longPressBind } = useLongPress((x, y) => {
    setPressPoint({ x, y });
    setOverviewOpen(true);
  });

  const materialText = sc.materials.length > 0 ? sc.materials.join(", ") : "—";

  const overviewRows: OverviewRow[] = [
    { icon: SourceIcon, label: "Status", value: sc.isAuto ? "Auto" : "Manual", valueColor: accentColor },
    { icon: Calendar, label: "Date", value: formatDate(sc.generationDate) },
    { icon: Package, label: "Material", value: materialText },
    { icon: Boxes, label: "Quantity", value: `${sc.lineCount} item${sc.lineCount !== 1 ? "s" : ""}` },
    { icon: IndianRupee, label: "Expected Amount", value: formatCurrency(sc.totalValue) },
    { icon: MapPin, label: "Location", value: sc.toLocationName },
  ];

  const overviewActions: ContextAction[] = [
    {
      label: "View Full Details",
      icon: Eye,
      onPress: () => router.push(`/m/scrap-generations/${sc.id}`),
    },
    {
      label: "Share",
      icon: Share2,
      onPress: () => {
        const url = `${window.location.origin}/m/scrap-generations/${sc.id}`;
        if (navigator.share) {
          navigator.share({ title: sc.scrapNumber, url }).catch(() => {});
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
          href={`/m/scrap-generations/${sc.id}`}
          className="flex flex-col rounded-[0.625rem] border text-m-body overflow-hidden active:scale-[0.98] transition-transform"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper)",
          }}
        >
          {/* Top accent strip */}
          <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />

          <div className="p-2 flex flex-col gap-1 flex-1">
            {/* Row 1: Slip number + source badge */}
            <div className="flex items-center justify-between gap-1">
              <span
                className="text-m-caption font-mono font-bold truncate"
                style={{ color: "var(--color-ink-950)" }}
              >
                {sc.scrapNumber}
              </span>
              <span
                className="flex items-center gap-0.5 text-m-caption font-bold uppercase shrink-0"
                style={{ color: accentColor }}
              >
                <SourceIcon className="size-2.5" />
                {sc.isAuto ? "Auto" : "Manual"}
              </span>
            </div>

            {/* Row 2: Location */}
            <p
              className="text-m-caption font-bold leading-tight truncate"
              style={{ color: "var(--color-ink-950)" }}
            >
              {sc.toLocationName}
            </p>

            {/* Row 3: Date + project */}
            <div className="flex items-center gap-1">
              <span
                className="text-m-caption tabular-nums"
                style={{ color: "var(--color-ink-500)" }}
              >
                {formatDate(sc.generationDate)}
              </span>
              {sc.projectName ? (
                <>
                  <span style={{ color: "var(--color-line)" }}>·</span>
                  <span
                    className="text-m-caption truncate"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    {sc.projectName}
                  </span>
                </>
              ) : null}
            </div>

            {/* Row 4: Bottom area — fixed height for equal card sizes */}
            <div className="mt-auto pt-1 h-[1rem] flex items-center justify-between">
              <span
                className="text-m-caption font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                {sc.lineCount} item{sc.lineCount !== 1 ? "s" : ""}
              </span>
              <span
                className="text-m-caption font-bold tabular-nums"
                style={{ color: "var(--color-go)" }}
              >
                {formatCurrencyCompact(sc.totalValue)}
              </span>
            </div>
          </div>
        </Link>
      </div>

      {/* Long-press overview sheet */}
      <MobileOverviewSheet
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        origin={pressPoint}
        title={sc.scrapNumber}
        subtitle={sc.isAuto ? "Auto" : "Manual"}
        accentColor={accentColor}
        rows={overviewRows}
        actions={overviewActions}
      />
    </>
  );
}
