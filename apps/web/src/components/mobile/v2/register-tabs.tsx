"use client";

import type { LucideIcon } from "lucide-react";

/**
 * ═══════════════════════════════════════════════════════════════════
 * RegisterTabs — Uiverse-inspired minimal pill tab bar.
 *
 * Adapted from the Adir-SL "warm-falcon-58" switch on Uiverse.io.
 *  · The strip is one soft, rounded track sitting on the page
 *    background.
 *  · Each tab is a flex-1 pill trigger.
 *  · The active tab becomes a white pill with a 1px inner hairline
 *    (the Adir-SL `0 0 0 1px rgba(0,0,0,0.05) inset` shadow), giving
 *    it a subtle pressed, physical feel.
 *  · Inactive tabs sit transparent on the track, so they melt into
 *    the background.
 *  · No clip-path, no trapezoid, no merge logic, no outer shadow —
 *    just clean pill shapes, subtle colour, and soft transitions.
 *  · Tabs flex to fill the viewport equally — no horizontal scroll.
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
      {/* Pill track — the soft well behind all tabs.
          A single rounded container in concrete, with a tiny bit of
          padding so the active white pill can float inside it. */}
      <div
        className="flex p-1 rounded-[0.625rem]"
        style={{
          gap: "2px",
          backgroundColor:
            "color-mix(in srgb, var(--color-concrete) 60%, var(--color-paper-2))",
          /* Subtle 1px inset hairline — the Uiverse switch's
             signature clean depth. */
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)",
        }}
      >
        {tabs.map((tab) => {
          const active = tab.value === value;
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              onClick={() => onChange(tab.value)}
              data-focus-ring="none"
              className="relative flex items-center justify-center gap-1 flex-1 min-w-0 py-2 text-m-body font-bold transition-all press"
              style={{
                outline: "none",
                outlineOffset: "0px",
                /* Pill shape for every tab. */
                borderRadius: "0.5rem",
                /* Active tab: white pill (paper) with the Uiverse
                   switch's subtle 1px inset hairline. Inactive: fully
                   transparent so it shows the concrete track. */
                backgroundColor: active
                  ? "var(--color-paper)"
                  : "transparent",
                color: active
                  ? "var(--color-ink-950)"
                  : "var(--color-ink-500)",
                /* The Uiverse switch feel — a 1px inner edge that
                   makes the active pill look physically inset. */
                boxShadow: active
                  ? "0 0 0 1px rgba(0,0,0,0.05) inset"
                  : "none",
                /* No borders — clean pill edges only. */
                border: "none",
              }}
            >
              {Icon ? (
                <Icon
                  className="size-3.5 shrink-0"
                  style={{
                    opacity: active ? 1 : 0.55,
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
                      : "color-mix(in srgb, var(--color-paper) 45%, transparent)",
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
    </div>
  );
}
