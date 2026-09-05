"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { PhotoUploader } from "@/components/ui/photo-uploader";
import { useWbsOptions } from "@/lib/use-wbs-options";
import { MobileDialog } from "@/components/mobile/v2/dialog";

type IncidentType = "ACCIDENT" | "NEAR_MISS" | "INJURY" | "FATALITY" | "PROPERTY_DAMAGE" | "ENVIRONMENTAL" | "FIRE" | "STRUCTURAL" | "OTHER";
type IncidentSeverity = "FIRST_AID" | "LOST_TIME" | "SERIOUS" | "FATAL" | "PROPERTY_ONLY";

const TYPES: { value: IncidentType; label: string }[] = [
  { value: "ACCIDENT", label: "Accident" }, { value: "NEAR_MISS", label: "Near Miss" }, { value: "INJURY", label: "Injury" },
  { value: "FATALITY", label: "Fatality" }, { value: "PROPERTY_DAMAGE", label: "Property Damage" }, { value: "ENVIRONMENTAL", label: "Environmental" },
  { value: "FIRE", label: "Fire" }, { value: "STRUCTURAL", label: "Structural" }, { value: "OTHER", label: "Other" },
];

const SEVERITIES: { value: IncidentSeverity; label: string }[] = [
  { value: "FIRST_AID", label: "First Aid" }, { value: "LOST_TIME", label: "Lost Time" }, { value: "SERIOUS", label: "Serious" },
  { value: "FATAL", label: "Fatal" }, { value: "PROPERTY_ONLY", label: "Property Only" },
];

const inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" };
const labelClass = "block text-m-caption font-bold mb-0";
const labelStyle = { color: "var(--color-ink-700)" };
const sectionClass = "rounded-[0.625rem] border p-3 flex flex-col gap-3";
const sectionStyle = { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" };
const sectionTitleClass = "text-m-section font-extrabold tracking-tight";
const sectionTitleStyle = { color: "var(--color-ink-950)" };

/**
 * MobileNewIncidentForm — form content for reporting an incident.
 *
 * Used inside <MobileFabModal> (spring-from-FAB animation) on the
 * safety page, or wrapped by <MobileNewIncidentDialog> (legacy
 * bottom-sheet backdrop) for inline creation from other pages.
 * Mirrors MobileNewLeaveForm / MobileNewMaterialForm.
 *
 * No header or Cancel button here — the wrapper supplies the title
 * and the close affordance (FAB morphs +→× in MobileFabModal, X
 * button in the legacy bottom-sheet).
 */
export function MobileNewIncidentForm({ onClose, projects }: { onClose: () => void; projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<{ url: string; fileName?: string }[]>([]);
  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? "", title: "", description: "", type: "ACCIDENT" as IncidentType, severity: "FIRST_AID" as IncidentSeverity,
    incidentDate: new Date().toISOString().slice(0, 10), incidentTime: "", location: "", peopleInvolved: "",
    injuredCount: "0", fatalities: "0", propertyDamageEstimate: "", wbsNodeId: "",
  });

  const wbsOptions = useWbsOptions(form.projectId || null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) { toast.error("Title and description are required"); return; }
    setSaving(true); haptic(20);
    try {
      const res = await fetch("/api/safety/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        projectId: form.projectId, title: form.title.trim(), description: form.description.trim(), type: form.type, severity: form.severity,
        incidentDate: form.incidentDate, incidentTime: form.incidentTime || null, location: form.location || null,
        wbsNodeId: form.wbsNodeId || null,
        peopleInvolved: form.peopleInvolved || null, injuredCount: parseInt(form.injuredCount) || 0, fatalities: parseInt(form.fatalities) || 0,
        propertyDamageEstimate: form.propertyDamageEstimate ? parseFloat(form.propertyDamageEstimate) : null,
        attachments: attachments.map((a) => a.url),
      }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Incident reported"); onClose(); router.refresh();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Details */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>Details</p>
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <label className={labelClass} style={labelStyle}>Project</label>
            <select value={form.projectId} onChange={(e) => set("projectId", e.target.value)} className={inputClass} style={inputStyle}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="pl-2">
            <label className={labelClass} style={labelStyle}>Title</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Worker fell from scaffolding" className={inputClass} style={inputStyle} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <label className={labelClass} style={labelStyle}>Type</label>
            <select value={form.type} onChange={(e) => set("type", e.target.value as IncidentType)} className={inputClass} style={inputStyle}>{TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          </div>
          <div className="pl-2">
            <label className={labelClass} style={labelStyle}>Severity</label>
            <select value={form.severity} onChange={(e) => set("severity", e.target.value as IncidentSeverity)} className={inputClass} style={inputStyle}>{SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>Description</p>
        <div>
          <label className={labelClass} style={labelStyle}>What happened?</label>
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Be specific…" className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors" style={inputStyle} />
        </div>
      </div>

      {/* When & Where */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>When &amp; Where</p>
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <label className={labelClass} style={labelStyle}>Date</label>
            <input type="date" value={form.incidentDate} onChange={(e) => set("incidentDate", e.target.value)} className={inputClass} style={inputStyle} />
          </div>
          <div className="pl-2">
            <label className={labelClass} style={labelStyle}>Time</label>
            <input type="time" value={form.incidentTime} onChange={(e) => set("incidentTime", e.target.value)} className={inputClass} style={inputStyle} />
          </div>
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>Location</label>
          <input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Tower B, 5th floor" className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>WBS Activity (optional)</label>
          <select value={form.wbsNodeId} onChange={(e) => set("wbsNodeId", e.target.value)} className={inputClass} style={inputStyle} disabled={wbsOptions.length === 0}>
            <option value="">{wbsOptions.length === 0 ? "No WBS nodes for this project" : "— None —"}</option>
            {wbsOptions.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>
      </div>

      {/* People & Damage */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>People &amp; Damage</p>
        <div>
          <label className={labelClass} style={labelStyle}>People Involved</label>
          <input value={form.peopleInvolved} onChange={(e) => set("peopleInvolved", e.target.value)} placeholder="Names or description" className={inputClass} style={inputStyle} />
        </div>
        <div className="grid grid-cols-3 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <label className={labelClass} style={labelStyle}>Injured</label>
            <input type="number" value={form.injuredCount} onChange={(e) => set("injuredCount", e.target.value)} className={`${inputClass} tabular-nums`} style={inputStyle} />
          </div>
          <div className="pl-2">
            <label className={labelClass} style={labelStyle}>Fatal</label>
            <input type="number" value={form.fatalities} onChange={(e) => set("fatalities", e.target.value)} className={`${inputClass} tabular-nums`} style={inputStyle} />
          </div>
          <div className="pl-2">
            <label className={labelClass} style={labelStyle}>Damage ₹</label>
            <input type="number" value={form.propertyDamageEstimate} onChange={(e) => set("propertyDamageEstimate", e.target.value)} placeholder="0" className={`${inputClass} tabular-nums`} style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Evidence */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>Photo Evidence</p>
        <PhotoUploader photos={attachments} onChange={setAttachments} maxPhotos={8} label="Add Photo" />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
        style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {saving ? "Reporting…" : "Report"}
      </button>
    </form>
  );
}

/**
 * MobileNewIncidentDialog — legacy bottom-sheet backdrop wrapper.
 *
 * Kept for backward compatibility / inline creation from other pages.
 * Prefer wrapping <MobileNewIncidentForm> in <MobileFabModal> instead —
 * that gives the spring-from-FAB animation matching the materials and
 * leaves pages.
 */
export function MobileNewIncidentDialog({ open, onClose, projects }: { open: boolean; onClose: () => void; projects: { id: string; name: string }[] }) {
  return (
    <MobileDialog open={open} onClose={onClose} title="New Incident">
      <MobileNewIncidentForm onClose={onClose} projects={projects} />
    </MobileDialog>
  );
}
