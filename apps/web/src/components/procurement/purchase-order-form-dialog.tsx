"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { formatCurrency } from "@/lib/utils";
import type { MaterialRow, ProjectOption, StockLocationRow, SupplierRow } from "@/lib/types";

type Line = {
  key: string;
  materialId: string;
  qtyOrdered: string;
  unitCost: string;
  gstRate: string;
};

let lineKey = 0;
function newLine(): Line {
  return { key: `l${++lineKey}`, materialId: "", qtyOrdered: "", unitCost: "", gstRate: "0" };
}

export function PurchaseOrderFormDialog({
  open,
  onOpenChange,
  suppliers,
  materials,
  locations,
  projects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: SupplierRow[];
  materials: MaterialRow[];
  locations: StockLocationRow[];
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [scope, setScope] = useState<"COMPANY" | "PROJECT">("COMPANY");
  const [projectId, setProjectId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [saving, setSaving] = useState(false);

  // Filter locations by scope
  const availableLocations = locations.filter((l) =>
    scope === "COMPANY" ? l.type === "COMPANY_WAREHOUSE" : l.type === "PROJECT_SITE",
  );
  // For PROJECT scope, further filter by selected project
  const projectLocations =
    scope === "PROJECT" && projectId
      ? availableLocations.filter((l) => l.projectId === projectId)
      : availableLocations;

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, newLine()]);
  }
  function removeLine(key: string) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }

  // Compute totals
  const computed = lines.reduce(
    (acc, l) => {
      const qty = Number(l.qtyOrdered) || 0;
      const cost = Number(l.unitCost) || 0;
      const gst = Number(l.gstRate) || 0;
      const sub = qty * cost;
      acc.subtotal += sub;
      acc.gst += (sub * gst) / 100;
      return acc;
    },
    { subtotal: 0, gst: 0 },
  );
  const total = computed.subtotal + computed.gst;

  function onScopeChange(s: "COMPANY" | "PROJECT") {
    setScope(s);
    setLocationId("");
    setProjectId("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) return toast.error("Select a supplier");
    if (!locationId) return toast.error("Select a destination location");
    if (scope === "PROJECT" && !projectId) return toast.error("Select a project for PROJECT-scope PO");

    const validLines = lines.filter((l) => l.materialId && Number(l.qtyOrdered) > 0);
    if (validLines.length === 0) return toast.error("Add at least one line item with a material and quantity");

    setSaving(true);
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          procurementScope: scope,
          projectId: scope === "PROJECT" ? projectId : null,
          destinationLocationId: locationId,
          expectedDate: expectedDate || null,
          notes: notes.trim() || null,
          lines: validLines.map((l) => ({
            materialId: l.materialId,
            qtyOrdered: Number(l.qtyOrdered),
            unitCost: Number(l.unitCost) || 0,
            gstRate: Number(l.gstRate) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create PO");
      toast.success(`PO ${data.poNumber} created`);
      onOpenChange(false);
      // Reset form
      setSupplierId(""); setLocationId(""); setProjectId(""); setExpectedDate(""); setNotes("");
      setLines([newLine()]);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Purchase Order"
      description="Create a PO with COMPANY or PROJECT scope. COMPANY → company warehouse; PROJECT → project site."
      className="max-w-3xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {/* Header fields */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier" required>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
              <option value="" disabled>Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Procurement Scope" required>
            <Select value={scope} onChange={(e) => onScopeChange(e.target.value as "COMPANY" | "PROJECT")}>
              <option value="COMPANY">Company (central warehouse)</option>
              <option value="PROJECT">Project (direct to site)</option>
            </Select>
          </Field>
          {scope === "PROJECT" && (
            <Field label="Project" required>
              <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setLocationId(""); }} required>
                <option value="" disabled>Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Destination Location" required>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
              <option value="" disabled>Select location…</option>
              {projectLocations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Expected Date">
            <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </Field>
        </div>

        {/* Line items */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Line Items</Label>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4" /> Add line
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.key} className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[1fr_90px_110px_80px_36px]">
                <Select value={l.materialId} onChange={(e) => updateLine(l.key, { materialId: e.target.value })}>
                  <option value="" disabled>Material…</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                  ))}
                </Select>
                <Input type="number" step="0.001" min="0" placeholder="Qty" value={l.qtyOrdered} onChange={(e) => updateLine(l.key, { qtyOrdered: e.target.value })} />
                <Input type="number" step="0.01" min="0" placeholder="Unit cost" value={l.unitCost} onChange={(e) => updateLine(l.key, { unitCost: e.target.value })} />
                <Input type="number" step="0.01" min="0" max="100" placeholder="GST%" value={l.gstRate} onChange={(e) => updateLine(l.key, { gstRate: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(l.key)} disabled={lines.length === 1} className="text-muted-foreground hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="flex justify-end gap-6 rounded-md bg-muted/40 px-4 py-2 text-body">
          <span className="tnum">Subtotal: <strong>{formatCurrency(computed.subtotal)}</strong></span>
          <span className="tnum">GST: <strong>{formatCurrency(computed.gst)}</strong></span>
          <span className="tnum">Total: <strong>{formatCurrency(total)}</strong></span>
        </div>

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional PO notes" />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create PO"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
