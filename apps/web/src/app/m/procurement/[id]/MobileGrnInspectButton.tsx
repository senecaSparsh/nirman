"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardCheck, CheckCircle, XCircle } from "lucide-react";
import { haptic } from "@/lib/haptic";

/**
 * Post-receipt QC verdict on a GRN card — shown while the receipt's
 * inspectionStatus is PENDING. The QC dashboard's "Inspect" link lands on the
 * PO page; without this affordance the pending-inspection queue could never
 * be cleared from mobile (or at all — no mutation endpoint existed).
 */
export function MobileGrnInspectButton({ goodsReceiptId }: { goodsReceiptId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(verdict: "PASSED" | "FAILED") {
    haptic(10);
    setBusy(true);
    try {
      const res = await fetch(`/api/goods-receipts/${goodsReceiptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "inspect", verdict, notes: notes || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Inspection failed");
      toast.success(verdict === "PASSED" ? "Receipt passed QC" : "Receipt failed QC", {
        description: verdict === "FAILED" ? "Consider a supplier return for rejected material" : undefined,
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Inspection failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1 text-m-caption font-semibold rounded px-1.5 py-0.5 press active:scale-95 disabled:opacity-50"
        style={{ color: "var(--color-signal)", backgroundColor: "var(--color-paper-2)" }}
      >
        <ClipboardCheck className="size-3" />
        Inspect
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/45" />
          <div
            className="relative w-full max-w-md rounded-t-[1rem] p-4 pb-6"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Inspect Receipt
            </p>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Remarks (optional)"
              className="mt-3 w-full rounded-[0.375rem] border px-3 py-2 text-m-body"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => submit("PASSED")}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-label font-bold press disabled:opacity-50"
                style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
              >
                <CheckCircle className="size-4" />
                Pass
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => submit("FAILED")}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-label font-bold press disabled:opacity-50"
                style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
              >
                <XCircle className="size-4" />
                Fail
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
