"use client";

import { QuickActionsBar, type QuickActionTab, type ExtraActionDef } from "@/components/mobile/v2/quick-actions-bar";
import type { Persona } from "@/lib/mobile-nav-v2";
import { ACCOUNTS_QUICK_ACTIONS } from "@/lib/quick-action-catalogs";

/* ═══════════════════════════════════════════════════════════════════════════
   ACCOUNTS HOME — interactive client layer

   Thin wrapper around the shared `QuickActionsBar`. The persona-aware,
   editable, drag-to-reorder quick-action grid lives in the shared
   component; this file just feeds it the accounts catalog + the user's
   persona + any server-side saved layouts + extra permission-filtered
   routes for the "Add" picker.
   ═══════════════════════════════════════════════════════════════════════════ */

interface AccountsInteractiveProps {
  persona: Persona;
  savedLayouts?: Record<string, string[]>;
  extraActions?: ExtraActionDef[];
}

export function AccountsInteractive({ persona, savedLayouts, extraActions }: AccountsInteractiveProps) {
  return (
    <QuickActionsBar
      module="accounts"
      persona={persona}
      tabs={ACCOUNTS_QUICK_ACTIONS as QuickActionTab[]}
      savedLayouts={savedLayouts}
      extraActions={extraActions}
    />
  );
}
