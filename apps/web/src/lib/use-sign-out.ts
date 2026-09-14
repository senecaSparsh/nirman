"use client";

import { useState } from "react";
import { signOut as authSignOut } from "@/lib/auth-client";
import { useConfirm } from "./use-confirm";
import { clearLocalSessionData, pendingLocalWorkCount } from "./session-cleanup";

/**
 * Shared sign-out flow — pending-work warning + local data wipe + session end.
 *
 * Before ending the session we check the offline queue. If the user has
 * unsynced items, we warn: signing out discards them (they must be wiped —
 * leaving them would replay one user's work under the next sign-in's
 * session). With a clean queue we wipe silently and redirect.
 *
 * Usage:
 *   const { handleSignOut, signingOut, dialog } = useSignOut();
 *   ... <button onClick={handleSignOut} disabled={signingOut}>Sign out</button>
 *   ... {dialog}   // render somewhere in the component tree
 */
export function useSignOut() {
  const [busy, setBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  const handleSignOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const pending = await pendingLocalWorkCount();
      if (pending > 0) {
        const ok = await confirm({
          title: "Discard unsynced items?",
          description: `${pending} item${
            pending === 1 ? "" : "s"
          } on this device ${
            pending === 1 ? "hasn't" : "haven't"
          } synced to the server yet. Signing out now will permanently discard ${
            pending === 1 ? "it" : "them"
          }.\n\nTo keep them: cancel, get back online, and let the queue finish syncing first.`,
          confirmLabel: "Discard & sign out",
          variant: "destructive",
        });
        if (!ok) {
          setBusy(false);
          return;
        }
      }
    } catch {
      // Queue check failed — proceed with sign-out anyway.
    }
    await signOutAndCleanup();
  };

  return { handleSignOut, signingOut: busy, dialog: confirmDialog };
}

/**
 * Silent sign-out — no confirmation. For session-expired paths (401
 * interceptor, missing session) where asking is pointless: the session is
 * already dead and queued work can't sync without re-login anyway. Still
 * wipes local data so nothing leaks to the next session on this device.
 */
export async function signOutAndCleanup(redirectUrl = "/sign-in"): Promise<void> {
  try {
    await clearLocalSessionData();
  } catch { /* best-effort */ }
  try {
    await authSignOut();
  } catch { /* still redirect */ }
  // Hard redirect — drops all in-memory React state and fetch caches.
  window.location.href = redirectUrl;
}
