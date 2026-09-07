"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  X,
  Pin,
  Plus,
  PinOff,
  Home,
  Search,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { usePinnedPages, useRecentPages } from "@/lib/use-nav-preferences";
import { ROUTES } from "@/lib/route-manifest";

/* ═══════════════════════════════════════════════════════════════════════════
   TAB SWITCHER — Safari-style tab rail, triggered by right-edge swipe

   A persistent glassy panel on the right edge. Three states:

   1. **Hidden** — not rendered (initial state, before first swipe)
   2. **Expanded** — full tab panel slides in from the right (swipe left
      from the right edge). Shows labelled tab cards with pin + close.
   3. **Collapsed** — the user taps X or a tab. Instead of disappearing,
      the panel shrinks to a slim vertical rail (~2.4rem) on the right
      edge showing just the tab icons — always visible, always glassy.
      Tapping an icon switches to that tab. Tapping the chevron on the
      rail expands back to the full panel.

   The rail NEVER fully disappears once activated — it stays pinned to
   the right edge as a persistent quick-switch strip. To fully dismiss
   it, the user can long-press the rail (or we add a tiny × at the
   bottom of the rail for a future "hide completely" gesture).

   Visual language: true Apple frosted glass — barely-there backgrounds,
   heavy blur + saturate, hairline translucent borders.
   ═══════════════════════════════════════════════════════════════════════════ */

interface TabItem {
  href: string;
  icon: LucideIcon;
  label: string;
  subtitle?: string;
  pinned: boolean;
  current: boolean;
  visitCount?: number;
}

// ── Build a lookup: href → {icon, label, subtitle} from the route manifest ──
const HREF_TO_META: Map<
  string,
  { icon: LucideIcon; label: string; subtitle?: string }
> = (() => {
  const map = new Map<
    string,
    { icon: LucideIcon; label: string; subtitle?: string }
  >();
  for (const route of ROUTES) {
    if (route.kind === "redirect") continue;
    map.set(route.path, {
      icon: route.icon,
      label: route.title,
      subtitle: route.hint,
    });
  }
  return map;
})();

// ── All navigable routes for the "New Tab" picker ──
// Skip dynamic routes ([id] segments) — they need an entity ID and can't be
// used as a plain <Link href>. Only static pages go in the picker.
const ALL_PAGES: { href: string; icon: LucideIcon; label: string }[] = (() => {
  const items: { href: string; icon: LucideIcon; label: string }[] = [];
  for (const route of ROUTES) {
    if (route.kind === "redirect" || route.path.includes("[")) continue;
    items.push({ href: route.path, icon: route.icon, label: route.title });
  }
  return items;
})();

// ── Closed tabs key — user can dismiss a tab from the switcher ──
const CLOSED_KEY = "nirman.nav.closedTabs";

function readClosed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CLOSED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x) => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function writeClosed(list: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CLOSED_KEY, JSON.stringify(list));
  } catch {
    /* private mode */
  }
}

/** Where the rail lives — persisted so it survives page navigations. */
const RAIL_ACTIVE_KEY = "nirman.nav.tabRail";

interface TabSwitcherProps {
  /** Whether the full panel is expanded (from the right-edge swipe). */
  open: boolean;
  /** Called when the user requests the panel collapse to rail. */
  onCollapse: () => void;
  /** Called when the rail's expand button is tapped. */
  onExpand: () => void;
}

export function TabSwitcher({ open, onCollapse, onExpand }: TabSwitcherProps) {
  const pathname = usePathname();
  const [exiting, setExiting] = React.useState(false);
  const collapseTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const railTouchRef = React.useRef<{ x: number; y: number } | null>(null);

  // ── Whether the rail has ever been activated (persists across nav) ──
  const [railActive, setRailActive] = React.useState(false);
  React.useEffect(() => {
    setRailActive(
      typeof window !== "undefined" &&
        localStorage.getItem(RAIL_ACTIVE_KEY) === "1",
    );
  }, []);

  // When the panel first opens, mark the rail as permanently active
  React.useEffect(() => {
    if (open && !railActive) {
      setRailActive(true);
      try {
        localStorage.setItem(RAIL_ACTIVE_KEY, "1");
      } catch {
        /* private mode */
      }
    }
  }, [open, railActive]);

  const { pinned, togglePin, isPinned } = usePinnedPages();
  const { recent, visitCounts } = useRecentPages();

  // ── "New tab" picker mode ──
  const [showPicker, setShowPicker] = React.useState(false);
  const [pickerQuery, setPickerQuery] = React.useState("");

  // ── Closed tabs ──
  const [closedTabs, setClosedTabs] = React.useState<string[]>([]);
  React.useEffect(() => {
    setClosedTabs(readClosed());
  }, []);

  const closeTab = React.useCallback((href: string) => {
    setClosedTabs((prev) => {
      const next = [...prev, href];
      writeClosed(next);
      return next;
    });
  }, []);

  // ── Panel open/close animation ──
  // When open → cancel any pending exit. When closed → start exit, then
  // settle into collapsed rail mode (the component stays mounted).
  const [panelMounted, setPanelMounted] = React.useState(open);
  React.useEffect(() => {
    if (open) {
      setPanelMounted(true);
      setExiting(false);
      setShowPicker(false);
      setPickerQuery("");
    } else if (panelMounted) {
      setExiting(true);
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
      collapseTimer.current = setTimeout(() => {
        setPanelMounted(false);
        setExiting(false);
      }, 220);
    }
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    };
  }, [open, panelMounted]);

  // ── Lock body scroll only while the FULL panel is open ──
  React.useEffect(() => {
    if (!panelMounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [panelMounted]);

  // ── Escape collapses to rail (never fully hides) ──
  React.useEffect(() => {
    if (!panelMounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCollapse();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelMounted, onCollapse]);

  // ── Build the tab list: pinned first, then recent, then current page ──
  // Tabs keep their position — no reordering on switch. The current page
  // is appended at the END if not already in pinned/recent.
  const tabs: TabItem[] = React.useMemo(() => {
    const seen = new Set<string>();
    const items: TabItem[] = [];

    const push = (href: string) => {
      if (seen.has(href) || closedTabs.includes(href)) return;
      const meta = HREF_TO_META.get(href);
      if (!meta) return;
      seen.add(href);
      items.push({
        href,
        icon: meta.icon,
        label: meta.label,
        subtitle: meta.subtitle,
        pinned: isPinned(href),
        current: href === pathname,
        visitCount: visitCounts[href],
      });
    };

    // 1. Pinned pages — stable order, user curated
    for (const href of pinned) push(href);
    // 2. Recent pages — stable order, frecency sorted
    for (const href of recent) push(href);
    // 3. Current page — append at end if not already in the list
    if (pathname.startsWith("/m/") && !seen.has(pathname)) push(pathname);

    return items;
  }, [pathname, pinned, recent, isPinned, visitCounts, closedTabs]);

  // ── Filtered page picker list ──
  const filteredPages = React.useMemo(() => {
    if (!pickerQuery.trim()) return ALL_PAGES;
    const q = pickerQuery.toLowerCase();
    return ALL_PAGES.filter(
      (p) =>
        p.label.toLowerCase().includes(q) || p.href.toLowerCase().includes(q),
    );
  }, [pickerQuery]);

  // Nothing rendered until the rail has been activated at least once
  if (!railActive && !open) return null;

  return (
    <>
      {/* ══ FULL PANEL — slides in from right on swipe ══ */}
      {panelMounted && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop — glassy dim. Tapping it collapses the panel to the
              rail (not fully hidden). */}
          <div
            className={exiting ? "overlay-out" : "overlay-in"}
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor:
                "rgba(0, 0, 0, 0.35)",
              backdropFilter: "blur(2px)",
              WebkitBackdropFilter: "blur(2px)",
            }}
            onClick={onCollapse}
          />

          {/* Panel — slim vertical strip from the right */}
          <div
            className={exiting ? "panel-right-out" : "panel-right-in"}
            style={{
              position: "relative",
              width: "42%",
              maxWidth: "10rem",
              height: "100%",
              backgroundColor:
                "color-mix(in srgb, var(--color-paper) 22%, transparent)",
              backdropFilter: "blur(40px) saturate(220%) brightness(1.05)",
              WebkitBackdropFilter:
                "blur(40px) saturate(220%) brightness(1.05)",
              borderLeft:
                "1px solid color-mix(in srgb, var(--color-paper) 30%, transparent)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header — title + add-tab + collapse */}
            <div
              className="flex items-center justify-between px-2 py-2 shrink-0"
              style={{
                borderBottom:
                  "1px solid color-mix(in srgb, var(--color-paper) 20%, transparent)",
              }}
            >
              <h2
                className="text-m-label font-bold uppercase tracking-wide"
                style={{ color: "var(--color-ink-700)" }}
              >
                {showPicker ? "New Tab" : "Tabs"}
              </h2>
              <div className="flex items-center gap-1">
                {!showPicker && (
                  <button
                    onClick={() => setShowPicker(true)}
                    aria-label="New tab"
                    className="press grid place-items-center size-7 rounded-[0.5rem]"
                    style={{
                      color: "var(--color-ink-700)",
                      backgroundColor:
                        "color-mix(in srgb, var(--color-paper) 18%, transparent)",
                    }}
                  >
                    <Plus className="size-4" />
                  </button>
                )}
                <button
                  onClick={
                    showPicker ? () => setShowPicker(false) : onCollapse
                  }
                  aria-label={
                    showPicker ? "Back to tabs" : "Collapse to rail"
                  }
                  className="press grid place-items-center size-7 rounded-[0.5rem]"
                  style={{
                    color: "var(--color-ink-500)",
                    backgroundColor:
                      "color-mix(in srgb, var(--color-paper) 18%, transparent)",
                  }}
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Content: tab list OR new-tab picker */}
            {showPicker ? (
              <div className="overflow-y-auto flex-1 px-1.5 py-1.5 pb-safe">
                {/* Search */}
                <div
                  className="flex items-center gap-1.5 rounded-[0.5rem] px-2 py-1.5 mb-1.5"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--color-paper) 15%, transparent)",
                    border:
                      "1px solid color-mix(in srgb, var(--color-paper) 25%, transparent)",
                  }}
                >
                  <Search
                    className="size-3.5 shrink-0"
                    style={{ color: "var(--color-ink-400)" }}
                  />
                  <input
                    type="text"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Search pages…"
                    className="flex-1 min-w-0 bg-transparent outline-none text-m-label font-medium"
                    style={{ color: "var(--color-ink-950)" }}
                    autoFocus
                  />
                </div>

                {/* Page list */}
                <div className="flex flex-col gap-0.5">
                  {filteredPages.map((page) => (
                    <Link
                      key={page.href}
                      href={page.href}
                      prefetch
                      onClick={onCollapse}
                      className="flex items-center gap-2 rounded-[0.5rem] px-2 py-2 press"
                      style={{
                        backgroundColor:
                          "color-mix(in srgb, var(--color-paper) 12%, transparent)",
                      }}
                    >
                      <page.icon
                        className="size-4 shrink-0"
                        style={{ color: "var(--color-ink-600)" }}
                      />
                      <span
                        className="text-m-label font-medium truncate"
                        style={{ color: "var(--color-ink-900)" }}
                      >
                        {page.label}
                      </span>
                    </Link>
                  ))}
                  {filteredPages.length === 0 && (
                    <p
                      className="text-m-label text-center py-6"
                      style={{ color: "var(--color-ink-400)" }}
                    >
                      No pages match
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 px-1.5 py-1.5 pb-safe">
                {tabs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Home
                      className="size-8 mb-2"
                      style={{ color: "var(--color-ink-300)" }}
                    />
                    <p
                      className="text-m-label font-semibold"
                      style={{ color: "var(--color-ink-500)" }}
                    >
                      No tabs yet
                    </p>
                    <p
                      className="text-m-caption mt-0.5"
                      style={{ color: "var(--color-ink-400)" }}
                    >
                      Navigate to pages and they&apos;ll appear here
                    </p>
                    <button
                      onClick={() => setShowPicker(true)}
                      className="mt-3 inline-flex items-center gap-1 rounded-[0.5rem] px-3 py-1.5 text-m-label font-semibold press"
                      style={{
                        backgroundColor:
                          "color-mix(in srgb, var(--color-signal) 80%, transparent)",
                        color: "var(--color-ink-950)",
                      }}
                    >
                      <Plus className="size-3.5" />
                      Browse pages
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {tabs.map((tab) => (
                      <TabCard
                        key={tab.href}
                        tab={tab}
                        onClose={onCollapse}
                        onTogglePin={togglePin}
                        onCloseTab={closeTab}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            {!showPicker && tabs.length > 0 && (
              <div
                className="shrink-0 px-2 py-1.5 flex items-center justify-between"
                style={{
                  borderTop:
                    "1px solid color-mix(in srgb, var(--color-paper) 20%, transparent)",
                }}
              >
                <span
                  className="text-m-caption font-semibold tabular-nums"
                  style={{ color: "var(--color-ink-400)" }}
                >
                  {tabs.length} {tabs.length === 1 ? "tab" : "tabs"}
                </span>
                <span
                  className="text-m-caption"
                  style={{ color: "var(--color-ink-400)" }}
                >
                  Tap ✕ to collapse
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ COLLAPSED RAIL — slim glassy strip, always visible ══
          Shows just icons. Tapping an icon switches to that tab.
          Tapping the chevron expands back to the full panel.
          Swiping left on the rail also expands it. */}
      {!panelMounted && railActive && (
        <div
          className="fixed top-0 bottom-0 right-0 z-40 flex flex-col items-center pt-12 pb-20"
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (t) railTouchRef.current = { x: t.clientX, y: t.clientY };
          }}
          onTouchMove={(e) => {
            if (!railTouchRef.current) return;
            const t = e.touches[0];
            if (!t) return;
            const dx = railTouchRef.current.x - t.clientX;
            // Swipe left on the rail → expand
            if (dx > 30) {
              railTouchRef.current = null;
              onExpand();
            }
          }}
          onTouchEnd={() => {
            railTouchRef.current = null;
          }}
          style={{
            width: "2.4rem",
            backgroundColor:
              "color-mix(in srgb, var(--color-paper) 18%, transparent)",
            backdropFilter: "blur(32px) saturate(200%)",
            WebkitBackdropFilter: "blur(32px) saturate(200%)",
            borderLeft:
              "1px solid color-mix(in srgb, var(--color-paper) 25%, transparent)",
          }}
        >
          {/* Expand button — tap to open the full panel */}
          <button
            onClick={onExpand}
            aria-label="Expand tab switcher"
            className="press grid place-items-center size-6 rounded-full mb-2 shrink-0"
            style={{
              color: "var(--color-ink-600)",
              backgroundColor:
                "color-mix(in srgb, var(--color-paper) 15%, transparent)",
            }}
          >
            <ChevronRight className="size-3.5" />
          </button>

          {/* Tab icons — vertical stack, glassy */}
          <div className="flex-1 overflow-y-auto flex flex-col items-center gap-1 px-0.5 w-full">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                prefetch
                aria-label={tab.label}
                className="press grid place-items-center size-7 rounded-[0.375rem] shrink-0 transition-all"
                style={{
                  backgroundColor: tab.current
                    ? "color-mix(in srgb, var(--color-signal) 25%, transparent)"
                    : "color-mix(in srgb, var(--color-paper) 12%, transparent)",
                  border: `1px solid ${
                    tab.current
                      ? "color-mix(in srgb, var(--color-signal) 30%, transparent)"
                      : "color-mix(in srgb, var(--color-paper) 18%, transparent)"
                  }`,
                }}
              >
                <tab.icon
                  className="size-3.5"
                  style={{
                    color: tab.current
                      ? "var(--color-signal-dark)"
                      : "var(--color-ink-500)",
                  }}
                />
              </Link>
            ))}
          </div>

          {/* Full-dismiss — hides the rail entirely until next swipe */}
          <button
            onClick={() => {
              setRailActive(false);
              try {
                localStorage.removeItem(RAIL_ACTIVE_KEY);
              } catch {
                /* private mode */
              }
              onCollapse();
            }}
            aria-label="Hide tab rail"
            className="press grid place-items-center size-6 rounded-full mt-2 shrink-0"
            style={{
              color: "var(--color-ink-400)",
              backgroundColor:
                "color-mix(in srgb, var(--color-paper) 15%, transparent)",
            }}
          >
            <X className="size-3" />
          </button>
        </div>
      )}
    </>
  );
}

/* ─── Tab card — a single glassy tab in the vertical list ─── */
function TabCard({
  tab,
  onClose,
  onTogglePin,
  onCloseTab,
}: {
  tab: TabItem;
  onClose: () => void;
  onTogglePin: (href: string) => void;
  onCloseTab: (href: string) => void;
}) {
  const Icon = tab.icon;
  return (
    <div
      className="relative rounded-[0.5rem] overflow-hidden transition-all"
      style={{
        backgroundColor: tab.current
          ? "color-mix(in srgb, var(--color-signal-wash) 28%, transparent)"
          : "color-mix(in srgb, var(--color-paper) 16%, transparent)",
        border: `1px solid ${
          tab.current
            ? "color-mix(in srgb, var(--color-signal) 25%, transparent)"
            : "color-mix(in srgb, var(--color-paper) 22%, transparent)"
        }`,
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
      }}
    >
      {/* Active indicator — left accent bar */}
      {tab.current && (
        <div
          className="absolute top-0 bottom-0 left-0"
          style={{
            width: 3,
            backgroundColor: "var(--color-signal)",
          }}
        />
      )}

      <div className="flex items-center gap-1 px-1.5 py-1.5">
        <Link
          href={tab.href}
          prefetch
          onClick={onClose}
          className="flex items-center gap-1.5 flex-1 min-w-0 press"
        >
          <div
            className="grid place-items-center size-6 rounded-[0.25rem] shrink-0"
            style={{
              backgroundColor: tab.current
                ? "color-mix(in srgb, var(--color-signal) 18%, transparent)"
                : "color-mix(in srgb, var(--color-paper) 20%, transparent)",
            }}
          >
            <Icon
              className="size-3"
              style={{
                color: tab.current
                  ? "var(--color-signal-dark)"
                  : "var(--color-ink-600)",
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-m-caption font-semibold truncate leading-tight"
              style={{
                color: tab.current
                  ? "var(--color-signal-dark)"
                  : "var(--color-ink-900)",
              }}
            >
              {tab.label}
            </p>
          </div>
        </Link>

        {/* Pin + close buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTogglePin(tab.href);
            }}
            aria-label={tab.pinned ? "Unpin tab" : "Pin tab"}
            className="press grid place-items-center size-6 rounded-[0.25rem]"
            style={{
              color: tab.pinned
                ? "var(--color-signal-dark)"
                : "var(--color-ink-400)",
            }}
          >
            {tab.pinned ? (
              <Pin className="size-3" style={{ fill: "currentColor" }} />
            ) : (
              <PinOff className="size-3" />
            )}
          </button>
          {!tab.current && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCloseTab(tab.href);
              }}
              aria-label="Close tab"
              className="press grid place-items-center size-6 rounded-[0.25rem]"
              style={{ color: "var(--color-ink-400)" }}
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
