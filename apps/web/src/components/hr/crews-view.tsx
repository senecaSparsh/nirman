"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UsersRound, Plus, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { StatusPill } from "@/components/page";
import { formatCurrency } from "@/lib/utils";

export type CrewMember = {
  id: string;
  name: string;
  trade: string | null;
  dailyRate: number;
  wageType: string;
  active: boolean;
};

export type CrewRow = {
  id: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
  supervisorId: string | null;
  supervisorName: string | null;
  active: boolean;
  members: CrewMember[];
};

export function CrewsView({
  crews,
  employees,
  projects,
  permissions,
}: {
  crews: CrewRow[];
  employees: { id: string; name: string; trade: string | null }[];
  projects: { id: string; name: string }[];
  permissions?: { canManage?: boolean };
}) {
  const router = useRouter();
  const canManage = permissions?.canManage ?? true;
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CrewRow | null>(null);
  const [delTarget, setDelTarget] = useState<CrewRow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-body text-muted-foreground">
          {crews.length} crew{crews.length !== 1 ? "s" : ""}
        </div>
        {canManage && (
          <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Crew
          </Button>
        )}
      </div>

      {/* Crew list */}
      {crews.length === 0 ? (
        <EmptyState
          icon={<UsersRound className="h-5 w-5" />}
          title="No crews"
          description="Group workers into crews assigned to projects and supervisors."
          action={canManage ? <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> Add Crew</Button> : undefined}
        />
      ) : (
        <div className="space-y-2">
          {crews.map((c) => (
            <div key={c.id} className="rounded-lg border border-border bg-card">
              <button
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/20"
              >
                {expanded === c.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-body font-medium">{c.name}</span>
                    <StatusPill status={c.active ? "ACTIVE" : "INACTIVE"} />
                  </div>
                  <div className="mt-0.5 text-caption text-muted-foreground">
                    {c.members.length} member{c.members.length !== 1 ? "s" : ""}
                    {c.projectName && ` · ${c.projectName}`}
                    {c.supervisorName && ` · led by ${c.supervisorName}`}
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditTarget(c); setFormOpen(true); }}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDelTarget(c); }}
                      className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </button>

              {expanded === c.id && c.members.length > 0 && (
                <div className="border-t border-border p-3">
                  <div className="space-y-1">
                    {c.members.map((m) => (
                      <div key={m.id} className="flex items-center justify-between py-1">
                        <div>
                          <span className="text-body font-medium">{m.name}</span>
                          {m.trade && <span className="ml-2 text-caption text-muted-foreground">{m.trade}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{m.wageType}</Badge>
                          <span className="tnum text-caption text-muted-foreground">
                            {m.wageType === "DAILY" ? `${formatCurrency(m.dailyRate)}/day` : ""}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Form dialog */}
      {formOpen && (
        <CrewFormDialog
          crew={editTarget}
          employees={employees}
          projects={projects}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); router.refresh(); }}
        />
      )}

      {/* Delete confirm */}
      {delTarget && (
        <DeleteConfirmDialog
          open={!!delTarget}
          onOpenChange={(o) => !o && setDelTarget(null)}
          endpoint={`/api/crews/${delTarget.id}`}
          title="Delete Crew"
          description={`Are you sure you want to delete ${delTarget.name}? This will remove the crew. Member assignments will be cleared.`}
          successMessage="Crew deleted"
        />
      )}
    </div>
  );
}

function CrewFormDialog({
  crew,
  employees,
  projects,
  onClose,
  onSaved,
}: {
  crew: CrewRow | null;
  employees: { id: string; name: string; trade: string | null }[];
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!crew;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: crew?.name ?? "",
    projectId: crew?.projectId ?? "",
    supervisorId: crew?.supervisorId ?? "",
  });
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(
    new Set(crew?.members.map((m) => m.id) ?? []),
  );

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      projectId: form.projectId || null,
      supervisorId: form.supervisorId || null,
      memberIds: [...selectedMembers],
    };
    try {
      const res = isEdit
        ? await fetch(`/api/crews/${crew!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/crews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        toast.success(isEdit ? "Crew updated" : "Crew created");
        onSaved();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? "Edit Crew" : "Add Crew"}
      className="max-h-[85vh] max-w-lg overflow-y-auto"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label>Crew Name *</Label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required placeholder="Masonry Crew A" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Project</Label>
            <Select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">None (floating)</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Supervisor</Label>
            <Select value={form.supervisorId} onChange={(e) => setForm((f) => ({ ...f, supervisorId: e.target.value }))}>
              <option value="">None</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </div>
        </div>
        <div>
          <Label>Members</Label>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {employees.map((e) => (
              <label key={e.id} className="flex cursor-pointer items-center gap-2 py-0.5 text-body hover:bg-muted/30 rounded px-1">
                <input
                  type="checkbox"
                  checked={selectedMembers.has(e.id)}
                  onChange={() => toggleMember(e.id)}
                />
                <span>{e.name}</span>
                {e.trade && <span className="text-caption text-muted-foreground">· {e.trade}</span>}
              </label>
            ))}
          </div>
          <p className="mt-1 text-micro text-muted-foreground">{selectedMembers.size} selected</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
