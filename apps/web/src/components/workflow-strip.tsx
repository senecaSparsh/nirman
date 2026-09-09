"use client";

import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

/**
 * WORKFLOW STRIP — a compact "how this works" guide for hub pages.
 *
 * A new user landing on /procurement or /sales sees 6+ tabs with no
 * indication of the correct order. This strip sits between the
 * PageHeader and the Tabs, showing the pipeline as numbered steps.
 * Clicking a step switches to that tab. Steps without a tab
 * (e.g. "Receive" — done from within a PO) are shown as visual
 * context only, not clickable.
 *
 * The `shortcut` prop shows a parallel path (e.g. "Cash Purchase"
 * skips Indent → Quotation → PO).
 *
 * Generic over T so it accepts the typed `setTab` from `useTabParam`
 * without casts.
 */

export type WorkflowStep<T extends string = string> = {
  label: string;
  /** Tab value to switch to when clicked. Omit for informational-only steps. */
  tab?: T;
};

export function WorkflowStrip<T extends string>({
  steps,
  activeTab,
  onTabChange,
  shortcut,
}: {
  steps: WorkflowStep<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  shortcut?: { label: string; tab: T };
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <span className="mr-1 text-caption font-medium text-faint">Flow:</span>
      {steps.map((step, i) => {
        const isActive = step.tab != null && activeTab === step.tab;
        const clickable = step.tab != null;
        return (
          <div key={i} className="flex items-center gap-1">
            {clickable ? (
              <button
                onClick={() => step.tab && onTabChange(step.tab)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1 text-caption font-medium transition-colors",
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full text-[10px] font-semibold",
                    isActive ? "bg-background/20 text-background" : "bg-muted text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                {step.label}
              </button>
            ) : (
              <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-caption font-medium text-faint">
                <span className="flex size-4 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-faint">
                  {i + 1}
                </span>
                {step.label}
              </div>
            )}
            {i < steps.length - 1 && (
              <ChevronRight className="size-3 shrink-0 text-faint" />
            )}
          </div>
        );
      })}
      {shortcut && (
        <>
          <span className="mx-1 text-caption text-faint">or skip to</span>
          <button
            onClick={() => onTabChange(shortcut.tab)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-caption font-medium transition-colors",
              activeTab === shortcut.tab
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {shortcut.label}
          </button>
        </>
      )}
    </div>
  );
}
