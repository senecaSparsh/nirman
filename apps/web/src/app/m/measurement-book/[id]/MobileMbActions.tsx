"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { useOptimisticAction } from "@/lib/use-optimistic-action";
import { ActionBar } from "@/components/mobile/v2/primitives";

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
      <ActionBar>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRejectConfirm(true)}
            disabled={rejectAction.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] border-2 font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
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
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-go)",
              color: "var(--color-paper)",
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
      </ActionBar>

      {/* Reject confirmation modal with reason input */}
      {showRejectConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center "
          style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }} onClick={() => setShowRejectConfirm(false)}
        >
          <div
            className="w-full max-w-md mx-4 rounded-[0.75rem] border p-5 shadow-xl"
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
                  className="text-m-section font-bold"
                  style={{ color: "var(--color-ink-950)" }}
                >
                  Reject this measurement entry?
                </h3>
                <p
                  className="text-m-body mt-1"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  Provide a reason — it will be visible to the submitter.
                </p>
              </div>
            </div>
            <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                Rejection Reason
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                placeholder="Reason for rejection (e.g. qty doesn't match site, wrong BOQ item)…"
                autoFocus
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setShowRejectConfirm(false)}
                disabled={rejectAction.isPending}
                className="flex-1 h-10 rounded-[0.5rem] border font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
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
                className="flex-1 h-10 rounded-[0.5rem] font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
                style={{
                  backgroundColor: "var(--color-stop)",
                  color: "var(--color-paper)",
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
