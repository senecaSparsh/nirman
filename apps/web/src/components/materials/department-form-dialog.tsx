"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import type { DepartmentRow } from "@/lib/types";

type FormState = {
  code: string;
  name: string;
  description: string;
  active: boolean;
};

export function DepartmentFormDialog({
  open,
  onOpenChange,
  department,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: DepartmentRow | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() =>
    department
      ? {
          code: department.code,
          name: department.name,
          description: department.description ?? "",
          active: department.active,
        }
      : { code: "", name: "", description: "", active: true },
  );
  const [saving, setSaving] = useState(false);
  const isEdit = department != null;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim()) {
      toast.error("Department code is required");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Department name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        active: form.active,
      };
      const res = await fetch(
        isEdit ? `/api/departments/${department!.id}` : "/api/departments",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save department");
      toast.success(isEdit ? "Department updated" : "Department created");
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save department");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit Department" : "New Department / Cost Centre"}
      description="Departments are operational consumption targets for raw materials (e.g. Boiler, Dryer, MP-2, Workshop). Materials issued to a department hit operating expenses."
      className="max-w-xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>
              Code <span className="text-danger">*</span>
            </Label>
            <Input
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="BOILER"
              required
              autoFocus
              className="font-mono uppercase"
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Name <span className="text-danger">*</span>
            </Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Boiler House"
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Optional — what this cost centre is for"
            rows={2}
          />
        </div>
        <label className="flex items-center gap-2 text-body">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => set("active", e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Active (can receive material issues)
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create department"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
