"use client";

import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

/**
 * Inline Tally sync action — one tap, fires POST /api/tally/sync,
 * shows a toast with the result. No navigation, no modal.
 * Designed for the owner's home screen quick-action row.
 */
export function TallySyncButton({
  pendingCount = 0,
}: {
  pendingCount?: number;
}) {
  const [syncing, setSyncing] = useState(false);
  // Ref guard prevents concurrent syncs from rapid double-taps
  // (React state updates are async, so disabled={syncing} alone isn't enough)
  const syncingRef = useRef(false);

  async function sync() {
    if (syncingRef.current) return;
    syncingRef.current = true;
    haptic(10);
    setSyncing(true);
    try {
      const res = await fetch("/api/tally/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: "push" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Sync failed");
      }
      const pushed = data.push?.synced ?? 0;
      const failed = data.push?.failed ?? 0;
      if (pushed > 0 && failed === 0) {
        toast.success(`Tally synced · ${pushed} entries pushed`);
      } else if (pushed > 0 && failed > 0) {
        toast.warning(`Synced ${pushed}, ${failed} failed`);
      } else {
        toast.success("Tally is up to date");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tally sync failed");
    }
    syncingRef.current = false;
    setSyncing(false);
  }

  return (
    <button
      onClick={sync}
      disabled={syncing}
      className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[0.625rem] border-2 px-3 py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-900)" }}
    >
      <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
      {syncing ? "Syncing…" : "Sync Tally"}
      {pendingCount > 0 && !syncing && (
        <span
          className="ml-0.5 rounded px-1.5 py-0.5 text-[0.5625rem] font-bold tabular-nums"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-signal) 15%, transparent)",
            color: "var(--color-signal-dark)",
          }}
        >
          {pendingCount}
        </span>
      )}
    </button>
  );
}
