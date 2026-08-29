"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Cancel button for the scrap generation detail page.
 * Calls PATCH /api/scrap-generations/[id] with action: "cancel".
 */
export function MobileScrapCancelBtn({ scrapId, scrapNumber }: { scrapId: string; scrapNumber: string }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/scrap-generations/${scrapId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel");
      toast.success(`Scrap ${scrapNumber} cancelled`);
      setShow(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setShow(true)}
        className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] border py-2 text-m-label font-bold text-m-body press"
        style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))", color: "var(--color-stop)" }}
      >
        <Ban className="size-3.5" />
        Cancel Scrap Generation
      </button>

      {show ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ backgroundColor: "rgba(18, 17, 13, 0.4)" }}
          onClick={() => setShow(false)}
        >
          <div
            className="w-full rounded-t-[1rem] mx-auto max-w-md"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
            </div>
            <div className="flex items-center justify-between px-3 pb-2">
              <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
                Cancel Scrap Generation?
              </p>
              <button onClick={() => setShow(false)} className="text-m-body press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div className="px-3 pb-4">
              <p className="text-m-label mb-3" style={{ color: "var(--color-ink-500)" }}>
                This will reverse the stock addition and GL entries for scrap <span className="font-mono font-bold">{scrapNumber}</span>. The scrap materials will be removed from the destination location. This cannot be undone.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShow(false)}
                  disabled={cancelling}
                  className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
                  style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
                >
                  Keep
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1"
                  style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
                >
                  {cancelling ? <Loader2 className="size-3.5 animate-spin" /> : "Cancel Scrap"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
