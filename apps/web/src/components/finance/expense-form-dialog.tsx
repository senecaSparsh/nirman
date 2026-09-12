"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { GlPreviewPanel } from "./gl-preview-panel";
import type { GlPreviewLine } from "@nirman/services/gl-preview";
import type { ProjectOption } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { required, positiveNumber, validateForm } from "@/lib/validate";
import { useInlineValidation, type ValidationRules } from "@/lib/use-inline-validation";

const COMMON_CATEGORIES = [
  "Office Supplies",
  "Travel",
  "Utilities",
  "Rent",
  "Salaries",
  "Marketing",
  "Professional Fees",
  "Repairs & Maintenance",
  "Insurance",
  "Bank Charges",
  "Transfer Duty",
  "Stamp Duty",
  "Registration Fee",
  "Legal Fees",
  "Miscellaneous",
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  projects,
  editing,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  editing?: { id: string; projectId: string | null; category: string; amount: number; date: string; notes: string | null } | null;
  /** Pre-fill fields (e.g. { projectId: "abc" } when scoped to a project node). */
  defaults?: { projectId?: string };
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewLines, setPreviewLines] = useState<GlPreviewLine[]>([]);
  const [_showPreview, setShowPreview] = useState(false);
  const [form, setForm] = useState({
    projectId: "",
    category: "",
    amount: "",
    date: todayISO(),
    notes: "",
  });

  // Local copy so freshly created projects appear in the dropdown without
  // waiting for router.refresh.
  const [localProjects, setLocalProjects] = useState<ProjectOption[]>(projects);
  useEffect(() => { setLocalProjects(projects); }, [projects]);

  type ExpenseFormState = typeof form;
  const validationRules: ValidationRules<ExpenseFormState> = {
    category: (v) => required(v as string, "Category"),
    amount: (v) => required(v as string, "Amount") ?? positiveNumber(v as string, "Amount"),
    date: (v) => required(v as string, "Date"),
  };
  const { errors, setErrors, onBlur, validateAll, clearError, clearAll } = useInlineValidation<ExpenseFormState>(validationRules);

  // Fetch project budget info when a project is selected
  const [projectBudget, setProjectBudget] = useState<{ budget: number; spent: number } | null>(null);
  useEffect(() => {
    if (!form.projectId) { setProjectBudget(null); return; }
    fetch(`/api/projects/${form.projectId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.totalBudget != null) {
          setProjectBudget({ budget: d.totalBudget, spent: d.totalProjectCost ?? 0 });
        } else {
          setProjectBudget(null);
        }
      })
      .catch(() => setProjectBudget(null));
  }, [form.projectId]);

  // Reset/populate form when dialog opens
  useEffect(() => {
    if (!open) return;
    clearAll();
    if (editing) {
      setForm({
        projectId: editing.projectId ?? "",
        category: editing.category ?? "",
        amount: String(editing.amount ?? ""),
        date: editing.date ? editing.date.slice(0, 10) : todayISO(),
        notes: editing.notes ?? "",
      });
    } else if (open && !editing) {
      setForm({ projectId: defaults?.projectId ?? "", category: "", amount: "", date: todayISO(), notes: "" });
    }
  }, [open, editing, defaults]);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    clearError(key);
  }

  async function previewGl() {
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount) || amount <= 0) {
      toast.error("Enter an amount to preview GL impact");
      return;
    }
    setPreviewing(true);
    try {
      const res = await fetch("/api/gl/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "expense", amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to preview");
      setPreviewLines(data.lines);
      setShowPreview(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formErrors = validateForm(form, validationRules);
    if (Object.keys(formErrors).length > 0) {
      toast.error(Object.values(formErrors)[0]!);
      setErrors(formErrors);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        projectId: form.projectId || null,
        category: form.category.trim(),
        amount: Number(form.amount),
        date: form.date || null,
        notes: form.notes.trim() || null,
      };
      const res = await fetch(
        editing ? `/api/expenses/${editing.id}` : "/api/expenses",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save expense");
      toast.success(editing ? "Expense updated" : "Expense added");
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
      title={editing ? "Edit Expense" : "Add Expense"}
      description="Record a general company expense, optionally linked to a project."
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="e-project">Project</Label>
          <SelectWithCreate
            value={form.projectId}
            onChange={(v) => set("projectId", v)}
            placeholder="No project (company expense)"
            createLabel="project"
            options={localProjects.map((p) => ({ value: p.id, label: p.name }))}
            renderCreateDialog={({ open: o, onCreated, onClose }) => (
              <ProjectFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalProjects((p) => [...p, { id: e.id, name: e.label ?? "", type: "RESIDENTIAL", status: "PLANNED" }]); onCreated(e); }} />
            )}
          />
        </div>
        {projectBudget && (
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-caption text-muted-foreground">
            <span>Budget: <span className="tnum font-medium text-foreground">{formatCurrency(projectBudget.budget)}</span></span>
            <span className="ml-3">Spent: <span className="tnum font-medium text-foreground">{formatCurrency(projectBudget.spent)}</span></span>
            <span className="ml-3">Remaining: <span className="tnum font-medium text-foreground">{formatCurrency(projectBudget.budget - projectBudget.spent)}</span></span>
            {Number(form.amount) > 0 && (projectBudget.spent + Number(form.amount)) > projectBudget.budget && (
              <span className="ml-2 text-danger font-medium">⚠ This expense will exceed the budget</span>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="e-category" className={errors.category ? "text-danger" : undefined}>Category *</Label>
            <Input
              id="e-category"
              list="e-categories"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              onBlur={() => onBlur("category", form)}
              aria-invalid={!!errors.category}
              placeholder="e.g. Office Supplies"
              required
            />
            {errors.category && <p className="text-caption text-danger" role="alert">{errors.category}</p>}
            <datalist id="e-categories">
              {COMMON_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-amount" className={errors.amount ? "text-danger" : undefined}>Amount *</Label>
            <Input
              id="e-amount"
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              onBlur={() => onBlur("amount", form)}
              aria-invalid={!!errors.amount}
              required
            />
            {errors.amount && <p className="text-caption text-danger" role="alert">{errors.amount}</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-date" className={errors.date ? "text-danger" : undefined}>Date *</Label>
          <Input id="e-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} onBlur={() => onBlur("date", form)} aria-invalid={!!errors.date} />
          {errors.date && <p className="text-caption text-danger" role="alert">{errors.date}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-notes">Notes</Label>
          <Textarea id="e-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Optional" />
        </div>

        {/* GL Impact Preview — collapsible inline panel before submit */}
        {!editing && previewLines.length > 0 && (
          <GlPreviewPanel
            lines={previewLines}
            title="GL Impact — Expense"
            description="This journal entry will be posted when you add the expense."
            defaultOpen
          />
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          {!editing && (
            <Button
              type="button"
              variant="ghost"
              onClick={previewGl}
              disabled={previewing || saving || !form.amount}
            >
              {previewing ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <BookOpen className="mr-2 h-3.5 w-3.5" />
              )}
              Preview GL
            </Button>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Expense"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
