"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  subcontractors?: { id: string; name: string; trade: string | null }[];
  editing?: ProjectCostRow | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
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
        costType: (COST_TYPES.includes(editing.costType as any) ? editing.costType : "LABOUR") as (typeof COST_TYPES)[number],
        amount: String(editing.amount ?? ""),
        date: editing.date ? editing.date.slice(0, 10) : todayISO(),
        vendor: editing.vendor ?? "",
        subcontractorId: editing.subcontractorId ?? "",
        notes: editing.notes ?? "",
      });
    } else if (open && !editing) {
      setForm({ projectId: "", costType: "LABOUR", amount: "", date: todayISO(), vendor: "", subcontractorId: "", notes: "" });
    }
  }, [open, editing]);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
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
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
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
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Cost"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
