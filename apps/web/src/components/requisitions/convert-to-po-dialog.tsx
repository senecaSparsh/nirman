"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { RequisitionDetail } from "@/lib/types";

type SupplierOption = { id: string; name: string };
type LocationOption = {
  id: string;
  name: string;
  type: "COMPANY_WAREHOUSE" | "PROJECT_SITE";
  projectId: string | null;
};

export function ConvertToPoDialog({
  open,
  onOpenChange,
  requisition,
  suppliers,
  locations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requisition: RequisitionDetail | null;
  suppliers: SupplierOption[];
  locations: LocationOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [scope, setScope] = useState<"COMPANY" | "PROJECT">("PROJECT");
  const [locationId, setLocationId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lineCosts, setLineCosts] = useState<Record<string, string>>({});

  // Filter locations by scope
  const availableLocations = locations.filter((l) =>
    scope === "COMPANY" ? l.type === "COMPANY_WAREHOUSE" : l.type === "PROJECT_SITE",
  );

  function onScopeChange(s: "COMPANY" | "PROJECT") {
    setScope(s);
    setLocationId("");
  }

  // Compute line totals + grand total
  const lineTotals = requisition
    ? requisition.lines.map((l) => {
        const cost = Number(lineCosts[l.materialId] ?? 0);
        return { ...l, lineTotal: l.qtyRequested * cost };
      })
    : [];
  const grandTotal = lineTotals.reduce((s, l) => s + l.lineTotal, 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requisition) return;
    if (!supplierId) return toast.error("Select a supplier");
    if (!locationId) return toast.error("Select a destination location");

    const costs: Record<string, number> = {};
    for (const line of requisition.lines) {
      const cost = Number(lineCosts[line.materialId] ?? 0);
      if (cost <= 0) return toast.error(`Enter unit cost for ${line.materialName}`);
      costs[line.materialId] = cost;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/requisitions/${requisition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "convert",
          supplierId,
          procurementScope: scope,
          destinationLocationId: locationId,
          lineCosts: costs,
          expectedDate: expectedDate || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to convert requisition");
      toast.success(`PO ${data.poNumber} created from ${requisition.reqNumber}`);
      onOpenChange(false);
      // Reset form
      setSupplierId(""); setLocationId(""); setExpectedDate(""); setNotes("");
      setLineCosts({});
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!requisition) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Convert Requisition to PO"
      description={`${requisition.reqNumber} · ${requisition.projectName}${requisition.phaseName ? ` · ${requisition.phaseName}` : ""}`}
      className="max-w-3xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {/* Header fields */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Supplier *</Label>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
              <option value="" disabled>Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Procurement Scope</Label>
            <Select value={scope} onChange={(e) => onScopeChange(e.target.value as "COMPANY" | "PROJECT")}>
              <option value="PROJECT">Project (direct to site)</option>
              <option value="COMPANY">Company (central warehouse)</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Destination Location *</Label>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
              <option value="" disabled>Select location…</option>
              {availableLocations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Expected Date</Label>
            <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </div>
        </div>

        {/* Line items with unit cost inputs */}
        <div className="space-y-2">
          <Label>Line Costs</Label>
          <div className="rounded-md border">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Material</TH>
                  <TH className="text-right">Qty Requested</TH>
                  <TH className="text-right">Unit Cost</TH>
                  <TH className="text-right">Line Total</TH>
                </TR>
              </THead>
              <TBody>
                {requisition.lines.map((l) => {
                  const cost = Number(lineCosts[l.materialId] ?? 0);
                  const lineTotal = l.qtyRequested * cost;
                  return (
                    <TR key={l.id}>
                      <TD>
                        <div className="font-medium">{l.materialName}</div>
                        <div className="font-mono text-caption text-muted-foreground">{l.materialCode}</div>
                      </TD>
                      <TD className="text-right tnum">{formatNumber(l.qtyRequested, 3)} {l.unit}</TD>
                      <TD className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={lineCosts[l.materialId] ?? ""}
                          onChange={(e) => setLineCosts((c) => ({ ...c, [l.materialId]: e.target.value }))}
                          className="ml-auto w-28 text-right"
                          required
                        />
                      </TD>
                      <TD className="text-right font-medium tnum">{formatCurrency(lineTotal)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
          <div className="flex justify-end gap-4 text-body">
            <span className="text-base tnum">Grand Total: <strong>{formatCurrency(grandTotal)}</strong></span>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="c-notes">Notes</Label>
          <Textarea
            id="c-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Converting…" : "Convert to PO"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
