"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

/**
 * Sticky bottom action bar for DPR approval actions.
 * Shows different buttons based on current status + user permissions:
 *   SUBMITTED          → Sub-Admin Approve / Reject (if canApproveSubAdmin)
 *   SUB_ADMIN_APPROVED → Admin Approve / Reject (if canApproveAdmin)
 *   REJECTED           → Resubmit (if canResubmit)
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
              onClick={() => void act("reject", "Rejected")}
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
  );
}
