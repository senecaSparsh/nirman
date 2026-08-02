"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import type { AvailableStockRow, StockLocationRow } from "@/lib/types";

type Line = { key: string; materialId: string; qty: string };

let lineKey = 0;
function newLine(): Line {
  return { key: `t${++lineKey}`, materialId: "", qty: "" };
}

export function TransferFormDialog({
  open,
  onOpenChange,
  locations,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: StockLocationRow[];
  /** Pre-fill fields (e.g. { fromLocationId: "abc" } when scoped to a location node). */
  defaults?: { fromLocationId?: string };
}) {
  const router = useRouter();
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState<AvailableStockRow[]>([]);

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

  const otherLocations = locations.filter((l) => l.id !== fromLocationId);

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, newLine()]);
  }
  function removeLine(key: string) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
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
          lines: validLines.map((l) => ({ materialId: l.materialId, qty: Number(l.qty) })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create transfer");
      toast.success("Transfer created (DRAFT). Complete it to move stock.");
      onOpenChange(false);
      setFromLocationId(""); setToLocationId(""); setNotes(""); setLines([newLine()]);
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
      title="New Stock Transfer"
      description="Move materials between locations. Created as DRAFT — complete it to atomically move stock."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From Location" required>
            <Select value={fromLocationId} onChange={(e) => { setFromLocationId(e.target.value); setLines([newLine()]); }} required>
              <option value="" disabled>Select source…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name} ({l.type === "COMPANY_WAREHOUSE" ? "WH" : "Site"})</option>
              ))}
            </Select>
          </Field>
          <Field label="To Location" required>
            <Select value={toLocationId} onChange={(e) => setToLocationId(e.target.value)} required disabled={!fromLocationId}>
              <option value="" disabled>Select destination…</option>
              {otherLocations.map((l) => (
                <option key={l.id} value={l.id}>{l.name} ({l.type === "COMPANY_WAREHOUSE" ? "WH" : "Site"})</option>
              ))}
            </Select>
          </Field>
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
              <div className="space-y-2">
                {lines.map((l) => {
                  const stock = available.find((a) => a.materialId === l.materialId);
                  return (
                    <div key={l.key} className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[1fr_100px_36px]">
                      <Select value={l.materialId} onChange={(e) => updateLine(l.key, { materialId: e.target.value })}>
                        <option value="" disabled>Material…</option>
                        {available.map((a) => (
                          <option key={a.materialId} value={a.materialId}>
                            {a.materialName} ({a.qty} {a.unit} avail)
                          </option>
                        ))}
                      </Select>
                      <Input type="number" step="0.001" min="0" max={stock?.qty} placeholder="Qty" value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(l.key)} disabled={lines.length === 1} className="text-muted-foreground hover:text-danger">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
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
