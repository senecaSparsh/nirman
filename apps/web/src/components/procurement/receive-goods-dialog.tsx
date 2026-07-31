"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import type { PurchaseOrderDetail } from "@/lib/types";

type RecvLine = {
  lineId: string;
  materialId: string;
  materialName: string;
  unit: string;
  qtyOrdered: number;
  qtyReceived: number;
  remaining: number;
  defaultCost: number;
  qtyToReceive: string;
  unitCost: string;
};

export function ReceiveGoodsDialog({
  open,
  onOpenChange,
  po,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  po: PurchaseOrderDetail | null;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Build receive lines from PO lines that still have remaining qty
  const [lines, setLines] = useState<RecvLine[]>([]);

  // Re-init lines when PO changes
  function ensureLines() {
    if (po && lines.length === 0) {
      setLines(
        po.lines
          .filter((l) => l.remaining > 0)
          .map((l) => ({
            lineId: l.id,
            materialId: l.materialId,
            materialName: l.materialName,
            unit: l.unit,
            qtyOrdered: l.qtyOrdered,
            qtyReceived: l.qtyReceived,
            remaining: l.remaining,
            defaultCost: l.unitCost,
            qtyToReceive: "",
            unitCost: String(l.unitCost),
          })),
      );
    }
  }

  function updateLine(lineId: string, patch: Partial<RecvLine>) {
    setLines((ls) => ls.map((l) => (l.lineId === lineId ? { ...l, ...patch } : l)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!po) return;
    const toReceive = lines.filter((l) => Number(l.qtyToReceive) > 0);
    if (toReceive.length === 0) return toast.error("Enter a quantity to receive for at least one line");

    // Validate no over-receipt
    for (const l of toReceive) {
      if (Number(l.qtyToReceive) > l.remaining) {
        return toast.error(`Cannot receive ${l.qtyToReceive} ${l.unit} of ${l.materialName} — only ${l.remaining} remaining`);
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notes.trim() || null,
          lines: toReceive.map((l) => ({
            purchaseOrderLineId: l.lineId,
            materialId: l.materialId,
            qtyReceived: Number(l.qtyToReceive),
            unitCost: Number(l.unitCost) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to receive goods");
      toast.success(`Goods received — PO is now ${data.newStatus}`);
      onOpenChange(false);
      setLines([]);
      setNotes("");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!po) return null;
  const canReceive = po.status === "ORDERED" || po.status === "PARTIAL";
  const receivableLines = po.lines.filter((l) => l.remaining > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) { setLines([]); setNotes(""); } }}
      title={`Receive Goods — ${po.poNumber}`}
      description={`Supplier: ${po.supplier.name} · Destination: ${po.destinationLocation.name}`}
      className="max-w-2xl"
    >
      {!canReceive ? (
        <div className="space-y-3">
          <p className="text-body text-muted-foreground">
            This PO is in status <strong>{po.status}</strong>. Goods can only be received against POs
            that are ORDERED or PARTIAL.
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      ) : receivableLines.length === 0 ? (
        <div className="space-y-3">
          <p className="text-body text-muted-foreground">All lines on this PO have been fully received.</p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3" onFocus={ensureLines}>
          <div className="space-y-2">
            {receivableLines.map((l) => {
              const rl = lines.find((x) => x.lineId === l.id) ?? {
                lineId: l.id, materialId: l.materialId, materialName: l.materialName, unit: l.unit,
                qtyOrdered: l.qtyOrdered, qtyReceived: l.qtyReceived, remaining: l.remaining,
                defaultCost: l.unitCost, qtyToReceive: "", unitCost: String(l.unitCost),
              };
              return (
                <div key={l.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{l.materialName}</span>
                    <span className="text-caption text-muted-foreground tnum">
                      Ordered {l.qtyOrdered} {l.unit} · Received {l.qtyReceived} · Remaining {l.remaining}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-caption">Qty to receive</Label>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        max={l.remaining}
                        placeholder={`max ${l.remaining}`}
                        value={rl.qtyToReceive}
                        onChange={(e) => updateLine(l.id, { qtyToReceive: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-caption">Actual unit cost (₹)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={rl.unitCost}
                        onChange={(e) => updateLine(l.id, { unitCost: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5">
            <Label>Receipt notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional — e.g. invoice no., delivery challan" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Receiving…" : "Receive goods"}</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
