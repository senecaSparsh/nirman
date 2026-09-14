"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {Input, Select} from "@/components/ui/input";
import { Field } from "@/components/field";
import { formatCurrency } from "@/lib/utils";
import { useFetch } from "@/lib/use-fetch";
import type { MaterialRow } from "@/lib/types";

/**
 * Dialog to add a new material line to an already-ORDERED or PARTIAL
 * purchase order. Calls `PATCH /api/purchase-orders/[id]` with
 * `action: "addLine"`.
 */
export function PoAddLineDialog({
  open,
  onOpenChange,
  poId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  poId: string;
  onAdded?: () => void;
}) {
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: materialsData } = useFetch<{ rows?: MaterialRow[] }>("/api/materials", { skip: !open });
  const materials = materialsData?.rows ?? [];
  useEffect(() => {
    if (materials.length > 0 && !materialId) setMaterialId(materials[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only seed default once data arrives
  }, [materialsData]);

  useEffect(() => {
    if (!open) {
      setQty("");
      setUnitCost("");
    }
  }, [open]);

  const lineTotal = (Number(qty) || 0) * (Number(unitCost) || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!materialId || Number(qty) <= 0 || Number(unitCost) < 0) {
      toast.error("Select a material, enter quantity and unit cost");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addLine",
          materialId,
          qtyOrdered: Number(qty),
          unitCost: Number(unitCost),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add line");
      toast.success("Line added to PO");
      onOpenChange(false);
      onAdded?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add line to PO" description="Add a new material line to this ordered purchase order.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Material" required>
          <Select value={materialId} onChange={(e) => setMaterialId(e.target.value)} required>
            {materials.length === 0 ? (
              <option value="">Loading materials…</option>
            ) : (
              materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.code})
                </option>
              ))
            )}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" required>
            <Input
              type="number"
              step="0.001"
              min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              required
            />
          </Field>
          <Field label="Unit cost (₹)" required>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="0"
              required
            />
          </Field>
        </div>

        {lineTotal > 0 && (
          <div className="flex justify-end text-body text-muted-foreground">
            Line total: <strong className="ml-1 text-foreground">{formatCurrency(lineTotal)}</strong>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            <Plus className="h-4 w-4" /> {submitting ? "Adding…" : "Add line"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
