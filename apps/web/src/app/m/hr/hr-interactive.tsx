"use client";

import { QuickActionsBar, type QuickActionTab, type ExtraActionDef } from "@/components/mobile/v2/quick-actions-bar";
import type { Persona } from "@/lib/mobile-nav-v2";
import { HR_QUICK_ACTIONS } from "@/lib/quick-action-catalogs";

/* ═══════════════════════════════════════════════════════════════════════════
   HR HOME — interactive client layer

   Thin wrapper around the shared `QuickActionsBar`. The persona-aware,
   editable, drag-to-reorder quick-action grid lives in the shared
   component; this file just feeds it the HR catalog + the user's persona
   + any server-side saved layouts + extra permission-filtered routes
   for the "Add" picker.
   ═══════════════════════════════════════════════════════════════════════════ */

interface HrInteractiveProps {
  persona: Persona;
  savedLayouts?: Record<string, string[]>;
  extraActions?: ExtraActionDef[];
}

export function HrInteractive({ persona, savedLayouts, extraActions }: HrInteractiveProps) {
  return (
    <QuickActionsBar
      module="hr"
      persona={persona}
      tabs={HR_QUICK_ACTIONS as QuickActionTab[]}
      savedLayouts={savedLayouts}
      extraActions={extraActions}
    />
  );
}
