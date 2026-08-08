"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type TabsContext = { value: string; setValue: (v: string) => void };

const TabsCtx = React.createContext<TabsContext | null>(null);

export function Tabs({
  value,
  onValueChange,
  defaultValue,
  children,
  className,
}: {
  value?: string;
  onValueChange?: (v: string) => void;
  defaultValue?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [internal, setInternal] = React.useState(defaultValue ?? "");
  const current = value ?? internal;
  const setValue = React.useCallback(
    (v: string) => {
      if (onValueChange) onValueChange(v);
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
 * The pill-in-a-well style breaks down past three or four tabs (and views
 * like the project hub have many): the well grows into a grey slab that
 * competes with the content, and it can't scroll gracefully. An underlined
 * row scales to any number of tabs, reads as a boundary between navigation
 * and content, and costs one hairline instead of a filled panel.
 */
export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto border-b border-border scrollbar-none">
      <div className={cn("inline-flex min-w-full items-stretch gap-5", className)}>{children}</div>
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
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
        "relative shrink-0 whitespace-nowrap pb-2 pt-1.5 text-meta transition-colors",
        active
          ? "font-semibold text-foreground"
          : "font-medium text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
      {/* The 2px rule sits ON the list's border, so the active tab reads as
          physically attached to the content below it. */}
      {active && (
        <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />
      )}
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
  return <div className={cn("mt-4", className)}>{children}</div>;
}
