"use client";

import { QuickActionsBar, type QuickActionTab, type ExtraActionDef } from "@/components/mobile/v2/quick-actions-bar";
import type { Persona } from "@/lib/mobile-nav-v2";
import { SALES_QUICK_ACTIONS } from "@/lib/quick-action-catalogs";

/* ═══════════════════════════════════════════════════════════════════════════
   SALES HOME — interactive client layer

   Thin wrapper around the shared `QuickActionsBar`, same convention as
   site/hr/accounts/inventory: feeds it the sales catalog + persona +
   server-saved layouts + extra permission-filtered routes for the "Add"
   picker.

   Two collisions are handled upstream in the bar itself:
     · Catalog tiles pointing back at /m/sales (Bookings, Collections) are
       dropped as dead taps — the hub page is already that destination.
     · The bar's tab state syncs to ?tab=pipeline|deals; MobileSalesHub
       only reads tab==="collections" for its own view, so they coexist.
   ═══════════════════════════════════════════════════════════════════════════ */

interface SalesInteractiveProps {
  persona: Persona;
  savedLayouts?: Record<string, string[]>;
  extraActions?: ExtraActionDef[];
  permissions?: string[];
}

export function SalesInteractive({ persona, savedLayouts, extraActions, permissions }: SalesInteractiveProps) {
  return (
    <QuickActionsBar
      module="sales"
      persona={persona}
      tabs={SALES_QUICK_ACTIONS as QuickActionTab[]}
      savedLayouts={savedLayouts}
      extraActions={extraActions}
      permissions={permissions}
    />
  );
}
