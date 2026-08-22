"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

/**
 * Quick inline create for an Employee (worker). Minimal fields — the full
 * form lives on the HR page. Designed to be hosted inside SelectWithCreate.
 */
export function EmployeeQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (entity: { id: string; label?: string }) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    trade: "",
    phone: "",
    wageType: "DAILY",
    dailyRate: "",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          trade: form.trade.trim() || null,
          phone: form.phone.trim() || null,
          wageType: form.wageType,
          dailyRate: form.dailyRate ? Number(form.dailyRate) : 0,
          active: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create employee");
      toast.success("Employee added");
      onOpenChange(false);
      if (onCreated) {
        onCreated({ id: data.id, label: form.name.trim() });
      } else {
        router.refresh();
      }
      setForm({ name: "", trade: "", phone: "", wageType: "DAILY", dailyRate: "" });
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
      title="New Employee"
      description="Add a worker. You can fill the rest of the details from the HR page."
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="eq-name">Name *</Label>
          <Input id="eq-name" value={form.name} onChange={(e) => set("name", e.target.value)} required autoFocus placeholder="Worker name" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="eq-trade">Trade</Label>
            <Input id="eq-trade" value={form.trade} onChange={(e) => set("trade", e.target.value)} placeholder="Masonry, Electrical…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-phone">Phone</Label>
            <Input id="eq-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Mobile number" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="eq-wage">Wage Type</Label>
            <Select id="eq-wage" value={form.wageType} onChange={(e) => set("wageType", e.target.value)}>
              <option value="DAILY">DAILY</option>
              <option value="MONTHLY">MONTHLY</option>
              <option value="FIXED">FIXED</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-rate">Daily Rate (₹)</Label>
            <Input id="eq-rate" type="number" min="0" step="0.01" value={form.dailyRate} onChange={(e) => set("dailyRate", e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Add employee"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
