"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
import { haptic } from "@/lib/haptic";

/**
 * Persistent "create supplier bill" affordance on a GRN card — mirrors the
 * post-receipt banner action in MobileReceiveDialog, but survives refresh so
 * finance can create the invoice from a past GRN without re-receiving.
 */
export function MobileGrnBillButton({ goodsReceiptId }: { goodsReceiptId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function createBill() {
    haptic(5);
    setBusy(true);
    try {
      const res = await fetch("/api/supplier-invoices/from-grn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goodsReceiptId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast.info("Bill already exists for this GRN", { description: data.invoiceNumber ?? undefined });
        router.push("/m/books/finance");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Failed to create invoice");
      toast.success("Draft supplier invoice created", {
        description: `${data.invoiceNumber} — review & approve in Finance`,
      });
      router.push("/m/books/finance");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={createBill}
      className="mt-1 inline-flex items-center gap-1 text-m-caption font-semibold rounded px-1.5 py-0.5 press active:scale-95 disabled:opacity-50"
      style={{ color: "var(--color-ink-950)", backgroundColor: "var(--color-paper-2)" }}
    >
      <Receipt className="size-3" />
      {busy ? "Creating…" : "Create bill"}
    </button>
  );
}
