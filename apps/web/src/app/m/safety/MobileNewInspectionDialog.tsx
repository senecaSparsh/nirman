"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";

const inputClass =
  "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
const inputStyle = {
  borderColor: "var(--color-line)",
  backgroundColor: "transparent",
  color: "var(--color-ink-950)",
};
const labelClass = "block text-m-caption font-bold mb-0";
const labelStyle = { color: "var(--color-ink-700)" };

const sectionClass = "rounded-[0.625rem] border p-3 flex flex-col gap-3";
const sectionStyle = {
  borderColor: "var(--color-line)",
  backgroundColor: "var(--color-paper)",
};
const sectionTitleClass = "text-m-section font-extrabold tracking-tight";
const sectionTitleStyle = { color: "var(--color-ink-950)" };

/**
 * MobileNewInspectionForm — form content for scheduling an inspection.
 *
 * Used inside <MobileFabModal> (spring-from-FAB animation) on the
 * safety page, or wrapped by <MobileNewInspectionDialog> (legacy
 * bottom-sheet backdrop) for inline creation from other pages.
 * Mirrors MobileNewLeaveForm / MobileNewMaterialForm.
 *
 * No header or Cancel button here — the wrapper supplies the title
 * and the close affordance (FAB morphs +→× in MobileFabModal, X
 * button in the legacy bottom-sheet).
 */
export function MobileNewInspectionForm({
  onClose,
  projects,
}: {
  onClose: () => void;
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? "",
    title: "",
    scheduledDate: new Date().toISOString().slice(0, 10),
    inspectorName: "",
  });

  useEffect(() => {
    setForm({
      projectId: projects[0]?.id ?? "",
      title: "",
      scheduledDate: new Date().toISOString().slice(0, 10),
      inspectorName: "",
    });
  }, [projects]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    haptic(20);
    try {
      const res = await fetch("/api/safety/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          title: form.title.trim(),
          scheduledDate: form.scheduledDate,
          inspectorName: form.inspectorName || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Inspection scheduled");
      onClose();
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Details */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>
          Details
        </p>
        <div>
          <MobileSelectWithCreate
            label="Project"
            value={form.projectId}
            onChange={(v) => set("projectId", v)}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            icon={FolderOpen}
          />
        </div>
        <div>
          <label className={labelClass} style={labelStyle}>
            Title <span style={{ color: "var(--color-stop)" }}>*</span>
          </label>
          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Weekly safety walkthrough"
            className={inputClass}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Schedule */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>
          Schedule
        </p>
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <div>
            <label className={labelClass} style={labelStyle}>
              Scheduled Date
            </label>
            <input
              type="date"
              value={form.scheduledDate}
              onChange={(e) => set("scheduledDate", e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div className="pl-2">
            <label className={labelClass} style={labelStyle}>
              Inspector Name (optional)
            </label>
            <input
              value={form.inspectorName}
              onChange={(e) => set("inspectorName", e.target.value)}
              placeholder="e.g. External safety auditor"
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>
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
            disabled={saving}
            className="flex-1 h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: "var(--color-ink-950)",
              color: "var(--color-paper)",
            }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {saving ? "Scheduling…" : "Schedule"}
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * MobileNewInspectionDialog — legacy bottom-sheet backdrop wrapper.
 *
 * Kept for backward compatibility / inline creation from other pages.
 * Prefer wrapping <MobileNewInspectionForm> in <MobileFabModal> instead —
 * that gives the spring-from-FAB animation matching the materials and
 * leaves pages.
 */
export function MobileNewInspectionDialog({
  open,
  onClose,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  projects: { id: string; name: string }[];
}) {
  return (
    <MobileDialog open={open} onClose={onClose} title="New Inspection">
      <MobileNewInspectionForm onClose={onClose} projects={projects} />
    </MobileDialog>
  );
}
