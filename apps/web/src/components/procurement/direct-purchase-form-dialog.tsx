"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Truck, ChevronDown, ChevronRight } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EditableGrid, type EditableColumn } from "@/components/ui/editable-grid";
import { formatCurrency } from "@/lib/utils";
import type { MaterialOption, StockLocationOption } from "@/lib/types";
import { VehicleCapture, type VehicleData } from "@/components/mobile/vehicle-capture";
import { required, positiveNumber, nonNegativeNumber } from "@/lib/validate";
import { useInlineValidation, type ValidationRules } from "@/lib/use-inline-validation";

type SupplierOption = { id: string; name: string };

type Line = {
  id: string;
  materialId: string;
  qty: string;
  unitCost: string;
  gstRate: string;
};

type FormState = {
  supplierId: string;
  supplierName: string;
  locationId: string;
  billDate: string;
  notes: string;
  lines: Line[];
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

  // Vehicle capture — how goods were brought from the market
  const [showVehicle, setShowVehicle] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleData>({ vehicleNumber: "", vehicleType: "" });

  // ── Inline validation ──────────────────────────────────────────
  // Validates on blur and shows red error text under the field instantly.
  const validationRules: ValidationRules<FormState> = {
    supplierName: (_v, all) => {
      if (!all.supplierId && !all.supplierName.trim()) return "Supplier is required";
    },
    locationId: (v) => required(v as string, "Receive Location"),
    lines: (v) => {
      const ls = v as Line[];
      for (const l of ls) {
        if (!l.materialId) continue;
        const qErr = positiveNumber(l.qty, "Quantity");
        if (qErr) return qErr;
        const cErr = nonNegativeNumber(l.unitCost, "Rate");
        if (cErr) return cErr;
      }
    },
  };
  const { errors, onBlur, validateAll, clearError, clearAll } = useInlineValidation<FormState>(validationRules);

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
    clearError("lines");
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
    if (!validateAll({ supplierId, supplierName, locationId, billDate, notes, lines })) {
      toast.error("Please fix the errors in the form");
      return;
    }
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
          // Vehicle / transport
          vehicleNumber: vehicle.vehicleNumber.trim() || undefined,
          vehicleType: vehicle.vehicleType || undefined,
          vehiclePhotoUrl: vehicle.photoUrl,
          driverName: vehicle.driverName?.trim() || undefined,
          driverPhone: vehicle.driverPhone?.trim() || undefined,
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
      if (!res.ok) throw new Error(data.error ?? "Failed to create cash purchase");
      toast.success(`Cash purchase ${data.billNumber} created`);
      onOpenChange(false);
      setSupplierId(""); setSupplierName(""); setLocationId(""); setBillDate(""); setNotes("");
      setVehicle({ vehicleNumber: "", vehicleType: "" });
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
          clearAll();
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
            <Label className={errors.supplierName ? "text-danger" : undefined}>Supplier *</Label>
            <Select
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                clearError("supplierName");
                if (e.target.value) {
                  const s = suppliers.find((s) => s.id === e.target.value);
                  setSupplierName(s?.name ?? "");
                }
              }}
              onBlur={() => onBlur("supplierName", { supplierId, supplierName, locationId, billDate, notes, lines })}
              aria-invalid={!!errors.supplierName}
            >
              <option value="">— Or type name below —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            {!supplierId && (
              <Input
                value={supplierName}
                onChange={(e) => { setSupplierName(e.target.value); clearError("supplierName"); }}
                onBlur={() => onBlur("supplierName", { supplierId, supplierName, locationId, billDate, notes, lines })}
                aria-invalid={!!errors.supplierName}
                placeholder="Supplier name (ad-hoc)"
                className="mt-1"
              />
            )}
            {errors.supplierName && <p className="text-caption text-danger" role="alert">{errors.supplierName}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className={errors.locationId ? "text-danger" : undefined}>Receive Location *</Label>
            <Select
              value={locationId}
              onChange={(e) => { setLocationId(e.target.value); clearError("locationId"); }}
              onBlur={() => onBlur("locationId", { supplierId, supplierName, locationId, billDate, notes, lines })}
              aria-invalid={!!errors.locationId}
            >
              <option value="">Select…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
            {errors.locationId && <p className="text-caption text-danger" role="alert">{errors.locationId}</p>}
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
          {errors.lines && <p className="text-caption text-danger" role="alert">{errors.lines}</p>}
        </div>

        {validLines.length > 0 && (
          <div className="flex justify-end gap-4 rounded-md bg-muted/40 px-3 py-2 text-body">
            <span className="text-muted-foreground">Subtotal: <span className="tnum">{formatCurrency(subtotal)}</span></span>
            <span className="text-muted-foreground">GST: <span className="tnum">{formatCurrency(gstTotal)}</span></span>
            <span className="font-semibold">Total: <span className="tnum">{formatCurrency(total)}</span></span>
          </div>
        )}

        {/* ── Vehicle / transport (collapsible) ── */}
        <button
          type="button"
          onClick={() => setShowVehicle((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {showVehicle ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <Truck className="size-4" />
          Vehicle / Transport
          {vehicle.vehicleNumber ? (
            <span className="ml-1 text-xs font-bold text-success">✓ {vehicle.vehicleNumber}</span>
          ) : null}
        </button>
        {showVehicle && (
          <div className="rounded-lg border border-border p-3 bg-muted/30">
            <VehicleCapture value={vehicle} onChange={setVehicle} />
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
