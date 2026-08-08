"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type MaterialLine = { materialId: string; qty: string; unitCost: string };
type LaborLine = { employeeId: string; crewId: string; hoursWorked: string; taskDescription: string };

type ExistingDpr = {
  id: string;
  projectId: string;
  date: string;
  weather: string | null;
  workSummary: string;
  progressPct: number;
  blockers: string | null;
  tomorrowPlan: string | null;
  notes: string | null;
  materialLines: { materialId: string; qty: number; unitCost: number }[];
  laborLines: { employeeId: string | null; crewId: string | null; hoursWorked: number; taskDescription: string }[];
};

export function MobileDprForm({
  projects,
  employees,
  crews,
  materials,
  existingDprsByProject,
}: {
  projects: { id: string; name: string }[];
  employees: { id: string; name: string; trade: string | null }[];
  crews: { id: string; name: string }[];
  materials: { id: string; name: string; unit: string | null }[];
  existingDprsByProject: Record<string, ExistingDpr>;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const [fProject, setFProject] = useState("");
  const [fDate, setFDate] = useState(today);
  const [fWeather, setFWeather] = useState("");
  const [fWorkSummary, setFWorkSummary] = useState("");
  const [fProgress, setFProgress] = useState("");
  const [fBlockers, setFBlockers] = useState("");
  const [fTomorrow, setFTomorrow] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [editingDprId, setEditingDprId] = useState<string | null>(null);

  const [materialLines, setMaterialLines] = useState<MaterialLine[]>([]);
  const [laborLines, setLaborLines] = useState<LaborLine[]>([]);

  // When the user picks a project, load that project's DPR for today if
  // one already exists (edit mode); otherwise blank the form (create mode).
  function onProjectChange(projectId: string) {
    setFProject(projectId);
    const existing = projectId ? existingDprsByProject[projectId] : undefined;
    if (existing) {
      setEditingDprId(existing.id);
      setFDate(existing.date);
      setFWeather(existing.weather ?? "");
      setFWorkSummary(existing.workSummary);
      setFProgress(String(existing.progressPct));
      setFBlockers(existing.blockers ?? "");
      setFTomorrow(existing.tomorrowPlan ?? "");
      setFNotes(existing.notes ?? "");
      setMaterialLines(
        existing.materialLines.map((l) => ({
          materialId: l.materialId,
          qty: String(l.qty),
          unitCost: String(l.unitCost),
        })),
      );
      setLaborLines(
        existing.laborLines.map((l) => ({
          employeeId: l.employeeId ?? "",
          crewId: l.crewId ?? "",
          hoursWorked: String(l.hoursWorked),
          taskDescription: l.taskDescription,
        })),
      );
    } else {
      setEditingDprId(null);
      setFDate(today);
      setFWeather("");
      setFWorkSummary("");
      setFProgress("");
      setFBlockers("");
      setFTomorrow("");
      setFNotes("");
      setMaterialLines([]);
      setLaborLines([]);
    }
  }

  function addMaterialLine() {
    setMaterialLines([...materialLines, { materialId: "", qty: "", unitCost: "0" }]);
  }
  function removeMaterialLine(idx: number) {
    setMaterialLines(materialLines.filter((_, i) => i !== idx));
  }
  function addLaborLine() {
    setLaborLines([...laborLines, { employeeId: "", crewId: "", hoursWorked: "", taskDescription: "" }]);
  }
  function removeLaborLine(idx: number) {
    setLaborLines(laborLines.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (!fProject) return toast.error("Select a project");
    if (!fWorkSummary.trim()) return toast.error("Work summary is required");

    setSubmitting(true);
    try {
      const res = await fetch("/api/dprs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: fProject,
          date: fDate,
          weather: fWeather || null,
          workSummary: fWorkSummary,
          progressPct: fProgress ? Number(fProgress) : null,
          blockers: fBlockers || null,
          tomorrowPlan: fTomorrow || null,
          notes: fNotes || null,
          materialLines: materialLines
            .filter((l) => l.materialId && Number(l.qty) > 0)
            .map((l) => ({
              materialId: l.materialId,
              qty: Number(l.qty),
              unitCost: Number(l.unitCost) || 0,
            })),
          laborLines: laborLines
            .filter((l) => (l.employeeId || l.crewId) && Number(l.hoursWorked) > 0 && l.taskDescription)
            .map((l) => ({
              employeeId: l.employeeId || null,
              crewId: l.crewId || null,
              hoursWorked: Number(l.hoursWorked),
              taskDescription: l.taskDescription,
            })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit DPR");
      toast.success(editingDprId ? "DPR updated" : "DPR submitted");
      router.push("/m/site");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 px-3 pb-24">
      {editingDprId && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-meta text-success">
          <CheckCircle2 className="h-4 w-4" />
          DPR for {fDate} already exists — editing
        </div>
      )}

      {/* Basic info */}
      <div className="space-y-3">
        <div>
          <Label>Project *</Label>
          <Select value={fProject} onChange={(e) => onProjectChange(e.target.value)}>
            <option value="">Select project…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Date *</Label>
          <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
        </div>
        <div>
          <Label>Weather</Label>
          <Input value={fWeather} onChange={(e) => setFWeather(e.target.value)} placeholder="Sunny, 28°C" />
        </div>
        <div>
          <Label>Work Summary *</Label>
          <Textarea value={fWorkSummary} onChange={(e) => setFWorkSummary(e.target.value)} rows={3} placeholder="What work was done today?" />
        </div>
        <div>
          <Label>Progress %</Label>
          <Input type="number" inputMode="decimal" enterKeyHint="done" min="0" max="100" value={fProgress} onChange={(e) => setFProgress(e.target.value)} placeholder="0-100" />
        </div>
        <div>
          <Label>Blockers</Label>
          <Textarea value={fBlockers} onChange={(e) => setFBlockers(e.target.value)} rows={2} placeholder="Any delays or issues?" />
        </div>
        <div>
          <Label>Tomorrow&apos;s Plan</Label>
          <Textarea value={fTomorrow} onChange={(e) => setFTomorrow(e.target.value)} rows={2} placeholder="What's planned for tomorrow?" />
        </div>
      </div>

      {/* Material lines */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Materials Used</Label>
          <Button size="sm" variant="outline" onClick={addMaterialLine}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        </div>
        {materialLines.map((l, idx) => (
          <div key={idx} className="rounded-md border border-border p-2 space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="muted">#{idx + 1}</Badge>
              <Button size="sm" variant="ghost" onClick={() => removeMaterialLine(idx)}>
                <X className="h-3 w-3 text-danger" />
              </Button>
            </div>
            <Select value={l.materialId} onChange={(e) => setMaterialLines(materialLines.map((m, i) => i === idx ? { ...m, materialId: e.target.value } : m))}>
              <option value="">Material…</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" inputMode="decimal" enterKeyHint="next" placeholder="Qty" value={l.qty} onChange={(e) => setMaterialLines(materialLines.map((m, i) => i === idx ? { ...m, qty: e.target.value } : m))} />
              <Input type="number" inputMode="decimal" enterKeyHint="next" placeholder="Unit cost" value={l.unitCost} onChange={(e) => setMaterialLines(materialLines.map((m, i) => i === idx ? { ...m, unitCost: e.target.value } : m))} />
            </div>
          </div>
        ))}
      </div>

      {/* Labor lines */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Labour Utilised</Label>
          <Button size="sm" variant="outline" onClick={addLaborLine}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        </div>
        {laborLines.map((l, idx) => (
          <div key={idx} className="rounded-md border border-border p-2 space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="muted">#{idx + 1}</Badge>
              <Button size="sm" variant="ghost" onClick={() => removeLaborLine(idx)}>
                <X className="h-3 w-3 text-danger" />
              </Button>
            </div>
            <Select value={l.employeeId} onChange={(e) => setLaborLines(laborLines.map((m, i) => i === idx ? { ...m, employeeId: e.target.value, crewId: e.target.value ? "" : m.crewId } : m))}>
              <option value="">Individual worker…</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name} {emp.trade ? `(${emp.trade})` : ""}</option>)}
            </Select>
            <Select value={l.crewId} onChange={(e) => setLaborLines(laborLines.map((m, i) => i === idx ? { ...m, crewId: e.target.value, employeeId: e.target.value ? "" : m.employeeId } : m))}>
              <option value="">Or crew…</option>
              {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" inputMode="decimal" enterKeyHint="next" placeholder="Hours" value={l.hoursWorked} onChange={(e) => setLaborLines(laborLines.map((m, i) => i === idx ? { ...m, hoursWorked: e.target.value } : m))} />
              <Input placeholder="Task description" value={l.taskDescription} onChange={(e) => setLaborLines(laborLines.map((m, i) => i === idx ? { ...m, taskDescription: e.target.value } : m))} />
            </div>
          </div>
        ))}
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} rows={2} placeholder="Additional notes…" />
      </div>

      {/* Sticky save bar — thumb zone */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md">
        <div className="mx-auto max-w-md">
          <Button className="w-full" size="lg" onClick={submit} disabled={submitting}>
            <ClipboardList className="mr-2 h-4 w-4" />
            {submitting ? "Submitting…" : editingDprId ? "Update DPR" : "Submit DPR"}
          </Button>
        </div>
      </div>
    </div>
  );
}
