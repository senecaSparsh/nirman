"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

/**
 * Settle a pending full-and-final — posts the pay-down JE and closes the
 * exit record. Suggests the amount recorded at termination; the actual
 * cash out is what gets booked.
 */
export function SettleExitButton({ employeeId, suggestedAmount }: { employeeId: string; suggestedAmount: number | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="rounded bg-emerald-700 px-2.5 py-0.5 text-micro font-medium text-white disabled:opacity-50"
      onClick={async () => {
        const raw = window.prompt("Settlement amount paid (₹):", suggestedAmount != null ? suggestedAmount.toFixed(0) : "");
        if (raw === null) return;
        const amount = Number(raw);
        if (!Number.isFinite(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }
        setBusy(true);
        try {
          const res = await fetch(`/api/employees/${employeeId}/exit/settle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { toast.error(data.error ?? "Settle failed"); return; }
          toast.success(`Settlement of ${formatCurrency(amount)} posted`);
          router.refresh();
        } catch { toast.error("Settle failed — check connection"); }
        finally { setBusy(false); }
      }}
    >
      {busy ? "…" : "Settle"}
    </button>
  );
}
