"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { computeRiskLevel } from "@nirman/services/safety";
import { PhotoUploader } from "@/components/ui/photo-uploader";
import { useWbsOptions } from "@/lib/use-wbs-options";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileProjectSelect } from "@/components/mobile/selectors";

/**
 * MobileNewHazardForm — form content for reporting a new hazard.
 *
 * Used inside <MobileFabModal> (spring-from-FAB animation) on the
 * safety page, or wrapped by <MobileNewHazardDialog> (legacy
 * bottom-sheet backdrop) for backward compatibility.
 * Mirrors MobileNewLeaveForm / MobileNewMaterialForm.
 *
 * No header or Cancel button here — the wrapper supplies the title
 * and the close affordance (FAB morphs +→× in MobileFabModal, X
 * button in the legacy bottom-sheet).
 */
export function MobileNewHazardForm({
  onClose,
  projects,
}: {
  onClose: () => void;
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<{ url: string; fileName?: string }[]>([]);
  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? "", title: "", description: "", likelihood: "2", severity: "2",
    location: "", mitigationPlan: "", targetResolutionDate: "", wbsNodeId: "",
  });

  const wbsOptions = useWbsOptions(projects.length ? form.projectId : null);

  useEffect(() => {
    setForm({ projectId: projects[0]?.id ?? "", title: "", description: "", likelihood: "2", severity: "2", location: "", mitigationPlan: "", targetResolutionDate: "", wbsNodeId: "" });
  }, [projects]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })); }

  const lk = parseInt(form.likelihood) || 1;
  const sv = parseInt(form.severity) || 1;
  const riskLevel = computeRiskLevel(lk, sv);
  const riskColor = { LOW: "var(--color-go)", MEDIUM: "var(--color-signal)", HIGH: "var(--color-stop)", CRITICAL: "var(--color-stop)" }[riskLevel];

  async function onSave() {
    if (!form.title.trim() || !form.description.trim()) { toast.error("Title and description are required"); return; }
    setSaving(true); haptic(20);
    try {
      const res = await fetch("/api/safety/hazards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        projectId: form.projectId, title: form.title.trim(), description: form.description.trim(),
        likelihood: lk, severity: sv, location: form.location || null,
        wbsNodeId: form.wbsNodeId || null,
        mitigationPlan: form.mitigationPlan || null, targetResolutionDate: form.targetResolutionDate || null,
        attachments: attachments.map((a) => a.url),
      }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Hazard reported"); onClose(); router.refresh();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  const inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };
  const sectionClass = "rounded-[0.625rem] border p-3 flex flex-col gap-3";
  const sectionStyle = { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" };
  const sectionTitleClass = "text-m-section font-extrabold tracking-tight";
  const sectionTitleStyle = { color: "var(--color-ink-950)" };

  return (
    <div className="flex flex-col gap-3">
      {/* Details */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>Details</p>
        <div>
          <MobileProjectSelect
            value={form.projectId}
            onChange={(v) => set("projectId", v)}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            icon={FolderOpen}
          />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Title</label>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Unprotected edge at 5th floor" className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Location</label>
          <input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Tower B, east side" className={inputClass} style={inputStyle} />
        </div>
        <div>
          <MobileSelectWithCreate
            label="WBS Activity (optional)"
            value={form.wbsNodeId}
            onChange={(v) => set("wbsNodeId", v)}
            options={wbsOptions.map((w) => ({ value: w.id, label: w.label }))}
            placeholder={wbsOptions.length === 0 ? "No WBS nodes for this project" : "— None —"}
            disabled={wbsOptions.length === 0}
          />
        </div>
      </div>

      {/* Description */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>Description</p>
        <div>
          <label className={labelClass} style={labelStyle}>Description</label>
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="What is the hazard?" className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors" style={inputStyle} />
        </div>
      </div>

      {/* Risk Assessment */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>Risk Assessment</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} style={labelStyle}>Likelihood (1-5)</label>
            <input type="range" min="1" max="5" value={form.likelihood} onChange={(e) => set("likelihood", e.target.value)} className="w-full" />
            <p className="text-m-caption text-center tabular-nums" style={{ color: "var(--color-ink-950)" }}>{lk} — {["", "Rare", "Unlikely", "Possible", "Likely", "Certain"][lk]}</p>
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Severity (1-5)</label>
            <input type="range" min="1" max="5" value={form.severity} onChange={(e) => set("severity", e.target.value)} className="w-full" />
            <p className="text-m-caption text-center tabular-nums" style={{ color: "var(--color-ink-950)" }}>{sv} — {["", "Minor", "Moderate", "Serious", "Major", "Catastrophic"][sv]}</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-m-caption" style={{ color: "var(--color-ink-700)" }}>Score: {lk * sv}</span>
          <span className="text-m-section font-bold uppercase" style={{ color: riskColor }}>{riskLevel}</span>
        </div>
      </div>

      {/* Mitigation */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>Mitigation</p>
        <div>
          <label className={labelClass} style={labelStyle}>Mitigation Plan (optional)</label>
          <textarea value={form.mitigationPlan} onChange={(e) => set("mitigationPlan", e.target.value)} rows={2} placeholder="How will the hazard be controlled?" className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors" style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Target Resolution Date</label>
          <input type="date" value={form.targetResolutionDate} onChange={(e) => set("targetResolutionDate", e.target.value)} className={inputClass} style={inputStyle} />
        </div>
      </div>

      {/* Photo Evidence */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>Photo Evidence</p>
        <PhotoUploader photos={attachments} onChange={setAttachments} maxPhotos={8} label="Add Photo" />
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
          <button onClick={onSave} disabled={saving} className="flex-1 h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{saving ? "Reporting…" : "Report"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * MobileNewHazardDialog — legacy bottom-sheet backdrop wrapper.
 *
 * Kept for backward compatibility / inline creation from other pages.
 * Prefer wrapping <MobileNewHazardForm> in <MobileFabModal> instead —
 * that gives the spring-from-FAB animation matching the materials and
 * leaves pages.
 */
export function MobileNewHazardDialog({
  open,
  onClose,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  projects: { id: string; name: string }[];
}) {
  return (
    <MobileDialog open={open} onClose={onClose} title="New Hazard">
      <MobileNewHazardForm onClose={onClose} projects={projects} />
    </MobileDialog>
  );
}
