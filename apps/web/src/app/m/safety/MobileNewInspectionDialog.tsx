"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";
import { MobileProjectSelect } from "@/components/mobile/selectors";
import { useTodayDate } from "@/lib/use-today-date";

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
  const today = useTodayDate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? "",
    title: "",
    scheduledDate: "",
    inspectorName: "",
  });

  useEffect(() => {
    setForm({
      projectId: projects[0]?.id ?? "",
      title: "",
      scheduledDate: today || new Date().toISOString().slice(0, 10),
      inspectorName: "",
    });
  }, [projects, today]);

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
      <SectionCard title="Details">
        <div>
          <MobileProjectSelect
            value={form.projectId}
            onChange={(v) => set("projectId", v)}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            icon={FolderOpen}
          />
        </div>
        <UnderlineInput
          label="Title"
          value={form.title}
          onChange={(v) => set("title", v)}
          placeholder="e.g. Weekly safety walkthrough"
          required
        />
      </SectionCard>

      {/* Schedule */}
      <SectionCard title="Schedule">
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <UnderlineInput
            label="Scheduled Date"
            value={form.scheduledDate}
            onChange={(v) => set("scheduledDate", v)}
            type="date"
          />
          <div className="pl-2">
            <UnderlineInput
              label="Inspector Name (optional)"
              value={form.inspectorName}
              onChange={(v) => set("inspectorName", v)}
              placeholder="e.g. External safety auditor"
            />
          </div>
        </div>
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
