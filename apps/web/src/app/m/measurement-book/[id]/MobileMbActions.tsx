"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { useOptimisticAction } from "@/lib/use-optimistic-action";

/**
 * Sticky bottom action bar for Measurement Book entry approval actions.
 * Shows different buttons based on current status + user permissions:
 *   DRAFT    → Verify / Reject (if canVerify)
 *   VERIFIED → Approve / Reject (if canApprove)
 *   REJECTED → (no actions — entry must be revised & resubmitted as a new entry)
 *
 * Uses optimistic updates — the action bar disappears the instant you
 * tap (because the visible status changes), giving immediate feedback.
 */
export function MobileMbActions({
  mbId,
  status,
  canVerify,
  canApprove,
}: {
  mbId: string;
  status: string;
  canVerify: boolean;
  canApprove: boolean;
}) {
  const [visibleStatus, setVisibleStatus] = useState(status);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const verifyAction = useOptimisticAction({
    endpoint: `/api/mb-entries/${mbId}`,
    method: "PATCH",
    body: { action: "verify" },
    optimisticUpdate: () => setVisibleStatus("VERIFIED"),
    revert: () => setVisibleStatus("DRAFT"),
    successMessage: "Entry verified",
    successDescription: "Ready for approval",
    hapticOnSuccess: [10, 30, 10],
  });

  const approveAction = useOptimisticAction({
    endpoint: `/api/mb-entries/${mbId}`,
    method: "PATCH",
    body: { action: "approve" },
    optimisticUpdate: () => setVisibleStatus("APPROVED"),
    revert: () => setVisibleStatus("VERIFIED"),
    successMessage: "Entry approved",
    successDescription: "Cumulative quantities updated",
    hapticOnSuccess: [10, 30, 10],
  });

  const rejectAction = useOptimisticAction({
    endpoint: `/api/mb-entries/${mbId}`,
    method: "PATCH",
    body: { action: "reject", reason: rejectReason.trim() || "Rejected by reviewer" },
    optimisticUpdate: () => setVisibleStatus("REJECTED"),
    revert: () => setVisibleStatus("DRAFT"),
    successMessage: "Entry rejected",
    hapticOnSuccess: 30,
  });

  const showVerify = visibleStatus === "DRAFT" && canVerify;
  const showApprove = visibleStatus === "VERIFIED" && canApprove;

  if (!showVerify && !showApprove) return null;

  const approveLabel = showApprove ? "Approve" : "Verify";
  const approveHandler = showApprove ? approveAction : verifyAction;
  const approveBusy = approveHandler.isPending;
  const ApproveIcon = showApprove ? CheckCircle2 : ShieldCheck;

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
            onClick={() => setShowRejectConfirm(true)}
            disabled={rejectAction.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] border-2 font-bold text-[0.8125rem] press active:scale-95 disabled:opacity-50"
            style={{
              borderColor: "var(--color-stop)",
              color: "var(--color-stop)",
              backgroundColor: "transparent",
            }}
          >
            {rejectAction.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <XCircle className="size-4" />
            )}
            Reject
          </button>
          <button
            onClick={() => approveHandler.execute()}
            disabled={approveBusy}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] font-bold text-[0.8125rem] press active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-go)",
              color: "#fff",
            }}
          >
            {approveBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ApproveIcon className="size-4" />
            )}
            {approveLabel}
          </button>
        </div>
      </div>

      {/* Reject confirmation modal with reason input */}
      {showRejectConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowRejectConfirm(false)}
        >
          <div
            className="w-full max-w-sm mx-4 rounded-[0.75rem] border p-5 shadow-xl"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-line)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="grid place-items-center size-10 rounded-full shrink-0"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--color-stop) 12%, transparent)",
                }}
              >
                <AlertTriangle
                  className="size-5"
                  style={{ color: "var(--color-stop)" }}
                />
              </div>
              <div>
                <h3
                  className="text-[0.875rem] font-bold"
                  style={{ color: "var(--color-ink-950)" }}
                >
                  Reject this measurement entry?
                </h3>
                <p
                  className="text-[0.6875rem] mt-1"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  Provide a reason — it will be visible to the submitter.
                </p>
              </div>
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Reason for rejection (e.g. qty doesn't match site, wrong BOQ item)…"
              autoFocus
              className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem] outline-none resize-none mb-3"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "var(--color-paper)",
                color: "var(--color-ink-950)",
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowRejectConfirm(false)}
                disabled={rejectAction.isPending}
                className="flex-1 h-10 rounded-[0.5rem] border font-bold text-[0.75rem] press active:scale-95 disabled:opacity-50"
                style={{
                  borderColor: "var(--color-line)",
                  color: "var(--color-ink-700)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowRejectConfirm(false);
                  rejectAction.execute();
                }}
                disabled={rejectAction.isPending}
                className="flex-1 h-10 rounded-[0.5rem] font-bold text-[0.75rem] press active:scale-95 disabled:opacity-50"
                style={{
                  backgroundColor: "var(--color-stop)",
                  color: "#fff",
                }}
              >
                {rejectAction.isPending ? (
                  <Loader2 className="size-4 animate-spin mx-auto" />
                ) : (
                  "Reject"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
