"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MobileDialog } from "@/components/mobile/v2/dialog";

export function MobileRateContractCancelBtn({ contractId, contractNumber }: { contractId: string; contractNumber: string }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/rate-contracts/${contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel");
      toast.success(`Rate contract ${contractNumber} cancelled`);
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
        Cancel Rate Contract
      </button>

      <MobileDialog open={show} onClose={() => setShow(false)} title="Cancel Rate Contract?">
            <div className="pb-4">
              <p className="text-m-label mb-3" style={{ color: "var(--color-ink-500)" }}>
                This will cancel rate contract <span className="font-mono font-bold">{contractNumber}</span>. Future purchase orders will not be able to reference this contract. This cannot be undone.
              </p>
              <div className="flex flex-col gap-2">
                <button onClick={() => setShow(false)} disabled={cancelling} className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Keep</button>
                <button onClick={handleCancel} disabled={cancelling} className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1" style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}>
                  {cancelling ? <Loader2 className="size-3.5 animate-spin" /> : "Cancel Contract"}
                </button>
              </div>
            </div>
      </MobileDialog>
    </>
  );
}
