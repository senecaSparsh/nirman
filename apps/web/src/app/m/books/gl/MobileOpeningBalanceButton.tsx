"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Landmark, Loader2 } from "lucide-react";
import { BottomSheet } from "@/components/mobile/v2/bottom-sheet";

/**
 * Opening cash/bank balance on the mobile GL — posts Dr 1000 / Cr 3100 via
 * /api/gl/opening-balance. One-time entry (server 409s a second post).
 */
export function MobileOpeningBalanceButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [posting, setPosting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPosting(true);
    try {
      const res = await fetch("/api/gl/opening-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to post");
      toast.success(`Opening balance posted — ${data.entryNumber}`);
      setOpen(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setPosting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-[0.375rem] border px-2.5 py-1.5 text-m-caption font-medium transition-colors active:opacity-70 press"
        style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
        title="Post the opening cash/bank balance"
      >
        <Landmark className="size-3.5" />
        Opening balance
      </button>

      {open && (
        <BottomSheet title="Opening cash balance" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-3">
            <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              Money in the bank on go-live day. Debits Cash/Bank (1000), credits Opening Balance Equity (3100). One-time — corrections need a reversal.
            </p>
            <label className="block space-y-1">
              <span className="text-m-caption font-medium" style={{ color: "var(--color-ink-700)" }}>Amount (₹) *</span>
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 5000000"
                className="w-full rounded-[0.5rem] border px-3 py-2.5 text-m-body"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}
              />
            </label>
            <button
              type="submit"
              disabled={posting}
              className="w-full rounded-[0.5rem] py-2.5 text-m-body font-semibold press disabled:opacity-60"
              style={{ backgroundColor: "var(--color-brand)", color: "var(--color-paper)" }}
            >
              {posting ? "Posting…" : "Post opening balance"}
            </button>
          </form>
        </BottomSheet>
      )}
    </>
  );
}
