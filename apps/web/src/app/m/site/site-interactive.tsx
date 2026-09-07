"use client";

import { QuickActionsBar, type QuickActionTab, type ExtraActionDef } from "@/components/mobile/v2/quick-actions-bar";
import type { Persona } from "@/lib/mobile-nav-v2";
import { SITE_QUICK_ACTIONS } from "@/lib/quick-action-catalogs";

/* ═══════════════════════════════════════════════════════════════════════════
   SITE HOME — interactive client layer

   Thin wrapper around the shared `QuickActionsBar`. The persona-aware,
   editable, drag-to-reorder quick-action grid lives in the shared
   component; this file just feeds it the site catalog + the user's
   persona + any server-side saved layouts + extra permission-filtered
   routes for the "Add" picker.
   ═══════════════════════════════════════════════════════════════════════════ */

interface SiteInteractiveProps {
  persona: Persona;
  savedLayouts?: Record<string, string[]>;
  extraActions?: ExtraActionDef[];
}

export function SiteInteractive({ persona, savedLayouts, extraActions }: SiteInteractiveProps) {
  return (
    <QuickActionsBar
      module="site"
      persona={persona}
      tabs={SITE_QUICK_ACTIONS as QuickActionTab[]}
      savedLayouts={savedLayouts}
      extraActions={extraActions}
    />
  );
}
