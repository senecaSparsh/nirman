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
import type { GlPreviewLine } from "@nirman/services/gl-preview";
import type { ProjectOption, ProjectCostRow } from "@/lib/types";

const COST_TYPES = ["LABOUR", "OVERHEAD", "EQUIPMENT", "CONTRACTOR", "PERMIT", "OTHER"] as const;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function ProjectCostFormDialog({
  open,
  onOpenChange,
  projects,
  subcontractors,
  editing,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  subcontractors?: { id: string; name: string; trade: string | null }[];
  editing?: ProjectCostRow | null;
  /** Pre-fill fields (e.g. { projectId: "abc" } when scoped to a project node). */
  defaults?: { projectId?: string };
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLines, setPreviewLines] = useState<GlPreviewLine[]>([]);
  const [form, setForm] = useState({
    projectId: "",
    costType: "LABOUR" as (typeof COST_TYPES)[number],
    amount: "",
    date: todayISO(),
    vendor: "",
    subcontractorId: "",
    notes: "",
  });

  // Reset/populate form when dialog opens
  useEffect(() => {
    if (open && editing) {
      setForm({
        projectId: editing.projectId ?? "",
        costType: (COST_TYPES.includes(editing.costType as (typeof COST_TYPES)[number]) ? editing.costType : "LABOUR") as (typeof COST_TYPES)[number],
        amount: String(editing.amount ?? ""),
        date: editing.date ? editing.date.slice(0, 10) : todayISO(),
        vendor: editing.vendor ?? "",
        subcontractorId: editing.subcontractorId ?? "",
        notes: editing.notes ?? "",
      });
    } else if (open && !editing) {
      setForm({ projectId: defaults?.projectId ?? "", costType: "LABOUR", amount: "", date: todayISO(), vendor: "", subcontractorId: "", notes: "" });
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
        body: JSON.stringify({ type: "projectCost", amount }),
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
    if (!form.projectId) {
      toast.error("Project is required");
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
        projectId: form.projectId,
        costType: form.costType,
        amount,
        date: form.date || null,
        vendor: form.vendor.trim() || null,
        subcontractorId: form.subcontractorId || null,
        notes: form.notes.trim() || null,
      };
      const res = await fetch(
        editing ? `/api/project-costs/${editing.id}` : "/api/project-costs",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save project cost");
      toast.success(editing ? "Project cost updated" : "Project cost added");
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
      title={editing ? "Edit Project Cost" : "Add Project Cost"}
      description="Record a labour, overhead, equipment, contractor, permit or other cost against a project."
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="pc-project">Project *</Label>
          <Select id="pc-project" value={form.projectId} onChange={(e) => set("projectId", e.target.value)} required>
            <option value="">Select project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pc-costType">Cost Type *</Label>
            <Select id="pc-costType" value={form.costType} onChange={(e) => set("costType", e.target.value)}>
              {COST_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace("_", " ")}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pc-amount">Amount *</Label>
            <Input
              id="pc-amount"
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pc-date">Date</Label>
            <Input id="pc-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pc-vendor">Vendor</Label>
            <Input id="pc-vendor" value={form.vendor} onChange={(e) => set("vendor", e.target.value)} placeholder="Optional" />
          </div>
        </div>
        {subcontractors && subcontractors.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="pc-subcontractor">Subcontractor</Label>
            <Select id="pc-subcontractor" value={form.subcontractorId} onChange={(e) => set("subcontractorId", e.target.value)}>
              <option value="">None</option>
              {subcontractors.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.trade ? ` (${s.trade})` : ""}</option>
              ))}
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="pc-notes">Notes</Label>
          <Textarea id="pc-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Optional" />
        </div>

        {/* GL Impact Preview — collapsible inline panel before submit */}
        {!editing && previewLines.length > 0 && (
          <GlPreviewPanel
            lines={previewLines}
            title="GL Impact — Project Cost"
            description="This journal entry will be posted when you add the project cost."
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
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Cost"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
