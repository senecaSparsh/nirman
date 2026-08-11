"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UsersRound, Plus, Pencil, Trash2, MapPin, User, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { StatusPill } from "@/components/page";
import { formatCurrency, cn } from "@/lib/utils";

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

const AVATAR_COLORS = [
  "bg-[var(--color-world-hr)]/15 text-[var(--color-world-hr)]",
  "bg-success/15 text-success",
  "bg-info/15 text-info",
  "bg-warning/15 text-warning",
  "bg-brand/15 text-brand",
  "bg-primary/10 text-primary",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Summary stats bar for crews. */
function CrewStatsBar({ crews }: { crews: CrewRow[] }) {
  const total = crews.length;
  const active = crews.filter((c) => c.active).length;
  const totalMembers = crews.reduce((sum, c) => sum + c.members.length, 0);
  const assignedToProject = crews.filter((c) => c.projectId).length;
  const withSupervisor = crews.filter((c) => c.supervisorId).length;

  return (
    <div className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4 sm:divide-x divide-y sm:divide-y-0">
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Crews</span>
        <span className="text-figure text-foreground">{total}</span>
        <span className="text-micro text-muted-foreground">{active} active</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Members</span>
        <span className="text-figure text-foreground">{totalMembers}</span>
        <span className="text-micro text-muted-foreground">{total > 0 ? (totalMembers / total).toFixed(1) : 0} avg / crew</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">On Project</span>
        <span className="text-figure text-foreground">{assignedToProject}</span>
        <span className="text-micro text-muted-foreground">{total - assignedToProject} unassigned</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">With Supervisor</span>
        <span className="text-figure text-foreground">{withSupervisor}</span>
        <span className="text-micro text-muted-foreground">{total - withSupervisor} no lead</span>
      </div>
    </div>
  );
}

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
  const canManage = permissions?.canManage ?? false;
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CrewRow | null>(null);
  const [delTarget, setDelTarget] = useState<CrewRow | null>(null);
  const [detailTarget, setDetailTarget] = useState<CrewRow | null>(null);

  const crewColumns: Column<CrewRow>[] = [
    {
      key: "name",
      label: "Crew",
      sortable: true,
      width: "220px",
      sortValue: (c) => c.name,
      render: (c) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-world-hr)]/10">
            <UsersRound className="h-3.5 w-3.5 text-[var(--color-world-hr)]" />
          </span>
          <div className="min-w-0">
            <div className="font-medium text-foreground">{c.name}</div>
            {c.supervisorName && <div className="text-caption text-muted-foreground">led by {c.supervisorName}</div>}
          </div>
        </div>
      ),
      exportValue: (c) => c.name,
    },
    {
      key: "members",
      label: "Members",
      align: "right",
      sortable: true,
      sortValue: (c) => c.members.length,
      render: (c) => (
        <span className="inline-flex items-center gap-1 tnum text-body">
          <User className="h-3 w-3 text-muted-foreground" />
          {c.members.length}
        </span>
      ),
      exportValue: (c) => c.members.length,
    },
    {
      key: "projectName",
      label: "Project",
      sortable: true,
      filterable: true,
      render: (c) => c.projectName ? (
        <span className="flex items-center gap-1 text-body">
          <MapPin className="h-3 w-3 text-muted-foreground" />
          {c.projectName}
        </span>
      ) : <span className="text-faint">—</span>,
      filterValue: (c) => c.projectName ?? "—",
      exportValue: (c) => c.projectName ?? "",
    },
    {
      key: "dailyCost",
      label: "Daily Cost",
      align: "right",
      sortable: true,
      sortValue: (c) => c.members.filter((m) => m.wageType === "DAILY").reduce((s, m) => s + m.dailyRate, 0),
      render: (c) => {
        const dailyCost = c.members.filter((m) => m.wageType === "DAILY").reduce((s, m) => s + m.dailyRate, 0);
        return dailyCost > 0 ? <span className="tnum text-body">{formatCurrency(dailyCost)}/day</span> : <span className="text-faint">—</span>;
      },
      exportValue: (c) => c.members.filter((m) => m.wageType === "DAILY").reduce((s, m) => s + m.dailyRate, 0),
    },
    {
      key: "active",
      label: "Status",
      sortable: true,
      filterable: true,
      sortValue: (c) => (c.active ? "ACTIVE" : "INACTIVE"),
      render: (c) => <StatusPill status={c.active ? "ACTIVE" : "INACTIVE"} />,
      filterValue: (c) => (c.active ? "ACTIVE" : "INACTIVE"),
      exportValue: (c) => (c.active ? "ACTIVE" : "INACTIVE"),
    },
  ];

  function crewRowActions(c: CrewRow) {
    if (!canManage) return null;
    return (
      <>
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
      </>
    );
  }

  const trailingButtons = canManage ? (
    <Button onClick={() => { setEditTarget(null); setFormOpen(true); }}>
      <Plus className="h-4 w-4" /> Add crew
    </Button>
  ) : null;

  const noMatch = (
    <EmptyState
      size="compact"
      icon={<SearchX />}
      title="No crews match"
      description="Adjust the search or column filters to see all crews."
    />
  );

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <CrewStatsBar crews={crews} />

      {/* Crew list */}
      {crews.length === 0 ? (
        <EmptyState
          icon={<UsersRound className="h-5 w-5" />}
          title="No crews"
          description="Group workers into crews assigned to projects and supervisors."
          action={canManage ? <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> Add Crew</Button> : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={crews}
            columns={crewColumns}
            storageKey="crews"
            hideable
            exportFileName="crews"
            initialSort={{ key: "name", direction: "asc" }}
            onRowClick={(c) => setDetailTarget(c)}
            searchable
            searchPlaceholder="Search crew, project, supervisor…"
            toolbarTrailing={trailingButtons}
            rowActions={crewRowActions}
            rowTone={(c) => (c.active ? null : "warning")}
            emptyState={noMatch}
          />
        </div>
      )}

      {/* Detail dialog */}
      {detailTarget && (
        <CrewDetailDialog crew={detailTarget} onClose={() => setDetailTarget(null)} />
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

// ───────────────────────────────────────────────────────────
//  Crew Detail Dialog
// ───────────────────────────────────────────────────────────

function CrewDetailDialog({ crew, onClose }: { crew: CrewRow; onClose: () => void }) {
  const dailyCost = crew.members.filter((m) => m.wageType === "DAILY").reduce((s, m) => s + m.dailyRate, 0);
  const memberColumns: Column<CrewMember>[] = [
    {
      key: "name",
      label: "Member",
      sortable: true,
      sortValue: (m) => m.name,
      render: (m) => (
        <div className="flex items-center gap-2.5">
          <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded text-caption font-semibold", avatarColor(m.name))}>
            {initials(m.name)}
          </span>
          <div className="min-w-0">
            <span className="block truncate font-medium text-foreground">{m.name}</span>
            {m.trade && <span className="block truncate text-caption text-muted-foreground">{m.trade}</span>}
          </div>
        </div>
      ),
    },
    {
      key: "wageType",
      label: "Wage",
      sortable: true,
      filterable: true,
      render: (m) => (
        <span className={cn(
          "rounded px-1.5 py-0.5 text-micro font-medium",
          m.wageType === "DAILY" && "bg-info/10 text-info",
          m.wageType === "MONTHLY" && "bg-brand/10 text-brand",
          m.wageType === "FIXED" && "bg-warning/10 text-warning",
        )}>
          {m.wageType}
        </span>
      ),
      filterValue: (m) => m.wageType,
    },
    {
      key: "dailyRate",
      label: "Rate",
      align: "right",
      sortable: true,
      render: (m) => (
        <span className="tnum text-body">
          {m.wageType === "DAILY" ? `${formatCurrency(m.dailyRate)}/day` : m.wageType === "MONTHLY" ? "monthly" : "fixed"}
        </span>
      ),
    },
    {
      key: "active",
      label: "Status",
      sortable: true,
      filterable: true,
      render: (m) => <StatusPill status={m.active ? "ACTIVE" : "INACTIVE"} />,
      filterValue: (m) => (m.active ? "ACTIVE" : "INACTIVE"),
    },
  ];

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={crew.name}
      description={`${crew.members.length} member${crew.members.length !== 1 ? "s" : ""}${crew.projectName ? ` · ${crew.projectName}` : ""}${crew.supervisorName ? ` · led by ${crew.supervisorName}` : ""}`}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-muted/20 p-3">
          <div>
            <div className="text-label text-muted-foreground">Members</div>
            <div className="text-body font-semibold tnum">{crew.members.length}</div>
          </div>
          <div>
            <div className="text-label text-muted-foreground">Daily Cost</div>
            <div className="text-body font-semibold tnum">{formatCurrency(dailyCost)}/day</div>
          </div>
          <div>
            <div className="text-label text-muted-foreground">Status</div>
            <div className="pt-0.5"><StatusPill status={crew.active ? "ACTIVE" : "INACTIVE"} /></div>
          </div>
        </div>

        {/* Members table */}
        {crew.members.length > 0 ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <DataTable
              data={crew.members}
              columns={memberColumns}
              getRowId={(m) => m.id}
              hideToolbar
              pageSize={50}
            />
          </div>
        ) : (
          <div className="py-6 text-center text-meta text-muted-foreground">No members in this crew.</div>
        )}
      </div>
    </Dialog>
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
      description="Group workers into a crew assigned to a project and supervisor."
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Crew Name *</Label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Masonry Crew A" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Project</Label>
            <Select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">None</option>
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
          <Label>Members ({selectedMembers.size} selected)</Label>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {employees.map((e) => (
              <label
                key={e.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-body hover:bg-subtle"
              >
                <input
                  type="checkbox"
                  checked={selectedMembers.has(e.id)}
                  onChange={() => toggleMember(e.id)}
                  className="rounded"
                />
                <span className="flex-1 text-foreground">{e.name}</span>
                {e.trade && <span className="text-caption text-muted-foreground">{e.trade}</span>}
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : isEdit ? "Update Crew" : "Create Crew"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
