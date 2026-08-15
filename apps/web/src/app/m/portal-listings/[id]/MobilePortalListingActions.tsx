"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

/**
 * Sticky bottom action bar for portal listing sync/delist actions.
 * Sync pushes the listing to the portal; Delist removes it.
 * Delist shows a confirmation modal before executing.
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
  const [showDelistConfirm, setShowDelistConfirm] = useState(false);

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
    <>
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
            onClick={() => setShowDelistConfirm(true)}
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

      {/* Delist confirmation modal */}
      {showDelistConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDelistConfirm(false)}>
          <div
            className="w-full max-w-sm mx-4 rounded-[0.75rem] border p-5 shadow-xl"
            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="grid place-items-center size-10 rounded-full shrink-0"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 12%, transparent)" }}
              >
                <AlertTriangle className="size-5" style={{ color: "var(--color-stop)" }} />
              </div>
              <div>
                <h3 className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                  Delist this property?
                </h3>
                <p className="text-[0.6875rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
                  The listing will be removed from the portal. You can sync it again later.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDelistConfirm(false)}
                disabled={busy !== null}
                className="flex-1 h-10 rounded-[0.5rem] border font-bold text-[0.75rem] press active:scale-95 disabled:opacity-50"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDelistConfirm(false);
                  void act("delist", "Delisted from portal");
                }}
                disabled={busy !== null}
                className="flex-1 h-10 rounded-[0.5rem] font-bold text-[0.75rem] press active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}
              >
                {busy === "delist" ? <Loader2 className="size-4 animate-spin mx-auto" /> : "Delist"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
