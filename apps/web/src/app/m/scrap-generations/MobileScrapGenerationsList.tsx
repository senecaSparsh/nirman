"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Recycle, Search, X, Plus, Zap, Hand } from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/utils";

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
      <div
        className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2 mb-2"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div>
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Scrap Value
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
            {formatCurrency(totalValue)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Slips
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {items.length}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.5rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Auto
          </p>
          <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {items.filter((s) => s.isAuto).length}
          </p>
        </div>
      </div>

      {/* ── Sticky search header ── */}
      <div
        className="sticky top-0 z-20 border-b backdrop-blur-sm -mx-3.5 px-3.5 py-1.5 mb-2"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-paper) 95%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
              style={{ color: "var(--color-ink-500)" }}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search slip, location, material…"
              className="w-full h-8 rounded-[0.5rem] border pl-8 pr-2 text-[0.75rem] focus:outline-none"
              style={{
                borderColor: query ? "var(--color-ink-950)" : "var(--color-line)",
                backgroundColor: "var(--color-paper)",
                color: "var(--color-ink-950)",
              }}
            />
          </div>
          {canCreate ? (
            <Link
              href="/m/scrap-generations/new"
              className="h-8 shrink-0 rounded-[0.5rem] px-2.5 flex items-center gap-1 text-[0.625rem] font-bold press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
            >
              <Plus className="size-3" />
              New
            </Link>
          ) : null}
        </div>

        {query ? (
          <button
            onClick={() => setQuery("")}
            className="text-[0.625rem] font-semibold flex items-center gap-1 mt-1"
            style={{ color: "var(--color-steel)" }}
          >
            <X className="size-2.5" /> Clear
          </button>
        ) : null}
      </div>

      {/* ── Scrap cards grid ── */}
      {filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <Recycle className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            {query ? "No matching scrap slips" : "No scrap generated"}
          </p>
          <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
            {query ? "Try a different search" : "Auto-detected from DPR variance or added manually"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((sc) => (
            <ScrapCard key={sc.id} sc={sc} />
          ))}
        </div>
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
