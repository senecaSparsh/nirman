"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, ShieldCheck } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  // Agreement to Sell (ATS) — registry substitute
  isATS?: boolean;
  atsRegistrationAmount?: number | null;
  atsExpectedRegistryDate?: string | null;
  // Registry number — captured when ATS = No (registry is done)
  registryNo?: string | null;
  // ── RERA registration ──
  reraNumber?: string | null;
  reraRegistrationDate?: string | null;
  reraValidityDate?: string | null;
  reraWebsiteUrl?: string | null;
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
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<ProjectFormValues>;
  projectId?: string;
  onCreated?: (entity: { id: string; label?: string }) => void;
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
    isATS: initial?.isATS ?? false,
    atsRegistrationAmount: initial?.atsRegistrationAmount ?? undefined,
    atsExpectedRegistryDate: initial?.atsExpectedRegistryDate ?? "",
    registryNo: initial?.registryNo ?? "",
    reraNumber: initial?.reraNumber ?? "",
    reraRegistrationDate: initial?.reraRegistrationDate ?? "",
    reraValidityDate: initial?.reraValidityDate ?? "",
    reraWebsiteUrl: initial?.reraWebsiteUrl ?? "",
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
      } else if (onCreated) {
        toast.success("Project created");
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
      if (!isEdit && onCreated) {
        onCreated({ id: data.id, label: data.name });
      } else {
        router.refresh();
      }
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

        {/* ── RERA Registration ── */}
        <div className="rounded-md border border-border p-3 space-y-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-body font-semibold">RERA Registration</div>
              <div className="text-caption text-muted-foreground">
                Mandatory for projects &gt; 500 sqm or &gt; 8 units. Without RERA, the project cannot legally be marketed or sold.
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-rera-no">RERA Number</Label>
              <Input
                id="p-rera-no"
                value={form.reraNumber ?? ""}
                onChange={(e) => set("reraNumber", e.target.value)}
                placeholder="e.g. P1234567890"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-rera-date">Registration Date</Label>
              <Input
                id="p-rera-date"
                type="date"
                value={form.reraRegistrationDate ?? ""}
                onChange={(e) => set("reraRegistrationDate", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-rera-valid">Validity Date</Label>
              <Input
                id="p-rera-valid"
                type="date"
                value={form.reraValidityDate ?? ""}
                onChange={(e) => set("reraValidityDate", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-rera-url">RERA Website URL</Label>
              <Input
                id="p-rera-url"
                value={form.reraWebsiteUrl ?? ""}
                onChange={(e) => set("reraWebsiteUrl", e.target.value)}
                placeholder="https://maharera.maharashtra.gov.in/..."
              />
            </div>
          </div>
        </div>

        {/* ── Agreement to Sell (ATS) — registry substitute ── */}
        {!isEdit && (
          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-body font-semibold">Agreement to Sell (ATS)</div>
                <div className="text-caption text-muted-foreground">
                  If the land registry isn't possible yet (e.g. registry window closed, pending conversion), record an ATS instead — a legal substitute where the registration amount is paid now but the full registry happens later.
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set("isATS", false)}
                className={cn(
                  "rounded-md border p-2 text-center transition-colors",
                  !form.isATS ? "border-brand bg-brand/5" : "border-border hover:border-border-strong",
                )}
              >
                <div className="text-caption font-medium">No ATS</div>
                <div className="text-caption text-muted-foreground">Registry done or pending</div>
              </button>
              <button
                type="button"
                onClick={() => set("isATS", true)}
                className={cn(
                  "rounded-md border p-2 text-center transition-colors",
                  form.isATS ? "border-brand bg-brand/5" : "border-border hover:border-border-strong",
                )}
              >
                <div className="text-caption font-medium">Yes, ATS</div>
                <div className="text-caption text-muted-foreground">Amount paid, registry deferred</div>
              </button>
            </div>
            {form.isATS && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="p-ats-amt">Registration Amount (₹)</Label>
                  <Input
                    id="p-ats-amt"
                    type="number"
                    min={0}
                    value={form.atsRegistrationAmount ?? ""}
                    onChange={(e) => set("atsRegistrationAmount", e.target.value === "" ? undefined : Number(e.target.value))}
                    placeholder="e.g. 500000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-ats-date">Expected Registry Date</Label>
                  <Input
                    id="p-ats-date"
                    type="date"
                    value={form.atsExpectedRegistryDate ?? ""}
                    onChange={(e) => set("atsExpectedRegistryDate", e.target.value || undefined)}
                  />
                </div>
              </div>
            )}
            {!form.isATS && (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="p-reg-no">Registry / Sale Deed No.</Label>
                <Input
                  id="p-reg-no"
                  value={form.registryNo ?? ""}
                  onChange={(e) => set("registryNo", e.target.value || undefined)}
                  placeholder="e.g. SR-1234/2025"
                />
                <p className="text-caption text-muted-foreground">
                  Enter the sale deed / registry number for the land on which this project is built.
                </p>
              </div>
            )}
          </div>
        )}

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
