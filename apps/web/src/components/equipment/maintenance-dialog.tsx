"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const MAINTENANCE_TYPES = ["SCHEDULED", "REPAIR", "INSPECTION"] as const;

export function MaintenanceDialog({
  open,
  onOpenChange,
  equipmentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentId: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: "SCHEDULED" as (typeof MAINTENANCE_TYPES)[number],
    cost: "",
    vendor: "",
    notes: "",
    endDate: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const cost = form.cost === "" ? undefined : Number(form.cost);
      if (cost !== undefined && (Number.isNaN(cost) || cost < 0)) {
        toast.error("Cost must be a number >= 0");
        setSaving(false);
        return;
      }
      const payload = {
        equipmentId,
        type: form.type,
        cost: cost ?? undefined,
        vendor: form.vendor.trim() || null,
        notes: form.notes.trim() || null,
        endDate: form.endDate || null,
      };
      const res = await fetch("/api/equipment-maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to record maintenance");
      toast.success(form.endDate ? "Maintenance recorded & completed" : "Maintenance recorded");
      onOpenChange(false);
      setForm({ type: "SCHEDULED", cost: "", vendor: "", notes: "", endDate: "" });
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
      title="Record Maintenance"
      description="Log a maintenance event. If an end date is set, the maintenance is immediately completed."
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="mt-type">Type</Label>
          <Select
            id="mt-type"
            value={form.type}
            onChange={(e) => set("type", e.target.value)}
          >
            {MAINTENANCE_TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="mt-cost">Cost</Label>
            <Input
              id="mt-cost"
              type="number"
              min="0"
              step="0.01"
              value={form.cost}
              onChange={(e) => set("cost", e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mt-vendor">Vendor</Label>
            <Input
              id="mt-vendor"
              value={form.vendor}
              onChange={(e) => set("vendor", e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mt-endDate">End Date (optional)</Label>
          <Input
            id="mt-endDate"
            type="date"
            value={form.endDate}
            onChange={(e) => set("endDate", e.target.value)}
          />
          <p className="text-caption text-muted-foreground">
            If set, maintenance is immediately marked as completed.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mt-notes">Notes</Label>
          <Textarea
            id="mt-notes"
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
            {saving ? "Saving…" : "Record Maintenance"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
