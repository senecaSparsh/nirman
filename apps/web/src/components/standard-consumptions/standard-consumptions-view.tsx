"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Ruler, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { formatNumber } from "@/lib/utils";

type MaterialOption = { id: string; code: string; name: string; unit: string };

type BenchmarkRow = {
  id: string;
  workType: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  standardQty: number;
  baseQty: number;
  unitOfMeasure: string;
  notes: string | null;
};

export function StandardConsumptionsView({
  benchmarks,
  materials,
  permissions,
}: {
  benchmarks: BenchmarkRow[];
  materials: MaterialOption[];
  permissions?: { canManage?: boolean };
}) {
  const canManage = permissions?.canManage ?? false;
  const [workTypeFilter, setWorkTypeFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BenchmarkRow | null>(null);
  const [delTarget, setDelTarget] = useState<BenchmarkRow | null>(null);
  const router = useRouter();

  const workTypes = useMemo(
    () => [...new Set(benchmarks.map((b) => b.workType))].sort(),
    [benchmarks],
  );

  const filtered = benchmarks.filter((b) => !workTypeFilter || b.workType === workTypeFilter);

  // Group by work type
  const grouped = useMemo(() => {
    const map = new Map<string, BenchmarkRow[]>();
    for (const b of filtered) {
      const arr = map.get(b.workType) ?? [];
      arr.push(b);
      map.set(b.workType, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Select value={workTypeFilter} onChange={(e) => setWorkTypeFilter(e.target.value)} className="w-auto">
          <option value="">All work types</option>
          {workTypes.map((w) => <option key={w} value={w}>{w}</option>)}
        </Select>
        {canManage && benchmarks.length > 0 && (
          <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }} disabled={materials.length === 0}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New Benchmark
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Ruler className="h-5 w-5" />}
          title="No consumption benchmarks yet"
          description="Add your first benchmark to start auto-detecting over-consumption during DPR submission."
          action={canManage ? (
            <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }} disabled={materials.length === 0}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New Benchmark
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {grouped.map(([workType, rows]) => (
            <div key={workType} className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-body font-semibold">{workType}</span>
                  <Badge variant="muted" className="text-micro">{rows.length} material{rows.length !== 1 ? "s" : ""}</Badge>
                </div>
              </div>
              <div className="divide-y divide-border">
                {rows.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-body font-medium">{b.materialName}</span>
                        <span className="font-mono text-micro text-muted-foreground">{b.materialCode}</span>
                      </div>
                      {b.notes && <div className="text-caption text-muted-foreground italic">{b.notes}</div>}
                    </div>
                    <div className="text-right">
                      <div className="tnum text-body font-medium">{formatNumber(b.standardQty, 3)} {b.unit}</div>
                      <div className="text-micro text-muted-foreground">per {formatNumber(b.baseQty, 3)} {b.unitOfMeasure.replace(/^per\s+/i, "")}</div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditTarget(b); setFormOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-danger" onClick={() => setDelTarget(b)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <BenchmarkForm
          materials={materials}
          editTarget={editTarget}
          onOpenChange={setFormOpen}
          onSaved={() => { setFormOpen(false); setEditTarget(null); router.refresh(); }}
        />
      )}

      <DeleteConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        endpoint={delTarget ? `/api/standard-consumptions/${delTarget.id}` : ""}
        title="Delete Benchmark"
        description={`Delete the ${delTarget?.workType ?? ""} benchmark for ${delTarget?.materialName ?? ""}?`}
        successMessage="Benchmark deleted"
        errorMessage="Failed to delete benchmark"
      />
    </div>
  );
}

function BenchmarkForm({
  materials,
  editTarget,
  onOpenChange,
  onSaved,
}: {
  materials: MaterialOption[];
  editTarget: BenchmarkRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [workType, setWorkType] = useState(editTarget?.workType ?? "");
  const [materialId, setMaterialId] = useState(editTarget?.materialId ?? "");
  const [standardQty, setStandardQty] = useState(editTarget ? String(editTarget.standardQty) : "");
  const [baseQty, setBaseQty] = useState(editTarget ? String(editTarget.baseQty) : "100");
  const [unitOfMeasure, setUnitOfMeasure] = useState(editTarget?.unitOfMeasure ?? "per 100 sqft");
  const [notes, setNotes] = useState(editTarget?.notes ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!workType.trim()) return toast.error("Work type is required");
    if (!materialId) return toast.error("Select a material");
    if (!standardQty || Number(standardQty) <= 0) return toast.error("Standard qty must be > 0");
    if (!baseQty || Number(baseQty) <= 0) return toast.error("Base qty must be > 0");
    if (!unitOfMeasure.trim()) return toast.error("Unit of measure is required");

    setSaving(true);
    try {
      const url = editTarget ? `/api/standard-consumptions/${editTarget.id}` : "/api/standard-consumptions";
      const method = editTarget ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workType: workType.trim(),
          materialId,
          standardQty,
          baseQty,
          unitOfMeasure: unitOfMeasure.trim(),
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save benchmark");
      toast.success(editTarget ? "Benchmark updated" : "Benchmark created");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={editTarget ? "Edit Benchmark" : "New Consumption Benchmark"}
      description="Define the standard material consumption rate for a type of construction work"
      className="max-w-lg"
    >
      <form onSubmit={save} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Work Type *</Label>
          <Input
            value={workType}
            onChange={(e) => setWorkType(e.target.value)}
            placeholder="e.g. Foundation, Slab Casting, Brickwork, Plastering"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Material *</Label>
          <Select value={materialId} onChange={(e) => setMaterialId(e.target.value)} required>
            <option value="" disabled>Select material…</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name} ({m.unit})</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Standard Qty *</Label>
            <Input
              type="number"
              step="0.001"
              min="0"
              value={standardQty}
              onChange={(e) => setStandardQty(e.target.value)}
              placeholder="e.g. 1.5"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Per (Base Qty) *</Label>
            <Input
              type="number"
              step="0.001"
              min="0"
              value={baseQty}
              onChange={(e) => setBaseQty(e.target.value)}
              placeholder="e.g. 100"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Work Unit *</Label>
            <Input
              value={unitOfMeasure}
              onChange={(e) => setUnitOfMeasure(e.target.value)}
              placeholder="e.g. sqft"
              required
            />
          </div>
        </div>
        <p className="text-caption text-muted-foreground">
          Benchmark: <strong>{standardQty || "?"}</strong> units of material per <strong>{baseQty || "?"} {unitOfMeasure || "unit"}</strong> of work. When a DPR records {baseQty || "?"} {unitOfMeasure || "unit"} of this work type, the standard consumption is {standardQty || "?"} units.
        </p>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional context…" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editTarget ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
