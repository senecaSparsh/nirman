"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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

/**
 * MobileGlobalSearch — full-screen search overlay.
 *
 * Opens from the bottom tab bar. Shows recent items when query is empty,
 * live search results grouped by entity type as the user types.
 * Tapping a result navigates to that entity's detail page and records it
 * in recent items.
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
  requisition: "Requisitions",
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

export function MobileGlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const { items: recentItems, clear } = useRecentItems();

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
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

  // Group results by type
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type] ?? type,
    items: results.filter((r) => r.type === type),
  })).filter((g) => g.items.length > 0);

  if (!open) return null;

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
          className="press shrink-0 flex items-center justify-center size-9 rounded-lg"
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
            placeholder="Search POs, projects, materials, people..."
            className="w-full h-10 pl-9 pr-9 rounded-lg text-sm outline-none"
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

      {/* Results / Recent */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading state */}
        {loading && query.trim() ? (
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
        {!loading && query.trim() && results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <Search className="size-8 mb-3" style={{ color: "var(--color-ink-300)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--color-ink-700)" }}>
              No results for &ldquo;{query}&rdquo;
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--color-ink-400)" }}>
              Try searching by name, number, or code
            </p>
          </div>
        ) : null}

        {/* Search results grouped by type */}
        {!loading && grouped.length > 0 ? (
          <div className="py-2">
            {grouped.map((group) => (
              <div key={group.type}>
                <div
                  className="px-4 py-1.5 text-[0.625rem] font-bold uppercase tracking-wide"
                  style={{ color: "var(--color-ink-400)" }}
                >
                  {group.label}
                </div>
                {group.items.map((item) => {
                  const Icon = TYPE_ICONS[item.type] ?? FileText;
                  return (
                    <button
                      key={`${item.type}:${item.id}`}
                      onClick={() => handleSelect(item)}
                      className="press w-full flex items-center gap-3 px-4 py-2.5 text-left"
                    >
                      <div
                        className="shrink-0 flex items-center justify-center size-8 rounded-lg"
                        style={{ backgroundColor: "var(--color-surface)" }}
                      >
                        <Icon className="size-4" style={{ color: "var(--color-ink-500)" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm font-medium truncate"
                          style={{ color: "var(--color-ink-950)" }}
                        >
                          {item.label}
                        </div>
                        {item.sublabel ? (
                          <div
                            className="text-xs truncate"
                            style={{ color: "var(--color-ink-400)" }}
                          >
                            {item.sublabel}
                          </div>
                        ) : null}
                      </div>
                      {item.badge ? (
                        <span
                          className="shrink-0 text-[0.5625rem] font-semibold px-1.5 py-0.5 rounded uppercase"
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
        {!query.trim() && recentItems.length > 0 ? (
          <div className="py-2">
            <div
              className="flex items-center justify-between px-4 py-1.5"
            >
              <span
                className="text-[0.625rem] font-bold uppercase tracking-wide"
                style={{ color: "var(--color-ink-400)" }}
              >
                Recent
              </span>
              <button
                onClick={clear}
                className="press flex items-center gap-1 text-[0.625rem] font-medium"
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
                  className="press w-full flex items-center gap-3 px-4 py-2.5 text-left"
                >
                  <div
                    className="shrink-0 flex items-center justify-center size-8 rounded-lg"
                    style={{ backgroundColor: "var(--color-surface)" }}
                  >
                    <Icon className="size-4" style={{ color: "var(--color-ink-500)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium truncate"
                      style={{ color: "var(--color-ink-950)" }}
                    >
                      {item.label}
                    </div>
                    {item.sublabel ? (
                      <div
                        className="text-xs truncate"
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
        {!query.trim() && recentItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <Search className="size-8 mb-3" style={{ color: "var(--color-ink-300)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--color-ink-700)" }}>
              Search anything
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--color-ink-400)" }}>
              POs, projects, materials, suppliers, customers, units...
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
