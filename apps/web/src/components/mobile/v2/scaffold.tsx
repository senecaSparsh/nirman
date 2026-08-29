"use client";

import * as React from "react";
import Link from "next/link";
import { Search, X, Plus, ChevronDown, type LucideIcon } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE V2 SCAFFOLD — shared list-page building blocks

   Every list page on /m reinvents the same 6 patterns (search header,
   filter chips, card grid, FAB, no-results, summary strip) with subtly
   different dimensions. This file standardises them so the whole mobile
   surface feels like one product.

   Standard dimensions (chosen from the most common values across the
   existing pages):
     - Search input:  h-9, rounded-[0.625rem], border-2, text-[0.8125rem]
     - Filter chips:  px-2.5 py-1, text-[0.6875rem], rounded-full, border
     - Card grid:     2-col gap-2 (transactional) / 3-col gap-1.5 (catalog)
     - Card:          rounded-[0.625rem], border, p-2
     - FAB:           size-12, right-4, bottom = tab bar + safe area
     - No-results:    rounded-[0.625rem], border, p-5, text-center
     - Summary strip: rounded-[0.625rem], border, p-3, mb-3
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Search Header ─────────────────────────────────────────────────────────

/**
 * Sticky search header with optional inline action button, filter chips,
 * and result-count/clear row.
 *
 * This is the single source of truth for the search header pattern. All
 * list pages should use it instead of hand-rolling the sticky div + input.
 */
export function MobileSearchHeader({
  query,
  onQueryChange,
  placeholder = "Search…",
  action,
  filterChips,
  resultCount,
  showClear,
  onClear,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  placeholder?: string;
  action?: React.ReactNode;
  filterChips?: React.ReactNode;
  resultCount?: string;
  showClear?: boolean;
  onClear?: () => void;
}) {
  const [searchFocused, setSearchFocused] = React.useState(false);

  return (
    <div
      className="sticky top-0 z-20 -mx-3.5 px-3.5 pt-1 pb-2 mb-1"
      style={{
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Search + action row — search expands to full width on focus */}
      <div className="flex items-center gap-1.5 mb-2">
        <div
          className="relative transition-all duration-200 ease-out"
          style={{ flex: searchFocused ? "1 1 100%" : "1 1 auto" }}
        >
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
            style={{ color: "var(--color-ink-500)" }}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={placeholder}
            className="w-full h-9 rounded-[0.5rem] border-2 pl-8 pr-3 text-m-body focus:outline-none"
            style={{
              borderColor:
                query || searchFocused
                  ? "var(--color-ink-950)"
                  : "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-950)",
            }}
          />
        </div>
        {/* Action icons — collapse when search is focused */}
        <div
          className="flex items-center gap-1 shrink-0 transition-all duration-200 ease-out"
          style={{
            opacity: searchFocused ? 0 : 1,
            maxWidth: searchFocused ? 0 : "200px",
            pointerEvents: searchFocused ? "none" : "auto",
          }}
        >
          {action}
        </div>
      </div>

      {/* Filter chips */}
      {filterChips}

      {/* Result count + clear */}
      {(resultCount || showClear) && (
        <div className="flex items-center justify-between mt-2">
          {resultCount ? (
            <span
              className="text-m-caption font-semibold"
              style={{ color: "var(--color-ink-500)" }}
            >
              {resultCount}
            </span>
          ) : (
            <span />
          )}
          {showClear && (
            <button
              onClick={onClear}
              className="touch text-m-caption font-semibold flex items-center gap-1 pl-2"
              style={{ color: "var(--color-steel)" }}
            >
              <X className="size-3" /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Filter Chips ──────────────────────────────────────────────────────────

export interface FilterChip<T extends string> {
  label: string;
  value: T;
  count?: number;
}

/**
 * Horizontal scrollable filter chips. Standard dimensions: px-2.5 py-1,
 * text-[0.6875rem], rounded-full, border.
 */
export function MobileFilterChips<T extends string>({
  chips,
  active,
  onChange,
}: {
  chips: FilterChip<T>[];
  active: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="-mx-3.5 px-3.5 overflow-x-auto scrollbar-hide">
      <div className="flex gap-2 w-max items-center">
        {chips.map((chip) => {
          const isActive = active === chip.value;
          return (
            <button
              key={chip.value}
              onClick={() => onChange(chip.value)}
              className="press rounded-full px-3.5 min-h-11 shrink-0 text-m-caption font-semibold border transition-colors flex items-center gap-1.5"
              style={
                isActive
                  ? {
                      backgroundColor: "var(--color-ink-950)",
                      borderColor: "var(--color-ink-950)",
                      color: "var(--color-paper)",
                    }
                  : {
                      color: "var(--color-ink-700)",
                      borderColor: "var(--color-line)",
                      backgroundColor: "var(--color-paper)",
                    }
              }
            >
              {chip.label}
              {chip.count != null && (
                <span
                  className="text-m-caption tabular-nums"
                  style={{ opacity: 0.6 }}
                >
                  {chip.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Filter Dropdown (alternative to chips when there are many options) ────

/**
 * Compact dropdown filter for when there are too many filter options for
 * chips. Matches the suppliers page style but standardised.
 */
export function MobileFilterDropdown<T extends string>({
  label,
  options,
  active,
  onChange,
}: {
  label: string;
  options: { label: string; value: T }[];
  active: T;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const activeLabel = options.find((o) => o.value === active)?.label ?? label;

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-11 rounded-[0.625rem] border-2 pl-3 pr-7 text-m-body font-semibold focus:outline-none cursor-pointer flex items-center"
        style={{
          borderColor:
            active !== options[0]?.value
              ? "var(--color-ink-950)"
              : "var(--color-line)",
          backgroundColor: "var(--color-paper)",
          color: "var(--color-ink-950)",
        }}
      >
        <span className="truncate">{activeLabel}</span>
      </button>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-3.5"
        style={{ color: "var(--color-ink-500)" }}
      />
      {open && (
        <div
          className="absolute top-10 right-0 z-30 rounded-[0.625rem] border-2 shadow-lg overflow-hidden min-w-[8rem]"
          style={{
            backgroundColor: "var(--color-paper)",
            borderColor: "var(--color-line)",
          }}
        >
          {options.map((opt, i) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className="touch w-full text-left px-3 py-2 text-m-body font-semibold press"
              style={{
                fontWeight: active === opt.value ? 700 : 500,
                color:
                  active === opt.value
                    ? "var(--color-ink-950)"
                    : "var(--color-ink-700)",
                backgroundColor:
                  active === opt.value
                    ? "var(--color-concrete)"
                    : "transparent",
                ...(i > 0 ? { borderTop: "1px solid var(--color-line)" } : {}),
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Filter Icon (compact icon-only filter button + dropdown) ──────────────

/**
 * Icon-only filter button that opens a dropdown — fits in the search
 * action row alongside Sort, Export, Share icons. Shows a dot badge
 * when a non-default filter is active.
 */
export function MobileFilterIcon<T extends string>({
  options,
  active,
  defaultValue,
  onChange,
}: {
  options: { label: string; value: T }[];
  active: T;
  defaultValue: T;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const hasFilter = active !== defaultValue;

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Filter"
        className="grid place-items-center size-9 rounded-[0.5rem] border press relative"
        style={{
          borderColor:
            hasFilter || open ? "var(--color-ink-950)" : "var(--color-line)",
          backgroundColor:
            hasFilter || open ? "var(--color-concrete)" : "var(--color-paper)",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M3 4h18l-7 8v7l-4 2v-9L3 4z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {hasFilter && (
          <span
            className="absolute -top-0.5 -right-0.5 size-2 rounded-full"
            style={{ backgroundColor: "var(--color-signal)" }}
          />
        )}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="absolute top-full right-0 z-20 mt-1 w-44 rounded-[0.625rem] border shadow-lg overflow-hidden"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-line)",
            }}
          >
            {options.map((opt, i) => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className="touch press w-full text-left px-3 py-2 text-m-body"
                style={{
                  fontWeight: active === opt.value ? 600 : 400,
                  color:
                    active === opt.value
                      ? "var(--color-ink-950)"
                      : "var(--color-ink-700)",
                  backgroundColor:
                    active === opt.value
                      ? "var(--color-concrete)"
                      : "transparent",
                  ...(i > 0
                    ? { borderTop: "1px solid var(--color-line)" }
                    : {}),
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Inline Action Button (for search header) ──────────────────────────────

/**
 * Standard inline action button for the search header (e.g. "New PO").
 * h-9 to match the search input height.
 */
export function MobileHeaderAction({
  href,
  onClick,
  icon: Icon = Plus,
  children,
}: {
  href?: string;
  onClick?: () => void;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  const cls =
    "flex items-center gap-1.5 h-9 px-3 rounded-[0.5rem] text-m-body font-bold whitespace-nowrap press active:scale-95 shrink-0";
  const style: React.CSSProperties = {
    backgroundColor: "var(--color-ink-950)",
    color: "var(--color-paper)",
  };
  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {Icon && <Icon className="size-4" />}
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={cls} style={style}>
      {Icon && <Icon className="size-4" />}
      {children}
    </button>
  );
}

// ─── Card Grid ─────────────────────────────────────────────────────────────

/**
 * Card grid wrapper. Use `cols="2"` for transactional records (POs, sales,
 * requisitions) and `cols="3"` for catalog items (materials, units).
 */
export function MobileCardGrid({
  cols = 2,
  children,
}: {
  cols?: 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        cols === 3 ? "grid grid-cols-3 gap-1.5" : "grid grid-cols-2 gap-2"
      }
    >
      {children}
    </div>
  );
}

// ─── FAB (Floating Action Button) ──────────────────────────────────────────

/**
 * Standard FAB. Sits above the bottom tab bar + safe area.
 * size-12, right-4, ink-950 fill.
 */
export function MobileFab({
  href,
  icon: Icon = Plus,
  label,
}: {
  href: string;
  icon?: LucideIcon;
  label?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label ?? "Create"}
      className="fixed right-4 z-30 grid place-items-center size-14 rounded-full shadow-lg press"
      style={{
        bottom:
          "calc(3.5rem + max(env(safe-area-inset-bottom), 0px) + 0.75rem)",
        backgroundColor: "var(--color-ink-950)",
        color: "var(--color-paper)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
      }}
    >
      <Icon className="size-6" />
    </Link>
  );
}

// ─── No Results (filter empty state) ───────────────────────────────────────

/**
 * Standard "no results match your filter" state. Distinct from
 * MobileEmptyState (which is for when there are zero records at all).
 */
export function MobileNoResults({
  title = "No results found",
  hint,
  query,
}: {
  title?: string;
  hint?: string;
  /** If set, hint becomes `Nothing matches "${query}"`. */
  query?: string;
}) {
  return (
    <div
      className="rounded-[0.625rem] border p-5 text-center"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <p className="text-m-section" style={{ color: "var(--color-ink-950)" }}>
        {title}
      </p>
      <p
        className="text-m-caption mt-1.5"
        style={{ color: "var(--color-ink-500)" }}
      >
        {query
          ? `Nothing matches "${query}"`
          : (hint ?? "Try a different search or filter.")}
      </p>
    </div>
  );
}

// ─── Summary Strip ─────────────────────────────────────────────────────────

export interface SummaryStat {
  label: string;
  value: string;
  tone?: "default" | "go" | "stop" | "signal";
}

/**
 * Compact KPI strip for list pages. Standard: rounded-[0.625rem], border,
 * p-3, mb-3. Renders 2-4 stats in a row.
 */
export function MobileSummaryStrip({ stats }: { stats: SummaryStat[] }) {
  const toneColor = (tone?: SummaryStat["tone"]) =>
    tone === "go"
      ? "var(--color-go)"
      : tone === "stop"
        ? "var(--color-stop)"
        : tone === "signal"
          ? "var(--color-signal-dark)"
          : "var(--color-ink-950)";

  return (
    <div
      className="flex items-center justify-between rounded-[0.625rem] border p-3 mb-3"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={
            i === 0
              ? "text-left flex-1"
              : i === stats.length - 1
                ? "text-right flex-1"
                : "text-center flex-1"
          }
          style={
            i > 0
              ? {
                  borderLeft: "1px solid var(--color-line)",
                  paddingLeft: "0.75rem",
                  marginLeft: "0.75rem",
                }
              : undefined
          }
        >
          <p className="text-m-label" style={{ color: "var(--color-ink-500)" }}>
            {s.label}
          </p>
          <p className="text-m-figure" style={{ color: toneColor(s.tone) }}>
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Dashed Create Button (for empty-list states) ──────────────────────────

/**
 * Dashed-border create button shown above MobileEmptyState when a list is
 * empty but the user can create. Standardised from procurement/requisitions.
 */
export function MobileDashedCreateButton({
  href,
  icon: Icon = Plus,
  children,
}: {
  href: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <Link
        href={href}
        className="touch-lg flex items-center justify-center gap-2 w-full rounded-[0.625rem] border-2 border-dashed text-m-body font-bold press"
        style={{
          borderColor: "var(--color-signal)",
          color: "var(--color-signal-dark)",
        }}
      >
        <Icon className="size-4" />
        {children}
      </Link>
    </div>
  );
}
