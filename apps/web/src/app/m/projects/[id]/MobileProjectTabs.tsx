"use client";

import { useState, type ReactNode } from "react";

type TabKey = "overview" | "units" | "activity" | "legal";

interface TabDef {
  key: TabKey;
  label: string;
  badge?: number;
}

/**
 * MobileProjectTabs — pill-style toggle bar that switches between the four
 * main sections of the project detail page: Overview, Units, Activity, Legal.
 * Badge counts surface items needing attention (pending DPRs, unsold units, etc).
 */
export function MobileProjectTabs({
  tabs,
  children,
}: {
  tabs: { overview?: number; units?: number; activity?: number; legal?: number };
  children: { overview: ReactNode; units: ReactNode; activity: ReactNode; legal: ReactNode };
}) {
  const [active, setActive] = useState<TabKey>("overview");

  const tabDefs: TabDef[] = [
    { key: "overview", label: "Overview" },
    { key: "units", label: "Units", badge: tabs.units },
    { key: "activity", label: "Activity", badge: tabs.activity },
    { key: "legal", label: "Legal", badge: tabs.legal },
  ];

  return (
    <>
      {/* Tab bar — horizontally scrollable, no scrollbar */}
      <div className="flex items-center gap-1.5 mb-3 scrollbar-hide overflow-x-auto">
        {tabDefs.map((t) => {
          const isActive = active === t.key;
          const showBadge = t.badge != null && t.badge > 0;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className="flex items-center gap-1 h-8 px-3 rounded-full text-m-body font-bold whitespace-nowrap press shrink-0"
              style={{
                backgroundColor: isActive ? "var(--color-ink-950)" : "var(--color-paper)",
                color: isActive ? "var(--color-paper)" : "var(--color-ink-500)",
                border: `1px solid ${isActive ? "var(--color-ink-950)" : "var(--color-line)"}`,
              }}
            >
              {t.label}
              {showBadge && (
                <span
                  className="badge-pulse grid place-items-center min-w-4 h-4 px-1 rounded-full text-m-caption font-bold leading-none tabular-nums"
                  style={{
                    backgroundColor: isActive ? "var(--color-paper)" : "var(--color-stop)",
                    color: isActive ? "var(--color-ink-950)" : "var(--color-paper)",
                    fontSize: "0.625rem",
                  }}
                >
                  {t.badge! > 99 ? "99+" : t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active section content */}
      {active === "overview" && children.overview}
      {active === "units" && children.units}
      {active === "activity" && children.activity}
      {active === "legal" && children.legal}
    </>
  );
}
