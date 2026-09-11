"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/field";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { required, nonNegativeNumber } from "@/lib/validate";
import { useInlineValidation, type ValidationRules } from "@/lib/use-inline-validation";
import type { ProjectOption } from "@/lib/types";

type PhaseStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "ON_HOLD";

export type PhaseFormValues = {
  name: string;
  status: PhaseStatus;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number | null;
  sortOrder: number;
};

const STATUS_LABELS: Record<PhaseStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ON_HOLD: "On Hold",
};

export function PhaseFormDialog({
  projectId,
  projects,
  open,
  onOpenChange,
  initial,
  phaseId,
}: {
  /** Fixed parent project — used when the dialog is scoped to a single project
   * (e.g. from the project detail page). When `projects` is provided instead,
   * the user can pick / create the parent project inline. */
  projectId?: string;
  /** Optional project list — when provided, a project select with inline
   * create is rendered at the top of the form. */
  projects?: ProjectOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<PhaseFormValues>;
  phaseId?: string;
}) {
  const router = useRouter();
  const isEdit = Boolean(phaseId);
  const [saving, setSaving] = useState(false);
  // Local copies so freshly created projects appear in the dropdown without
  // waiting for router.refresh.
  const [localProjects, setLocalProjects] = useState<ProjectOption[]>(projects ?? []);
  useEffect(() => { if (projects) setLocalProjects(projects); }, [projects]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? "");
  useEffect(() => { if (projectId) setSelectedProjectId(projectId); }, [projectId]);
  const activeProjectId = projects ? selectedProjectId : (projectId ?? "");
  const [form, setForm] = useState<PhaseFormValues>({
    name: initial?.name ?? "",
    status: initial?.status ?? "PLANNED",
    startDate: initial?.startDate ?? "",
    endDate: initial?.endDate ?? "",
    budget: initial?.budget ?? undefined,
    sortOrder: initial?.sortOrder ?? 0,
  });

  // ── Inline validation ──────────────────────────────────────────
  // Validates on blur and shows red error text under the field instantly.
  const validationRules: ValidationRules<PhaseFormValues> = {
    name: (v) => required(v as string, "Phase Name"),
    budget: (v) => nonNegativeNumber((v ?? "") as string | number, "Phase Budget"),
  };
  const { errors, onBlur, validateAll, clearError, clearAll } = useInlineValidation<PhaseFormValues>(validationRules);

  // Reset validation errors when the dialog opens fresh.
  useEffect(() => {
    if (!open) return;
    clearAll();
  }, [open]);

  function set<K extends keyof PhaseFormValues>(key: K, value: PhaseFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    clearError(key);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProjectId) {
      toast.error("Select a project");
      return;
    }
    if (!validateAll(form)) {
      toast.error("Please fix the errors in the form");
      return;
    }
    setSaving(true);
    try {
      const url = phaseId
        ? `/api/projects/${activeProjectId}/phases/${phaseId}`
        : `/api/projects/${activeProjectId}/phases`;
      const method = phaseId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save phase");
      toast.success(isEdit ? "Phase updated" : "Phase added");
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit Phase" : "Add Phase"}
      description={isEdit ? "Update phase details." : "Add a phase to this project (e.g. Tower A, Phase 1)."}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {projects && (
          <Field label="Project" required>
            <SelectWithCreate
              value={selectedProjectId}
              onChange={setSelectedProjectId}
              required
              placeholder="Select project…"
              createLabel="project"
              options={localProjects.map((p) => ({ value: p.id, label: p.name }))}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <ProjectFormDialog
                  open={o}
                  onOpenChange={onClose}
                  onCreated={(e) => {
                    setLocalProjects((p) => [...p, { id: e.id, name: e.label ?? "", type: "RESIDENTIAL", status: "PLANNED" }]);
                    onCreated(e);
                  }}
                />
              )}
            />
          </Field>
        )}
        <Field label="Phase Name" required error={errors.name}>
          <Input
            id="ph-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            onBlur={() => onBlur("name", form)}
            aria-invalid={!!errors.name}
            placeholder="e.g. Tower A"
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <Select id="ph-status" value={form.status} onChange={(e) => set("status", e.target.value as PhaseStatus)}>
              {(Object.keys(STATUS_LABELS) as PhaseStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sort Order">
            <Input
              id="ph-sort"
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(e) => set("sortOrder", Number(e.target.value))}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start Date">
            <Input id="ph-start" type="date" value={form.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} />
          </Field>
          <Field label="End Date">
            <Input id="ph-end" type="date" value={form.endDate ?? ""} onChange={(e) => set("endDate", e.target.value)} />
          </Field>
        </div>
        <Field label="Phase Budget (₹)" error={errors.budget}>
          <Input
            id="ph-budget"
            type="number"
            min={0}
            value={form.budget ?? ""}
            onChange={(e) => set("budget", e.target.value === "" ? undefined : Number(e.target.value))}
            onBlur={() => onBlur("budget", form)}
            aria-invalid={!!errors.budget}
            placeholder="0"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Phase"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
