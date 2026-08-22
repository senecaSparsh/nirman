"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const SOURCES = [
  ["PORTAL", "Property portal"],
  ["WALK_IN", "Walk-in"],
  ["REFERRAL", "Referral"],
  ["BROKER", "Broker"],
  ["DIGITAL_AD", "Digital ad"],
  ["OTHER", "Other"],
] as const;

export function LeadFormDialog({
  open,
  onOpenChange,
  projects,
  units,
  assignees,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: { id: string; name: string }[];
  units: { id: string; projectId: string; projectName: string; label: string }[];
  assignees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    source: "PORTAL",
    priority: "MEDIUM",
    projectId: "",
    interestedUnitId: "",
    budgetMin: "",
    budgetMax: "",
    assignedToId: "",
    nextFollowUpAt: "",
    notes: "",
  });

  const filteredUnits = useMemo(
    () => form.projectId ? units.filter((unit) => unit.projectId === form.projectId) : units,
    [form.projectId, units],
  );

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "projectId" ? { interestedUnitId: "" } : {}),
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          email: form.email || undefined,
          projectId: form.projectId || undefined,
          interestedUnitId: form.interestedUnitId || undefined,
          budgetMin: form.budgetMin || undefined,
          budgetMax: form.budgetMax || undefined,
          assignedToId: form.assignedToId || undefined,
          nextFollowUpAt: form.nextFollowUpAt || undefined,
          notes: form.notes || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to add lead");
      toast.success("Lead added to the pipeline");
      setForm({
        name: "",
        phone: "",
        email: "",
        source: "PORTAL",
        priority: "MEDIUM",
        projectId: "",
        interestedUnitId: "",
        budgetMin: "",
        budgetMax: "",
        assignedToId: "",
        nextFollowUpAt: "",
        notes: "",
      });
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New lead"
      description="Capture enough context for the next useful sales action."
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lead-name">Name *</Label>
            <Input id="lead-name" value={form.name} onChange={(event) => set("name", event.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-phone">Phone *</Label>
            <Input id="lead-phone" value={form.phone} onChange={(event) => set("phone", event.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-email">Email</Label>
            <Input id="lead-email" type="email" value={form.email} onChange={(event) => set("email", event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-source">Source *</Label>
              <Select id="lead-source" value={form.source} onChange={(event) => set("source", event.target.value)}>
                {SOURCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-priority">Priority</Label>
              <Select id="lead-priority" value={form.priority} onChange={(event) => set("priority", event.target.value)}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="HOT">Hot</option>
              </Select>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lead-project">Project</Label>
            <Select id="lead-project" value={form.projectId} onChange={(event) => set("projectId", event.target.value)}>
              <option value="">Any project</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-unit">Interested unit</Label>
            <Select id="lead-unit" value={form.interestedUnitId} onChange={(event) => set("interestedUnitId", event.target.value)}>
              <option value="">Not decided</option>
              {filteredUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.projectName} · {unit.label}</option>)}
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="lead-budget-min">Budget from</Label>
            <Input id="lead-budget-min" type="number" min="0" step="0.01" value={form.budgetMin} onChange={(event) => set("budgetMin", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-budget-max">Budget to</Label>
            <Input id="lead-budget-max" type="number" min="0" step="0.01" value={form.budgetMax} onChange={(event) => set("budgetMax", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-owner">Owner</Label>
            <Select id="lead-owner" value={form.assignedToId} onChange={(event) => set("assignedToId", event.target.value)}>
              <option value="">Unassigned</option>
              {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lead-follow-up">Next follow-up</Label>
          <Input id="lead-follow-up" type="datetime-local" value={form.nextFollowUpAt} onChange={(event) => set("nextFollowUpAt", event.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lead-notes">Notes</Label>
          <Textarea id="lead-notes" value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={3} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving || !form.name.trim() || !form.phone.trim()}>{saving ? "Adding…" : "Add lead"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
