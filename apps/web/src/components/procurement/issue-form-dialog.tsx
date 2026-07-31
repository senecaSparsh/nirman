"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { MaterialOption, ProjectOption, StockLocationOption } from "@/lib/types";

export function IssueFormDialog({
  open,
  onOpenChange,
  projects,
  locations,
  materials,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  locations: StockLocationOption[];
  materials: MaterialOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<{ id: string; materialId: string; qty: string }[]>([{ id: crypto.randomUUID(), materialId: "", qty: "" }]);

  function addLine() { setLines((ls) => [...ls, { id: crypto.randomUUID(), materialId: "", qty: "" }]); }
  function removeLine(idx: number) { setLines((ls) => ls.filter((_, i) => i !== idx)); }
  function updateLine(idx: number, key: "materialId" | "qty", value: string) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return toast.error("Select a project");
    if (!fromLocationId) return toast.error("Select a source location");
    const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0);
    if (validLines.length === 0) return toast.error("Add at least one line");

    setSaving(true);
    try {
      const res = await fetch("/api/issue-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          fromLocationId,
          notes: notes.trim() || null,
          lines: validLines.map((l) => ({ materialId: l.materialId, qty: Number(l.qty) })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to issue materials");
      toast.success("Materials issued to project");
      onOpenChange(false);
      setProjectId("");
      setFromLocationId("");
      setNotes("");
      setLines([{ id: crypto.randomUUID(), materialId: "", qty: "" }]);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Issue Materials to Project" description="Materials leave stock at MAC and accumulate as project WIP cost." className="max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Project *</Label>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select…</option>
              {projects.filter((p) => p.status !== "ON_HOLD").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>From Location *</Label>
            <Select value={fromLocationId} onChange={(e) => setFromLocationId(e.target.value)}>
              <option value="">Select…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Materials</Label>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-3.5 w-3.5" /> Add Line
            </Button>
          </div>
          {lines.map((line, idx) => {
            const mat = materials.find((m) => m.id === line.materialId);
            return (
              <div key={line.id} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-8 space-y-1">
                  <span className="text-caption text-muted-foreground">Material</span>
                  <Select value={line.materialId} onChange={(e) => updateLine(idx, "materialId", e.target.value)}>
                    <option value="">Select…</option>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                  </Select>
                </div>
                <div className="col-span-3 space-y-1">
                  <span className="text-caption text-muted-foreground">Qty {mat ? `(${mat.unit})` : ""}</span>
                  <Input type="number" min={0} step="any" value={line.qty} onChange={(e) => updateLine(idx, "qty", e.target.value)} />
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(idx)} disabled={lines.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Issuing…" : "Issue Materials"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
