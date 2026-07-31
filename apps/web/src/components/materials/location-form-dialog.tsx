"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import type { ProjectOption, StockLocationRow } from "@/lib/types";

type FormState = {
  type: "COMPANY_WAREHOUSE" | "PROJECT_SITE";
  name: string;
  projectId: string;
  address: string;
};

export function LocationFormDialog({
  open,
  onOpenChange,
  projects,
  location,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  location: StockLocationRow | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() =>
    location
      ? {
          type: location.type,
          name: location.name,
          projectId: location.projectId ?? "",
          address: location.address ?? "",
        }
      : { type: "COMPANY_WAREHOUSE", name: "", projectId: "", address: "" },
  );
  const [saving, setSaving] = useState(false);
  const isEdit = location != null;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.type === "PROJECT_SITE" && !form.projectId) {
      toast.error("A project site must be linked to a project");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        type: form.type,
        name: form.name.trim(),
        projectId: form.type === "PROJECT_SITE" ? form.projectId : null,
        address: form.address.trim() || null,
      };
      const res = await fetch(
        isEdit ? `/api/stock-locations/${location!.id}` : "/api/stock-locations",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save location");
      toast.success(isEdit ? "Location updated" : "Location created");
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit Stock Location" : "New Stock Location"}
      description="Company warehouses hold central stock; project sites hold on-site stock."
      className="max-w-xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>
            Type <span className="text-danger">*</span>
          </Label>
          <Select
            value={form.type}
            onChange={(e) => set("type", e.target.value as FormState["type"])}
            disabled={isEdit}
          >
            <option value="COMPANY_WAREHOUSE">Company Warehouse</option>
            <option value="PROJECT_SITE">Project Site</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>
            Name <span className="text-danger">*</span>
          </Label>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={form.type === "COMPANY_WAREHOUSE" ? "Central Warehouse" : "Greenfield Site Yard"}
            required
            autoFocus
          />
        </div>
        {form.type === "PROJECT_SITE" && (
          <div className="space-y-1.5">
            <Label>
              Project <span className="text-danger">*</span>
            </Label>
            <Select value={form.projectId} onChange={(e) => set("projectId", e.target.value)} required>
              <option value="" disabled>
                Select project…
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Address</Label>
          <Textarea
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="Optional address / landmark"
            rows={2}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create location"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
