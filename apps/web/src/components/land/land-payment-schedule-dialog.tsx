"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, CalendarClock } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Field } from "@/components/field";
import { formatCurrency } from "@/lib/utils";
import type { LandPaymentScheduleItemRow } from "./land-hub";

type ScheduleItem = {
  installmentNo: number;
  description: string;
  percentage: string;
  dueDate: string;
};

/**
 * Dialog to create or replace the staged payment schedule for a land
 * purchase. Calls `POST /api/land-purchases/[id]/payment-schedule`.
 * Percentages should sum to 100; the amount for each installment is
 * computed server-side as `percentage × totalCost / 100`.
 */
export function LandPaymentScheduleDialog({
  open,
  onOpenChange,
  landPurchaseId,
  totalCost,
  existingItems,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  landPurchaseId: string;
  totalCost: number;
  existingItems?: LandPaymentScheduleItemRow[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (existingItems && existingItems.length > 0) {
      setItems(
        existingItems.map((it) => ({
          installmentNo: it.installmentNo,
          description: it.description,
          percentage: String(it.percentage),
          dueDate: it.dueDate ? it.dueDate.split("T")[0] ?? "" : "",
        })),
      );
    } else {
      setItems([
        { installmentNo: 1, description: "Token", percentage: "10", dueDate: "" },
        { installmentNo: 2, description: "Balance", percentage: "90", dueDate: "" },
      ]);
    }
  }, [open, existingItems]);

  const totalPct = items.reduce((s, it) => s + (Number(it.percentage) || 0), 0);

  function updateItem(idx: number, field: keyof ScheduleItem, val: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: val } : it)));
  }

  function addItem() {
    const nextNo = Math.max(0, ...items.map((i) => i.installmentNo)) + 1;
    setItems([...items, { installmentNo: nextNo, description: "", percentage: "", dueDate: "" }]);
  }

  function removeItem(idx: number) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valid = items.filter((it) => it.description.trim() && Number(it.percentage) > 0);
    if (valid.length === 0) {
      toast.error("Add at least one installment with description and percentage");
      return;
    }
    if (Math.abs(totalPct - 100) > 0.01) {
      toast.error(`Percentages must total 100% (currently ${totalPct.toFixed(2)}%)`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/land-purchases/${landPurchaseId}/payment-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: valid.map((it) => ({
            installmentNo: it.installmentNo,
            description: it.description.trim(),
            percentage: Number(it.percentage),
            dueDate: it.dueDate || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save payment schedule");
      toast.success("Payment schedule saved");
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Payment schedule"
      description="Define staged installments for this land purchase. Percentages should total 100%."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-[2rem_1fr_80px_120px_2rem] items-center gap-2 text-caption font-medium text-muted-foreground">
            <span>#</span>
            <span>Description</span>
            <span className="text-right">%</span>
            <span>Due date</span>
            <span />
          </div>
          {items.map((it, idx) => {
            const amount = (Number(it.percentage) || 0) * totalCost / 100;
            return (
              <div key={idx} className="grid grid-cols-[2rem_1fr_80px_120px_2rem] items-center gap-2">
                <span className="tnum text-caption text-muted-foreground">{it.installmentNo}</span>
                <Input
                  value={it.description}
                  onChange={(e) => updateItem(idx, "description", e.target.value)}
                  placeholder="e.g. Token, Registry…"
                  required
                />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={it.percentage}
                  onChange={(e) => updateItem(idx, "percentage", e.target.value)}
                  placeholder="0"
                  className="text-right"
                  required
                />
                <Input
                  type="date"
                  value={it.dueDate}
                  onChange={(e) => updateItem(idx, "dueDate", e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItem(idx)}
                  disabled={items.length <= 1}
                  className="text-muted-foreground hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                {amount > 0 && (
                  <div className="col-span-5 -mt-1 text-caption text-muted-foreground">
                    = {formatCurrency(amount)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4" /> Add installment
          </Button>
          <div className="text-body">
            Total:{" "}
            <strong className={Math.abs(totalPct - 100) > 0.01 ? "text-danger" : "text-go"}>
              {totalPct.toFixed(2)}%
            </strong>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            <CalendarClock className="h-4 w-4" /> {submitting ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
