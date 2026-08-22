"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";

type MaterialOption = { id: string; code: string; name: string; unit: string };
type LocationOption = { id: string; name: string; type: string };
type ProjectOption = { id: string; name: string; type: string; status: string };

type Line = {
  id: string;
  materialId: string;
  description: string;
  qty: string;
  unit: string;
};

const VEHICLE_TYPES = ["PICKUP", "TRUCK", "TRACTOR", "MINI_TRUCK", "AUTO", "OTHER"];

export function GatePassFormDialog({
  open,
  onOpenChange,
  locations,
  materials,
  projects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: LocationOption[];
  materials: MaterialOption[];
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    locationId: "",
    projectId: "",
    destination: "",
    purpose: "",
    notes: "",
    vehicleNumber: "",
    vehicleType: "PICKUP",
    driverName: "",
    driverPhone: "",
    transporterName: "",
    autoSubmit: true,
  });
  const [lines, setLines] = useState<Line[]>([
    { id: crypto.randomUUID(), materialId: "", description: "", qty: "", unit: "" },
  ]);

  useEffect(() => {
    if (open) {
      setForm({
        locationId: locations[0]?.id ?? "",
        projectId: "",
        destination: "",
        purpose: "",
        notes: "",
        vehicleNumber: "",
        vehicleType: "PICKUP",
        driverName: "",
        driverPhone: "",
        transporterName: "",
        autoSubmit: true,
      });
      setLines([{ id: crypto.randomUUID(), materialId: "", description: "", qty: "", unit: "" }]);
    }
  }, [open, locations]);

  function set(key: keyof typeof form, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setLine(id: string, key: keyof Line, value: string) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.id !== id) return l;
        if (key === "materialId") {
          const mat = materials.find((m) => m.id === value);
          return { ...l, materialId: value, unit: mat?.unit ?? "", description: mat ? `${mat.code} · ${mat.name}` : l.description };
        }
        return { ...l, [key]: value };
      }),
    );
  }

  function addLine() {
    setLines((ls) => [...ls, { id: crypto.randomUUID(), materialId: "", description: "", qty: "", unit: "" }]);
  }

  function removeLine(id: string) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.locationId) {
      toast.error("Select a gate / location");
      return;
    }
    const validLines = lines.filter((l) => (l.materialId || l.description) && l.qty);
    if (validLines.length === 0) {
      toast.error("Add at least one line item with quantity");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/gate-passes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: form.locationId,
          projectId: form.projectId || null,
          category: "MANUAL",
          lines: validLines.map((l) => ({
            materialId: l.materialId || null,
            description: l.description || null,
            qty: l.qty,
            unit: l.unit || null,
          })),
          vehicleNumber: form.vehicleNumber || null,
          vehicleType: form.vehicleType,
          driverName: form.driverName || null,
          driverPhone: form.driverPhone || null,
          transporterName: form.transporterName || null,
          destination: form.destination || null,
          purpose: form.purpose || null,
          notes: form.notes || null,
          autoSubmit: form.autoSubmit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create gate pass");
      toast.success(`Gate pass ${data.gatePassNumber} created`, {
        description: form.autoSubmit ? "Submitted for approval — items cannot leave until approved." : "Saved as draft.",
      });
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Gate Pass"
      description="Generate a gate pass for items leaving the gate. An authorized person must approve before items can physically exit."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="gp-location">Gate / Location *</Label>
            <Select id="gp-location" value={form.locationId} onChange={(e) => set("locationId", e.target.value)} required>
              <option value="">Select location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.type === "COMPANY_WAREHOUSE" ? "Warehouse" : "Site"})
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gp-project">Project</Label>
            <Select id="gp-project" value={form.projectId} onChange={(e) => set("projectId", e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="gp-destination">Destination</Label>
          <Input id="gp-destination" value={form.destination} onChange={(e) => set("destination", e.target.value)} placeholder="Where items are going" />
        </div>

        {/* Line items */}
        <div className="space-y-2">
          <Label>Items</Label>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground tracking-wide">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Material / Description</th>
                  <th className="px-2 py-1.5 text-right font-medium w-24">Qty</th>
                  <th className="px-2 py-1.5 text-left font-medium w-20">Unit</th>
                  <th className="px-2 py-1.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t border-border/40">
                    <td className="px-2 py-1.5">
                      <Select value={l.materialId} onChange={(e) => setLine(l.id, "materialId", e.target.value)} className="h-8 text-caption">
                        <option value="">— Select material or type description below —</option>
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>{m.code} · {m.name}</option>
                        ))}
                      </Select>
                      <Input
                        value={l.description}
                        onChange={(e) => setLine(l.id, "description", e.target.value)}
                        placeholder="Description (for non-material items)"
                        className="mt-1 h-7 text-caption"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input type="number" min="0" step="any" value={l.qty} onChange={(e) => setLine(l.id, "qty", e.target.value)} className="h-8 text-caption text-right" placeholder="0" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={l.unit} onChange={(e) => setLine(l.id, "unit", e.target.value)} className="h-8 text-caption" placeholder="unit" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button type="button" onClick={() => removeLine(l.id)} className="text-muted-foreground hover:text-danger" title="Remove">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={addLine}>
            + Add line
          </Button>
        </div>

        {/* Vehicle details */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="gp-vno">Vehicle Number</Label>
            <Input id="gp-vno" value={form.vehicleNumber} onChange={(e) => set("vehicleNumber", e.target.value)} placeholder="RJ01 AB 1234" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gp-vtype">Vehicle Type</Label>
            <Select id="gp-vtype" value={form.vehicleType} onChange={(e) => set("vehicleType", e.target.value)}>
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>{v.replace("_", " ")}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gp-trans">Transporter</Label>
            <Input id="gp-trans" value={form.transporterName} onChange={(e) => set("transporterName", e.target.value)} placeholder="Transporter name" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="gp-driver">Driver Name</Label>
            <Input id="gp-driver" value={form.driverName} onChange={(e) => set("driverName", e.target.value)} placeholder="Driver name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gp-phone">Driver Phone</Label>
            <Input id="gp-phone" value={form.driverPhone} onChange={(e) => set("driverPhone", e.target.value)} placeholder="98765 43210" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="gp-purpose">Purpose</Label>
          <Input id="gp-purpose" value={form.purpose} onChange={(e) => set("purpose", e.target.value)} placeholder="e.g. Issue to site, return to supplier" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gp-notes">Notes</Label>
          <Textarea id="gp-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Optional" />
        </div>

        <label className="flex items-center gap-2 text-caption text-muted-foreground">
          <input type="checkbox" checked={form.autoSubmit} onChange={(e) => set("autoSubmit", e.target.checked)} />
          Submit for approval immediately (uncheck to save as draft)
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : form.autoSubmit ? "Create & Submit" : "Create Draft"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
