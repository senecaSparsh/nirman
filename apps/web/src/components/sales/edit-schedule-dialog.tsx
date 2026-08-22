"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PaymentPlanEditor, type PaymentPlanItem } from "@/components/sales/payment-plan-editor";
import { formatCurrency } from "@/lib/utils";
import type { AssetSaleRow } from "@/lib/types";

/**
 * Edit the payment schedule on an existing sale. Reuses the same
 * PaymentPlanEditor used at creation time, pre-filled with the current
 * schedule items. Saves via POST /api/sales/[id]/schedule (create-or-replace).
 */
export function EditScheduleDialog({
  open,
  onOpenChange,
  sale,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: AssetSaleRow | null;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [scheduleType, setScheduleType] = useState<"TLP" | "DPP" | "CLP">(
    sale?.paymentSchedule?.type ?? "TLP",
  );
  const [items, setItems] = useState<PaymentPlanItem[]>(
    sale?.paymentSchedule?.items.map((item) => ({
      installmentNo: item.installmentNo,
      description: item.description,
      percentage: String(item.percentage),
      amount: String(item.amount),
      dueDate: item.dueDate ? item.dueDate.split("T")[0]! : "",
    })) ?? [],
  );

  if (!sale) return null;

  const totalCollectible = sale.salePrice + (sale.gstAmount ?? 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) {
      toast.error("Add at least one installment");
      return;
    }
    const totalPct = items.reduce((s, item) => s + (Number(item.percentage) || 0), 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      toast.error("Installment percentages must sum to 100%");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/sales/${sale!.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: scheduleType,
          items: items.map((item) => ({
            installmentNo: item.installmentNo,
            description: item.description,
            percentage: Number(item.percentage),
            amount: Number(item.amount),
            dueDate: item.dueDate || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update schedule");
      toast.success("Payment schedule updated");
      onOpenChange(false);
      onSuccess?.();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update schedule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Payment Schedule"
      description={`${sale.saleNumber} · ${formatCurrency(totalCollectible)} total`}
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <PaymentPlanEditor
          items={items}
          onChange={setItems}
          scheduleType={scheduleType}
          onScheduleTypeChange={setScheduleType}
          salePrice={sale.salePrice}
          gstAmount={sale.gstAmount ?? 0}
          advanceAmount={sale.depositAmount ?? 0}
          dealMaturityMonths={sale.dealMaturityMonths ?? 0}
        />
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || items.length === 0}>
            {saving ? "Saving…" : "Update Schedule"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
