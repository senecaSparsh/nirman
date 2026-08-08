"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ProjectFormValues = {
  name: string;
  type: "RESIDENTIAL" | "COMMERCIAL" | "WAREHOUSE" | "MALL" | "LAND" | "OTHER";
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "ON_HOLD";
  address?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  totalBudget?: number | null;
  totalSellableArea?: number | null;
  description?: string | null;
};

const TYPE_LABELS: Record<ProjectFormValues["type"], string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  WAREHOUSE: "Warehouse",
  MALL: "Mall / Retail",
  LAND: "Land Development",
  OTHER: "Other",
};

const STATUS_LABELS: Record<ProjectFormValues["status"], string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ON_HOLD: "On Hold",
};

export function ProjectFormDialog({
  open,
  onOpenChange,
  initial,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<ProjectFormValues>;
  projectId?: string;
}) {
  const router = useRouter();
  const isEdit = Boolean(projectId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProjectFormValues>({
    name: initial?.name ?? "",
    type: initial?.type ?? "RESIDENTIAL",
    status: initial?.status ?? "PLANNED",
    address: initial?.address ?? "",
    startDate: initial?.startDate ?? "",
    endDate: initial?.endDate ?? "",
    totalBudget: initial?.totalBudget ?? undefined,
    totalSellableArea: initial?.totalSellableArea ?? undefined,
    description: initial?.description ?? "",
  });

  function set<K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Project name is required");
      return;
    }
    setSaving(true);
    try {
      const url = projectId ? `/api/projects/${projectId}` : "/api/projects";
      const method = projectId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save project");
      if (isEdit) {
        toast.success("Project updated");
      } else {
        const newProjectId = data.id ?? "";
        toast.success("Project created", {
          description: "Add built units (flats, shops, plots) to start tracking inventory.",
          action: {
            label: "Add Units",
            onClick: () => router.push(`/projects/${newProjectId}`),
          },
        });
      }
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
      title={isEdit ? "Edit Project" : "New Project"}
      description={isEdit ? "Update project details." : "Create a new construction or development project (site)."}
      className="max-w-xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-name">Project Name *</Label>
          <Input
            id="p-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Apex Center — Tower One"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-type">Type</Label>
            <Select id="p-type" value={form.type} onChange={(e) => set("type", e.target.value as ProjectFormValues["type"])}>
              {(Object.keys(TYPE_LABELS) as ProjectFormValues["type"][]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-status">Status</Label>
            <Select id="p-status" value={form.status} onChange={(e) => set("status", e.target.value as ProjectFormValues["status"])}>
              {(Object.keys(STATUS_LABELS) as ProjectFormValues["status"][]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p-address">Address</Label>
          <Input id="p-address" value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="Site address — plot no, area, city, PIN" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-start">Start Date</Label>
            <Input id="p-start" type="date" value={form.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-end">End Date</Label>
            <Input id="p-end" type="date" value={form.endDate ?? ""} onChange={(e) => set("endDate", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-budget">Total Budget (₹)</Label>
            <Input
              id="p-budget"
              type="number"
              min={0}
              value={form.totalBudget ?? ""}
              onChange={(e) => set("totalBudget", e.target.value === "" ? undefined : Number(e.target.value))}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-area">Sellable Area (sq.ft)</Label>
            <Input
              id="p-area"
              type="number"
              min={0}
              step="any"
              value={form.totalSellableArea ?? ""}
              onChange={(e) => set("totalSellableArea", e.target.value === "" ? undefined : Number(e.target.value))}
              placeholder="0"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p-desc">Description</Label>
          <Textarea id="p-desc" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Optional notes" />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Project"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
