"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { EditableGrid, type EditableColumn } from "@/components/ui/editable-grid";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { LocationFormDialog } from "@/components/materials/location-form-dialog";
import { formatNumber } from "@/lib/utils";
import type { AvailableStockRow, ProjectOption, StockLocationRow } from "@/lib/types";

type Line = { key: string; materialId: string; materialName: string; availableQty: number; unit: string; qty: string };

let lineKey = 0;
function newLine(): Line {
  return { key: `t${++lineKey}`, materialId: "", materialName: "", availableQty: 0, unit: "", qty: "" };
}

export function TransferFormDialog({
  open,
  onOpenChange,
  locations,
  projects,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: StockLocationRow[];
  projects: ProjectOption[];
  /** Pre-fill fields (e.g. { fromLocationId: "abc" } when scoped to a location node). */
  defaults?: { fromLocationId?: string };
}) {
  const router = useRouter();
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [freight, setFreight] = useState("");
  const [handlingFee, setHandlingFee] = useState("");
  const [markupPct, setMarkupPct] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState<AvailableStockRow[]>([]);
  // Local copy so a freshly created location appears in both dropdowns without
  // waiting for router.refresh.
  const [localLocations, setLocalLocations] = useState<StockLocationRow[]>(locations);
  useEffect(() => { setLocalLocations(locations); }, [locations]);

  // Apply defaults when the dialog opens
  useEffect(() => {
    if (open && defaults?.fromLocationId) setFromLocationId(defaults.fromLocationId);
  }, [open, defaults]);

  // Fetch available stock when source location changes
  useEffect(() => {
    if (!fromLocationId) {
      setAvailable([]);
      return;
    }
    fetch(`/api/stock/available?locationId=${fromLocationId}`)
      .then((r) => r.json())
      .then((data) => setAvailable(Array.isArray(data) ? data : []))
      .catch((err) => { console.error("Failed to load available stock:", err); setAvailable([]); });
  }, [fromLocationId]);

  const otherLocations = localLocations.filter((l) => l.id !== fromLocationId);

  // Build material options from available stock
  const stockOptions = useMemo(
    () => available.map((a) => ({ value: a.materialId, label: `${a.materialName} (${a.qty} ${a.unit} avail)` })),
    [available],
  );

  const transferColumns: EditableColumn<Line>[] = useMemo(() => [
    {
      key: "materialId",
      label: "Material",
      type: "select",
      options: stockOptions,
      placeholder: "Select…",
      width: "1fr",
    },
    {
      key: "availableQty",
      label: "Available",
      type: "readonly",
      align: "right",
      width: "90px",
      format: (v) => v ? formatNumber(Number(v), 3) : "—",
    },
    {
      key: "unit",
      label: "Unit",
      type: "readonly",
      width: "60px",
    },
    {
      key: "qty",
      label: "Qty to Transfer",
      type: "number",
      align: "right",
      step: "0.001",
      min: 0,
      placeholder: "0",
      width: "120px",
      format: (v) => v ? formatNumber(Number(v), 3) : "",
    },
  ], [stockOptions]);

  // Sync materialName + availableQty + unit when materialId changes
  function handleLinesChange(newLines: Line[]) {
    const synced = newLines.map((l) => {
      if (l.materialId) {
        const stock = available.find((a) => a.materialId === l.materialId);
        if (stock) return { ...l, materialName: stock.materialName, availableQty: stock.qty, unit: stock.unit };
      }
      return l;
    });
    setLines(synced);
  }

  // Group locations by company for the dropdowns. Source stays the current
  // company; destinations span the whole company group (siblings/children/parent)
  // so inter-company Stock Transfer Orders (STOs) are reachable from the UI.
  const fromLocations = localLocations; // source = current company (first in list)
  const fromLocation = localLocations.find((l) => l.id === fromLocationId);
  const toLocation = localLocations.find((l) => l.id === toLocationId);
  const isInterCompany = !!fromLocation && !!toLocation && fromLocation.companyId !== toLocation.companyId;

  // Build <optgroup> per company, preserving the order locations arrive in.
  const groupByCompany = (locs: typeof localLocations) => {
    const groups = new Map<string, { companyName: string; items: typeof localLocations }>();
    for (const l of locs) {
      const g = groups.get(l.companyId) ?? { companyName: l.companyName, items: [] };
      g.items.push(l);
      groups.set(l.companyId, g);
    }
    return [...groups.values()];
  };

  // Convert grouped locations into the SelectWithCreate `groups` shape.
  const locTypeTag = (l: StockLocationRow) => l.type === "COMPANY_WAREHOUSE" ? "WH" : l.type === "DEPARTMENT" ? "Dept" : "Site";
  const fromGroups = groupByCompany(fromLocations).map((g) => ({
    label: g.companyName,
    options: g.items.map((l) => ({ value: l.id, label: `${l.name} (${locTypeTag(l)})` })),
  }));
  const toGroups = groupByCompany(otherLocations).map((g) => ({
    label: g.companyName,
    options: g.items.map((l) => ({ value: l.id, label: `${l.name} (${locTypeTag(l)})` })),
  }));

  function addLine() {
    setLines((ls) => [...ls, newLine()]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromLocationId) return toast.error("Select a source location");
    if (!toLocationId) return toast.error("Select a destination location");
    if (fromLocationId === toLocationId) return toast.error("Source and destination must differ");
    const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0);
    if (validLines.length === 0) return toast.error("Add at least one line item");

    // Validate stock availability client-side
    for (const l of validLines) {
      const stock = available.find((a) => a.materialId === l.materialId);
      if (!stock) return toast.error("Selected material not in stock at source");
      if (Number(l.qty) > stock.qty) {
        return toast.error(`Cannot transfer ${l.qty} — only ${stock.qty} ${stock.unit} available`);
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromLocationId,
          toLocationId,
          notes: notes.trim() || null,
          freight: freight.trim() === "" ? undefined : Number(freight),
          handlingFee: handlingFee.trim() === "" ? undefined : Number(handlingFee),
          markupPct: markupPct.trim() === "" ? undefined : Number(markupPct),
          lines: validLines.map((l) => ({ materialId: l.materialId, qty: Number(l.qty) })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create transfer");
      toast.success("Transfer created (DRAFT). Complete it to move stock.");
      onOpenChange(false);
      setFromLocationId(""); setToLocationId(""); setNotes(""); setFreight(""); setHandlingFee(""); setMarkupPct(""); setLines([newLine()]);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Stock Transfer"
      description="Move materials between locations. Created as DRAFT — complete it to atomically move stock."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From Location" required>
            <SelectWithCreate
              value={fromLocationId}
              onChange={(v) => { setFromLocationId(v); setLines([newLine()]); }}
              required
              placeholder="Select source…"
              createLabel="location"
              groups={fromGroups}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <LocationFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalLocations((p) => [...p, { ...({} as StockLocationRow), id: e.id, name: e.label ?? "", type: "COMPANY_WAREHOUSE", companyId: "", companyName: "" }]); onCreated(e); }} projects={projects} location={null} />
              )}
            />
          </Field>
          <Field label="To Location" required>
            <SelectWithCreate
              value={toLocationId}
              onChange={setToLocationId}
              required
              disabled={!fromLocationId}
              placeholder="Select destination…"
              createLabel="location"
              groups={toGroups}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <LocationFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalLocations((p) => [...p, { ...({} as StockLocationRow), id: e.id, name: e.label ?? "", type: "COMPANY_WAREHOUSE", companyId: "", companyName: "" }]); onCreated(e); }} projects={projects} location={null} />
              )}
            />
          </Field>
        </div>

        {isInterCompany && (
          <div className="rounded-md border border-brand/40 bg-brand/5 p-2 text-meta text-foreground">
            Inter-company Stock Transfer Order — destination receives at a Transfer Price
            (source MAC + freight + handling + markup%), not the bare source cost.
          </div>
        )}

        {/* Inter-company STO fields — only meaningful for cross-company transfers. */}
        <div className={`rounded-md border border-dashed border-border/60 p-3 ${isInterCompany ? "" : "opacity-60"}`}>
          <p className="text-meta text-muted-foreground mb-2">
            Inter-company STO costs {isInterCompany ? "(applied — destination company is charged the transfer price)" : "(ignored for intra-company transfers)"}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Freight (₹)">
              <Input type="number" step="0.01" min="0" value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="0" disabled={!isInterCompany} />
            </Field>
            <Field label="Handling Fee (₹)">
              <Input type="number" step="0.01" min="0" value={handlingFee} onChange={(e) => setHandlingFee(e.target.value)} placeholder="0" disabled={!isInterCompany} />
            </Field>
            <Field label="Markup (%)">
              <Input type="number" step="0.01" min="0" max="100" value={markupPct} onChange={(e) => setMarkupPct(e.target.value)} placeholder="0" disabled={!isInterCompany} />
            </Field>
          </div>
        </div>

        {fromLocationId && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Materials</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4" /> Add line
              </Button>
            </div>
            {available.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-body text-muted-foreground">
                No stock at this location.
              </p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <EditableGrid
                  rows={lines}
                  onChange={handleLinesChange}
                  columns={transferColumns}
                  getRowId={(r) => r.key}
                  sumColumns={["qty"]}
                  className="max-h-[40vh]"
                />
              </div>
            )}
          </div>
        )}

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional transfer notes" />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving || !fromLocationId}>{saving ? "Creating…" : "Create transfer"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
