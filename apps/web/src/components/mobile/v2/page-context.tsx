"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type { FlowId } from "@/lib/flow-map";

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE CONTEXT — entity context that flows from page → shell

   PROBLEM (D2 in NAVIGATION.md):
   The mobile shell renders NavSheet as a SIBLING of children, not a parent.
   React context flows downward only, so usePageContext() inside NavSheet
   always returned {} — making Next Step + flow-aware Related dead code.

   SOLUTION:
   Replace React context with a module-level store using useSyncExternalStore.
   Any component — regardless of tree position — can read the current page
   context. Detail pages call useSetPageContext() to announce their entity.
   The store auto-clears on pathname change so stale labels never leak.

   Detail pages (server components) render a client wrapper that calls
   useSetPageContext with the entity's live data:

   - entityType: "purchaseOrder" | "dpr" | "requisition" | ...
   - flowId: the flow-map ID (e.g. "procurement") — enables Next Step
   - status: the entity's current status (e.g. "ORDERED")
   - label: the entity's display name (e.g. "PO-2024-001")
   - recordId: the entity's ID (for navigation)
   - canActions: permission flags the user has for this entity

   The NavSheet reads this store to show:
   - "Next Step" section with the flow-map's resolved next action
   - The real entity label in the header (instead of URL-derived title)
   - Flow-aware Related links (workflow neighbors, not URL-prefix matches)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PageContextValue {
  /** Entity type identifier — matches the flow-map's entity naming. */
  entityType?: string;
  /** The flow-map ID — enables Next Step + flow-aware Related links. */
  flowId?: FlowId;
  /** Current status of the entity (e.g. "ORDERED", "SUBMITTED"). */
  status?: string;
  /** Display label for the entity (e.g. "PO-2024-001", "DPR 2024-03-15"). */
  label?: string;
  /** Subtitle for the entity (e.g. "Acme Suppliers", "Tower A · Floor 3"). */
  subtitle?: string;
  /** The entity's database ID — used for navigation. */
  recordId?: string;
  /** Permission flags the current user has for this entity. */
  canActions?: string[];
}

// ── Module-level store ──────────────────────────────────────────────────
// A simple external store that survives across the React tree boundary.
// Components above the provider (shell, NavSheet) can read what pages below
// the provider set.

let currentContext: PageContextValue = {};
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return currentContext;
}

/** Internal: set the current page context (called by useSetPageContext). */
function setPageContext(value: PageContextValue) {
  currentContext = value;
  emit();
}

/** Internal: clear the current page context. */
function clearPageContext() {
  if (Object.keys(currentContext).length > 0) {
    currentContext = {};
    emit();
  }
}

/**
 * Hook — read the current page context. Works from ANY component in the tree,
 * including the shell and NavSheet which sit above the page content.
 * Returns empty object if no page has set context.
 */
export function usePageContext(): PageContextValue {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Hook — read just the flow + status + permissions, for flow-map resolution.
 * Convenience wrapper.
 */
export function useFlowContext(): {
  flowId?: FlowId;
  status?: string;
  canActions: string[];
} {
  const ctx = usePageContext();
  return {
    flowId: ctx.flowId,
    status: ctx.status,
    canActions: ctx.canActions ?? [],
  };
}

/**
 * Hook — SET the page context. Called by detail pages (via PageContextProvider).
 * Automatically clears the context when the pathname changes or the
 * component unmounts, so stale labels never leak across navigations.
 */
function useSetPageContext(value: PageContextValue): void {
  const pathname = usePathname();

  // Set context on mount and when value/pathname changes.
  // The dependency array includes `value` (an object) — React compares by
  // reference, so pages should pass a stable object (e.g. from useMemo or
  // a literal that only changes when the entity changes).
  React.useEffect(() => {
    setPageContext(value);
    return () => {
      // Clear on unmount — prevents stale context when navigating away
      clearPageContext();
    };
  }, [pathname, value]);
}

/**
 * Provider — wrap a page's content to announce entity context.
 *
 * Usage in a server component detail page:
 * ```tsx
 * <PageContextProvider value={{
 *   entityType: "purchaseOrder",
 *   flowId: "procurement",
 *   status: po.status,
 *   label: po.poNumber,
 *   subtitle: po.supplier.name,
 *   recordId: po.id,
 *   canActions: ["PROCUREMENT_MANAGE", "PO_APPROVE"],
 * }}>
 *   <MobilePoDetailContent po={po} />
 * </PageContextProvider>
 * ```
 *
 * Backward-compatible: existing pages that import PageContextProvider
 * continue to work without changes — the API is identical.
 */
export function PageContextProvider({
  value,
  children,
}: {
  value: PageContextValue;
  children: React.ReactNode;
}) {
  useSetPageContext(value);
  return <>{children}</>;
}
