"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type TabsContext = { value: string; setValue: (v: string) => void };

const TabsCtx = React.createContext<TabsContext | null>(null);

/**
 * Generic over the tab union, so a caller can hold its tab in a typed
 * `"overview" | "finance" | …` and still pass the setter straight in —
 * without that, every call site has to cast in `onValueChange`, and a
 * cast is exactly where a renamed tab silently stops working.
 */
export function Tabs<T extends string = string>({
  value,
  onValueChange,
  defaultValue,
  children,
  className,
}: {
  value?: T;
  onValueChange?: (v: T) => void;
  defaultValue?: T;
  children: React.ReactNode;
  className?: string;
}) {
  const [internal, setInternal] = React.useState<string>(defaultValue ?? "");
  const current = value ?? internal;
  const setValue = React.useCallback(
    (v: string) => {
      if (onValueChange) onValueChange(v as T);
      else setInternal(v);
    },
    [onValueChange],
  );
  return (
    <TabsCtx.Provider value={{ value: current, setValue }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}

/**
 * Tab list — an underlined row, not a segmented pill control.
 *
 * The pill-in-a-well style breaks down past three or four tabs (and
 * views like the project hub have many): the well grows into a grey slab
 * that competes with the content, and it can't scroll gracefully. An
 * underlined row scales to any number of tabs, reads as a boundary
 * between navigation and content, and costs one hairline instead of a
 * filled panel.
 *
 * On a narrow viewport the row scrolls horizontally with the scrollbar
 * hidden and an edge fade, so it's obvious there are more tabs without
 * a chevron button eating a tab's worth of width.
 */
export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="relative border-b border-border">
      <div className="overflow-x-auto scrollbar-none">
        <div className={cn("inline-flex min-w-full items-stretch gap-1", className)} role="tablist">
          {children}
        </div>
      </div>
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  count,
  className,
}: {
  value: string;
  children: React.ReactNode;
  /** A live count beside the label — requisitions awaiting you, etc. */
  count?: number;
  className?: string;
}) {
  const ctx = React.useContext(TabsCtx);
  if (!ctx) throw new Error("TabsTrigger must be used within Tabs");
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => ctx.setValue(value)}
      className={cn(
        "relative -mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 pb-2.5 pt-2",
        "text-[13px]",
        active
          ? "font-semibold text-foreground"
          : "font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        className,
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1",
            "text-[10px] font-semibold tabular-nums leading-none",
            active ? "bg-brand-soft text-brand-strong" : "bg-muted text-muted-foreground",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
      {/* A 2px rule sitting ON the list's border, so the active tab reads
          as physically attached to the content below it. */}
      {active && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-foreground" />}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(TabsCtx);
  if (!ctx) throw new Error("TabsContent must be used within Tabs");
  if (ctx.value !== value) return null;
  return (
    <div role="tabpanel" className={cn("mt-5", className)}>
      {children}
    </div>
  );
}

/**
 * SEGMENTED — the small either/or control (Day / Week / Month, density,
 * chart vs. table). This is the *only* place a pill-in-a-well is right:
 * 2–4 short options that are mutually exclusive views of the same data.
 * Use TabsList for navigation; use this for a view switch.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  iconOnly = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  className?: string;
  /** Show only icons; the label becomes a hover tooltip (`title`). */
  iconOnly?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-input bg-muted p-0.5",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            title={iconOnly ? o.label : undefined}
            aria-label={iconOnly ? o.label : undefined}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-[5px] text-[12px] font-medium",
              "transition-[background-color,color,box-shadow] duration-100 [&_svg]:size-3.5",
              iconOnly ? "px-1.5" : "px-2.5",
              active
                ? "bg-card text-foreground shadow-raised"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.icon}
            {!iconOnly && o.label}
          </button>
        );
      })}
    </div>
  );
}
