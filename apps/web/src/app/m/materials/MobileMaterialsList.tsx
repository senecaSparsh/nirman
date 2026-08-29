"use client";

import { useState, useMemo } from "react";
import { MobileLink as Link } from "@/components/mobile/mobile-link";
import { formatNumber, formatCurrency } from "@/lib/utils";
import { MaterialIllustration } from "@/components/mobile/v2/material-illustration";
import { ScanButton } from "@/components/mobile/v2/scan-button";
import {
  MobileSearchHeader,
  MobileNoResults,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { mobileStatusColor } from "@/components/mobile/v2/primitives";

export type MaterialItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  categoryName: string;
  totalQty: number;
  stockValue: number;
  unitCost: number;
  minStock: number | null;
  reorderPoint: number | null;
  isLow: boolean;
  isOut: boolean;
};

type SortMode = "default" | "stock-low" | "stock-high" | "name";

/**
 * Materials list — nirman-os catalog-style architecture.
 *
 *   - Sticky search header with category chips
 *   - 2-column card grid (MaterialCard)
 *   - Sort dropdown
 *   - Grouped by category in default sort
 */
export function MobileMaterialsList({
  items,
  initialCategory,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: MaterialItem[];
  initialCategory?: string;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(
    initialCategory ?? null,
  );
  const [sort, setSort] = useState<SortMode>("default");

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((m) => set.add(m.categoryName));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let result = items.filter((m) => {
      const q = query.toLowerCase();
      const matchesQuery =
        !query ||
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        m.categoryName.toLowerCase().includes(q);
      const matchesCategory = !activeCategory || m.categoryName === activeCategory;
      return matchesQuery && matchesCategory;
    });

    if (sort === "stock-low") {
      result = [...result].sort((a, b) => a.totalQty - b.totalQty);
    } else if (sort === "stock-high") {
      result = [...result].sort((a, b) => b.totalQty - a.totalQty);
    } else if (sort === "name") {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [items, query, activeCategory, sort]);

  // Group by category in default sort
  const grouped: Record<string, MaterialItem[]> = {};
  for (const m of filtered) {
    (grouped[m.categoryName] ??= []).push(m);
  }
  const groupedCategories = Object.keys(grouped).sort();

  if (items.length === 0) return null;

  const sortLabel: Record<SortMode, string> = {
    default: "Default",
    "stock-low": "Stock: Low first",
    "stock-high": "Stock: High first",
    name: "Name A-Z",
  };

  return (
    <div>
      {/* ── Sticky search header ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search materials…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <ScanButton onScan={setQuery} label="" />
            <FilterDropdown
              categories={categories}
              activeCategory={activeCategory}
              onChange={(v) => setActiveCategory(v)}
            />
            <SortDropdown sort={sort} setSort={setSort} sortLabel={sortLabel} />
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
        showClear={(!!activeCategory || !!query) && filtered.length > 0}
        onClear={() => { setQuery(""); setActiveCategory(null); }}
      />

      {/* ── Results ── */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title="No materials found"
          query={query || undefined}
          hint="No materials match the selected filters."
        />
      ) : (
        <div>
          {sort === "default" ? (
            /* Grouped by category */
            groupedCategories.map((category, idx) => (
              <section key={category} className="mb-4">
                <h2
                  className="text-[0.8125rem] font-bold mb-1.5 flex items-center gap-1.5"
                  style={{ color: "var(--color-ink-950)" }}
                >
                  {category}
                  <span
                    className="text-[0.625rem] font-normal"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    {grouped[category]!.length}
                  </span>
                  {idx === 0 && (
                    <span
                      className="ml-auto text-[0.625rem] font-semibold"
                      style={{ color: "var(--color-ink-500)" }}
                    >
                      {filtered.length} item{filtered.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </h2>
                <div className="grid grid-cols-3 gap-1.5">
                  {grouped[category]!.map((m) => (
                    <MaterialCard key={m.id} material={m} />
                  ))}
                </div>
              </section>
            ))
          ) : (
            /* Sorted: flat grid */
            <div>
              <div className="flex items-center justify-end mb-1.5">
                <span
                  className="text-[0.625rem] font-semibold"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  {filtered.length} item{filtered.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {filtered.map((m) => (
                  <MaterialCard key={m.id} material={m} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MATERIAL CARD — 2-col grid card matching nirman-os ProductCard style.
   Square-ish icon area, category label, name, stock qty, status badge.
   ═══════════════════════════════════════════════════════════════════════════ */
function MaterialCard({ material }: { material: MaterialItem }) {
  const stockStatus = material.isOut ? "OUT_OF_STOCK" : material.isLow ? "LOW_STOCK" : "IN_STOCK";
  const statusColor = mobileStatusColor(stockStatus);
  const statusLabel =
    material.isOut ? "Out" : material.isLow ? "Low" : "In stock";

  return (
    <Link
      href={`/m/materials/${material.id}`}
      className="block rounded-[0.625rem] border overflow-hidden active:scale-[0.98] transition-transform"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Illustration area — SVG based on category */}
      <div
        className="aspect-square relative"
        style={{ backgroundColor: "var(--color-paper-2)" }}
      >
        <MaterialIllustration
          categoryName={material.categoryName}
          materialName={material.name}
        />
        {/* Status dot in top-right corner */}
        <span
          className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
      </div>

      {/* Content */}
      <div className="p-1.5">
        <p
          className="text-[0.5rem] font-semibold uppercase tracking-wide truncate"
          style={{ color: "var(--color-steel)" }}
        >
          {material.categoryName}
        </p>
        <p
          className="font-semibold text-[0.625rem] leading-snug mt-0.5 line-clamp-2 min-h-[2em]"
          style={{ color: "var(--color-ink-950)" }}
        >
          {material.name}
        </p>
        <div className="mt-1 flex items-baseline justify-between gap-1">
          <div className="min-w-0">
            <p
              className="numeric text-[0.625rem] font-bold"
              style={{ color: "var(--color-ink-950)" }}
            >
              {formatNumber(material.totalQty, 0)} {material.unit}
            </p>
            <p
              className="numeric text-[0.5rem]"
              style={{ color: "var(--color-ink-500)" }}
            >
              {formatCurrency(material.stockValue)}
            </p>
          </div>
          <span
            className="text-[0.5rem] font-bold uppercase shrink-0"
            style={{ color: statusColor }}
          >
            {statusLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ── Filter dropdown (icon button + menu) ── */
function FilterDropdown({
  categories,
  activeCategory,
  onChange,
}: {
  categories: string[];
  activeCategory: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasFilter = activeCategory !== null;

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Filter"
        className="grid place-items-center size-8 rounded-[0.5rem] border press relative"
        style={{
          borderColor: hasFilter || open ? "var(--color-ink-950)" : "var(--color-line)",
          backgroundColor: hasFilter || open ? "var(--color-concrete)" : "var(--color-paper)",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 4h18l-7 8v7l-4 2v-9L3 4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {hasFilter && (
          <span
            className="absolute -top-0.5 -right-0.5 size-2 rounded-full"
            style={{ backgroundColor: "var(--color-signal)" }}
          />
        )}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="absolute top-full right-0 z-20 mt-1 w-48 rounded-[0.625rem] border shadow-lg overflow-hidden max-h-[60vh] overflow-y-auto"
            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
          >
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className="press w-full text-left px-3 py-2 text-[0.75rem]"
              style={{
                fontWeight: !hasFilter ? 600 : 400,
                color: !hasFilter ? "var(--color-ink-950)" : "var(--color-ink-700)",
                backgroundColor: !hasFilter ? "var(--color-concrete)" : "transparent",
              }}
            >
              All categories
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => { onChange(c); setOpen(false); }}
                className="press w-full text-left px-3 py-2 text-[0.75rem] border-t"
                style={{
                  borderColor: "var(--color-line)",
                  fontWeight: activeCategory === c ? 600 : 400,
                  color: activeCategory === c ? "var(--color-ink-950)" : "var(--color-ink-700)",
                  backgroundColor: activeCategory === c ? "var(--color-concrete)" : "transparent",
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ── Sort dropdown ── */
function SortDropdown({
  sort,
  setSort,
  sortLabel,
}: {
  sort: SortMode;
  setSort: (s: SortMode) => void;
  sortLabel: Record<SortMode, string>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Sort"
        className="grid place-items-center size-8 rounded-[0.5rem] border press"
        style={{
          borderColor: sort !== "default" || open ? "var(--color-ink-950)" : "var(--color-line)",
          backgroundColor: sort !== "default" || open ? "var(--color-concrete)" : "var(--color-paper)",
          color: sort !== "default" ? "var(--color-ink-950)" : "var(--color-ink-700)",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M7 4v16m0 0l-3-3m3 3l3-3M17 20V4m0 0l-3 3m3-3l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="absolute top-full right-0 z-20 mt-1 w-44 rounded-[0.625rem] border shadow-lg overflow-hidden"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--color-paper)",
            }}
          >
            {(Object.keys(sortLabel) as SortMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => { setSort(mode); setOpen(false); }}
                className="press w-full text-left px-3 py-2 text-[0.75rem]"
                style={{
                  fontWeight: sort === mode ? 600 : 400,
                  color: sort === mode ? "var(--color-ink-950)" : "var(--color-ink-700)",
                  backgroundColor: sort === mode ? "var(--color-concrete)" : "transparent",
                }}
              >
                {sortLabel[mode]}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
