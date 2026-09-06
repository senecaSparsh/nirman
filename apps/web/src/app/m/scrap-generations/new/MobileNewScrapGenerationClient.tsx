"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Send, Loader2,
  CheckCircle2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useDrafts } from "@/lib/offline/use-drafts";
import { DraftBanner } from "@/components/mobile/draft-banner";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";
import { MobileNewStockLocationDialog } from "@/app/m/stock-locations/MobileNewStockLocationDialog";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";

interface LocationItem {
  id: string;
  name: string;
  type: string;
}

interface MaterialItem {
  id: string;
  name: string;
  code: string;
  unit: string;
}

interface ProjectItem {
  id: string;
  name: string;
}

interface ScrapLine {
  materialId: string;
  qty: string;
  unitCost: string;
}

export default function MobileNewScrapGenerationClient({ onClose, onCreated }: { onClose?: () => void; onCreated?: (id: string) => void } = {}) {
  const router = useRouter();
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [toLocationId, setToLocationId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [sourceMaterialId, setSourceMaterialId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ScrapLine[]>([{ materialId: "", qty: "", unitCost: "" }]);

  const [success, setSuccess] = useState<{ scrapNumber: string; totalValue: number } | null>(null);

  // ── Draft auto-save ──
  const { draft, hasDraft, draftUpdatedAt, saveDraft, clearDraft } = useDrafts<{
    toLocationId: string;
    projectId: string;
    sourceMaterialId: string;
    notes: string;
    lines: ScrapLine[];
  }>("scrap", "scrap-new");
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    if (success) return;
    const hasContent = toLocationId || projectId || sourceMaterialId || notes ||
      lines.some((l) => l.materialId || l.qty || l.unitCost);
    if (!hasContent) return;
    saveDraft({ toLocationId, projectId, sourceMaterialId, notes, lines });
  }, [toLocationId, projectId, sourceMaterialId, notes, lines, success, saveDraft]);

  useEffect(() => {
    if (draft && !draftRestored && hasDraft) {
      if (draft.toLocationId) setToLocationId(draft.toLocationId);
      if (draft.projectId) setProjectId(draft.projectId);
      if (draft.sourceMaterialId) setSourceMaterialId(draft.sourceMaterialId);
      if (draft.notes) setNotes(draft.notes);
      if (draft.lines?.length > 0) setLines(draft.lines);
      setDraftRestored(true);
    }
  }, [draft, hasDraft, draftRestored]);

  // Load options
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [locRes, projRes, matRes] = await Promise.all([
          fetch("/api/stock-locations?group=true").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/projects").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/materials").then((r) => (r.ok ? r.json() : { rows: [] })),
        ]);
        if (cancelled) return;
        if (Array.isArray(locRes)) {
          setLocations(locRes);
          if (locRes.length > 0) setToLocationId(locRes[0].id);
        }
        if (Array.isArray(projRes)) setProjects(projRes);
        const mats = matRes?.rows ?? [];
        if (mats.length > 0) {
          setMaterials(mats);
          setLines([{ materialId: "", qty: "", unitCost: "" }]);
        }
      } catch (err) {
        console.error("Failed to load form options:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  const handleAddLine = () => {
    setLines([...lines, { materialId: "", qty: "", unitCost: "" }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: keyof ScrapLine, val: string) => {
    const updated = [...lines];
    updated[index] = { ...updated[index]!, [field]: val };
    setLines(updated);
  };

  const totalValue = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!toLocationId) {
      toast.error("Please select destination location");
      return;
    }

    const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0);
    if (validLines.length === 0) {
      toast.error("Add at least one line item with quantity");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/scrap-generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toLocationId,
          sourceMaterialId: sourceMaterialId || null,
          projectId: projectId || null,
          notes: notes || null,
          lines: validLines.map((l) => ({
            materialId: l.materialId,
            qty: Number(l.qty),
            unitCost: Number(l.unitCost) || 0,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create scrap generation");
      }

      const data = await res.json();
      clearDraft();
      setSuccess({ scrapNumber: data.scrapNumber, totalValue });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create scrap generation");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Success state ── */
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div
          className="grid place-items-center size-14 rounded-full mb-3"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}
        >
          <CheckCircle2 className="size-7" style={{ color: "var(--color-go)" }} />
        </div>
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
          Scrap Generated
        </p>
        <p className="text-m-caption font-mono mb-3" style={{ color: "var(--color-ink-700)" }}>
          {success.scrapNumber}
        </p>
        <p className="text-m-section font-bold tabular-nums mb-4" style={{ color: "var(--color-go)" }}>
          {formatCurrency(success.totalValue)}
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              if (onCreated) {
                onCreated("");
              } else {
                router.refresh();
                router.push("/m/stock?tab=scrap");
              }
            }}
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            View All Scrap
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setLines([{ materialId: "", qty: "", unitCost: "" }]);
              setNotes("");
              setDraftRestored(true);
            }}
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold border text-m-body press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
          >
            Add Another
          </button>
        </div>
      </div>
    );
  }

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin" style={{ color: "var(--color-ink-700)" }} />
        <p className="text-m-body mt-2" style={{ color: "var(--color-ink-700)" }}>Loading form…</p>
      </div>
    );
  }

  const inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";

  return (
    <div className="pb-32">

      {hasDraft && !draftRestored && !success ? (
        <DraftBanner
          formName="scrap-new"
          updatedAt={draftUpdatedAt}
          onRestore={() => setDraftRestored(true)}
          onDiscard={() => { clearDraft(); setDraftRestored(true); }}
        />
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Destination & Linkage */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Destination & Linkage
          </p>
          {/* ── Destination (full width) ── */}
          <MobileSelectWithCreate
            label="Destination location"
            required
            value={toLocationId}
            onChange={setToLocationId}
            options={locations.map((loc) => ({
              value: loc.id,
              label: `${loc.name} (${loc.type.replace(/_/g, " ").toLowerCase()})`,
            }))}
            placeholder="Select location"
            inputClass={inputClass}
            inputStyle={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            renderDialog={({ open, onClose, onCreated }) => (
              <MobileNewStockLocationDialog
                open={open}
                onClose={onClose}
                projects={projects}
                onCreated={(l) => {
                  setLocations((prev) => [...prev, { id: l.id, name: l.name, type: l.type }]);
                  onCreated(l.id, `${l.name} (${l.type.replace(/_/g, " ").toLowerCase()})`);
                }}
              />
            )}
          />

          {/* ── Project + Source material side-by-side ── */}
          <div className="grid grid-cols-2 gap-3">
            <MobileSelectWithCreate
              label="Project"
              value={projectId}
              onChange={setProjectId}
              options={projects.map((proj) => ({ value: proj.id, label: proj.name }))}
              placeholder="None"
              inputClass={inputClass}
              inputStyle={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              renderDialog={({ open, onClose, onCreated, originRect }) => (
                <MobileFabModal open={open} onClose={onClose} originRect={originRect} title="New Project">
                  <MobileNewProjectDialog
                    open={open}
                    onClose={onClose}
                    onCreated={(p) => {
                      setProjects((prev) => [...prev, { id: p.id, name: p.name }]);
                      onCreated(p.id, p.name);
                    }}
                  />
                </MobileFabModal>
              )}
            />

            <MobileSelectWithCreate
              label="Source material"
              value={sourceMaterialId}
              onChange={setSourceMaterialId}
              options={materials.map((mat) => ({ value: mat.id, label: `${mat.name} (${mat.code})` }))}
              placeholder="None"
              inputClass={inputClass}
              inputStyle={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              renderDialog={({ open, onClose, onCreated }) => (
                <MobileNewMaterialDialog
                  open={open}
                  onClose={onClose}
                  categories={[]}
                  onCreated={(m) => {
                    setMaterials((prev) => [...prev, { id: m.id, name: m.name, code: m.code, unit: m.unit }]);
                    onCreated(m.id, `${m.name} (${m.code})`);
                  }}
                />
              )}
            />
          </div>
        </div>

        {/* Line Items */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <div className="flex items-center justify-between">
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Line Items
            </p>
            <button
              type="button"
              onClick={handleAddLine}
              className="flex items-center gap-1 text-m-caption font-bold press"
              style={{ color: "var(--color-go)" }}
            >
              <Plus className="size-3" />
              <span>Add line</span>
            </button>
          </div>
          <div>
            <div className="flex flex-col gap-3">
              {lines.map((line, idx) => {
                const mat = materials.find((m) => m.id === line.materialId);
                const lineTotal = (Number(line.qty) || 0) * (Number(line.unitCost) || 0);
                return (
                  <div
                    key={idx}
                    className="rounded-[0.5rem] border p-2"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                  >
                    {/* Material selector */}
                    <MobileSelectWithCreate
                      label="Material"
                      required
                      placeholder="— Select material —"
                      value={line.materialId}
                      onChange={(val) => handleLineChange(idx, "materialId", val)}
                      options={materials.map((mat) => ({ value: mat.id, label: `${mat.name} (${mat.code})` }))}
                      inputClass={`${inputClass} text-m-body mb-2`}
                      inputStyle={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                      labelClass="text-m-caption font-semibold uppercase block mb-1"
                      renderDialog={({ open, onClose, onCreated }) => (
                        <MobileNewMaterialDialog
                          open={open}
                          onClose={onClose}
                          categories={[]}
                          onCreated={(m) => {
                            setMaterials((prev) => [...prev, { id: m.id, name: m.name, code: m.code, unit: m.unit }]);
                            onCreated(m.id, `${m.name} (${m.code})`);
                          }}
                        />
                      )}
                    />

                    {/* Qty + unit cost */}
                    <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                      <div>
                        <label className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-700)" }}>
                          Qty{mat ? ` (${mat.unit})` : ""}
                        </label>
                        <input
                          type="text" inputMode="decimal"
                          step="any"
                          min="0"
                          value={line.qty}
                          onChange={(e) => handleLineChange(idx, "qty", e.target.value)}
                          placeholder="Qty"
                          className={`${inputClass} text-m-caption tabular-nums`}
                          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                        />
                      </div>
                      <div className="pl-2">
                        <label className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-700)" }}>
                          Unit Cost
                        </label>
                        <input
                          type="text" inputMode="decimal"
                          step="any"
                          min="0"
                          value={line.unitCost}
                          onChange={(e) => handleLineChange(idx, "unitCost", e.target.value)}
                          placeholder="Cost"
                          className={`${inputClass} text-m-caption tabular-nums`}
                          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                        />
                      </div>
                    </div>

                    {/* Line total + remove */}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-m-caption font-bold tabular-nums" style={{ color: lineTotal > 0 ? "var(--color-go)" : "var(--color-ink-300)" }}>
                        {lineTotal > 0 ? formatCurrency(lineTotal) : "—"}
                      </span>
                      {lines.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="flex items-center gap-1.5 text-m-caption font-semibold text-m-body press"
                          style={{ color: "var(--color-stop)" }}
                        >
                          <Trash2 className="size-3" /> Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Notes
          </p>
          <FormField label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Broken tiles from Tower A flooring"
              rows={2}
              className={`${inputClass} resize-none`}
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            />
          </FormField>
        </div>

        {/* ── Total + submit ── */}
        <div
          className="flex items-center justify-between py-2"
          style={{ borderColor: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-go) 6%, var(--color-paper))" }}
        >
          <span className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-700)" }}>
            Total Scrap Value
          </span>
          <span className="text-m-section font-bold tabular-nums" style={{ color: totalValue > 0 ? "var(--color-go)" : "var(--color-ink-300)" }}>
            {totalValue > 0 ? formatCurrency(totalValue) : "—"}
          </span>
        </div>

        {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
        <div
          className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-4 -mb-4 px-4 py-2"
          style={{
            backgroundColor: "var(--color-paper)",
            borderColor: "var(--color-line)",
          }}
        >
          <div className="flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-1 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Send className="size-4" />
                  <span>Generate Scrap Slip</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ─── Form field wrapper ─── */
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
        style={{ color: "var(--color-ink-700)" }}
      >
        {label}
        {required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
      </label>
      {children}
    </div>
  );
}
