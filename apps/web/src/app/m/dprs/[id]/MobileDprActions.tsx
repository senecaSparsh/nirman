"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, RotateCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { useOptimisticAction } from "@/lib/use-optimistic-action";

/**
 * Sticky bottom action bar for DPR approval actions.
 * Shows different buttons based on current status + user permissions:
 *   SUBMITTED          → Sub-Admin Approve / Reject (if canApproveSubAdmin)
 *   SUB_ADMIN_APPROVED → Admin Approve / Reject (if canApproveAdmin)
 *   REJECTED           → Resubmit (if canResubmit)
 *
 * Uses optimistic updates — the action bar disappears the instant you
 * tap (because the visible status changes), giving immediate feedback.
 */
export function MobileDprActions({
  dprId,
  status,
  canApproveSubAdmin,
  canApproveAdmin,
  canResubmit,
}: {
  dprId: string;
  status: string;
  canApproveSubAdmin: boolean;
  canApproveAdmin: boolean;
  canResubmit: boolean;
}) {
  const [visibleStatus, setVisibleStatus] = useState(status);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  const approveAction = useOptimisticAction({
    endpoint: `/api/dprs/${dprId}`,
    method: "PATCH",
    body: { action: "subAdminApprove" },
    optimisticUpdate: () => setVisibleStatus("SUB_ADMIN_APPROVED"),
    revert: () => setVisibleStatus("SUBMITTED"),
    successMessage: "Sub-Admin Approved",
    hapticOnSuccess: [10, 30, 10],
  });

  const adminApproveAction = useOptimisticAction({
    endpoint: `/api/dprs/${dprId}`,
    method: "PATCH",
    body: { action: "adminApprove" },
    optimisticUpdate: () => setVisibleStatus("APPROVED"),
    revert: () => setVisibleStatus("SUB_ADMIN_APPROVED"),
    successMessage: "Admin Approved",
    hapticOnSuccess: [10, 30, 10],
  });

  const rejectAction = useOptimisticAction({
    endpoint: `/api/dprs/${dprId}`,
    method: "PATCH",
    body: { action: "reject" },
    optimisticUpdate: () => setVisibleStatus("REJECTED"),
    revert: () => setVisibleStatus("SUBMITTED"),
    successMessage: "Rejected",
    hapticOnSuccess: 30,
  });

  const resubmitAction = useOptimisticAction({
    endpoint: `/api/dprs/${dprId}`,
    method: "PATCH",
    body: { action: "resubmit" },
    optimisticUpdate: () => setVisibleStatus("SUBMITTED"),
    revert: () => setVisibleStatus("REJECTED"),
    successMessage: "Resubmitted",
    hapticOnSuccess: 20,
  });

  const showSubAdmin = visibleStatus === "SUBMITTED" && canApproveSubAdmin;
  const showAdmin = visibleStatus === "SUB_ADMIN_APPROVED" && canApproveAdmin;
  const showResubmit = visibleStatus === "REJECTED" && canResubmit;

  if (!showSubAdmin && !showAdmin && !showResubmit) return null;

  const isSubAdmin = showSubAdmin;
  const approveLabel = isSubAdmin ? "Sub-Admin Approve" : "Admin Approve";
  const approveHandler = isSubAdmin ? approveAction : adminApproveAction;
  const approveBusy = approveHandler.isPending;

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
          {showResubmit ? (
            <button
              onClick={() => resubmitAction.execute()}
              disabled={resubmitAction.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] font-bold text-[0.8125rem] press active:scale-95 disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-signal)",
                color: "var(--color-ink-950)",
              }}
            >
              {resubmitAction.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCw className="size-4" />
              )}
              Resubmit
            </button>
          ) : (
            <>
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
                  <CheckCircle2 className="size-4" />
                )}
                {approveLabel}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Reject confirmation modal */}
      {showRejectConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowRejectConfirm(false)}>
          <div
            className="w-full max-w-sm mx-4 rounded-[0.75rem] border p-5 shadow-xl"
            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="grid place-items-center size-10 rounded-full shrink-0"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 12%, transparent)" }}
              >
                <AlertTriangle className="size-5" style={{ color: "var(--color-stop)" }} />
              </div>
              <div>
                <h3 className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                  Reject this Daily Progress Report?
                </h3>
                <p className="text-[0.6875rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
                  The submitter will need to revise and resubmit.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRejectConfirm(false)}
                disabled={rejectAction.isPending}
                className="flex-1 h-10 rounded-[0.5rem] border font-bold text-[0.75rem] press active:scale-95 disabled:opacity-50"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
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
                style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}
              >
                {rejectAction.isPending ? <Loader2 className="size-4 animate-spin mx-auto" /> : "Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
