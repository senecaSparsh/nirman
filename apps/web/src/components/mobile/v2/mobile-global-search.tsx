"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  Clock,
  FileText,
  ShoppingCart,
  Building2,
  Boxes,
  Truck,
  Users,
  Package,
  LandPlot,
  ClipboardList,
  Wrench,
  ArrowLeftRight,
  TrendingUp,
  ArrowRight,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useRecentItems, recordRecentItem, type RecentItem } from "@/lib/use-recent-items";
import { ALL_NAV_LINKS } from "@/lib/mobile-nav-v2";
import { useRecentPages } from "@/lib/use-nav-preferences";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileNoResults } from "@/components/mobile/v2/scaffold";

/**
 * MobileGlobalSearch — full-screen search overlay.
 *
 * Opens from the bottom tab bar. Shows recent items when query is empty,
 * live search results grouped by entity type as the user types.
 * Tapping a result navigates to that entity's detail page and records it
 * in recent items.
 *
 * Features:
 * - Debounced live search (300ms)
 * - Keyboard navigation (arrow up/down, enter to select, escape to close)
 * - Match highlighting in result labels
 * - Result count summary bar
 * - Recent items when query is empty
 */

interface SearchResult {
  type: string;
  id: string;
  label: string;
  sublabel: string;
  badge?: string;
  href: string;
}

const TYPE_ICONS: Record<string, LucideIcon> = {
  po: FileText,
  requisition: ShoppingCart,
  project: Building2,
  material: Boxes,
  supplier: Truck,
  customer: Users,
  unit: Package,
  land: LandPlot,
  dpr: ClipboardList,
  employee: Users,
  equipment: Wrench,
  sale: TrendingUp,
  transfer: ArrowLeftRight,
};

const TYPE_LABELS: Record<string, string> = {
  po: "Purchase Orders",
  requisition: "Indents",
  project: "Projects",
  material: "Materials",
  supplier: "Suppliers",
  customer: "Customers",
  unit: "Built Units",
  land: "Land Parcels",
  dpr: "DPRs",
  employee: "Employees",
  equipment: "Equipment",
  sale: "Material Sales",
  transfer: "Transfers",
};

// Order of groups in results
const TYPE_ORDER = [
  "po", "requisition", "project", "material", "supplier",
  "customer", "unit", "land", "dpr", "employee",
  "equipment", "sale", "transfer",
];

/** Highlight matched substring within a text label. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ backgroundColor: "rgba(245,158,11,0.25)", color: "inherit", borderRadius: "2px", padding: "0 1px" }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function MobileGlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { items: recentItems, clear } = useRecentItems();
  const { visitCounts } = useRecentPages();

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveIndex(-1);
      // Small delay to let the overlay mount
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}&limit=20`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
        }
      } catch {
        // Network error — ignore
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

  // Group results by type
  const grouped = useMemo(() => TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type] ?? type,
    items: results.filter((r) => r.type === type),
  })).filter((g) => g.items.length > 0), [results]);

  // ── Page results — filter ALL_NAV_LINKS locally (no API call) ──
  // This is the universal reachability safety net: any page is one
  // search away, regardless of NavSheet structure.
  // Results are sorted by frecency: pages you visit often float to the
  // top, so "stock" surfaces your frequently-visited stock page first.
  const pageResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ALL_NAV_LINKS.filter((link) => {
      const label = link.label.toLowerCase();
      const subtitle = (link.subtitle ?? "").toLowerCase();
      return label.includes(q) || subtitle.includes(q);
    })
      .sort((a, b) => {
        // Frecency: pages with more visits rank higher
        const aVisits = visitCounts[a.href] ?? 0;
        const bVisits = visitCounts[b.href] ?? 0;
        return bVisits - aVisits;
      })
      .slice(0, 8);
  }, [query, visitCounts]);

  // Flat list for keyboard navigation
  const flatResults = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Handle result tap
  const handleSelect = useCallback(
    (item: SearchResult | RecentItem) => {
      recordRecentItem({
        type: item.type,
        id: item.id,
        label: item.label,
        sublabel: item.sublabel ?? "",
        href: item.href,
      });
      onClose();
      router.push(item.href);
    },
    [router, onClose],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (flatResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % flatResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? flatResults.length - 1 : prev - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatResults[activeIndex];
      if (item) handleSelect(item);
    }
  }, [flatResults, activeIndex, handleSelect, onClose]);

  if (!open) return null;

  const totalResults = flatResults.length + pageResults.length;
  const trimmedQuery = query.trim();

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ backgroundColor: "var(--color-paper)" }}
    >
      {/* Search header */}
      <div
        className="flex items-center gap-2 px-3 py-3 border-b"
        style={{ borderColor: "var(--color-line)" }}
      >
        <button
          onClick={onClose}
          className="press shrink-0 flex items-center justify-center size-9 rounded-[0.625rem] text-m-body"
          style={{ color: "var(--color-ink-500)" }}
          aria-label="Close search"
        >
          <ArrowRight className="size-5 rotate-180" />
        </button>
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 size-4"
            style={{ color: "var(--color-ink-400)" }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, POs, projects, materials, people..."
            className="w-full h-9 pl-9 pr-9 rounded-[0.625rem] text-m-body outline-none"
            style={{
              backgroundColor: "var(--color-paper)",
              border: "1px solid var(--color-line)",
              color: "var(--color-ink-950)",
            }}
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 press shrink-0 flex items-center justify-center size-6 rounded-full"
              style={{ color: "var(--color-ink-400)" }}
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Results count summary bar */}
      {!loading && trimmedQuery && totalResults > 0 ? (
        <div
          className="px-4 py-1.5 text-m-label font-semibold border-b"
          style={{
            color: "var(--color-ink-500)",
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-surface)",
          }}
        >
          {totalResults} result{totalResults !== 1 ? "s" : ""} across {grouped.length} categor{grouped.length !== 1 ? "ies" : "y"}
        </div>
      ) : null}

      {/* Results / Recent */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading state */}
        {loading && trimmedQuery ? (
          <div className="flex items-center justify-center py-12">
            <div
              className="size-5 rounded-full border-2 animate-spin"
              style={{
                borderColor: "var(--color-line)",
                borderTopColor: "var(--color-ink-500)",
              }}
            />
          </div>
        ) : null}

        {/* No results */}
        {!loading && trimmedQuery && totalResults === 0 ? (
          <div className="py-16 px-6">
            <MobileNoResults query={query} />
          </div>
        ) : null}

        {/* Search results grouped by type */}
        {!loading && pageResults.length > 0 ? (
          <div className="py-2">
            <div
              className="px-4 py-1.5 text-m-label font-bold uppercase tracking-wide"
              style={{ color: "var(--color-ink-400)" }}
            >
              Pages
            </div>
            {pageResults.map((link) => {
              const Icon = link.icon as LucideIcon;
              return (
                <button
                  key={link.href}
                  onClick={() => {
                    onClose();
                    router.push(link.href);
                  }}
                  className="text-m-body press w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                >
                  <div
                    className="shrink-0 flex items-center justify-center size-8 rounded-[0.625rem]"
                    style={{ backgroundColor: "var(--color-surface)" }}
                  >
                    <Icon className="size-4" style={{ color: "var(--color-ink-500)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-m-body font-medium truncate"
                      style={{ color: "var(--color-ink-950)" }}
                    >
                      <Highlight text={link.label} query={trimmedQuery} />
                    </div>
                    {link.subtitle ? (
                      <div
                        className="text-m-caption truncate"
                        style={{ color: "var(--color-ink-400)" }}
                      >
                        <Highlight text={link.subtitle} query={trimmedQuery} />
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}

        {!loading && grouped.length > 0 ? (
          <div className="py-2">
            {grouped.map((group) => (
              <div key={group.type}>
                <div
                  className="px-4 py-1.5 text-m-label font-bold uppercase tracking-wide"
                  style={{ color: "var(--color-ink-400)" }}
                >
                  {group.label}
                </div>
                {group.items.map((item) => {
                  const flatIdx = flatResults.findIndex((r) => r.id === item.id && r.type === item.type);
                  const isActive = flatIdx === activeIndex;
                  const Icon = TYPE_ICONS[item.type] ?? FileText;
                  return (
                    <button
                      key={`${item.type}:${item.id}`}
                      onClick={() => handleSelect(item)}
                      className="text-m-body press w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                      style={{
                        backgroundColor: isActive ? "var(--color-surface)" : "transparent",
                      }}
                    >
                      <div
                        className="shrink-0 flex items-center justify-center size-8 rounded-[0.625rem]"
                        style={{ backgroundColor: "var(--color-surface)" }}
                      >
                        <Icon className="size-4" style={{ color: "var(--color-ink-500)" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-m-body font-medium truncate"
                          style={{ color: "var(--color-ink-950)" }}
                        >
                          <Highlight text={item.label} query={trimmedQuery} />
                        </div>
                        {item.sublabel ? (
                          <div
                            className="text-m-caption truncate"
                            style={{ color: "var(--color-ink-400)" }}
                          >
                            <Highlight text={item.sublabel} query={trimmedQuery} />
                          </div>
                        ) : null}
                      </div>
                      {item.badge ? (
                        <span
                          className="shrink-0 text-m-caption font-semibold px-1.5 py-0.5 rounded uppercase"
                          style={{
                            backgroundColor: "var(--color-surface)",
                            color: "var(--color-ink-500)",
                          }}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}

        {/* Recent items (shown when query is empty) */}
        {!trimmedQuery && recentItems.length > 0 ? (
          <div className="py-2">
            <div
              className="flex items-center justify-between px-4 py-1.5"
            >
              <span
                className="text-m-label font-bold uppercase tracking-wide"
                style={{ color: "var(--color-ink-400)" }}
              >
                Recent
              </span>
              <button
                onClick={clear}
                className="text-m-body press flex items-center gap-1 text-m-label font-medium"
                style={{ color: "var(--color-ink-400)" }}
              >
                <Trash2 className="size-3" /> Clear
              </button>
            </div>
            {recentItems.map((item) => {
              const Icon = TYPE_ICONS[item.type] ?? FileText;
              return (
                <button
                  key={`${item.type}:${item.id}`}
                  onClick={() => handleSelect(item)}
                  className="text-m-body press w-full flex items-center gap-3 px-4 py-2.5 text-left"
                >
                  <div
                    className="shrink-0 flex items-center justify-center size-8 rounded-[0.625rem]"
                    style={{ backgroundColor: "var(--color-surface)" }}
                  >
                    <Icon className="size-4" style={{ color: "var(--color-ink-500)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-m-body font-medium truncate"
                      style={{ color: "var(--color-ink-950)" }}
                    >
                      {item.label}
                    </div>
                    {item.sublabel ? (
                      <div
                        className="text-m-caption truncate"
                        style={{ color: "var(--color-ink-400)" }}
                      >
                        {item.sublabel}
                      </div>
                    ) : null}
                  </div>
                  <Clock className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Empty recent state */}
        {!trimmedQuery && recentItems.length === 0 ? (
          <div className="py-16 px-6">
            <MobileEmptyState
              icon={Search}
              title="Search anything"
              description="POs, projects, materials, suppliers, customers, units..."
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
