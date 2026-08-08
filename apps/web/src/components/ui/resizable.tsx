"use client";

import * as React from "react";
import {
  Group,
  Panel as RPanel,
  Separator as RSeparator,
  type GroupProps,
  type PanelProps,
  type SeparatorProps,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";

/**
 * RESIZABLE — thin wrappers around react-resizable-panels v4.
 *
 * The library handles the hard parts (pointer + keyboard dragging,
 * percentage math, collapsible panels). We add styling that matches
 * the design system's hairline aesthetic.
 */

/** Group container — a horizontal or vertical panel group. */
export function ResizablePanelGroup({
  className,
  children,
  ...props
}: GroupProps) {
  return (
    <Group
      className={cn("flex h-full w-full data-[panel-group-direction=vertical]:flex-col", className)}
      {...props}
    >
      {children}
    </Group>
  );
}

/** A single resizable panel. */
export function ResizablePanel({
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <RPanel className={cn("h-full w-full min-w-0 overflow-hidden", className)} {...props}>
      {children}
    </RPanel>
  );
}

/**
 * The drag handle between panels. A 1px hairline that widens and
 * shifts to the brand colour on hover/active, with a small grip dot
 * in the centre so the affordance is obvious.
 */
export function ResizableHandle({
  className,
  children,
  ...props
}: SeparatorProps) {
  return (
    <RSeparator
      className={cn(
        "group relative flex w-1 shrink-0 items-center justify-center bg-border transition-all duration-150",
        "hover:w-1.5 hover:bg-primary/20",
        "data-[resize-handle-state=drag]:w-1.5 data-[resize-handle-state=drag]:bg-primary/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        className,
      )}
      {...props}
    >
      {/* Grip — a small vertical line in the centre of the handle */}
      <span className="h-6 w-0.5 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-primary/40 group-data-[resize-handle-state=drag]:bg-primary/60" />
      {children}
    </RSeparator>
  );
}
