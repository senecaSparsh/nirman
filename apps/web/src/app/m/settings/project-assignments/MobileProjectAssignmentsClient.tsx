"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  ChevronDown,
  Loader2,
  User,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  MobileSearchHeader,
  MobileNoResults,
  MobileSummaryStrip,
  MobileFab,
  type SummaryStat,
} from "@/components/mobile/v2/scaffold";
import { formatDate, cn } from "@/lib/utils";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

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

export type UserOption = { id: string; name: string; email: string; role: string };
export type ProjectOption = { id: string; name: string };

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  PROJECT_DIRECTOR: "Proj. Director",
  FINANCE_HEAD: "Finance Head",
  PROJECT_MANAGER: "Proj. Manager",
  PROCUREMENT_MANAGER: "Procurement Mgr",
  HR_MANAGER: "HR Manager",
  SITE_ENGINEER: "Site Engineer",
  STORE_KEEPER: "Store Keeper",
  ACCOUNTANT: "Accountant",
  SALES_MANAGER: "Sales Mgr",
  SUPERVISOR: "Supervisor",
  QAQC_ENGINEER: "QA/QC Engineer",
};

const SCOPED_ROLE_OPTIONS = [
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "QAQC_ENGINEER", label: "QA/QC Engineer" },
  { value: "SITE_ENGINEER", label: "Site Engineer" },
  { value: "STORE_KEEPER", label: "Store Keeper" },
  { value: "SALES_MANAGER", label: "Sales Manager" },
  { value: "ACCOUNTANT", label: "Accountant" },
  { value: "PROJECT_MANAGER", label: "Project Manager" },
  { value: "PROCUREMENT_MANAGER", label: "Procurement Manager" },
  { value: "HR_MANAGER", label: "HR Manager" },
];

export function MobileProjectAssignmentsClient({
  assignments,
  users,
  projects,
  canManage,
}: {
  assignments: AssignmentRow[];
  users: UserOption[];
  projects: ProjectOption[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const fab = useFabModal();
  const [delTarget, setDelTarget] = useState<AssignmentRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return assignments;
    const q = query.toLowerCase();
    return assignments.filter(
      (a) =>
        a.userName.toLowerCase().includes(q) ||
        a.projectName.toLowerCase().includes(q) ||
        a.userEmail.toLowerCase().includes(q),
    );
  }, [assignments, query]);

  const summaryStats: SummaryStat[] = [
    { label: "Assignments", value: String(assignments.length) },
    { label: "Scoped Users", value: String(users.length) },
    { label: "Projects", value: String(projects.length) },
  ];

  async function handleDelete(id: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/project-assignments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete");
      }
      toast.success("Assignment removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setSubmitting(false);
      setDelTarget(null);
    }
  }

  return (
    <div>
      <MobileSummaryStrip stats={summaryStats} />

      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search user, project, email…"
        showClear={!!query}
        onClear={() => setQuery("")}
      />

      {filtered.length === 0 ? (
        <MobileNoResults
          title={query ? "No matching assignments" : "No project assignments"}
          hint={query
            ? "Try a different search"
            : canManage && users.length > 0
              ? "Tap + to assign a user to a project"
              : "Assignments will appear here once created"}
        />
      ) : (
        <div className="space-y-2 px-3.5">
          {filtered.map((a) => (
            <div
              key={a.id}
              className="rounded-[0.625rem] border p-3"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            >
              <div className="flex items-start gap-2.5">
                {/* User icon */}
                <div
                  className="size-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "color-mix(in srgb, var(--color-steel) 10%, transparent)" }}
                >
                  <User className="size-3.5" style={{ color: "var(--color-steel)" }} />
                </div>

                <div className="flex-1 min-w-0">
                  {/* User → Project */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
                      {a.userName}
                    </span>
                    <ArrowRight className="size-2.5" style={{ color: "var(--color-ink-400)" }} />
                    <span className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
                      {a.projectName}
                    </span>
                  </div>

                  {/* Role badges */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className="text-m-caption font-semibold px-1.5 py-0.5 rounded-[0.25rem]"
                      style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-500)" }}
                    >
                      {ROLE_LABELS[a.userRole] ?? a.userRole}
                    </span>
                    <span className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>as</span>
                    <span
                      className="text-m-caption font-semibold px-1.5 py-0.5 rounded-[0.25rem]"
                      style={{ backgroundColor: "color-mix(in srgb, var(--color-steel) 10%, transparent)", color: "var(--color-steel)" }}
                    >
                      {ROLE_LABELS[a.scopedRole] ?? a.scopedRole}
                    </span>
                  </div>

                  {/* Email + date */}
                  <div className="text-m-caption mt-1" style={{ color: "var(--color-ink-400)" }}>
                    {a.userEmail} · assigned {formatDate(a.assignedAt)}
                  </div>
                </div>

                {/* Delete button */}
                {canManage && (
                  <button
                    onClick={() => setDelTarget(a)}
                    disabled={submitting}
                    className="text-m-body press p-1.5 -mr-1"
                  >
                    <Trash2 className="size-3.5" style={{ color: "var(--color-danger, #ef4444)" }} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FAB */}
      {canManage && users.length > 0 && projects.length > 0 ? (
        <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Assign user to project" />
      ) : null}

      {/* ── Assignment form dialog ── */}
      <AssignmentFormDialog
          open={fab.isOpen}
          onOpenChange={fab.close}
          originRect={fab.originRect}
          users={users}
          projects={projects}
          onSubmit={async (userId, projectId, scopedRole) => {
            setSubmitting(true);
            try {
              const res = await fetch("/api/project-assignments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, projectId, scopedRole }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error ?? "Failed to create assignment");
              toast.success("Project assignment created");
              fab.close();
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to create assignment");
            } finally {
              setSubmitting(false);
            }
          }}
          submitting={submitting}
        />

      {/* ── Delete confirmation ── */}
      {delTarget && (
        <MobileDialog open={!!delTarget} onClose={() => setDelTarget(null)} title="Remove assignment?">
            <p className="text-m-body mb-4" style={{ color: "var(--color-ink-500)" }}>
              Remove {delTarget.userName}&rsquo;s access to {delTarget.projectName}? They will no longer see this project&rsquo;s data.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDelTarget(null)}
                className="px-4 h-10 rounded-[0.5rem] text-m-section font-medium press"
                style={{ color: "var(--color-ink-500)" }}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(delTarget.id)}
                disabled={submitting}
                className="px-4 h-10 rounded-[0.5rem] text-m-section font-bold flex items-center gap-1.5 press"
                style={{ backgroundColor: "var(--color-danger, #ef4444)", color: "var(--color-paper)" }}
              >
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                {submitting ? "Removing…" : "Remove"}
              </button>
            </div>
        </MobileDialog>
      )}
    </div>
  );
}

/* ─── Assignment form dialog (bottom sheet) ─── */
function AssignmentFormDialog({
  open,
  onOpenChange,
  originRect,
  users,
  projects,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originRect?: DOMRect | null;
  users: UserOption[];
  projects: ProjectOption[];
  onSubmit: (userId: string, projectId: string, scopedRole: string) => void;
  submitting: boolean;
}) {
  const [userId, setUserId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [scopedRole, setScopedRole] = useState("SUPERVISOR");
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);

  // Reset form state when the dialog closes
  useEffect(() => {
    if (!open) {
      setUserId("");
      setProjectId("");
      setScopedRole("SUPERVISOR");
      setUserPickerOpen(false);
      setProjectPickerOpen(false);
    }
  }, [open]);

  const selectedUser = users.find((u) => u.id === userId);
  const selectedProject = projects.find((p) => p.id === projectId);

  function handleSubmit() {
    if (!userId) return toast.error("Select a user");
    if (!projectId) return toast.error("Select a project");
    onSubmit(userId, projectId, scopedRole);
  }

  return (
    <MobileFabModal open={open} onClose={() => onOpenChange(false)} originRect={originRect} title="Assign User to Project">
        <div className="space-y-4">
          {/* User picker */}
          <div>
            <label className="text-m-caption font-semibold block mb-1" style={{ color: "var(--color-ink-700)" }}>
              User *
            </label>
            <button
              onClick={() => { setUserPickerOpen(!userPickerOpen); setProjectPickerOpen(false); }}
              className="w-full flex items-center justify-between h-11 rounded-[0.5rem] border px-3 press"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
            >
              <span className={cn("text-m-section", !selectedUser && "text-[var(--color-ink-400)]")} style={{ color: selectedUser ? "var(--color-ink-950)" : undefined }}>
                {selectedUser ? `${selectedUser.name} (${ROLE_LABELS[selectedUser.role] ?? selectedUser.role})` : "Select user…"}
              </span>
              <ChevronDown className={cn("size-4 transition-transform", userPickerOpen && "rotate-180")} style={{ color: "var(--color-ink-500)" }} />
            </button>
            {userPickerOpen && (
              <div className="mt-1 rounded-[0.5rem] border max-h-48 overflow-y-auto" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setUserId(u.id); setUserPickerOpen(false); }}
                    className="w-full text-left px-3 py-2.5 text-m-section hover:bg-[var(--color-paper-2)] press"
                    style={{
                      color: u.id === userId ? "var(--color-steel)" : "var(--color-ink-950)",
                      fontWeight: u.id === userId ? 600 : 400,
                    }}
                  >
                    {u.name} <span style={{ color: "var(--color-ink-400)" }}>({ROLE_LABELS[u.role] ?? u.role})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Project picker */}
          <div>
            <label className="text-m-caption font-semibold block mb-1" style={{ color: "var(--color-ink-700)" }}>
              Project *
            </label>
            <button
              onClick={() => { setProjectPickerOpen(!projectPickerOpen); setUserPickerOpen(false); }}
              className="w-full flex items-center justify-between h-11 rounded-[0.5rem] border px-3 press"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
            >
              <span className={cn("text-m-section", !selectedProject && "text-[var(--color-ink-400)]")} style={{ color: selectedProject ? "var(--color-ink-950)" : undefined }}>
                {selectedProject ? selectedProject.name : "Select project…"}
              </span>
              <ChevronDown className={cn("size-4 transition-transform", projectPickerOpen && "rotate-180")} style={{ color: "var(--color-ink-500)" }} />
            </button>
            {projectPickerOpen && (
              <div className="mt-1 rounded-[0.5rem] border max-h-48 overflow-y-auto" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setProjectId(p.id); setProjectPickerOpen(false); }}
                    className="w-full text-left px-3 py-2.5 text-m-section hover:bg-[var(--color-paper-2)] press"
                    style={{
                      color: p.id === projectId ? "var(--color-steel)" : "var(--color-ink-950)",
                      fontWeight: p.id === projectId ? 600 : 400,
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Scoped role */}
          <div>
            <EnumSelect
              label="Scoped role"
              value={scopedRole}
              onChange={(v) => setScopedRole(v)}
              options={SCOPED_ROLE_OPTIONS}
            />
            <p className="mt-1 text-m-caption" style={{ color: "var(--color-ink-400)" }}>
              The role the user acts as within this project. OWNER/ADMIN see all projects regardless.
            </p>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 h-10 rounded-[0.5rem] text-m-section font-medium press"
              style={{ color: "var(--color-ink-500)" }}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 h-10 rounded-[0.5rem] text-m-section font-bold flex items-center gap-1.5 press"
              style={{ backgroundColor: "var(--color-steel)", color: "var(--color-paper)" }}
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              {submitting ? "Assigning…" : "Assign"}
            </button>
          </div>
        </div>
    </MobileFabModal>
  );
}
