"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Truck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { useOptimisticAction } from "@/lib/use-optimistic-action";
import { ActionBar } from "@/components/mobile/v2/primitives";

interface PoPayload {
  id: string;
  poNumber: string;
  status: string;
  supplierName: string;
}

/**
 * Inline action bar for a purchase order on mobile. Surfaces the actions
 * valid for the PO's current status and the user's permissions:
 *   DRAFT     → approve (if po.approve) / cancel (if procurement.manage)
 *   APPROVED  → order (if procurement.manage)
 *   ORDERED/PARTIAL → (receiving is a separate CTA above)
 *
 * Uses optimistic updates — the status pill changes the instant you tap,
 * before the server round-trip completes. If the server rejects, it
 * reverts and shows the error.
 */
export function MobilePoActions({
  po,
  canApprove,
  canManage,
  backHref,
}: {
  po: PoPayload;
  canApprove: boolean;
  canManage: boolean;
  backHref: string;
}) {
  // Track the visible status — updated optimistically, reverted on error.
  const [visibleStatus, setVisibleStatus] = useState(po.status);

  const approveAction = useOptimisticAction({
    endpoint: `/api/purchase-orders/${po.id}`,
    method: "PATCH",
    body: { action: "approve" },
    optimisticUpdate: () => setVisibleStatus("APPROVED"),
    revert: () => setVisibleStatus("DRAFT"),
    successMessage: `PO ${po.poNumber} approved`,
    hapticOnSuccess: [10, 30, 10],
  });

  const orderAction = useOptimisticAction({
    endpoint: `/api/purchase-orders/${po.id}`,
    method: "PATCH",
    body: { action: "order" },
    optimisticUpdate: () => setVisibleStatus("ORDERED"),
    revert: () => setVisibleStatus("APPROVED"),
    successMessage: `PO ${po.poNumber} ordered`,
    successDescription: "The supplier has been sent the order.",
    hapticOnSuccess: [10, 30, 10],
  });

  const cancelAction = useOptimisticAction({
    endpoint: `/api/purchase-orders/${po.id}`,
    method: "PATCH",
    body: { action: "cancel" },
    optimisticUpdate: () => setVisibleStatus("CANCELLED"),
    revert: () => setVisibleStatus("DRAFT"),
    successMessage: `PO ${po.poNumber} cancelled`,
    hapticOnSuccess: 30,
  });

  // Use the optimistic status for button visibility so the action bar
  // updates immediately — no flash of the old buttons.
  const showApprove = visibleStatus === "DRAFT" && canApprove;
  const showOrder = visibleStatus === "APPROVED" && canManage;
  const showCancel = visibleStatus === "DRAFT" && canManage;

  if (!showApprove && !showOrder && !showCancel) return null;

  return (
    <ActionBar>
      <div className="space-y-2">
        {showApprove && showCancel ? (
          <div className="flex gap-2">
            <ActionButton
              onClick={() => approveAction.execute()}
              busy={approveAction.isPending}
              icon={CheckCircle2}
              label="Approve"
              variant="primary"
              className="flex-1"
            />
            <ActionButton
              onClick={() => cancelAction.execute()}
              busy={cancelAction.isPending}
              icon={XCircle}
              label="Cancel PO"
              variant="outline"
              className="flex-1"
            />
          </div>
        ) : (
          <>
            {showApprove && (
              <ActionButton
                onClick={() => approveAction.execute()}
                busy={approveAction.isPending}
                icon={CheckCircle2}
                label="Approve"
                variant="primary"
              />
            )}
            {showOrder && (
              <ActionButton
                onClick={() => orderAction.execute()}
                busy={orderAction.isPending}
                icon={Truck}
                label="Mark as ordered"
                variant="primary"
              />
            )}
            {showCancel && (
              <ActionButton
                onClick={() => cancelAction.execute()}
                busy={cancelAction.isPending}
                icon={XCircle}
                label="Cancel PO"
                variant="outline"
              />
            )}
          </>
        )}
      </div>
    </ActionBar>
  );
}

function ActionButton({
  onClick,
  busy,
  icon: Icon,
  label,
  variant,
  className,
}: {
  onClick: () => void;
  busy: boolean;
  icon: typeof CheckCircle2;
  label: string;
  variant: "primary" | "outline";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors active:scale-[0.99] disabled:opacity-60",
        variant === "primary"
          ? "bg-primary text-primary-foreground shadow-raised"
          : "border border-border bg-card text-foreground",
        className,
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}
