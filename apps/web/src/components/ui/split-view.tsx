"use client";

import * as React from "react";
import { X } from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./resizable";
import { cn } from "@/lib/utils";

interface SplitViewProps {
  /** Left panel — typically the list */
  list: React.ReactNode;
  /** Right panel — typically the detail. When null/undefined a
   *  placeholder is shown and the detail panel collapses. */
  detail: React.ReactNode | null;
  /** Called when the user clicks the close button on the detail panel.
   *  The parent should set `detail` to null to collapse the panel. */
  onClose?: () => void;
  /** Initial list panel size as percentage (default 40) */
  defaultListSize?: number;
  /** Minimum list panel size as percentage (default 25) */
  minListSize?: number;
  /** Persist panel sizes to localStorage under this key */
  storageKey?: string;
  /** Class name for the container */
  className?: string;
}

/**
 * SPLIT VIEW — a master/detail layout with a resizable divider.
 *
 * The list sits on the left, the detail on the right. When no item is
 * selected (`detail` is null/undefined) the list expands to full width
 * and a muted placeholder prompts the user to pick an item.
 */
export function SplitView({
  list,
  detail,
  onClose,
  defaultListSize = 40,
  minListSize = 25,
  storageKey,
  className,
}: SplitViewProps) {
  const hasDetail = detail != null;

  // Persist the list size to localStorage when a storageKey is provided
  React.useEffect(() => {
    if (!storageKey) return;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= minListSize && parsed <= 75) {
        defaultListSize = parsed;
      }
    }
  }, [storageKey, minListSize]);

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className={cn("h-full min-h-0", className)}
    >
      <ResizablePanel
        defaultSize={`${hasDetail ? defaultListSize : 100}%`}
        minSize={`${hasDetail ? minListSize : 100}%`}
        maxSize={`${hasDetail ? 75 : 100}%`}
        className="min-h-0"
      >
        <div className="h-full overflow-y-auto">{list}</div>
      </ResizablePanel>

      {hasDetail && (
        <>
          <ResizableHandle />
          <ResizablePanel
            defaultSize={`${100 - defaultListSize}%`}
            minSize="25%"
            className="min-h-0"
          >
            <div className="relative h-full overflow-y-auto">
              {onClose && (
                <button
                  onClick={onClose}
                  aria-label="Close detail panel"
                  title="Close"
                  className="absolute right-3 top-3 z-50 inline-flex size-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-border-strong hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
              {detail}
            </div>
          </ResizablePanel>
        </>
      )}

      {!hasDetail && (
        <>
          <ResizableHandle className="hidden" />
          <ResizablePanel defaultSize="0%" minSize="0%" maxSize="0%" className="min-h-0">
            <div className="flex h-full items-center justify-center">
              <p className="text-body text-muted-foreground">Select an item to view details</p>
            </div>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
