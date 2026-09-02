"use client";

import type { LucideIcon } from "lucide-react";

/**
 * ═══════════════════════════════════════════════════════════════════
 * RegisterTabs — physical register/binder bookmark tabs.
 *
 * Inspired by the carved vertical tab dividers in a physical register:
 *  · Each tab is a trapezoidal "page divider" sticking up from the page.
 *  · The active tab is flush with the content — same paper colour,
 *    connected, with a subtle shadow beneath the neighbouring tabs
 *    to create the illusion that the active page is pulled forward.
 *  · Inactive tabs sit slightly back (concrete-coloured, no shadow).
 *  · Tabs flex to fill the viewport equally — no horizontal scroll.
 *
 * The component is self-contained — pass it the list of tabs and the
 * current value + setter, and it renders the bookmark strip.
 * ═══════════════════════════════════════════════════════════════════
 */
export function RegisterTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: {
    value: T;
    label: string;
    icon?: LucideIcon;
    count?: number;
  }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div
      className="sticky top-0 z-20"
      style={{
        backgroundColor: "var(--color-paper-2)",
      }}
    >
      {/* The tab strip — a row of carved bookmark shapes.
          gap-0 so tab bottoms touch seamlessly; the trapezoid clip-path
          creates natural visual separation at the top. */}
      <div className="flex pt-1.5 gap-0">
        {tabs.map((tab, i) => {
          const active = tab.value === value;
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              onClick={() => onChange(tab.value)}
              className="relative flex items-center justify-center gap-1 flex-1 min-w-0 pt-2 pb-2 text-m-body font-bold transition-all press"
              style={{
                /* Trapezoidal shape: narrower at top, wider at bottom.
                   This is the "carved bookmark" silhouette — achieved
                   with clip-path so the whole button is the tab shape.
                   The 4% inset at top creates the die-cut angle. */
                clipPath:
                  "polygon(4% 0%, 96% 0%, 100% 100%, 0% 100%)",
                /* Active tab: paper-coloured (flush with content below),
                   inactive: concrete (recessed). */
                backgroundColor: active
                  ? "var(--color-paper)"
                  : "var(--color-concrete)",
                color: active
                  ? "var(--color-ink-950)"
                  : "var(--color-ink-500)",
                /* Active tab sits forward (shadow beneath neighbours),
                   inactive tabs are flat. */
                boxShadow: active
                  ? "0 -2px 4px rgba(0,0,0,0.03), inset 0 2px 0 0 rgba(0,0,0,0.02)"
                  : "inset 0 1px 0 0 rgba(0,0,0,0.03)",
                /* Slight upward lift on the active tab — like a real
                   register page that's been pulled out. */
                marginTop: active ? 0 : "0.125rem",
                /* Active tab overlaps the hairline below by 2px so its
                   bottom edge connects seamlessly to the page content. */
                marginBottom: active ? "-2px" : 0,
                /* Rounded top corners for a softer die-cut feel */
                borderTopLeftRadius: "0.375rem",
                borderTopRightRadius: "0.375rem",
                /* Thin separator between tabs — a right border on all
                   but the last tab, matching the page-2 background so
                   it reads as a hairline gap between divider pages. */
                borderRight:
                  i < tabs.length - 1
                    ? "1px solid var(--color-paper-2)"
                    : "none",
              }}
            >
              {Icon ? (
                <Icon
                  className="size-3.5 shrink-0"
                  style={{
                    opacity: active ? 1 : 0.6,
                  }}
                />
              ) : null}
              <span className="truncate text-center leading-tight">{tab.label}</span>
              {tab.count !== undefined ? (
                <span
                  className="shrink-0 px-1 rounded-full text-m-caption tabular-nums leading-5"
                  style={{
                    backgroundColor: active
                      ? "var(--color-concrete)"
                      : "color-mix(in srgb, var(--color-paper) 50%, transparent)",
                    color: active
                      ? "var(--color-ink-700)"
                      : "var(--color-ink-400)",
                  }}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Hairline beneath the strip — the "page edge" that the active
          tab connects to. The active tab's -2px bottom margin makes it
          overlap this line, so the active tab appears connected to the
          page content below. */}
      <div
        style={{
          height: "1px",
          backgroundColor: "var(--color-line)",
        }}
      />
    </div>
  );
}
