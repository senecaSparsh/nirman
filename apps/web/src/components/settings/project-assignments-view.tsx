"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { formatDate } from "@/lib/utils";

export type AssignmentRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  projectId: string;
  projectName: string;
  scopedRole: string;
  assignedAt: string;
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  SUPERVISOR: "Supervisor",
  SALES: "Sales",
  ACCOUNTANT: "Accountant",
};

export function ProjectAssignmentsView({
  assignments,
  users,
  projects,
  permissions,
}: {
  assignments: AssignmentRow[];
  users: { id: string; name: string; email: string; role: string }[];
  projects: { id: string; name: string }[];
  permissions?: { canManage?: boolean };
}) {
  const router = useRouter();
  const canManage = permissions?.canManage ?? false;
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [delTarget, setDelTarget] = useState<string | null>(null);

  const [fUser, setFUser] = useState("");
  const [fProject, setFProject] = useState("");
  const [fScopedRole, setFScopedRole] = useState("SUPERVISOR");
  const [localProjects, setLocalProjects] = useState(projects);
  useEffect(() => { setLocalProjects(projects); }, [projects]);

  async function submit() {
    if (!fUser) return toast.error("Select a user");
    if (!fProject) return toast.error("Select a project");
    setSubmitting(true);
    try {
      const res = await fetch("/api/project-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: fUser, projectId: fProject, scopedRole: fScopedRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create assignment");
      toast.success("Project assignment created");
      setFormOpen(false);
      setFUser(""); setFProject(""); setFScopedRole("SUPERVISOR");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/project-assignments/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("Assignment removed");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-body text-muted-foreground">
          {assignments.length} assignment{assignments.length !== 1 ? "s" : ""}
          {users.length === 0 && (
            <span className="ml-2 text-warning">· No scoped users (SUPERVISOR/SALES/ACCOUNTANT) found</span>
          )}
        </div>
        {canManage && users.length > 0 && projects.length > 0 && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Assign User to Project
          </Button>
        )}
      </div>

      {assignments.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-5 w-5" />}
          title="No project assignments"
          description="Scope supervisors, sales, and accountants to specific projects. Unassigned scoped users see no projects."
        />
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <div className="flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{a.userName}</span>
                  <Badge variant="outline">{ROLE_LABELS[a.userRole] ?? a.userRole}</Badge>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium text-foreground">{a.projectName}</span>
                  <Badge variant="default">as {ROLE_LABELS[a.scopedRole] ?? a.scopedRole}</Badge>
                </div>
                <div className="text-meta text-muted-foreground">
                  {a.userEmail} · assigned {formatDate(a.assignedAt)}
                </div>
              </div>
              {canManage && (
                <Button size="sm" variant="ghost" onClick={() => setDelTarget(a.id)} disabled={submitting}>
                  <Trash2 className="h-3.5 w-3.5 text-danger" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Assign User to Project"
        description="Scope a user's access to a specific project. They will only see data for projects they're assigned to."
      >
        <div className="space-y-3">
          <div>
            <Label>User *</Label>
            <Select value={fUser} onChange={(e) => setFUser(e.target.value)}>
              <option value="">Select user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role] ?? u.role})</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Project *</Label>
            <SelectWithCreate
              value={fProject}
              onChange={setFProject}
              placeholder="Select project…"
              createLabel="project"
              options={localProjects.map((p) => ({ value: p.id, label: p.name }))}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <ProjectFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalProjects((p) => [...p, { id: e.id, name: e.label ?? "" }]); onCreated(e); }} />
              )}
            />
          </div>
          <div>
            <Label>Scoped role</Label>
            <Select value={fScopedRole} onChange={(e) => setFScopedRole(e.target.value)}>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="QAQC_ENGINEER">QA/QC Engineer</option>
              <option value="SITE_ENGINEER">Site Engineer</option>
              <option value="STORE_KEEPER">Store Keeper</option>
              <option value="SALES_MANAGER">Sales Manager</option>
              <option value="ACCOUNTANT">Accountant</option>
              <option value="PROJECT_MANAGER">Project Manager</option>
              <option value="PROCUREMENT_MANAGER">Procurement Manager</option>
              <option value="HR_MANAGER">HR Manager</option>
            </Select>
            <p className="mt-1 text-caption text-muted-foreground">
              The role the user acts as within this project. OWNER/ADMIN see all projects regardless.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Assigning…" : "Assign"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={delTarget !== null}
        onOpenChange={(o) => { if (!o) setDelTarget(null); }}
        title="Remove project assignment?"
        description="This will remove the user's project-scoped role. They will no longer have access to this project's resources."
        confirmLabel="Remove"
        onConfirm={() => {
          if (delTarget) remove(delTarget);
          setDelTarget(null);
        }}
      />
    </div>
  );
}
