"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";

type ProjectOption = { id: string; name: string };
type PhaseOption = { id: string; name: string; projectId: string };
type MaterialOption = { id: string; code: string; name: string; unit: string };

type Line = {
  key: string;
  materialId: string;
  qtyRequested: string;
  notes: string;
};

let lineKey = 0;
function newLine(): Line {
  return { key: `l${++lineKey}`, materialId: "", qtyRequested: "", notes: "" };
}

export function RequisitionFormDialog({
  open,
  onOpenChange,
  projects,
  phases,
  materials,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  phases: PhaseOption[];
  materials: MaterialOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [neededByDate, setNeededByDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);

  const filteredPhases = projectId ? phases.filter((p) => p.projectId === projectId) : [];

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
    if (!projectId) return toast.error("Select a project");
    const validLines = lines.filter((l) => l.materialId && Number(l.qtyRequested) > 0);
    if (validLines.length === 0) return toast.error("Add at least one line item with a material and quantity");

    setSaving(true);
    try {
      const res = await fetch("/api/requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          phaseId: phaseId || null,
          neededByDate: neededByDate || null,
          notes: notes.trim() || null,
          lines: validLines.map((l) => ({
            materialId: l.materialId,
            qtyRequested: Number(l.qtyRequested),
            notes: l.notes.trim() || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create requisition");
      toast.success(`Requisition ${data.reqNumber} created`);
      onOpenChange(false);
      // Reset form
      setProjectId(""); setPhaseId(""); setNeededByDate(""); setNotes("");
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
      title="New Material Requisition"
      description="Request materials for a project. Submit for approval, then convert to a PO."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {/* Header fields */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Project *</Label>
            <Select
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setPhaseId(""); }}
              required
            >
              <option value="" disabled>Select project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Phase</Label>
            <Select
              value={phaseId}
              onChange={(e) => setPhaseId(e.target.value)}
              disabled={filteredPhases.length === 0}
            >
              <option value="">None</option>
              {filteredPhases.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Needed By Date</Label>
            <Input type="date" value={neededByDate} onChange={(e) => setNeededByDate(e.target.value)} />
          </div>
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
              <div key={l.key} className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[1fr_100px_36px]">
                <Select value={l.materialId} onChange={(e) => updateLine(l.key, { materialId: e.target.value })}>
                  <option value="" disabled>Material…</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                  ))}
                </Select>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="Qty"
                  value={l.qtyRequested}
                  onChange={(e) => updateLine(l.key, { qtyRequested: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeLine(l.key)}
                  disabled={lines.length === 1}
                  className="text-muted-foreground hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="r-notes">Notes</Label>
          <Textarea
            id="r-notes"
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
            {saving ? "Creating…" : "Create Requisition"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
