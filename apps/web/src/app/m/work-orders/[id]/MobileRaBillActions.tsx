"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, CheckCircle, XCircle, Banknote, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

type RaBillStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PAID";

export function MobileRaBillActions({
  billId,
  billNumber,
  status,
  netPayable,
  canSubmit,
  canApprove,
  canPay,
  isCreator,
  isSubmitter,
}: {
  billId: string;
  billNumber: string;
  status: RaBillStatus;
  netPayable: number;
  canSubmit: boolean;
  canApprove: boolean;
  canPay: boolean;
  isCreator: boolean;
  isSubmitter: boolean;
}) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showPay, setShowPay] = useState(false);
  const [payMode, setPayMode] = useState("BANK");
  const [payRef, setPayRef] = useState("");

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setActing(action);
    try {
      const res = await fetch(`/api/ra-bills/${billId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(
        action === "submit" ? (status === "REJECTED" ? "RA bill resubmitted for approval" : "RA bill submitted for approval")
        : action === "approve" ? "RA bill approved"
        : action === "reject" ? "RA bill rejected"
        : action === "pay" ? "RA bill paid"
        : "Updated"
      );
      setShowReject(false);
      setShowPay(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(null);
    }
  }

  // Self-approval protection: creator/submitter cannot approve or reject
  const selfBlock = isCreator || isSubmitter;
  const showSubmitBtn = canSubmit && (status === "DRAFT" || status === "REJECTED") && !isCreator;
  const showApproveBtn = canApprove && status === "SUBMITTED" && !selfBlock;
  const showRejectBtn = canApprove && status === "SUBMITTED" && !selfBlock;
  const showPayBtn = canPay && status === "APPROVED";

  if (!showSubmitBtn && !showApproveBtn && !showRejectBtn && !showPayBtn) return null;

  const inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <>
      <div className="flex items-center gap-1.5 mt-2">
        {showSubmitBtn ? (
          <button
            onClick={() => doAction("submit")}
            disabled={acting !== null}
            className="flex-1 flex items-center justify-center gap-1 h-7 rounded-[0.375rem] font-bold text-m-caption press active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {acting === "submit" ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
            {status === "REJECTED" ? "Resubmit" : "Submit"}
          </button>
        ) : null}

        {showApproveBtn ? (
          <button
            onClick={() => doAction("approve")}
            disabled={acting !== null}
            className="flex-1 flex items-center justify-center gap-1 h-7 rounded-[0.375rem] font-bold text-m-caption press active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
          >
            {acting === "approve" ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle className="size-3" />}
            Approve
          </button>
        ) : null}

        {showRejectBtn ? (
          <button
            onClick={() => setShowReject(true)}
            disabled={acting !== null}
            className="flex-1 flex items-center justify-center gap-1 h-7 rounded-[0.375rem] border font-bold text-m-caption press active:scale-95 disabled:opacity-50"
            style={{ borderColor: "var(--color-stop)", color: "var(--color-stop)", backgroundColor: "transparent" }}
          >
            <XCircle className="size-3" />
            Reject
          </button>
        ) : null}

        {showPayBtn ? (
          <button
            onClick={() => setShowPay(true)}
            disabled={acting !== null}
            className="flex-1 flex items-center justify-center gap-1 h-7 rounded-[0.375rem] font-bold text-m-caption press active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            <Banknote className="size-3" />
            Pay {formatCurrency(netPayable)}
          </button>
        ) : null}
      </div>

      {/* Reject sheet */}
      {showReject ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }}
          onClick={() => setShowReject(false)}
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
              <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>Reject RA Bill</p>
              <button onClick={() => setShowReject(false)} aria-label="Close" className="text-m-body press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div className="px-3 pb-4 flex flex-col gap-3">
              <p className="text-m-label" style={{ color: "var(--color-ink-500)" }}>
                Rejection will unlink all MB entries from this bill so they can be re-billed later.
              </p>
              <div>
                <label className={labelClass} style={labelStyle}>Reason *</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Why is this bill being rejected?"
                  rows={3}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowReject(false)} disabled={acting !== null} className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
                <button
                  onClick={() => {
                    if (!rejectReason.trim()) { toast.error("Please enter a rejection reason"); return; }
                    doAction("reject", { reason: rejectReason.trim() });
                  }}
                  disabled={acting !== null || !rejectReason.trim()}
                  className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1"
                  style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)", opacity: acting !== null || !rejectReason.trim() ? 0.5 : 1 }}
                >
                  {acting === "reject" ? <Loader2 className="size-3.5 animate-spin" /> : "Reject Bill"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Pay sheet */}
      {showPay ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }}
          onClick={() => setShowPay(false)}
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
              <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>Pay RA Bill</p>
              <button onClick={() => setShowPay(false)} aria-label="Close" className="text-m-body press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div className="px-3 pb-4 flex flex-col gap-3">
              <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                  {billNumber} — {formatCurrency(netPayable)}
                </p>
                <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                  <div>
                    <EnumSelect
                      label="Payment Mode"
                      value={payMode}
                      onChange={setPayMode}
                      options={[
                        { value: "BANK", label: "Bank Transfer" },
                        { value: "CASH", label: "Cash" },
                        { value: "CHEQUE", label: "Cheque" },
                        { value: "UPI", label: "UPI" },
                        { value: "NEFT", label: "NEFT" },
                      ]}
                    />
                  </div>
                  <div className="pl-2">
                    <label className={labelClass} style={labelStyle}>Reference No.</label>
                    <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="UTR / Cheque no." className={inputClass} style={inputStyle} />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowPay(false)} disabled={acting !== null} className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
                <button
                  onClick={() => doAction("pay", { paymentMode: payMode, paymentReference: payRef || undefined })}
                  disabled={acting !== null}
                  className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1"
                  style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
                >
                  {acting === "pay" ? <Loader2 className="size-3.5 animate-spin" /> : "Pay Now"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
