"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { required } from "@/lib/validate";
import { useInlineValidation, type ValidationRules } from "@/lib/use-inline-validation";
import type { ProjectOption, StockLocationRow } from "@/lib/types";

type FormState = {
  type: "CENTRAL_WAREHOUSE" | "COMPANY_WAREHOUSE" | "PROJECT_SITE" | "DEPARTMENT";
  name: string;
  projectId: string;
  address: string;
};

export function LocationFormDialog({
  open,
  onOpenChange,
  projects,
  location,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  location: StockLocationRow | null;
  onCreated?: (entity: { id: string; label?: string }) => void;
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

  // ── Inline validation ──────────────────────────────────────────
  // Validates on blur and shows red error text under the field instantly.
  const validationRules: ValidationRules<FormState> = {
    name: (v) => required(v as string, "Name"),
    type: (v) => required(v as string, "Type"),
    projectId: (v, all) => (all.type === "PROJECT_SITE" ? required(v as string, "Project") : undefined),
  };
  const { errors, onBlur, validateAll, clearError, clearAll } = useInlineValidation<FormState>(validationRules);

  // Reset validation errors when the dialog opens fresh.
  useEffect(() => {
    if (!open) return;
    clearAll();
  }, [open]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    clearError(key);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateAll(form)) {
      toast.error("Please fix the errors in the form");
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
      if (!isEdit && onCreated) {
        onCreated({ id: data.id, label: data.name });
      } else {
        router.refresh();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
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
        <Field label="Type" required error={errors.type}>
          <Select
            value={form.type}
            onChange={(e) => set("type", e.target.value as FormState["type"])}
            onBlur={() => onBlur("type", form)}
            aria-invalid={!!errors.type}
            disabled={isEdit}
          >
            <option value="CENTRAL_WAREHOUSE">Central Warehouse (Parent Company)</option>
            <option value="COMPANY_WAREHOUSE">Company Warehouse</option>
            <option value="PROJECT_SITE">Project Site</option>
            <option value="DEPARTMENT">Department / Cost Centre</option>
          </Select>
        </Field>
        <Field label="Name" required error={errors.name}>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            onBlur={() => onBlur("name", form)}
            aria-invalid={!!errors.name}
            placeholder={form.type === "COMPANY_WAREHOUSE" ? "Central Warehouse" : "Greenfield Site Yard"}
            required
            autoFocus
          />
        </Field>
        {form.type === "PROJECT_SITE" && (
          <Field label="Project" required error={errors.projectId}>
            <Select
              value={form.projectId}
              onChange={(e) => set("projectId", e.target.value)}
              onBlur={() => onBlur("projectId", form)}
              aria-invalid={!!errors.projectId}
              required
            >
              <option value="" disabled>
                Select project…
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Address">
          <Textarea
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="Optional address / landmark"
            rows={2}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
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
