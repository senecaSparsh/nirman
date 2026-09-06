"use client";

import { } from "react";
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
      <div className="relative flex w-full">
        {tabs.map((tab) => {
          const active = tab.value === value;
          const showCount = tab.count !== undefined && tab.count > 0;
          return (
            <button
              key={tab.value}
              onClick={() => onChange(tab.value)}
              data-focus-ring="none"
              className="relative flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1.5 transition-colors press"
              style={{ outline: "none" }}
            >
              <span
                className="text-m-caption leading-tight truncate"
                style={{
                  color: active ? "var(--color-ink-950)" : "var(--color-ink-400)",
                  fontWeight: active ? 700 : 500,
                }}
              >
                {tab.label}
                {showCount ? (
                  <span
                    className="ml-0.5 text-micro tabular-nums align-super"
                    style={{ color: active ? "var(--color-go)" : "var(--color-ink-400)" }}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
        {/* Sliding underline — uses translateX so it's always under the
            active tab regardless of container padding or viewport size.
            The outer div is one tab-width wide; translateX moves it to
            the active tab. The inner div is the visible underline,
            centered within the tab via mx-auto. */}
        <div
          className="absolute bottom-0 left-0 h-0.5"
          style={{
            width: `${tabPct}%`,
            transform: `translateX(${activeIndex * 100}%)`,
            transition: "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          <div
            className="h-full rounded-full mx-auto"
            style={{
              width: "calc(100% - 1.5rem)",
              backgroundColor: "var(--color-go)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
