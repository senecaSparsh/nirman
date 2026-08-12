"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

/**
 * Sticky bottom action bar for portal listing sync/delist actions.
 * Sync pushes the listing to the portal; Delist removes it.
 */
export function MobilePortalListingActions({
  listingId,
  status,
}: {
  listingId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  // Hide actions for already-delisted listings (nothing to sync/delist)
  if (status === "DELISTED") return null;

  async function act(action: "sync" | "delist", label: string) {
    haptic(10);
    setBusy(action);
    try {
      const res = await fetch(`/api/portal-listings/${listingId}?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed to ${action}`);
      toast.success(label);
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="sticky bottom-0 z-20 border-t mt-4"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
        borderColor: "var(--color-line)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="mx-auto w-full max-w-[34rem] px-3.5 py-2.5 pb-safe flex items-center gap-2">
        <button
          onClick={() => void act("delist", "Delisted from portal")}
          disabled={busy !== null || status !== "LISTED"}
          className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] border-2 font-bold text-[0.8125rem] press active:scale-95 disabled:opacity-50"
          style={{
            borderColor: "var(--color-stop)",
            color: "var(--color-stop)",
            backgroundColor: "transparent",
          }}
        >
          {busy === "delist" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <XCircle className="size-4" />
          )}
          Delist
        </button>
        <button
          onClick={() => void act("sync", "Synced to portal")}
          disabled={busy !== null}
          className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] font-bold text-[0.8125rem] press active:scale-95 disabled:opacity-50"
          style={{
            backgroundColor: "var(--color-ink-950)",
            color: "#fff",
          }}
        >
          {busy === "sync" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Sync
        </button>
      </div>
    </div>
  );
}
