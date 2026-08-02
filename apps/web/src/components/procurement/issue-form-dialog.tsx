"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import type { DepartmentOption, MaterialOption, ProjectOption, StockLocationOption } from "@/lib/types";

type Target = "PROJECT" | "DEPARTMENT";

export function IssueFormDialog({
  open,
  onOpenChange,
  projects,
  locations,
  materials,
  departments,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  locations: StockLocationOption[];
  materials: MaterialOption[];
  departments: DepartmentOption[];
  /** Pre-fill fields (e.g. { projectId: "abc" } when scoped to a project node). */
  defaults?: { projectId?: string; fromLocationId?: string };
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState<Target>("PROJECT");
  const [projectId, setProjectId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<{ id: string; materialId: string; qty: string }[]>([{ id: crypto.randomUUID(), materialId: "", qty: "" }]);

  // Apply defaults when the dialog opens
  useEffect(() => {
    if (open && defaults) {
      if (defaults.projectId) { setProjectId(defaults.projectId); setTarget("PROJECT"); }
      if (defaults.fromLocationId) setFromLocationId(defaults.fromLocationId);
    }
  }, [open, defaults]);

  function addLine() { setLines((ls) => [...ls, { id: crypto.randomUUID(), materialId: "", qty: "" }]); }
  function removeLine(idx: number) { setLines((ls) => ls.filter((_, i) => i !== idx)); }
  function updateLine(idx: number, key: "materialId" | "qty", value: string) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (target === "PROJECT" && !projectId) return toast.error("Select a project");
    if (target === "DEPARTMENT" && !departmentId) return toast.error("Select a department");
    if (!fromLocationId) return toast.error("Select a source location");
    const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0);
    if (validLines.length === 0) return toast.error("Add at least one line");

    setSaving(true);
    try {
      const res = await fetch("/api/issue-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: target === "PROJECT" ? projectId : null,
          departmentId: target === "DEPARTMENT" ? departmentId : null,
          fromLocationId,
          notes: notes.trim() || null,
          lines: validLines.map((l) => ({ materialId: l.materialId, qty: Number(l.qty) })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to issue materials");
      toast.success(target === "PROJECT" ? "Materials issued to project" : "Materials issued to department");
      onOpenChange(false);
      setProjectId(""); setDepartmentId(""); setFromLocationId(""); setNotes("");
      setLines([{ id: crypto.randomUUID(), materialId: "", qty: "" }]);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const targetLabel = target === "PROJECT" ? "Project" : "Cost Center";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={target === "PROJECT" ? "Issue Materials to Project" : "Issue Materials to Cost Center"}
      description={
        target === "PROJECT"
          ? "Materials leave stock at MAC and accumulate as project WIP cost."
          : "Materials leave stock at MAC and are expensed to the department (Operating Expenses)."
      }
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {/* Target toggle — segmented control */}
        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setTarget("PROJECT")}
            className={`rounded px-3 py-1.5 text-body font-medium transition-colors ${
              target === "PROJECT" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Project
          </button>
          <button
            type="button"
            onClick={() => setTarget("DEPARTMENT")}
            className={`rounded px-3 py-1.5 text-body font-medium transition-colors ${
              target === "DEPARTMENT" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Cost Center
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{targetLabel} *</Label>
            {target === "PROJECT" ? (
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Select…</option>
                {projects.filter((p) => p.status !== "ON_HOLD").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            ) : (
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">Select…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
              </Select>
            )}
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
          <Button type="submit" disabled={saving}>{saving ? "Issuing…" : `Issue to ${targetLabel}`}</Button>
        </div>
      </form>
    </Dialog>
  );
}
