"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

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
  open,
  onOpenChange,
  initial,
  phaseId,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<PhaseFormValues>;
  phaseId?: string;
}) {
  const router = useRouter();
  const isEdit = Boolean(phaseId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PhaseFormValues>({
    name: initial?.name ?? "",
    status: initial?.status ?? "PLANNED",
    startDate: initial?.startDate ?? "",
    endDate: initial?.endDate ?? "",
    budget: initial?.budget ?? undefined,
    sortOrder: initial?.sortOrder ?? 0,
  });

  function set<K extends keyof PhaseFormValues>(key: K, value: PhaseFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Phase name is required");
      return;
    }
    setSaving(true);
    try {
      const url = phaseId
        ? `/api/projects/${projectId}/phases/${phaseId}`
        : `/api/projects/${projectId}/phases`;
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
      title={isEdit ? "Edit Phase" : "Add Phase"}
      description={isEdit ? "Update phase details." : "Add a phase to this project (e.g. Tower A, Phase 1)."}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ph-name">Phase Name *</Label>
          <Input id="ph-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Tower A" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ph-status">Status</Label>
            <Select id="ph-status" value={form.status} onChange={(e) => set("status", e.target.value as PhaseStatus)}>
              {(Object.keys(STATUS_LABELS) as PhaseStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ph-sort">Sort Order</Label>
            <Input
              id="ph-sort"
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(e) => set("sortOrder", Number(e.target.value))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ph-start">Start Date</Label>
            <Input id="ph-start" type="date" value={form.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ph-end">End Date</Label>
            <Input id="ph-end" type="date" value={form.endDate ?? ""} onChange={(e) => set("endDate", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ph-budget">Phase Budget (₹)</Label>
          <Input
            id="ph-budget"
            type="number"
            min={0}
            value={form.budget ?? ""}
            onChange={(e) => set("budget", e.target.value === "" ? undefined : Number(e.target.value))}
            placeholder="0"
          />
        </div>
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
