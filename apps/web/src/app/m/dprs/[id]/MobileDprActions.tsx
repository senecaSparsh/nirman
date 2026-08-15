"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, RotateCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

/**
 * Sticky bottom action bar for DPR approval actions.
 * Shows different buttons based on current status + user permissions:
 *   SUBMITTED          → Sub-Admin Approve / Reject (if canApproveSubAdmin)
 *   SUB_ADMIN_APPROVED → Admin Approve / Reject (if canApproveAdmin)
 *   REJECTED           → Resubmit (if canResubmit)
 *
 * Reject shows a confirmation modal before executing.
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
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  const showSubAdmin = status === "SUBMITTED" && canApproveSubAdmin;
  const showAdmin = status === "SUB_ADMIN_APPROVED" && canApproveAdmin;
  const showResubmit = status === "REJECTED" && canResubmit;

  if (!showSubAdmin && !showAdmin && !showResubmit) return null;

  async function act(action: "subAdminApprove" | "adminApprove" | "reject" | "resubmit", label: string) {
    haptic(10);
    setBusy(action);
    try {
      const res = await fetch(`/api/dprs/${dprId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed to ${action}`);
      toast.success(label);
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const approveAction = showSubAdmin ? "subAdminApprove" : "adminApprove";
  const approveLabel = showSubAdmin ? "Sub-Admin Approve" : "Admin Approve";

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
              onClick={() => void act("resubmit", "Resubmitted")}
              disabled={busy !== null}
              className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] font-bold text-[0.8125rem] press active:scale-95 disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-signal)",
                color: "var(--color-ink-950)",
              }}
            >
              {busy === "resubmit" ? (
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
                disabled={busy !== null}
                className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] border-2 font-bold text-[0.8125rem] press active:scale-95 disabled:opacity-50"
                style={{
                  borderColor: "var(--color-stop)",
                  color: "var(--color-stop)",
                  backgroundColor: "transparent",
                }}
              >
                {busy === "reject" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <XCircle className="size-4" />
                )}
                Reject
              </button>
              <button
                onClick={() => void act(approveAction, approveLabel)}
                disabled={busy !== null}
                className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] font-bold text-[0.8125rem] press active:scale-95 disabled:opacity-50"
                style={{
                  backgroundColor: "var(--color-go)",
                  color: "#fff",
                }}
              >
                {busy === approveAction ? (
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
                  Reject this DPR?
                </h3>
                <p className="text-[0.6875rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
                  The submitter will need to revise and resubmit.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRejectConfirm(false)}
                disabled={busy !== null}
                className="flex-1 h-10 rounded-[0.5rem] border font-bold text-[0.75rem] press active:scale-95 disabled:opacity-50"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowRejectConfirm(false);
                  void act("reject", "Rejected");
                }}
                disabled={busy !== null}
                className="flex-1 h-10 rounded-[0.5rem] font-bold text-[0.75rem] press active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}
              >
                {busy === "reject" ? <Loader2 className="size-4 animate-spin mx-auto" /> : "Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
