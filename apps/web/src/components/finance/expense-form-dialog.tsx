"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GlPreviewPanel } from "./gl-preview-panel";
import type { GlPreviewLine } from "@nirman/services";
import type { ProjectOption } from "@/lib/types";

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
  const [showPreview, setShowPreview] = useState(false);
  const [form, setForm] = useState({
    projectId: "",
    category: "",
    amount: "",
    date: todayISO(),
    notes: "",
  });

  // Reset/populate form when dialog opens
  useEffect(() => {
    if (open && editing) {
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
    if (!form.category.trim()) {
      toast.error("Category is required");
      return;
    }
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount) || amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        projectId: form.projectId || null,
        category: form.category.trim(),
        amount,
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
          <Select id="e-project" value={form.projectId} onChange={(e) => set("projectId", e.target.value)}>
            <option value="">No project (company expense)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="e-category">Category *</Label>
            <Input
              id="e-category"
              list="e-categories"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="e.g. Office Supplies"
              required
            />
            <datalist id="e-categories">
              {COMMON_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-amount">Amount *</Label>
            <Input
              id="e-amount"
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-date">Date</Label>
          <Input id="e-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
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
