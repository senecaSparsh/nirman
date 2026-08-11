"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, X, CheckCircle2, Repeat, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableMaterialPicker } from "@/components/mobile/searchable-material-picker";
import { PhotoUploader } from "@/components/ui/photo-uploader";
import { useDrafts } from "@/lib/offline/use-drafts";
import { DraftBanner } from "@/components/mobile/draft-banner";
import { formatRelativeTime } from "@/lib/utils";

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

type YesterdayDpr = {
  workSummary: string;
  weather: string | null;
  materialLines: { materialId: string; qty: number; unitCost: number }[];
  laborLines: { employeeId: string | null; crewId: string | null; hoursWorked: number; taskDescription: string }[];
};

export function MobileDprForm({
  projects,
  employees,
  crews,
  materials,
  existingDprsByProject,
  yesterdayDprsByProject,
}: {
  projects: { id: string; name: string }[];
  employees: { id: string; name: string; trade: string | null }[];
  crews: { id: string; name: string }[];
  materials: { id: string; name: string; unit: string | null }[];
  existingDprsByProject: Record<string, ExistingDpr>;
  yesterdayDprsByProject: Record<string, YesterdayDpr>;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().split("T")[0] ?? "";
  const [fProject, setFProject] = useState("");
  const [fDate, setFDate] = useState(today);
  const [fWorkType, setFWorkType] = useState("Foundation");
  const [fWeather, setFWeather] = useState("");
  const [fWorkSummary, setFWorkSummary] = useState("");
  const [fProgress, setFProgress] = useState("");
  const [fBlockers, setFBlockers] = useState("");
  const [fTomorrow, setFTomorrow] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fPhotos, setFPhotos] = useState<{ url: string; fileName?: string }[]>([]);
  const [editingDprId, setEditingDprId] = useState<string | null>(null);

  const [materialLines, setMaterialLines] = useState<MaterialLine[]>([]);
  const [laborLines, setLaborLines] = useState<LaborLine[]>([]);

  // ── Draft auto-save ──────────────────────────────────────────
  type DprDraft = {
    fProject: string;
    fDate: string;
    fWorkType: string;
    fWeather: string;
    fWorkSummary: string;
    fProgress: string;
    fBlockers: string;
    fTomorrow: string;
    fNotes: string;
    fPhotos: { url: string; fileName?: string }[];
    materialLines: MaterialLine[];
    laborLines: LaborLine[];
  };

  const draftKey = `dpr:${fDate}`;
  const { draft, hasDraft, draftUpdatedAt, saveStatus, saveDraft, clearDraft } = useDrafts<DprDraft>("dpr", draftKey);

  // Auto-save form state (debounced via the hook's internal timer)
  useEffect(() => {
    const hasChanges =
      fProject !== "" ||
      fWorkSummary !== "" ||
      fWeather !== "" ||
      fBlockers !== "" ||
      fTomorrow !== "" ||
      fNotes !== "" ||
      materialLines.some((l) => l.materialId && l.qty) ||
      laborLines.some((l) => (l.employeeId || l.crewId) && l.hoursWorked && l.taskDescription) ||
      fPhotos.length > 0;
    if (hasChanges && !editingDprId) {
      saveDraft({
        fProject, fDate, fWorkType, fWeather, fWorkSummary, fProgress,
        fBlockers, fTomorrow, fNotes, fPhotos, materialLines, laborLines,
      });
    }
  }, [fProject, fDate, fWorkType, fWeather, fWorkSummary, fProgress, fBlockers, fTomorrow, fNotes, fPhotos, materialLines, laborLines, editingDprId, saveDraft]);

  function restoreDraft() {
    if (!draft) return;
    if (draft.fProject) setFProject(draft.fProject);
    if (draft.fDate) setFDate(draft.fDate);
    if (draft.fWorkType) setFWorkType(draft.fWorkType);
    if (draft.fWeather !== undefined) setFWeather(draft.fWeather);
    if (draft.fWorkSummary) setFWorkSummary(draft.fWorkSummary);
    if (draft.fProgress !== undefined) setFProgress(draft.fProgress);
    if (draft.fBlockers !== undefined) setFBlockers(draft.fBlockers);
    if (draft.fTomorrow !== undefined) setFTomorrow(draft.fTomorrow);
    if (draft.fNotes !== undefined) setFNotes(draft.fNotes);
    if (draft.fPhotos) setFPhotos(draft.fPhotos);
    if (draft.materialLines) setMaterialLines(draft.materialLines);
    if (draft.laborLines) setLaborLines(draft.laborLines);
    toast.success("Draft restored");
  }

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

  // ── Repeat yesterday's DPR lines ──────────────────────────────
  const hasYesterdayData = fProject && yesterdayDprsByProject[fProject];
  const yesterdayDpr = hasYesterdayData ? yesterdayDprsByProject[fProject] : null;

  function repeatYesterday() {
    if (!yesterdayDpr) return;
    // Copy material lines
    setMaterialLines(
      yesterdayDpr.materialLines.map((l) => ({
        materialId: l.materialId,
        qty: String(l.qty),
        unitCost: String(l.unitCost),
      })),
    );
    // Copy labor lines
    setLaborLines(
      yesterdayDpr.laborLines.map((l) => ({
        employeeId: l.employeeId ?? "",
        crewId: l.crewId ?? "",
        hoursWorked: String(l.hoursWorked),
        taskDescription: l.taskDescription,
      })),
    );
    // Copy work summary + weather as starting point
    if (!fWorkSummary) setFWorkSummary(yesterdayDpr.workSummary);
    if (!fWeather && yesterdayDpr.weather) setFWeather(yesterdayDpr.weather);
    toast.success(`Copied ${yesterdayDpr.materialLines.length} material + ${yesterdayDpr.laborLines.length} labour lines from yesterday`);
  }

  // ── Quick-select material chips ───────────────────────────────
  // Show materials that were used in yesterday's DPR (for the selected
  // project) as quick-add chips. Clicking a chip adds a pre-filled
  // material line with that material.
  const quickSelectMaterials = useMemo(() => {
    if (!yesterdayDpr) return [];
    return yesterdayDpr.materialLines.map((l) => {
      const mat = materials.find((m) => m.id === l.materialId);
      return {
        materialId: l.materialId,
        name: mat?.name ?? "Unknown",
        unit: mat?.unit ?? "",
        qty: String(l.qty),
        unitCost: String(l.unitCost),
      };
    });
  }, [yesterdayDpr, materials]);

  function quickAddMaterial(materialId: string, qty: string, unitCost: string) {
    setMaterialLines((prev) => [...prev, { materialId, qty, unitCost }]);
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
          photoUrls: fPhotos.map((p) => p.url),
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
      clearDraft();
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

      {/* ── Draft restoration banner ─────────────────────────── */}
      {hasDraft && !editingDprId && (
        <DraftBanner
          formName="DPR"
          updatedAt={draftUpdatedAt}
          onRestore={restoreDraft}
          onDiscard={clearDraft}
        />
      )}

      {/* ── Auto-save status indicator ─────────────────────────── */}
      {!editingDprId && saveStatus !== "idle" && (
        <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
          {saveStatus === "saving" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Saving draft…</span>
            </>
          )}
          {saveStatus === "saved" && (
            <>
              <CheckCircle2 className="h-3 w-3 text-success" />
              <span>Draft saved {draftUpdatedAt ? formatRelativeTime(new Date(draftUpdatedAt)) : ""}</span>
            </>
          )}
          {saveStatus === "unsaved" && (
            <>
              <div className="h-2 w-2 rounded-full bg-warning" />
              <span>Unsaved changes</span>
            </>
          )}
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
          <Label>Work Type *</Label>
          <Select value={fWorkType} onChange={(e) => setFWorkType(e.target.value)}>
            <option value="Foundation">Foundation &amp; Substructure</option>
            <option value="Structure">RCC Structural Concrete</option>
            <option value="Masonry">Brickwork &amp; Masonry</option>
            <option value="Finishing">Plaster, Tile &amp; Finishing</option>
            <option value="Plumbing">Plumbing &amp; MEP</option>
            <option value="Electrical">Electrical Works</option>
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
          <div className="flex items-center gap-2">
            {yesterdayDpr && !editingDprId && (
              <Button size="sm" variant="outline" onClick={repeatYesterday}>
                <Repeat className="mr-1 h-3.5 w-3.5" /> Repeat yesterday
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={addMaterialLine}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </div>

        {/* Quick-select chips from yesterday's materials */}
        {quickSelectMaterials.length > 0 && !editingDprId && materialLines.length === 0 && (
          <div className="rounded-lg border border-brand/20 bg-brand/5 p-2.5 space-y-2">
            <div className="flex items-center gap-1.5 text-meta text-brand">
              <Zap className="h-3 w-3" />
              <span className="font-medium">Quick add from yesterday</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {quickSelectMaterials.map((m) => (
                <button
                  key={m.materialId}
                  onClick={() => quickAddMaterial(m.materialId, m.qty, m.unitCost)}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-caption text-foreground active:scale-95 transition-transform"
                >
                  + {m.name} ({m.qty} {m.unit})
                </button>
              ))}
            </div>
          </div>
        )}
        {materialLines.map((l, idx) => (
          <div key={idx} className="rounded-md border border-border p-2 space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="muted">#{idx + 1}</Badge>
              <Button size="sm" variant="ghost" onClick={() => removeMaterialLine(idx)}>
                <X className="h-3 w-3 text-danger" />
              </Button>
            </div>
            <SearchableMaterialPicker
              materials={materials}
              value={l.materialId}
              onChange={(id) => setMaterialLines(materialLines.map((m, i) => i === idx ? { ...m, materialId: id } : m))}
            />
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

      <div>
        <Label>Site Photos</Label>
        <PhotoUploader photos={fPhotos} onChange={setFPhotos} maxPhotos={8} label="Add Site Photo" />
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
