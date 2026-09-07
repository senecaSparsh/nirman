"use client";

import { QuickActionsBar, type QuickActionTab, type ExtraActionDef } from "@/components/mobile/v2/quick-actions-bar";
import type { Persona } from "@/lib/mobile-nav-v2";
import { INVENTORY_QUICK_ACTIONS } from "@/lib/quick-action-catalogs";

/* ═══════════════════════════════════════════════════════════════════════════
   INVENTORY HOME — interactive client layer

   Thin wrapper around the shared `QuickActionsBar`. The persona-aware,
   editable, drag-to-reorder quick-action grid lives in the shared
   component; this file just feeds it the inventory catalog + the user's
   persona + any server-side saved layouts + extra permission-filtered
   routes for the "Add" picker.
   ═══════════════════════════════════════════════════════════════════════════ */

interface InventoryInteractiveProps {
  persona: Persona;
  savedLayouts?: Record<string, string[]>;
  extraActions?: ExtraActionDef[];
}

export function InventoryInteractive({ persona, savedLayouts, extraActions }: InventoryInteractiveProps) {
  return (
    <QuickActionsBar
      module="inventory"
      persona={persona}
      tabs={INVENTORY_QUICK_ACTIONS as QuickActionTab[]}
      savedLayouts={savedLayouts}
      extraActions={extraActions}
    />
  );
}
