"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Package, ArrowRight } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { EditableGrid, type EditableColumn } from "@/components/ui/editable-grid";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { PurchaseOrderDetail } from "@/lib/types";

type RecvLine = {
  lineId: string;
  materialId: string;
  materialName: string;
  unit: string;
  baseUnit: string;
  uomConversionFactor: number | null;
  qtyOrdered: number;
  qtyReceived: number;
  remaining: number;
  defaultCost: number;
  qtyToReceive: string;
  unitCost: string;
  weightReceived: string;
};

/** Column definitions for the receive-goods editable grid. */
const recvColumns: EditableColumn<RecvLine>[] = [
  {
    key: "materialName",
    label: "Material",
    type: "readonly",
    width: "1fr",
  },
  {
    key: "qtyOrdered",
    label: "Ordered",
    type: "readonly",
    align: "right",
    format: (v) => formatNumber(v as number, 3),
  },
  {
    key: "remaining",
    label: "Remaining",
    type: "readonly",
    align: "right",
    format: (v) => formatNumber(v as number, 3),
  },
  {
    key: "weightReceived",
    label: "Weight (KG)",
    type: "number",
    align: "right",
    step: "0.001",
    min: 0,
    placeholder: "—",
    width: "100px",
    format: (v) => v ? formatNumber(Number(v), 3) : "",
  },
  {
    key: "qtyToReceive",
    label: "Qty to Receive",
    type: "number",
    align: "right",
    step: "0.001",
    min: 0,
    placeholder: "0",
    width: "110px",
    format: (v) => v ? formatNumber(Number(v), 3) : "",
  },
  {
    key: "unitCost",
    label: "Unit Cost (₹)",
    type: "number",
    align: "right",
    step: "0.01",
    min: 0,
    width: "110px",
    format: (v) => v ? formatCurrency(Number(v)) : "",
  },
  {
    key: "lineTotal",
    label: "Line Total",
    type: "computed",
    align: "right",
    compute: (r) => (Number(r.qtyToReceive) || 0) * (Number(r.unitCost) || 0),
    format: (v) => formatCurrency(v as number),
  },
];

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
            baseUnit: l.baseUnit,
            uomConversionFactor: l.uomConversionFactor,
            qtyOrdered: l.qtyOrdered,
            qtyReceived: l.qtyReceived,
            remaining: l.remaining,
            defaultCost: l.unitCost,
            qtyToReceive: "",
            unitCost: String(l.unitCost),
            weightReceived: "",
          })),
      );
    }
  }

  function updateLine(lineId: string, patch: Partial<RecvLine>) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.lineId !== lineId) return l;
        const next = { ...l, ...patch };
        // Auto-calculate qty from weight when conversion factor exists
        if (patch.weightReceived !== undefined && l.uomConversionFactor && l.uomConversionFactor > 0) {
          const wt = Number(patch.weightReceived);
          if (wt > 0) {
            next.qtyToReceive = (wt / l.uomConversionFactor).toFixed(3);
          } else if (patch.weightReceived === "") {
            next.qtyToReceive = "";
          }
        }
        return next;
      }),
    );
  }

  // Intercept grid changes to auto-calc qty from weight
  function handleGridChange(newRows: RecvLine[]) {
    setLines(newRows.map((r) => {
      if (r.uomConversionFactor && r.uomConversionFactor > 0 && r.weightReceived) {
        const wt = Number(r.weightReceived);
        if (wt > 0) {
          return { ...r, qtyToReceive: (wt / r.uomConversionFactor).toFixed(3) };
        }
      }
      return r;
    }));
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

      // Build a detailed confirmation toast with stock landing info
      const receivedSummary = toReceive
        .map((l) => `${l.qtyToReceive} ${l.unit} ${l.materialName}`)
        .join(", ");
      const isProjectScoped = po.procurementScope === "PROJECT" && po.projectId;
      toast.success(`GRN done — PO is now ${data.newStatus}`, {
        description: `${receivedSummary} → ${po.destinationLocation.name}`,
        action: {
          label: isProjectScoped ? "Issue to Project" : "View Stock Movements",
          onClick: () => router.push(isProjectScoped ? `/stock?issue=1&project=${po.projectId}` : "/stock?tab=movements"),
        },
      });
      onOpenChange(false);
      setLines([]);
      setNotes("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
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
      title={`Make GRN — ${po.poNumber}`}
      description={`Supplier: ${po.supplier.name} · Receiving at: ${po.destinationLocation.name}`}
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
          {lines.length > 0 && (
            <>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLines((ls) => ls.map((l) => ({
                      ...l,
                      qtyToReceive: l.remaining > 0 ? String(l.remaining) : "",
                    })));
                    toast.success("Filled all remaining quantities");
                  }}
                >
                  Receive All Remaining
                </Button>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <EditableGrid
                  rows={lines}
                  onChange={handleGridChange}
                  columns={recvColumns}
                  getRowId={(r) => r.lineId}
                  sumColumns={["qtyToReceive", "lineTotal"]}
                  className="max-h-[50vh]"
                />
              </div>
              {lines.some((l) => l.uomConversionFactor && l.uomConversionFactor > 0) && (
                <p className="text-xs text-muted-foreground">
                  💡 Enter weight in the "Weight" column — qty auto-calculates from the material's UOM conversion factor (e.g., 5000 KG ÷ 50 = 100 BAG).
                </p>
              )}
            </>
          )}
          <div className="space-y-1.5">
            <Label>GRN notes</Label>
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
