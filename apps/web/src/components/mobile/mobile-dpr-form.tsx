"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, CheckCircle2, Repeat, Zap, Loader2, Send, MapPin, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { SearchableMaterialPicker } from "@/components/mobile/searchable-material-picker";
import { PhotoUploader } from "@/components/ui/photo-uploader";
import { useDrafts } from "@/lib/offline/use-drafts";
import { DraftBanner } from "@/components/mobile/draft-banner";
import { formatRelativeTime } from "@/lib/utils";
import { useSmartDefaults } from "@/lib/use-smart-defaults";
import { useNearestProject } from "@/lib/use-nearest-project";

type MaterialLine = { materialId: string; qty: string; unitCost: string };
type LaborLine = { employeeId: string; crewId: string; hoursWorked: string; taskDescription: string };

type ExistingDpr = {
  id: string;
  projectId: string;
  date: string;
  weather: string | null;
  workSummary: string;
  workType: string | null;
  workQty: number | null;
  workUnit: string | null;
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

const inputClass = "w-full h-10 rounded-[0.5rem] border px-3 text-m-section font-medium outline-none";
const inputStyle = {
  borderColor: "var(--color-line)",
  backgroundColor: "var(--color-paper)",
  color: "var(--color-ink-950)",
} as React.CSSProperties;

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-m-caption font-semibold mb-1"
        style={{ color: "var(--color-ink-500)" }}
      >
        {label}
        {required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
      </label>
      {children}
    </div>
  );
}

export function MobileDprForm({
  projects,
  employees,
  crews,
  materials,
  existingDprsByProject,
  yesterdayDprsByProject,
  onClose,
  onCreated,
}: {
  projects: { id: string; name: string }[];
  employees: { id: string; name: string; trade: string | null }[];
  crews: { id: string; name: string }[];
  materials: { id: string; name: string; unit: string | null; standardCost: number }[];
  existingDprsByProject: Record<string, ExistingDpr>;
  yesterdayDprsByProject: Record<string, YesterdayDpr>;
  /** Called when the form is dismissed (modal close). */
  onClose?: () => void;
  /** Called after a DPR is successfully submitted/updated. */
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const { getDefault, recordDefaults } = useSmartDefaults("dpr");
  const { nearestProjectId, nearestProjectName, distanceMeters, loading: gpsLoading, request: requestGps } = useNearestProject();

  const today = new Date().toISOString().split("T")[0] ?? "";
  const [fProject, setFProject] = useState("");
  const [fDate, setFDate] = useState(today);
  const [fWorkType, setFWorkType] = useState(getDefault("workType") ?? "Foundation");
  const [fWorkQty, setFWorkQty] = useState("");
  const [fWorkUnit, setFWorkUnit] = useState("sqft");
  const [fWeather, setFWeather] = useState(getDefault("weather") ?? "");
  const [fWorkSummary, setFWorkSummary] = useState("");
  const [fProgress, setFProgress] = useState("");
  const [fBlockers, setFBlockers] = useState("");
  const [fTomorrow, setFTomorrow] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fPhotos, setFPhotos] = useState<{ url: string; fileName?: string }[]>([]);
  const [editingDprId, setEditingDprId] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  const [materialLines, setMaterialLines] = useState<MaterialLine[]>([]);
  const [laborLines, setLaborLines] = useState<LaborLine[]>([]);

  // ── Draft auto-save ──────────────────────────────────────────
  type DprDraft = {
    fProject: string;
    fDate: string;
    fWorkType: string;
    fWorkQty: string;
    fWorkUnit: string;
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

  // ── Smart defaults: pre-select last-used project if no draft ──
  useEffect(() => {
    if (!fProject && !hasDraft) {
      const lastProject = getDefault("project");
      if (lastProject && projects.some((p) => p.id === lastProject)) {
        setFProject(lastProject);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getDefault, hasDraft, projects]);

  // ── GPS auto-select: when nearest project is found, auto-select it ──
  useEffect(() => {
    if (nearestProjectId && projects.some((p) => p.id === nearestProjectId)) {
      onProjectChange(nearestProjectId);
      haptic(10);
      toast.success(`Auto-selected ${nearestProjectName} (${Math.round(distanceMeters ?? 0)}m away)`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearestProjectId, nearestProjectName, distanceMeters, projects]);

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
        fProject, fDate, fWorkType, fWorkQty, fWorkUnit, fWeather, fWorkSummary, fProgress,
        fBlockers, fTomorrow, fNotes, fPhotos, materialLines, laborLines,
      });
    }
  }, [fProject, fDate, fWorkType, fWorkQty, fWorkUnit, fWeather, fWorkSummary, fProgress, fBlockers, fTomorrow, fNotes, fPhotos, materialLines, laborLines, editingDprId, saveDraft]);

  function restoreDraft() {
    if (!draft) return;
    if (draft.fProject) setFProject(draft.fProject);
    if (draft.fDate) setFDate(draft.fDate);
    if (draft.fWorkType) setFWorkType(draft.fWorkType);
    if (draft.fWorkQty !== undefined) setFWorkQty(draft.fWorkQty);
    if (draft.fWorkUnit !== undefined) setFWorkUnit(draft.fWorkUnit);
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
    haptic(10);
    const existing = projectId ? existingDprsByProject[projectId] : undefined;
    if (existing) {
      setEditingDprId(existing.id);
      setFDate(existing.date);
      setFWeather(existing.weather ?? "");
      setFWorkSummary(existing.workSummary);
      setFWorkType(existing.workType ?? "Foundation");
      setFWorkQty(existing.workQty != null ? String(existing.workQty) : "");
      setFWorkUnit(existing.workUnit ?? "sqft");
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
      setFPhotos([]);
      setMaterialLines([]);
      setLaborLines([]);
    }
  }

  // ── Repeat yesterday's DPR lines ──────────────────────────────
  const hasYesterdayData = fProject && yesterdayDprsByProject[fProject];
  const yesterdayDpr = hasYesterdayData ? yesterdayDprsByProject[fProject] : null;

  function repeatYesterday() {
    if (!yesterdayDpr) return;
    haptic(20);
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
    haptic(10);
    setMaterialLines((prev) => [...prev, { materialId, qty, unitCost }]);
  }

  // ── OCR: extract DPR data from a site photo ──────────────────
  const [ocrLoading, setOcrLoading] = useState(false);

  async function runOcr() {
    if (fPhotos.length === 0) {
      toast.error("Add a site photo first, then tap Scan");
      return;
    }
    setOcrLoading(true);
    haptic(15);
    try {
      // Convert the first photo URL to base64
      const photoUrl = fPhotos[0]!.url;
      let base64: string | undefined;
      if (photoUrl.startsWith("data:")) {
        base64 = photoUrl.split(",")[1];
      } else {
        const res = await fetch(photoUrl);
        const blob = await res.blob();
        const reader = new FileReader();
        base64 = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        base64 = base64.split(",")[1];
      }

      const res = await fetch("/api/ocr/dpr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "OCR failed");
      }
      const data = await res.json();
      const result = data.result;

      // Populate form fields from OCR result
      if (result.workType) setFWorkType(result.workType);
      if (result.workQty != null) setFWorkQty(String(result.workQty));
      if (result.workUnit) setFWorkUnit(result.workUnit);
      if (result.notes) setFNotes(result.notes);
      if (result.progressPercent != null) setFProgress(String(result.progressPercent));

      // Match material lines to known materials by name
      if (result.materials?.length > 0) {
        const matched: MaterialLine[] = [];
        for (const ml of result.materials) {
          const mat = materials.find(
            (m) => m.name.toLowerCase().includes(ml.materialName.toLowerCase()) ||
                   ml.materialName.toLowerCase().includes(m.name.toLowerCase()),
          );
          if (mat) {
            matched.push({
              materialId: mat.id,
              qty: String(ml.quantity),
              unitCost: String(mat.standardCost),
            });
          }
        }
        if (matched.length > 0) {
          setMaterialLines(matched);
          toast.success(`OCR: filled ${matched.length} material lines from photo`);
        }
      }

      // Match labor lines by trade
      if (result.labor?.length > 0) {
        const matched: LaborLine[] = [];
        for (const ll of result.labor) {
          const emp = employees.find((e) => e.trade?.toLowerCase() === ll.trade.toLowerCase());
          matched.push({
            employeeId: emp?.id ?? "",
            crewId: "",
            hoursWorked: "8",
            taskDescription: ll.trade,
          });
        }
        if (matched.length > 0) {
          setLaborLines(matched);
        }
      }

      if (result.materials?.length === 0 && result.labor?.length === 0) {
        toast.info("OCR completed but no lines detected. The photo may need to be clearer.");
      } else {
        haptic(20);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "OCR failed — fill manually");
    } finally {
      setOcrLoading(false);
    }
  }

  function addMaterialLine() {
    haptic(10);
    setMaterialLines([...materialLines, { materialId: "", qty: "", unitCost: "0" }]);
  }
  function removeMaterialLine(idx: number) {
    haptic(10);
    setMaterialLines(materialLines.filter((_, i) => i !== idx));
  }
  function addLaborLine() {
    haptic(10);
    setLaborLines([...laborLines, { employeeId: "", crewId: "", hoursWorked: "", taskDescription: "" }]);
  }
  function removeLaborLine(idx: number) {
    haptic(10);
    setLaborLines(laborLines.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (!fProject) {
      haptic([50, 20, 50]);
      return toast.error("Select a project");
    }
    if (!fWorkSummary.trim()) {
      haptic([50, 20, 50]);
      return toast.error("Work summary is required");
    }

    setSubmitting(true);
    haptic(10);
    try {
      const res = await fetch("/api/dprs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: fProject,
          date: fDate,
          weather: fWeather || null,
          workSummary: fWorkSummary,
          workType: fWorkType || null,
          workQty: fWorkQty ? Number(fWorkQty) : null,
          workUnit: fWorkUnit || null,
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
      haptic([10, 40, 80]);
      toast.success(editingDprId ? "DPR updated" : "DPR submitted");
      // Record smart defaults for next time
      recordDefaults({ project: fProject, workType: fWorkType, weather: fWeather });
      clearDraft();
      onCreated?.();
      router.push("/m/site");
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-32">
      {editingDprId && (
        <div
          className="flex items-center gap-2 rounded-[0.5rem] border p-2.5 text-m-caption font-semibold"
          style={{
            borderColor: "color-mix(in srgb, var(--color-go) 30%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--color-go) 8%, transparent)",
            color: "var(--color-go)",
          }}
        >
          <CheckCircle2 className="size-3.5" />
          DPR for {fDate} already exists — editing
        </div>
      )}

      {/* ── Draft restoration banner ─────────────────────────── */}
      {hasDraft && !editingDprId && !draftRestored && (
        <DraftBanner
          formName="DPR"
          updatedAt={draftUpdatedAt}
          onRestore={() => { restoreDraft(); setDraftRestored(true); }}
          onDiscard={() => { clearDraft(); setDraftRestored(true); }}
        />
      )}

      {/* ── Auto-save status indicator ─────────────────────────── */}
      {!editingDprId && saveStatus !== "idle" && (
        <div className="flex items-center gap-1.5 text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          {saveStatus === "saving" && (
            <>
              <Loader2 className="size-3 animate-spin" />
              <span>Saving draft…</span>
            </>
          )}
          {saveStatus === "saved" && (
            <>
              <CheckCircle2 className="size-3" style={{ color: "var(--color-go)" }} />
              <span>Draft saved {draftUpdatedAt ? formatRelativeTime(new Date(draftUpdatedAt)) : ""}</span>
            </>
          )}
          {saveStatus === "unsaved" && (
            <>
              <div className="size-1.5 rounded-full" style={{ backgroundColor: "var(--color-signal)" }} />
              <span>Unsaved changes</span>
            </>
          )}
        </div>
      )}

      {/* ══════ SECTION: Basic info ══════ */}
      <FormField label="Project" required>
        <div className="flex gap-1.5">
          <select value={fProject} onChange={(e) => onProjectChange(e.target.value)} className={`${inputClass} flex-1`} style={inputStyle}>
            <option value="">Select project…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            type="button"
            onClick={requestGps}
            disabled={gpsLoading}
            className="shrink-0 rounded-[0.375rem] border px-2 py-1 text-m-caption font-bold text-m-body press disabled:opacity-50"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
            title="Use my location to auto-select project"
          >
            {gpsLoading ? <Loader2 className="size-3 animate-spin" /> : <MapPin className="size-3" />}
          </button>
        </div>
      </FormField>

      <FormField label="Work type" required>
        <select value={fWorkType} onChange={(e) => setFWorkType(e.target.value)} className={inputClass} style={inputStyle}>
          <option value="Foundation">Foundation &amp; Substructure</option>
          <option value="Structure">RCC Structural Concrete</option>
          <option value="Masonry">Brickwork &amp; Masonry</option>
          <option value="Finishing">Plaster, Tile &amp; Finishing</option>
          <option value="Plumbing">Plumbing &amp; MEP</option>
          <option value="Electrical">Electrical Works</option>
        </select>
      </FormField>

      <div className="grid grid-cols-2 gap-2">
        <FormField label="Work Qty">
          <input
            type="number"
            step="any"
            min="0"
            inputMode="numeric"
            value={fWorkQty}
            onChange={(e) => setFWorkQty(e.target.value)}
            placeholder="e.g. 500"
            className={inputClass}
            style={inputStyle}
          />
        </FormField>
        <FormField label="Unit">
          <select value={fWorkUnit} onChange={(e) => setFWorkUnit(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="sqft">sqft</option>
            <option value="sqm">sqm</option>
            <option value="cubic meter">cubic meter</option>
            <option value="cubic ft">cubic ft</option>
            <option value="rmt">rmt (running metre)</option>
            <option value="nos">nos</option>
            <option value="kg">kg</option>
            <option value="ton">ton</option>
            <option value="bag">bag</option>
            <option value="set">set</option>
          </select>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FormField label="Date" required>
          <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className={inputClass} style={inputStyle} />
        </FormField>
        <FormField label="Progress %">
          <input type="text" inputMode="decimal" enterKeyHint="done" min="0" max="100" value={fProgress} onChange={(e) => setFProgress(e.target.value)} placeholder="0-100" className={`${inputClass} tabular-nums`} style={inputStyle} />
        </FormField>
      </div>

      <FormField label="Weather">
        <input value={fWeather} onChange={(e) => setFWeather(e.target.value)} placeholder="Sunny, 28°C" enterKeyHint="next" className={inputClass} style={inputStyle} />
      </FormField>

      <FormField label="Work summary" required>
        <textarea value={fWorkSummary} onChange={(e) => setFWorkSummary(e.target.value)} rows={3} placeholder="What work was done today?" className={`${inputClass} resize-none`} style={inputStyle} />
      </FormField>

      <FormField label="Blockers">
        <textarea value={fBlockers} onChange={(e) => setFBlockers(e.target.value)} rows={2} placeholder="Any delays or issues?" className={`${inputClass} resize-none`} style={inputStyle} />
      </FormField>

      <FormField label="Tomorrow's plan">
        <textarea value={fTomorrow} onChange={(e) => setFTomorrow(e.target.value)} rows={2} placeholder="What's planned for tomorrow?" className={`${inputClass} resize-none`} style={inputStyle} />
      </FormField>

      {/* ══════ SECTION: Materials ══════ */}
      <div
        className="rounded-[0.625rem] border p-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Materials used
          </p>
          <div className="flex items-center gap-1.5">
            {yesterdayDpr && !editingDprId && (
              <button
                type="button"
                onClick={repeatYesterday}
                className="flex items-center gap-1 rounded-[0.375rem] border px-2 py-1 text-m-caption font-bold text-m-body press"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
              >
                <Repeat className="size-2.5" /> Repeat
              </button>
            )}
            <button
              type="button"
              onClick={addMaterialLine}
              className="flex items-center gap-1 rounded-[0.375rem] border px-2 py-1 text-m-caption font-bold text-m-body press"
              style={{ borderColor: "var(--color-ink-950)", backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <Plus className="size-2.5" /> Add
            </button>
          </div>
        </div>

        {/* Quick-select chips from yesterday's materials */}
        {quickSelectMaterials.length > 0 && !editingDprId && materialLines.length === 0 && (
          <div
            className="rounded-[0.375rem] border p-2 mb-2"
            style={{ borderColor: "color-mix(in srgb, var(--color-signal) 25%, transparent)", backgroundColor: "color-mix(in srgb, var(--color-signal) 5%, transparent)" }}
          >
            <div className="flex items-center gap-1.5 text-m-caption font-semibold mb-1.5" style={{ color: "var(--color-signal-dark)" }}>
              <Zap className="size-2.5" />
              Quick add from yesterday
            </div>
            <div className="flex flex-wrap gap-1.5">
              {quickSelectMaterials.map((m) => (
                <button
                  key={m.materialId}
                  onClick={() => quickAddMaterial(m.materialId, m.qty, m.unitCost)}
                  className="rounded-full border px-2.5 py-1 text-m-caption font-semibold text-m-body press"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
                >
                  + {m.name} ({m.qty} {m.unit})
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {materialLines.map((l, idx) => (
            <div
              key={idx}
              className="rounded-[0.375rem] border p-2"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-concrete)" }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className="text-m-caption font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: "var(--color-paper)", color: "var(--color-ink-500)" }}
                >
                  #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeMaterialLine(idx)}
                  className="text-m-body press"
                >
                  <X className="size-3" style={{ color: "var(--color-stop)" }} />
                </button>
              </div>
              <SearchableMaterialPicker
                materials={materials}
                value={l.materialId}
                onChange={(id) => {
                  const mat = materials.find((m) => m.id === id);
                  const shouldAutoFill = !l.unitCost || l.unitCost === "0";
                  setMaterialLines(materialLines.map((m, i) => i === idx ? {
                    ...m,
                    materialId: id,
                    unitCost: shouldAutoFill && mat && mat.standardCost > 0 ? String(mat.standardCost) : m.unitCost,
                  } : m));
                }}
              />
              <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                <input type="text" inputMode="decimal" enterKeyHint="next" placeholder="Qty" value={l.qty} onChange={(e) => setMaterialLines(materialLines.map((m, i) => i === idx ? { ...m, qty: e.target.value } : m))} className="w-full h-10 rounded-[0.5rem] border px-3 text-m-label tabular-nums outline-none" style={inputStyle} />
                <input type="text" inputMode="decimal" enterKeyHint="next" placeholder="Unit cost" value={l.unitCost} onChange={(e) => setMaterialLines(materialLines.map((m, i) => i === idx ? { ...m, unitCost: e.target.value } : m))} className="w-full h-10 rounded-[0.5rem] border px-3 text-m-label tabular-nums outline-none" style={inputStyle} />
              </div>
              {l.qty && l.unitCost && Number(l.qty) > 0 && Number(l.unitCost) > 0 ? (
                <p className="text-right text-m-caption font-semibold tabular-nums mt-1" style={{ color: "var(--color-ink-500)" }}>
                  = {(Number(l.qty) * Number(l.unitCost)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        {materialLines.some((l) => l.qty && l.unitCost && Number(l.qty) > 0 && Number(l.unitCost) > 0) ? (
          <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: "var(--color-line)" }}>
            <span className="text-m-caption font-bold uppercase" style={{ color: "var(--color-ink-500)" }}>
              Material total
            </span>
            <span className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {materialLines
                .filter((l) => l.qty && l.unitCost)
                .reduce((s, l) => s + (Number(l.qty) * Number(l.unitCost) || 0), 0)
                .toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </span>
          </div>
        ) : null}
      </div>

      {/* ══════ SECTION: Labour ══════ */}
      <div
        className="rounded-[0.625rem] border p-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Labour utilised
          </p>
          <button
            type="button"
            onClick={addLaborLine}
            className="flex items-center gap-1 rounded-[0.375rem] border px-2 py-1 text-m-caption font-bold text-m-body press"
            style={{ borderColor: "var(--color-ink-950)", backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            <Plus className="size-2.5" /> Add
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {laborLines.map((l, idx) => (
            <div
              key={idx}
              className="rounded-[0.375rem] border p-2"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-concrete)" }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className="text-m-caption font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: "var(--color-paper)", color: "var(--color-ink-500)" }}
                >
                  #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeLaborLine(idx)}
                  className="text-m-body press"
                >
                  <X className="size-3" style={{ color: "var(--color-stop)" }} />
                </button>
              </div>
              <select value={l.employeeId} onChange={(e) => setLaborLines(laborLines.map((m, i) => i === idx ? { ...m, employeeId: e.target.value, crewId: e.target.value ? "" : m.crewId } : m))} className="w-full h-10 rounded-[0.5rem] border px-3 text-m-label mb-1.5 outline-none" style={inputStyle}>
                <option value="">Individual worker…</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name} {emp.trade ? `(${emp.trade})` : ""}</option>)}
              </select>
              <select value={l.crewId} onChange={(e) => setLaborLines(laborLines.map((m, i) => i === idx ? { ...m, crewId: e.target.value, employeeId: e.target.value ? "" : m.employeeId } : m))} className="w-full h-10 rounded-[0.5rem] border px-3 text-m-label mb-1.5 outline-none" style={inputStyle}>
                <option value="">Or crew…</option>
                {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-1.5">
                <input type="text" inputMode="decimal" enterKeyHint="next" placeholder="Hours" value={l.hoursWorked} onChange={(e) => setLaborLines(laborLines.map((m, i) => i === idx ? { ...m, hoursWorked: e.target.value } : m))} className="w-full h-10 rounded-[0.5rem] border px-3 text-m-label tabular-nums outline-none" style={inputStyle} />
                <input placeholder="Task description" value={l.taskDescription} onChange={(e) => setLaborLines(laborLines.map((m, i) => i === idx ? { ...m, taskDescription: e.target.value } : m))} className="w-full h-10 rounded-[0.5rem] border px-3 text-m-label outline-none" style={inputStyle} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <FormField label="Notes">
        <textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} rows={2} placeholder="Additional notes…" className={`${inputClass} resize-none`} style={inputStyle} />
      </FormField>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-m-caption font-semibold" style={{ color: "var(--color-ink-500)" }}>
            Site photos
          </label>
          {fPhotos.length > 0 && (
            <button
              type="button"
              onClick={runOcr}
              disabled={ocrLoading}
              className="flex items-center gap-1 rounded-[0.375rem] border px-2 py-1 text-m-caption font-bold press disabled:opacity-50"
              style={{ borderColor: "var(--color-signal)", backgroundColor: "color-mix(in srgb, var(--color-signal) 10%, transparent)", color: "var(--color-signal-dark)" }}
            >
              {ocrLoading ? <Loader2 className="size-2.5 animate-spin" /> : <ScanLine className="size-2.5" />}
              {ocrLoading ? "Scanning…" : "Scan Photo"}
            </button>
          )}
        </div>
        <PhotoUploader photos={fPhotos} onChange={setFPhotos} maxPhotos={8} label="Add Site Photo" />
      </div>

      {/* ── Sticky save bar ─────────────────────────────────── */}
      <div
        className="fixed left-0 right-0 z-30 border-t backdrop-blur-sm"
        style={{
          bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px))",
          backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="max-w-md mx-auto px-3.5 py-2">
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            {submitting ? "Submitting…" : editingDprId ? "Update DPR" : "Submit DPR"}
          </button>
        </div>
      </div>
    </div>
  );
}
