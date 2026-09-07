"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { PhotoUploader } from "@/components/ui/photo-uploader";
import { useWbsOptions } from "@/lib/use-wbs-options";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileProjectSelect } from "@/components/mobile/selectors";
import { useTodayDate } from "@/lib/use-today-date";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

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

const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" };
const labelClass = "block text-m-caption font-bold mb-0";
const labelStyle = { color: "var(--color-ink-700)" };

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
  const today = useTodayDate();
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<{ url: string; fileName?: string }[]>([]);
  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? "", title: "", description: "", type: "ACCIDENT" as IncidentType, severity: "FIRST_AID" as IncidentSeverity,
    incidentDate: "", incidentTime: "", location: "", peopleInvolved: "",
    injuredCount: "0", fatalities: "0", propertyDamageEstimate: "", wbsNodeId: "",
  });

  useEffect(() => {
    if (today) setForm((f) => (f.incidentDate ? f : { ...f, incidentDate: today }));
  }, [today]);

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
      <SectionCard title="Details">
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <MobileProjectSelect
              value={form.projectId}
              onChange={(v) => set("projectId", v)}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              icon={FolderOpen}
            />
          </div>
          <div className="pl-2">
            <UnderlineInput
              label="Title"
              value={form.title}
              onChange={(v) => set("title", v)}
              placeholder="e.g. Worker fell from scaffolding"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <EnumSelect
            label="Type"
            value={form.type}
            onChange={(v) => set("type", v as IncidentType)}
            options={TYPES}
          />
          <div className="pl-2">
            <EnumSelect
              label="Severity"
              value={form.severity}
              onChange={(v) => set("severity", v as IncidentSeverity)}
              options={SEVERITIES}
            />
          </div>
        </div>
      </SectionCard>

      {/* Description */}
      <SectionCard title="Description">
        <div>
          <label className={labelClass} style={labelStyle}>What happened?</label>
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Be specific…" className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors" style={inputStyle} />
        </div>
      </SectionCard>

      {/* When & Where */}
      <SectionCard title="When &amp; Where">
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <UnderlineInput
            label="Date"
            value={form.incidentDate}
            onChange={(v) => set("incidentDate", v)}
            type="date"
          />
          <div className="pl-2">
            <UnderlineInput
              label="Time"
              value={form.incidentTime}
              onChange={(v) => set("incidentTime", v)}
              type="time"
            />
          </div>
        </div>
        <UnderlineInput
          label="Location"
          value={form.location}
          onChange={(v) => set("location", v)}
          placeholder="e.g. Tower B, 5th floor"
        />
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
      </SectionCard>

      {/* People & Damage */}
      <SectionCard title="People &amp; Damage">
        <UnderlineInput
          label="People Involved"
          value={form.peopleInvolved}
          onChange={(v) => set("peopleInvolved", v)}
          placeholder="Names or description"
        />
        <div className="grid grid-cols-3 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <UnderlineInput
            label="Injured"
            value={form.injuredCount}
            onChange={(v) => set("injuredCount", v)}
            type="number"
          />
          <div className="pl-2">
            <UnderlineInput
              label="Fatal"
              value={form.fatalities}
              onChange={(v) => set("fatalities", v)}
              type="number"
            />
          </div>
          <div className="pl-2">
            <UnderlineInput
              label="Damage ₹"
              value={form.propertyDamageEstimate}
              onChange={(v) => set("propertyDamageEstimate", v)}
              placeholder="0"
              type="number"
            />
          </div>
        </div>
      </SectionCard>

      {/* Evidence */}
      <SectionCard title="Photo Evidence">
        <PhotoUploader photos={attachments} onChange={setAttachments} maxPhotos={8} label="Add Photo" />
      </SectionCard>

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
            disabled={saving}
            className="flex-1 h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {saving ? "Reporting…" : "Report"}
          </button>
        </div>
      </div>
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
