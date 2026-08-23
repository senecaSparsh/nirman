"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Recycle, Zap, Hand } from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/utils";
import {
  MobileSearchHeader,
  MobileHeaderAction,
  MobileCardGrid,
  MobileNoResults,
  MobileSummaryStrip,
} from "@/components/mobile/v2/scaffold";

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
  canCreate,
}: {
  items: ScrapGenerationItem[];
  totalValue: number;
  canCreate: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((sc) =>
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
          { label: "Scrap Value", value: formatCurrency(totalValue), tone: "go" },
          { label: "Slips", value: String(items.length), tone: "default" },
          { label: "Auto", value: String(items.filter((s) => s.isAuto).length), tone: "default" },
        ]}
      />

      {/* ── Sticky search header ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search slip, location, material…"
        action={canCreate ? <MobileHeaderAction href="/m/scrap-generations/new">New</MobileHeaderAction> : undefined}
        showClear={query !== ""}
        onClear={() => setQuery("")}
      />

      {/* ── Scrap cards grid ── */}
      {filtered.length === 0 ? (
        query ? (
          <MobileNoResults title="No matching scrap slips" hint="Try a different search" />
        ) : (
          <div
            className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
          >
            <Recycle className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
            <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
              No scrap generated
            </p>
            <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
              Auto-detected from Daily Progress Report variance or added manually
            </p>
          </div>
        )
      ) : (
        <MobileCardGrid>
          {filtered.map((sc) => (
            <ScrapCard key={sc.id} sc={sc} />
          ))}
        </MobileCardGrid>
      )}
    </div>
  );
}

/* ─── Scrap card — procurement-style with source accent ─── */
function ScrapCard({ sc }: { sc: ScrapGenerationItem }) {
  const accentColor = sc.isAuto ? "var(--color-signal)" : "var(--color-steel)";
  const SourceIcon = sc.isAuto ? Zap : Hand;

  return (
    <Link
      href={`/m/scrap-generations/${sc.id}`}
      className="flex flex-col rounded-[0.625rem] border overflow-hidden active:scale-[0.98] transition-transform"
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
          <span className="text-[0.5625rem] font-mono font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {sc.scrapNumber}
          </span>
          <span
            className="flex items-center gap-0.5 text-[0.4375rem] font-bold uppercase shrink-0"
            style={{ color: accentColor }}
          >
            <SourceIcon className="size-2.5" />
            {sc.isAuto ? "Auto" : "Manual"}
          </span>
        </div>

        {/* Row 2: Location */}
        <p className="text-[0.5625rem] font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
          {sc.toLocationName}
        </p>

        {/* Row 3: Date + project */}
        <div className="flex items-center gap-1">
          <span className="text-[0.5rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
            {formatDate(sc.generationDate)}
          </span>
          {sc.projectName ? (
            <>
              <span style={{ color: "var(--color-line)" }}>·</span>
              <span className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                {sc.projectName}
              </span>
            </>
          ) : null}
        </div>

        {/* Row 4: Bottom area — fixed height for equal card sizes */}
        <div className="mt-auto pt-1 h-[1rem] flex items-center justify-between">
          <span className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
            {sc.lineCount} item{sc.lineCount !== 1 ? "s" : ""}
          </span>
          <span className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
            {formatCurrencyCompact(sc.totalValue)}
          </span>
        </div>
      </div>
    </Link>
  );
}
