"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Truck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";

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
 * Each action hits the existing PATCH /api/purchase-orders/[id] endpoint.
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
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(action: "approve" | "order" | "cancel", label: string) {
    haptic(10);
    setBusy(action);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed to ${action} PO`);
      toast.success(label);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setBusy(null);
    }
  }

  const showApprove = po.status === "DRAFT" && canApprove;
  const showOrder = po.status === "APPROVED" && canManage;
  const showCancel = po.status === "DRAFT" && canManage;

  if (!showApprove && !showOrder && !showCancel) return null;

  return (
    <div className="space-y-2 px-4 pb-6 pt-3">
      {showApprove && (
        <ActionButton
          onClick={() => act("approve", `PO ${po.poNumber} approved`)}
          busy={busy === "approve"}
          icon={CheckCircle2}
          label="Approve"
          variant="primary"
        />
      )}
      {showOrder && (
        <ActionButton
          onClick={() => act("order", `PO ${po.poNumber} ordered`)}
          busy={busy === "order"}
          icon={Truck}
          label="Mark as ordered"
          variant="primary"
        />
      )}
      {showCancel && (
        <ActionButton
          onClick={() => act("cancel", `PO ${po.poNumber} cancelled`)}
          busy={busy === "cancel"}
          icon={XCircle}
          label="Cancel PO"
          variant="outline"
        />
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  busy,
  icon: Icon,
  label,
  variant,
}: {
  onClick: () => void;
  busy: boolean;
  icon: typeof CheckCircle2;
  label: string;
  variant: "primary" | "outline";
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
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}
