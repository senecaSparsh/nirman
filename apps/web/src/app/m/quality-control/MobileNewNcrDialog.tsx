"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Plus, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

type NcrCategory = "MATERIAL" | "WORKMANSHIP" | "DESIGN" | "DOCUMENT" | "PROCESS" | "SAFETY" | "OTHER";
type NcrSeverity = "CRITICAL" | "MAJOR" | "MINOR" | "OBSERVATION";

const CATEGORIES: { value: NcrCategory; label: string }[] = [
  { value: "WORKMANSHIP", label: "Workmanship" },
  { value: "MATERIAL", label: "Material" },
  { value: "DESIGN", label: "Design" },
  { value: "DOCUMENT", label: "Document" },
  { value: "PROCESS", label: "Process" },
  { value: "SAFETY", label: "Safety" },
  { value: "OTHER", label: "Other" },
];

const SEVERITIES: { value: NcrSeverity; label: string; desc: string }[] = [
  { value: "CRITICAL", label: "Critical", desc: "Safety/structural — stop work" },
  { value: "MAJOR", label: "Major", desc: "Significant — rework required" },
  { value: "MINOR", label: "Minor", desc: "Small deviation — concession possible" },
  { value: "OBSERVATION", label: "Observation", desc: "Note for improvement" },
];

export function MobileNewNcrDialog({
  open,
  onClose,
  projects,
  subcontractors,
}: {
  open: boolean;
  onClose: () => void;
  projects: { id: string; name: string }[];
  subcontractors: { id: string; name: string; trade: string | null }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? "",
    title: "",
    description: "",
    category: "WORKMANSHIP" as NcrCategory,
    severity: "MINOR" as NcrSeverity,
    location: "",
    responsibleParty: "",
    subcontractorId: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        projectId: projects[0]?.id ?? "",
        title: "",
        description: "",
        category: "WORKMANSHIP",
        severity: "MINOR",
        location: "",
        responsibleParty: "",
        subcontractorId: "",
      });
    }
  }, [open, projects]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSave() {
    if (!form.projectId) { toast.error("Select a project"); return; }
    if (!form.title.trim() || !form.description.trim()) { toast.error("Title and description are required"); return; }

    setSaving(true);
    haptic(20);
    try {
      const res = await fetch("/api/quality-control/ncr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          severity: form.severity,
          location: form.location || null,
          responsibleParty: form.responsibleParty || null,
          subcontractorId: form.subcontractorId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      toast.success("NCR raised");
      onClose();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div
        className="mt-auto rounded-t-[1rem] max-h-[92vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-paper)", animation: "slideUp 0.25s ease-out" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4" style={{ color: "var(--color-ink-950)" }} />
            <h2 className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Raise NCR</h2>
          </div>
          <button onClick={onClose} className="press">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Project */}
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Project</label>
            <select
              value={form.projectId}
              onChange={(e) => set("projectId", e.target.value)}
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            >
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Title</label>
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Uneven plaster in flat 302"
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              placeholder="What is non-conforming? Be specific…"
              className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem]"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Category + Severity */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Category</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value as NcrCategory)}
                className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              >
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Severity</label>
              <select
                value={form.severity}
                onChange={(e) => set("severity", e.target.value as NcrSeverity)}
                className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              >
                {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Severity description */}
          <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
            {SEVERITIES.find((s) => s.value === form.severity)?.desc}
          </p>

          {/* Location */}
          <div>
            <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Location (optional)</label>
            <input
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="e.g. Tower A, 3rd floor, flat 302"
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Responsible party + Subcontractor */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Responsible Party</label>
              <input
                value={form.responsibleParty}
                onChange={(e) => set("responsibleParty", e.target.value)}
                placeholder="e.g. In-house team"
                className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Subcontractor</label>
              <select
                value={form.subcontractorId}
                onChange={(e) => set("subcontractorId", e.target.value)}
                className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              >
                <option value="">— None —</option>
                {subcontractors.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.trade ? ` (${s.trade})` : ""}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex-1 h-11 rounded-[0.5rem] text-[0.75rem] font-bold press flex items-center justify-center gap-1.5"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {saving ? "Raising…" : "Raise NCR"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
