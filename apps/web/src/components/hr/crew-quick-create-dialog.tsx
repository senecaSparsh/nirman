"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import type { ProjectOption } from "@/lib/types";

/**
 * Quick inline create for a Crew. Minimal fields — name + optional project.
 * The full crew builder (with member assignment) lives on the HR page.
 */
export function CrewQuickCreateDialog({
  open,
  onOpenChange,
  projects,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  onCreated?: (entity: { id: string; label?: string }) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Crew name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/crews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          projectId: projectId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create crew");
      toast.success("Crew created");
      onOpenChange(false);
      if (onCreated) {
        onCreated({ id: data.id, label: name.trim() });
      } else {
        router.refresh();
      }
      setName("");
      setProjectId("");
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
      title="New Crew"
      description="Create a crew. Assign members from the HR page."
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="cq-name">Crew Name *</Label>
          <Input id="cq-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. Masonry Crew A" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cq-project">Project (optional)</Label>
          <Select id="cq-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create crew"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
