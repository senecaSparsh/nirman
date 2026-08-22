"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { computeRiskLevel } from "@nirman/services";

export function MobileNewHazardDialog({ open, onClose, projects }: { open: boolean; onClose: () => void; projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? "", title: "", description: "", likelihood: "2", severity: "2",
    location: "", mitigationPlan: "", targetResolutionDate: "",
  });

  useEffect(() => {
    if (open) setForm({ projectId: projects[0]?.id ?? "", title: "", description: "", likelihood: "2", severity: "2", location: "", mitigationPlan: "", targetResolutionDate: "" });
  }, [open, projects]);

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
        mitigationPlan: form.mitigationPlan || null, targetResolutionDate: form.targetResolutionDate || null,
      }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Hazard reported"); onClose(); router.refresh();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="mt-auto rounded-t-[1rem] max-h-[92vh] overflow-y-auto" style={{ backgroundColor: "var(--color-paper)", animation: "slideUp 0.25s ease-out" }}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <div className="flex items-center gap-2"><ShieldAlert className="size-4" style={{ color: "var(--color-signal)" }} /><h2 className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Report Hazard</h2></div>
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
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Unprotected edge at 5th floor" className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
          </div>
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Description</label>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="What is the hazard?" className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
          </div>
          {/* Risk assessment */}
          <div className="rounded-[0.5rem] p-3" style={{ backgroundColor: "var(--color-concrete)" }}>
            <p className="text-[0.625rem] font-semibold uppercase mb-2" style={{ color: "var(--color-ink-500)" }}>Risk Assessment</p>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className="text-[0.5rem] font-semibold mb-1 block" style={{ color: "var(--color-ink-500)" }}>Likelihood (1-5)</label>
                <input type="range" min="1" max="5" value={form.likelihood} onChange={(e) => set("likelihood", e.target.value)} className="w-full" />
                <p className="text-[0.5rem] text-center tabular-nums" style={{ color: "var(--color-ink-950)" }}>{lk} — {["", "Rare", "Unlikely", "Possible", "Likely", "Certain"][lk]}</p>
              </div>
              <div>
                <label className="text-[0.5rem] font-semibold mb-1 block" style={{ color: "var(--color-ink-500)" }}>Severity (1-5)</label>
                <input type="range" min="1" max="5" value={form.severity} onChange={(e) => set("severity", e.target.value)} className="w-full" />
                <p className="text-[0.5rem] text-center tabular-nums" style={{ color: "var(--color-ink-950)" }}>{sv} — {["", "Minor", "Moderate", "Serious", "Major", "Catastrophic"][sv]}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>Score: {lk * sv}</span>
              <span className="text-[0.75rem] font-bold uppercase" style={{ color: riskColor }}>{riskLevel}</span>
            </div>
          </div>
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Location</label>
            <input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Tower B, east side" className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
          </div>
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Mitigation Plan (optional)</label>
            <textarea value={form.mitigationPlan} onChange={(e) => set("mitigationPlan", e.target.value)} rows={2} placeholder="How will the hazard be controlled?" className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
          </div>
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Target Resolution Date</label>
            <input type="date" value={form.targetResolutionDate} onChange={(e) => set("targetResolutionDate", e.target.value)} className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
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
