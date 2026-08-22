"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Plus, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

export function MobileNewInspectionDialog({ open, onClose, projects }: { open: boolean; onClose: () => void; projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? "", title: "", scheduledDate: new Date().toISOString().slice(0, 10), inspectorName: "",
  });

  useEffect(() => {
    if (open) setForm({ projectId: projects[0]?.id ?? "", title: "", scheduledDate: new Date().toISOString().slice(0, 10), inspectorName: "" });
  }, [open, projects]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })); }

  async function onSave() {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true); haptic(20);
    try {
      const res = await fetch("/api/safety/inspections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        projectId: form.projectId, title: form.title.trim(), scheduledDate: form.scheduledDate, inspectorName: form.inspectorName || null,
      }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Inspection scheduled"); onClose(); router.refresh();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="mt-auto rounded-t-[1rem] max-h-[60vh] overflow-y-auto" style={{ backgroundColor: "var(--color-paper)", animation: "slideUp 0.25s ease-out" }}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <div className="flex items-center gap-2"><ClipboardCheck className="size-4" style={{ color: "var(--color-ink-950)" }} /><h2 className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Schedule Inspection</h2></div>
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
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Weekly safety walkthrough" className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
          </div>
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Scheduled Date</label>
            <input type="date" value={form.scheduledDate} onChange={(e) => set("scheduledDate", e.target.value)} className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
          </div>
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Inspector Name (optional)</label>
            <input value={form.inspectorName} onChange={(e) => set("inspectorName", e.target.value)} placeholder="e.g. External safety auditor" className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
            <button onClick={onSave} disabled={saving} className="flex-1 h-11 rounded-[0.5rem] text-[0.75rem] font-bold press flex items-center justify-center gap-1.5" style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{saving ? "Scheduling…" : "Schedule"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
