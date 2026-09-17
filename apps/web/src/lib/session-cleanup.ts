"use client";

import { clearLocalCache } from "./local-first";
import { clearFetchCache } from "./use-fetch";
import { clearAllOps, pendingCount } from "./offline/queue";
import { clearAllDrafts } from "./offline/use-drafts";
import { clearRecentItems } from "./use-recent-items";
import { clearRecent } from "./use-recently-viewed";
import { clearAllSnoozed } from "./use-snooze";
import { clearAllSmartDefaults } from "./use-smart-defaults";

/**
 * Session cleanup — wipes every piece of business data cached on the device.
 *
 * Why this exists: the field PWA caches data in four places that survive a
 * plain sign-out redirect —
 *   1. localStorage "nirman-cache:*" entries (local-first read cache)
 *   2. useFetch's in-memory response cache
 *   3. The service worker's API cache (offline GET fallback)
 *   4. IndexedDB — the offline mutation queue + auto-saved form drafts
 *   5. localStorage "nirman:recent-items" + "nirman.recent" — the two
 *      recently-viewed lists (jump-back-in, search, record tracks)
 *   6. localStorage "nirman:snoozed-items" + "nirman:defaults:*" — a user's
 *      dismissed alerts and last-used form values (mild business context)
 *
 * None of these are keyed by user. On a shared or resold phone, the next
 * person opening the app would see the previous user's cached data — and
 * worse, the previous user's queued mutations would replay under the next
 * sign-in's session (wrong-user attribution). Sign-out must wipe all of it.
 */

/** Count of queued mutations not yet synced (for the sign-out warning). */
export async function pendingLocalWorkCount(): Promise<number> {
  try {
    return await pendingCount();
  } catch {
    return 0; // IndexedDB unavailable — nothing to warn about
  }
}

/**
 * Delete the service worker's cached API responses (tenant/user-scoped data).
 * Shell + asset caches are kept — they're public UI files, and keeping them
 * preserves the offline app shell for the sign-in page itself.
 */
export async function clearSwApiCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith("nirman-api")).map((k) => caches.delete(k)),
    );
    // The shell cache also holds personalized HTML for "/" and "/m"
    // (server-rendered home/dashboard embed the signed-in user's data).
    // Delete those entries; keep the precached public pages (/sign-in).
    const shell = await caches.open("nirman-shell-v5");
    const origin = location.origin;
    await Promise.all(
      ["/", "/m"].map((p) => shell.delete(new Request(origin + p))),
    );
  } catch {
    // Best-effort — Cache Storage may be unavailable
  }
}

/**
 * Full local wipe for sign-out / session expiry. Every step is best-effort:
 * a failure in one store must not block the rest or the redirect.
 */
export async function clearLocalSessionData(): Promise<void> {
  try {
    clearLocalCache();
  } catch { /* ignore */ }
  try {
    clearFetchCache();
  } catch { /* ignore */ }
  try {
    await clearAllOps();
  } catch { /* ignore */ }
  try {
    await clearAllDrafts();
  } catch { /* ignore */ }
  try {
    await clearSwApiCache();
  } catch { /* ignore */ }
  try {
    clearRecentItems();
    clearRecent();
  } catch { /* ignore */ }
  try {
    clearAllSnoozed();
  } catch { /* ignore */ }
  try {
    clearAllSmartDefaults();
  } catch { /* ignore */ }
}

// Company switch is a smaller boundary than sign-out: wipe tenant-scoped
// READ caches only (localStorage + SW API cache + useFetch's own listener
// handles memory). The queue and drafts are deliberately kept — ops are
// company-tagged and the sync guard fails closed on a mismatch, and losing
// drafted work on every switch would be hostile to field users.
if (typeof window !== "undefined") {
  window.addEventListener("nirman-company-switched", () => {
    void clearSwApiCache();
  });
}
