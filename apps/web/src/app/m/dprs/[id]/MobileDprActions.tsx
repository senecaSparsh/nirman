"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {CheckCircle2, XCircle, Loader2, RotateCw, AlertTriangle, DollarSign, Trash2} from "lucide-react";
import { toast } from "sonner";
import { useOptimisticAction } from "@/lib/use-optimistic-action";
import { ActionBar } from "@/components/mobile/v2/primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";

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
  canMarkCostPosted,
  canManage,
  costPosted,
  submittedById,
  currentUserId,
}: {
  dprId: string;
  status: string;
  canApproveSubAdmin: boolean;
  canApproveAdmin: boolean;
  canResubmit: boolean;
  canMarkCostPosted: boolean;
  canManage: boolean;
  costPosted: boolean;
  submittedById?: string | null;
  currentUserId?: string | null;
}) {
  const router = useRouter();
  const [visibleStatus, setVisibleStatus] = useState(status);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [busy, setBusy] = useState(false);

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

  // Creator gate: don't show approve/reject to the person who submitted the DPR
  const isOwnDpr = submittedById !== currentUserId;
  const showSubAdmin = visibleStatus === "SUBMITTED" && canApproveSubAdmin && isOwnDpr;
  const showAdmin = visibleStatus === "SUB_ADMIN_APPROVED" && canApproveAdmin && isOwnDpr;
  const showResubmit = visibleStatus === "REJECTED" && canResubmit;
  const showMarkCost = canMarkCostPosted && visibleStatus === "APPROVED" && !costPosted;
  const canDelete = canManage;

  async function handleMarkCostPosted() {
    setBusy(true);
    try {
      const res = await fetch(`/api/dprs/${dprId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markCostPosted" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Cost marked as posted");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      const res = await fetch(`/api/dprs/${dprId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("DPR deleted");
      setShowDelete(false);
      router.push("/m/hr?tab=dprs");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!showSubAdmin && !showAdmin && !showResubmit && !showMarkCost && !canDelete) return null;

  // If the only actions are Mark Cost Posted / Delete (which render above
  // the ActionBar), don't render an empty ActionBar with stale buttons.
  const hasApprovalActions = showSubAdmin || showAdmin || showResubmit;

  const isSubAdmin = showSubAdmin;
  const approveLabel = isSubAdmin ? "Sub-Admin Approve" : "Admin Approve";
  const approveHandler = isSubAdmin ? approveAction : adminApproveAction;
  const approveBusy = approveHandler.isPending;

  return (
    <>
      {/* Mark Cost Posted + Delete buttons (above the sticky approval bar) */}
      {(showMarkCost || canDelete) ? (
        <div className="flex gap-2 mt-4 mb-2">
          {showMarkCost ? (
            <button
              onClick={handleMarkCostPosted}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press disabled:opacity-50"
              style={{ borderColor: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))", color: "var(--color-go)" }}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <DollarSign className="size-3.5" />}
              Mark Cost Posted
            </button>
          ) : null}
          {canDelete ? (
            <button
              onClick={() => setShowDelete(true)}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press disabled:opacity-50"
              style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))", color: "var(--color-stop)" }}
            >
              <Trash2 className="size-3.5" />
              Delete
            </button>
          ) : null}
        </div>
      ) : null}

      {hasApprovalActions ? (
        <ActionBar>
          <div className="flex items-center gap-2">
          {showResubmit ? (
            <button
              onClick={() => resubmitAction.execute()}
              disabled={resubmitAction.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
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
                  <CheckCircle2 className="size-4" />
                )}
                {approveLabel}
              </button>
            </>
          )}
          </div>
        </ActionBar>
      ) : null}

      {/* Reject confirmation modal */}
      <MobileDialog open={showRejectConfirm} onClose={() => setShowRejectConfirm(false)} title="Reject this Daily Progress Report?">
            <div className="flex items-start gap-3 mb-4">
              <div
                className="grid place-items-center size-10 rounded-full shrink-0"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 12%, transparent)" }}
              >
                <AlertTriangle className="size-5" style={{ color: "var(--color-stop)" }} />
              </div>
              <div>
                <p className="text-m-body mt-1" style={{ color: "var(--color-ink-500)" }}>
                  The submitter will need to revise and resubmit.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (required)..."
                className="w-full min-h-[80px] rounded-[0.5rem] border p-3 text-m-body mb-2"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-950)", backgroundColor: "var(--color-paper)" }}
              />
              <button
                onClick={() => setShowRejectConfirm(false)}
                disabled={rejectAction.isPending}
                className="flex-1 h-10 rounded-[0.5rem] border font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowRejectConfirm(false);
                  rejectAction.execute({ action: "reject", reason: rejectReason || undefined });
                  setRejectReason("");
                }}
                disabled={rejectAction.isPending}
                className="flex-1 h-10 rounded-[0.5rem] font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
              >
                {rejectAction.isPending ? <Loader2 className="size-4 animate-spin mx-auto" /> : "Reject"}
              </button>
            </div>
      </MobileDialog>

      {/* Delete confirmation */}
      <MobileDialog open={showDelete} onClose={() => setShowDelete(false)} title="Delete DPR?">
            <div className="pb-4">
              <p className="text-m-label mb-3" style={{ color: "var(--color-ink-500)" }}>
                This will permanently delete this Daily Progress Report and all its line items. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowDelete(false)} disabled={busy} className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
                <button onClick={handleDelete} disabled={busy} className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1" style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}>
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Delete"}
                </button>
              </div>
            </div>
      </MobileDialog>
    </>
  );
}
