"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

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

export function MobileNewIncidentDialog({ open, onClose, projects }: { open: boolean; onClose: () => void; projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? "", title: "", description: "", type: "ACCIDENT" as IncidentType, severity: "FIRST_AID" as IncidentSeverity,
    incidentDate: new Date().toISOString().slice(0, 10), incidentTime: "", location: "", peopleInvolved: "",
    injuredCount: "0", fatalities: "0", propertyDamageEstimate: "",
  });

  useEffect(() => {
    if (open) setForm({ projectId: projects[0]?.id ?? "", title: "", description: "", type: "ACCIDENT", severity: "FIRST_AID", incidentDate: new Date().toISOString().slice(0, 10), incidentTime: "", location: "", peopleInvolved: "", injuredCount: "0", fatalities: "0", propertyDamageEstimate: "" });
  }, [open, projects]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })); }

  async function onSave() {
    if (!form.title.trim() || !form.description.trim()) { toast.error("Title and description are required"); return; }
    setSaving(true); haptic(20);
    try {
      const res = await fetch("/api/safety/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        projectId: form.projectId, title: form.title.trim(), description: form.description.trim(), type: form.type, severity: form.severity,
        incidentDate: form.incidentDate, incidentTime: form.incidentTime || null, location: form.location || null,
        peopleInvolved: form.peopleInvolved || null, injuredCount: parseInt(form.injuredCount) || 0, fatalities: parseInt(form.fatalities) || 0,
        propertyDamageEstimate: form.propertyDamageEstimate ? parseFloat(form.propertyDamageEstimate) : null,
      }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Incident reported"); onClose(); router.refresh();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="mt-auto rounded-t-[1rem] max-h-[92vh] overflow-y-auto" style={{ backgroundColor: "var(--color-paper)", animation: "slideUp 0.25s ease-out" }}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <div className="flex items-center gap-2"><AlertTriangle className="size-4" style={{ color: "var(--color-stop)" }} /><h2 className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Report Incident</h2></div>
          <button onClick={onClose} className="press"><X className="size-4" style={{ color: "var(--color-ink-500)" }} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Project</label>
            <select value={form.projectId} onChange={(e) => set("projectId", e.target.value)} className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Title</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Worker fell from scaffolding" className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
          </div>
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Description</label>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="What happened? Be specific…" className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Type</label>
              <select value={form.type} onChange={(e) => set("type", e.target.value as IncidentType)} className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}>{TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Severity</label>
              <select value={form.severity} onChange={(e) => set("severity", e.target.value as IncidentSeverity)} className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}>{SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Date</label>
              <input type="date" value={form.incidentDate} onChange={(e) => set("incidentDate", e.target.value)} className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Time</label>
              <input type="time" value={form.incidentTime} onChange={(e) => set("incidentTime", e.target.value)} className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
          </div>
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Location</label>
            <input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Tower B, 5th floor" className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
          </div>
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>People Involved</label>
            <input value={form.peopleInvolved} onChange={(e) => set("peopleInvolved", e.target.value)} placeholder="Names or description" className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Injured</label>
              <input type="number" value={form.injuredCount} onChange={(e) => set("injuredCount", e.target.value)} className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] tabular-nums" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Fatal</label>
              <input type="number" value={form.fatalities} onChange={(e) => set("fatalities", e.target.value)} className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] tabular-nums" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Damage ₹</label>
              <input type="number" value={form.propertyDamageEstimate} onChange={(e) => set("propertyDamageEstimate", e.target.value)} placeholder="0" className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] tabular-nums" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
            <button onClick={onSave} disabled={saving} className="flex-1 h-11 rounded-[0.5rem] text-[0.75rem] font-bold press flex items-center justify-center gap-1.5" style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{saving ? "Reporting…" : "Report"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
