"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EditableGrid, type EditableColumn } from "@/components/ui/editable-grid";
import { formatCurrency } from "@/lib/utils";
import type { MaterialOption, StockLocationOption } from "@/lib/types";

type SupplierOption = { id: string; name: string };

type Line = {
  id: string;
  materialId: string;
  qty: string;
  unitCost: string;
  gstRate: string;
};

export function DirectPurchaseFormDialog({
  open,
  onOpenChange,
  suppliers,
  locations,
  materials,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: SupplierOption[];
  locations: StockLocationOption[];
  materials: MaterialOption[];
}) {
  const materialOptions = useMemo(
    () => materials.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` })),
    [materials],
  );

  const lineColumns: EditableColumn<Line>[] = useMemo(() => [
    {
      key: "materialId",
      label: "Material",
      type: "select",
      options: materialOptions,
      placeholder: "Select…",
      width: "1fr",
    },
    {
      key: "qty",
      label: "Qty",
      type: "number",
      align: "right",
      step: "any",
      min: 0,
      placeholder: "0",
      width: "90px",
      format: (v) => v ? String(v) : "",
    },
    {
      key: "unitCost",
      label: "Rate (₹)",
      type: "number",
      align: "right",
      step: "any",
      min: 0,
      placeholder: "0",
      width: "110px",
      format: (v) => v ? formatCurrency(Number(v)) : "",
    },
    {
      key: "gstRate",
      label: "GST %",
      type: "number",
      align: "right",
      step: "any",
      min: 0,
      placeholder: "0",
      width: "80px",
      format: (v) => v ? `${v}%` : "",
    },
    {
      key: "lineTotal",
      label: "Amount",
      type: "computed",
      align: "right",
      compute: (r) => (Number(r.qty) || 0) * (Number(r.unitCost) || 0),
      format: (v) => formatCurrency(v as number),
    },
  ], [materialOptions]);

  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [billDate, setBillDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLinesState] = useState<Line[]>([{ id: crypto.randomUUID(), materialId: "", qty: "", unitCost: "", gstRate: "" }]);

  // Wrap setLines to auto-fill gstRate & unitCost from the selected material.
  function setLines(updater: Line[] | ((prev: Line[]) => Line[])) {
    setLinesState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next.map((line, i) => {
        const prevLine = prev[i];
        if (line.materialId && line.materialId !== prevLine?.materialId) {
          const mat = materials.find((m) => m.id === line.materialId);
          if (mat) {
            return {
              ...line,
              gstRate: !line.gstRate ? String(mat.gstRate) : line.gstRate,
              unitCost: !line.unitCost ? String(mat.standardCost) : line.unitCost,
            };
          }
        }
        return line;
      });
    });
  }

  function addLine() { setLines((ls) => [...ls, { id: crypto.randomUUID(), materialId: "", qty: "", unitCost: "", gstRate: "" }]); }

  // Compute total from valid lines
  const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0);
  const subtotal = validLines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0);
  const gstTotal = validLines.reduce((s, l) => {
    const lineSub = (Number(l.qty) || 0) * (Number(l.unitCost) || 0);
    return s + lineSub * ((Number(l.gstRate) || 0) / 100);
  }, 0);
  const total = subtotal + gstTotal;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierName.trim() && !supplierId) return toast.error("Select or enter a supplier name");
    if (!locationId) return toast.error("Select a receive location");
    const finalSupplierName = supplierId
      ? suppliers.find((s) => s.id === supplierId)?.name ?? supplierName
      : supplierName.trim();

    setSaving(true);
    try {
      const res = await fetch("/api/direct-purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplierId || null,
          supplierName: finalSupplierName,
          locationId,
          billDate: billDate || null,
          notes: notes.trim() || null,
          lines: validLines.length > 0
            ? validLines.map((l) => ({
                materialId: l.materialId,
                qty: Number(l.qty),
                unitCost: Number(l.unitCost),
                gstRate: l.gstRate ? Number(l.gstRate) : null,
              }))
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create direct purchase");
      toast.success(`Direct purchase ${data.billNumber} created`);
      onOpenChange(false);
      setSupplierId(""); setSupplierName(""); setLocationId(""); setBillDate(""); setNotes("");
      setLinesState([{ id: crypto.randomUUID(), materialId: "", qty: "", unitCost: "", gstRate: "" }]);
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) {
          // Default bill date to today
          setBillDate((cur) => cur || new Date().toISOString().slice(0, 10));
        }
      }}
      title="New Cash Purchase"
      description="Log a local or ad-hoc purchase without a formal PO. Add line items to receive stock automatically."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Supplier *</Label>
            <Select
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                if (e.target.value) {
                  const s = suppliers.find((s) => s.id === e.target.value);
                  setSupplierName(s?.name ?? "");
                }
              }}
            >
              <option value="">— Or type name below —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            {!supplierId && (
              <Input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Supplier name (ad-hoc)"
                className="mt-1"
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Receive Location *</Label>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Select…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Bill Date</Label>
            <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Line Items (optional — adds stock)</Label>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-3.5 w-3.5" /> Add Line
            </Button>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <EditableGrid
              rows={lines}
              onChange={setLines}
              columns={lineColumns}
              getRowId={(r) => r.id}
              sumColumns={["qty", "lineTotal"]}
              className="max-h-[40vh]"
            />
          </div>
        </div>

        {validLines.length > 0 && (
          <div className="flex justify-end gap-4 rounded-md bg-muted/40 px-3 py-2 text-body">
            <span className="text-muted-foreground">Subtotal: <span className="tnum">{formatCurrency(subtotal)}</span></span>
            <span className="text-muted-foreground">GST: <span className="tnum">{formatCurrency(gstTotal)}</span></span>
            <span className="font-semibold">Total: <span className="tnum">{formatCurrency(total)}</span></span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create Cash Purchase"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
