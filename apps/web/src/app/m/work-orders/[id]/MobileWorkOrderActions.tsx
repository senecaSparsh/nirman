"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send, CheckCircle, Banknote, Lock, Loader2, X, Printer,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { ActionBar } from "@/components/mobile/v2/primitives";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

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

  const inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <>
      {/* Action buttons — sticky bottom bar keeps workflow actions in the thumb zone */}
      <ActionBar>
        <div className="flex items-center gap-2">
        {showIssue ? (
          <>
          <button
            onClick={() => doAction("cancel")}
            disabled={acting !== null}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] border-2 font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
            style={{ borderColor: "var(--color-stop)", color: "var(--color-stop)", backgroundColor: "transparent" }}
          >
            <X className="size-4" />
            Cancel
          </button>
          <button
            onClick={() => doAction("issue")}
            disabled={acting !== null}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {acting === "issue" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Issue
          </button>
          </>
        ) : null}

        {showPayAdvance ? (
          <button
            onClick={() => setShowAdvance(true)}
            disabled={acting !== null}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] border-2 font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
          >
            <Banknote className="size-4" />
            Pay Advance{advanceBalance > 0 ? ` (${formatCurrency(advanceBalance)})` : ""}
          </button>
        ) : null}

        {showComplete ? (
          <button
            onClick={() => doAction("complete")}
            disabled={acting !== null}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
          >
            {acting === "complete" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
            Complete
          </button>
        ) : null}

        {showReleaseRetention ? (
          <>
          <a
            href={`/api/work-orders/${workOrderId}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] border-2 font-bold text-m-section text-m-body press active:scale-95"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
          >
            <Printer className="size-4" />
            Print
          </a>
          <button
            onClick={() => setShowRetention(true)}
            disabled={acting !== null}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] border-2 font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
            style={{ borderColor: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))", color: "var(--color-go)", backgroundColor: "var(--color-paper)" }}
          >
            <Lock className="size-4" />
            Release Retention
          </button>
          </>
        ) : null}
        </div>
      </ActionBar>

      {/* Pay advance sheet */}
      {showAdvance ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }}
          onClick={() => setShowAdvance(false)}
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
              <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>Pay Advance</p>
              <button onClick={() => setShowAdvance(false)} aria-label="Close advance dialog" className="text-m-body press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div className="px-3 pb-4 flex flex-col gap-3">
              <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                  Payment Details
                </p>
                <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                  <div>
                    <label className={labelClass} style={labelStyle}>Amount (₹) *</label>
                    <input type="number" min="0" step="any" inputMode="numeric" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="0" className={inputClass} style={inputStyle} />
                  </div>
                  <div className="pl-2">
                    <EnumSelect
                      label="Payment Mode"
                      value={advanceMode}
                      onChange={setAdvanceMode}
                      options={[
                        { value: "BANK", label: "Bank Transfer" },
                        { value: "CASH", label: "Cash" },
                        { value: "CHEQUE", label: "Cheque" },
                        { value: "UPI", label: "UPI" },
                      ]}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Reference No.</label>
                  <input value={advanceRef} onChange={(e) => setAdvanceRef(e.target.value)} placeholder="UTR / Cheque no." className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowAdvance(false)} disabled={acting !== null} className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
                <button
                  onClick={() => {
                    if (!advanceAmount || Number(advanceAmount) <= 0) { toast.error("Enter a valid amount"); return; }
                    doAction("pay-advance", { amount: Number(advanceAmount), paymentMode: advanceMode, paymentReference: advanceRef || undefined });
                  }}
                  disabled={acting !== null || !advanceAmount}
                  className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1"
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
          style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }}
          onClick={() => setShowRetention(false)}
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
              <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>Release Retention?</p>
              <button onClick={() => setShowRetention(false)} aria-label="Close retention dialog" className="text-m-body press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div className="px-3 pb-4">
              <p className="text-m-label mb-3" style={{ color: "var(--color-ink-500)" }}>
                This will release the retention amount held against this work order back to the subcontractor. If the defect liability period has not elapsed, this may require an override reason.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowRetention(false)} disabled={acting !== null} className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
                <button
                  onClick={() => doAction("release-retention")}
                  disabled={acting !== null}
                  className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1"
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
