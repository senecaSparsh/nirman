"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send, CheckCircle, Banknote, Lock, Loader2, X,
} from "lucide-react";
import { toast } from "sonner";

type Status = "DRAFT" | "ISSUED" | "ACTIVE" | "COMPLETED" | "CLOSED";

export function MobileWorkOrderActions({
  workOrderId,
  status,
  canManage,
  canPay,
  advanceBalance,
}: {
  workOrderId: string;
  status: Status;
  canManage: boolean;
  canPay: boolean;
  advanceBalance: number;
}) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);
  const [showAdvance, setShowAdvance] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceMode, setAdvanceMode] = useState("BANK");
  const [advanceRef, setAdvanceRef] = useState("");
  const [showRetention, setShowRetention] = useState(false);

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setActing(action);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(
        action === "issue" ? "Work order issued"
        : action === "complete" ? "Work order completed"
        : action === "pay-advance" ? "Advance paid"
        : action === "release-retention" ? "Retention released"
        : "Updated"
      );
      setShowAdvance(false);
      setShowRetention(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(null);
    }
  }

  const showIssue = canManage && status === "DRAFT";
  const showPayAdvance = canManage && (status === "ISSUED" || status === "ACTIVE");
  const showComplete = canManage && status === "ACTIVE";
  const showReleaseRetention = canPay && status === "COMPLETED";

  if (!showIssue && !showPayAdvance && !showComplete && !showReleaseRetention) return null;

  const inputClass = "w-full h-9 rounded-[0.5rem] border px-2.5 text-[0.75rem] outline-none";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" };
  const labelClass = "text-[0.5625rem] font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <>
      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        {showIssue ? (
          <button
            onClick={() => doAction("issue")}
            disabled={acting !== null}
            className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] py-2.5 text-[0.6875rem] font-bold press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {acting === "issue" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Issue Work Order
          </button>
        ) : null}

        {showPayAdvance ? (
          <button
            onClick={() => setShowAdvance(true)}
            disabled={acting !== null}
            className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] border py-2 text-[0.625rem] font-bold press disabled:opacity-50"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
          >
            <Banknote className="size-3.5" />
            Pay Advance {advanceBalance > 0 ? `(₹${advanceBalance.toFixed(0)} balance)` : ""}
          </button>
        ) : null}

        {showComplete ? (
          <button
            onClick={() => doAction("complete")}
            disabled={acting !== null}
            className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] py-2.5 text-[0.6875rem] font-bold press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
          >
            {acting === "complete" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle className="size-3.5" />}
            Mark Complete
          </button>
        ) : null}

        {showReleaseRetention ? (
          <button
            onClick={() => setShowRetention(true)}
            disabled={acting !== null}
            className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] border py-2 text-[0.625rem] font-bold press disabled:opacity-50"
            style={{ borderColor: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))", color: "var(--color-go)" }}
          >
            <Lock className="size-3.5" />
            Release Retention
          </button>
        ) : null}
      </div>

      {/* Pay advance sheet */}
      {showAdvance ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowAdvance(false)}
        >
          <div
            className="w-full rounded-t-[1rem]"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
            </div>
            <div className="flex items-center justify-between px-3 pb-2">
              <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Pay Advance</p>
              <button onClick={() => setShowAdvance(false)} className="press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div className="px-3 pb-4 flex flex-col gap-3">
              <div>
                <label className={labelClass} style={labelStyle}>Amount (₹) *</label>
                <input type="number" min="0" step="any" inputMode="numeric" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="0" className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Payment Mode</label>
                <select value={advanceMode} onChange={(e) => setAdvanceMode(e.target.value)} className={inputClass} style={inputStyle}>
                  <option value="BANK">Bank Transfer</option>
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="UPI">UPI</option>
                </select>
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Reference No.</label>
                <input value={advanceRef} onChange={(e) => setAdvanceRef(e.target.value)} placeholder="UTR / Cheque no." className={inputClass} style={inputStyle} />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowAdvance(false)} disabled={acting !== null} className="flex-1 h-9 rounded-[0.5rem] border text-[0.625rem] font-bold press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
                <button
                  onClick={() => {
                    if (!advanceAmount || Number(advanceAmount) <= 0) { toast.error("Enter a valid amount"); return; }
                    doAction("pay-advance", { amount: Number(advanceAmount), paymentMode: advanceMode, paymentReference: advanceRef || undefined });
                  }}
                  disabled={acting !== null || !advanceAmount}
                  className="flex-1 h-9 rounded-[0.5rem] text-[0.625rem] font-bold press flex items-center justify-center gap-1"
                  style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", opacity: acting !== null || !advanceAmount ? 0.5 : 1 }}
                >
                  {acting === "pay-advance" ? <Loader2 className="size-3.5 animate-spin" /> : "Pay Advance"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Release retention confirmation */}
      {showRetention ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowRetention(false)}
        >
          <div
            className="w-full rounded-t-[1rem]"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
            </div>
            <div className="flex items-center justify-between px-3 pb-2">
              <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Release Retention?</p>
              <button onClick={() => setShowRetention(false)} className="press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div className="px-3 pb-4">
              <p className="text-[0.625rem] mb-3" style={{ color: "var(--color-ink-500)" }}>
                This will release the retention amount held against this work order back to the subcontractor. If the defect liability period has not elapsed, this may require an override reason.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowRetention(false)} disabled={acting !== null} className="flex-1 h-9 rounded-[0.5rem] border text-[0.625rem] font-bold press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
                <button
                  onClick={() => doAction("release-retention")}
                  disabled={acting !== null}
                  className="flex-1 h-9 rounded-[0.5rem] text-[0.625rem] font-bold press flex items-center justify-center gap-1"
                  style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
                >
                  {acting === "release-retention" ? <Loader2 className="size-3.5 animate-spin" /> : "Release"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
