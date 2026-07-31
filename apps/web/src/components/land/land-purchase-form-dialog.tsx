"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectOption, LandPurchaseRow } from "@/lib/types";

export function LandPurchaseFormDialog({
  open,
  onOpenChange,
  projects,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  editing?: LandPurchaseRow | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: "",
    sellerName: "",
    sellerContact: "",
    purchaseDate: "",
    totalArea: "",
    areaUnit: "SQFT",
    totalCost: "",
    registryNo: "",
    location: "",
    initialParcelNumber: "",
  });

  // Populate form when editing
  useEffect(() => {
    if (open && editing) {
      setForm({
        projectId: editing.projectId ?? "",
        sellerName: editing.sellerName ?? "",
        sellerContact: editing.sellerContact ?? "",
        purchaseDate: editing.purchaseDate ? editing.purchaseDate.slice(0, 10) : "",
        totalArea: String(editing.totalArea ?? ""),
        areaUnit: editing.areaUnit ?? "SQFT",
        totalCost: String(editing.totalCost ?? ""),
        registryNo: editing.registryNo ?? "",
        location: editing.location ?? "",
        initialParcelNumber: "",
      });
    } else if (open && !editing) {
      setForm({ projectId: "", sellerName: "", sellerContact: "", purchaseDate: "", totalArea: "", areaUnit: "SQFT", totalCost: "", registryNo: "", location: "", initialParcelNumber: "" });
    }
  }, [open, editing]);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.sellerName.trim()) return toast.error("Seller name is required");
    if (!form.totalArea || Number(form.totalArea) <= 0) return toast.error("Total area must be > 0");
    if (!form.totalCost || Number(form.totalCost) <= 0) return toast.error("Total cost must be > 0");

    setSaving(true);
    try {
      const payload = {
        projectId: form.projectId || null,
        sellerName: form.sellerName.trim(),
        sellerContact: form.sellerContact.trim() || null,
        purchaseDate: form.purchaseDate || null,
        totalArea: Number(form.totalArea),
        areaUnit: form.areaUnit,
        totalCost: Number(form.totalCost),
        registryNo: form.registryNo.trim() || null,
        location: form.location.trim() || null,
        ...(editing ? {} : { initialParcelNumber: form.initialParcelNumber.trim() || undefined }),
      };
      const res = await fetch(
        editing ? `/api/land-purchases/${editing.id}` : "/api/land-purchases",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save land purchase");
      toast.success(editing ? "Land purchase updated" : "Land purchase recorded");
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={editing ? "Edit Land Purchase" : "Record Land Purchase"} description={editing ? "Update land purchase details." : "A land purchase creates an initial parcel covering the full area. You can partition it later."} className="max-w-lg">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Project (optional)</Label>
          <Select value={form.projectId} onChange={(e) => set("projectId", e.target.value)}>
            <option value="">No project — standalone land</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Seller Name *</Label>
            <Input value={form.sellerName} onChange={(e) => set("sellerName", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Seller Contact</Label>
            <Input value={form.sellerContact} onChange={(e) => set("sellerContact", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Total Area *</Label>
            <Input type="number" min={0} step="any" value={form.totalArea} onChange={(e) => set("totalArea", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <Select value={form.areaUnit} onChange={(e) => set("areaUnit", e.target.value)}>
              {["SQFT", "SQM", "ACRE", "BIGHA", "HECTARE"].map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Total Cost *</Label>
          <Input type="number" min={0} step="any" value={form.totalCost} onChange={(e) => set("totalCost", e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Registry No.</Label>
            <Input value={form.registryNo} onChange={(e) => set("registryNo", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Purchase Date</Label>
            <Input type="date" value={form.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Location</Label>
          <Textarea value={form.location} onChange={(e) => set("location", e.target.value)} rows={2} />
        </div>
        {!editing && (
          <div className="space-y-1.5">
            <Label>Initial Parcel Number</Label>
            <Input value={form.initialParcelNumber} onChange={(e) => set("initialParcelNumber", e.target.value)} placeholder="PLOT-1 (default)" />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save Changes" : "Record Purchase"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
