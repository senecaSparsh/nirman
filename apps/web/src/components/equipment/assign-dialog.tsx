"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StockLocationRow, ProjectOption } from "@/lib/types";

export function AssignDialog({
  open,
  onOpenChange,
  equipmentId,
  locations,
  projects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentId: string;
  locations: StockLocationRow[];
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    locationId: "",
    projectId: "",
    notes: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.locationId) {
      toast.error("Please select a location");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        equipmentId,
        locationId: form.locationId,
        projectId: form.projectId || null,
        notes: form.notes.trim() || null,
      };
      const res = await fetch("/api/equipment-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to assign equipment");
      toast.success("Equipment assigned");
      onOpenChange(false);
      setForm({ locationId: "", projectId: "", notes: "" });
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
      title="Assign Equipment"
      description="Send this equipment to a project site or warehouse."
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="as-location">Location *</Label>
          <Select
            id="as-location"
            value={form.locationId}
            onChange={(e) => set("locationId", e.target.value)}
            required
          >
            <option value="">Select location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.type === "PROJECT_SITE" ? "Project Site" : "Warehouse"})
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="as-project">Project (optional)</Label>
          <Select
            id="as-project"
            value={form.projectId}
            onChange={(e) => set("projectId", e.target.value)}
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="as-notes">Notes</Label>
          <Textarea
            id="as-notes"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Assigning…" : "Assign"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
