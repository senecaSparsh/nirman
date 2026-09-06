"use client";

import { useRef } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * RegisterTabs — minimal text-only tab bar with a sliding underline.
 *
 *  · No container, no track, no border — just typography.
 *  · Text-only tabs (icons dropped for cleaner mobile symmetry).
 *  · Active: ink-950 + bold. Inactive: ink-400, regular weight.
 *  · Count shown as small superscript number, only when > 0.
 *  · A green underline slides between tabs on switch (CSS transition).
 *  · Sticky with transparent bg so it floats over content.
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
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.value === value),
  );
  const tabPct = 100 / tabs.length;

  return (
    <div
      className="sticky top-0 z-20 py-1 mb-2"
      style={{ backgroundColor: "var(--color-paper-2)" }}
    >
      <div className="relative flex items-center justify-around">
        {tabs.map((tab) => {
          const active = tab.value === value;
          const showCount = tab.count !== undefined && tab.count > 0;
          return (
            <button
              key={tab.value}
              onClick={() => onChange(tab.value)}
              data-focus-ring="none"
              className="relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-2 transition-colors press"
              style={{ outline: "none" }}
            >
              <span
                className="text-m-body leading-tight truncate"
                style={{
                  color: active ? "var(--color-ink-950)" : "var(--color-ink-400)",
                  fontWeight: active ? 700 : 500,
                }}
              >
                {tab.label}
                {showCount ? (
                  <span
                    className="ml-0.5 text-m-caption tabular-nums align-super"
                    style={{ color: active ? "var(--color-go)" : "var(--color-ink-400)" }}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
        {/* Sliding underline — positioned by active tab index */}
        <div
          className="absolute bottom-0 h-0.5 rounded-full"
          style={{
            width: `calc(${tabPct}% - 1.5rem)`,
            left: `calc(${activeIndex * tabPct}% + 0.75rem)`,
            backgroundColor: "var(--color-go)",
            transition: "left 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </div>
    </div>
  );
}
