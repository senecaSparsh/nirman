"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Shield, Building2, Layers, HardHat, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";

type DepartmentOption = { id: string; code: string; name: string; active: boolean };
type ProjectOption = { id: string; name: string };

type ScopeEntry = {
  id?: string;
  departmentId?: string | null;
  projectId?: string | null;
};

type ScopeResponse = {
  membershipId: string;
  role: string;
  scopeType: string | null;
  reportsToUserCompanyId: string | null;
  scopes: {
    id: string;
    scopeKind: string;
    departmentId: string | null;
    projectId: string | null;
    department: { id: string; code: string; name: string } | null;
    project: { id: string; name: string } | null;
  }[];
};

/**
 * ScopeEditorDialog — lets an admin/manager set the hierarchical RBAC scope
 * (COMPANY / DEPARTMENT / PROJECT) for a user's company membership.
 *
 * Calls GET /api/users/[id]/scope to load current state, then
 * PATCH /api/users/[id]/scope to save. The service layer
 * (assignScopedMembership) handles validation, cycle prevention, and audit
 * logging.
 */
export function ScopeEditorDialog({
  userId,
  userName,
  userRole,
  projects,
  departments,
  canEdit,
  onClose,
  onSaved,
}: {
  userId: string;
  userName: string;
  userRole: string;
  projects: ProjectOption[];
  departments: DepartmentOption[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scopeType, setScopeType] = useState<"COMPANY" | "DEPARTMENT" | "PROJECT">("COMPANY");
  const [entries, setEntries] = useState<ScopeEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load current scope on open
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/users/${userId}/scope`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Failed to load scope");
        }
        const data: ScopeResponse = await res.json();
        if (cancelled) return;
        const st = (data.scopeType === "DEPARTMENT" || data.scopeType === "PROJECT")
          ? data.scopeType
          : "COMPANY";
        setScopeType(st);
        setEntries(
          data.scopes.map((s) => ({
            id: s.id,
            departmentId: s.departmentId,
            projectId: s.projectId,
          })),
        );
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load scope");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // When switching to COMPANY, clear entries. When switching to DEPARTMENT/PROJECT
  // with no entries, seed one empty row.
  function handleScopeTypeChange(newType: "COMPANY" | "DEPARTMENT" | "PROJECT") {
    setScopeType(newType);
    if (newType === "COMPANY") {
      setEntries([]);
    } else if (entries.length === 0) {
      setEntries([newType === "DEPARTMENT" ? { departmentId: "" } : { projectId: "" }]);
    }
  }

  function addEntry() {
    if (scopeType === "DEPARTMENT") {
      setEntries((e) => [...e, { departmentId: "" }]);
    } else if (scopeType === "PROJECT") {
      setEntries((e) => [...e, { projectId: "" }]);
    }
  }

  function removeEntry(idx: number) {
    setEntries((e) => e.filter((_, i) => i !== idx));
  }

  function updateEntry(idx: number, field: "departmentId" | "projectId", value: string) {
    setEntries((e) => e.map((entry, i) => (i === idx ? { ...entry, [field]: value || null } : entry)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const cleanEntries = entries
        .filter((e) => (scopeType === "DEPARTMENT" ? !!e.departmentId : !!e.projectId))
        .map((e) =>
          scopeType === "DEPARTMENT"
            ? { departmentId: e.departmentId! }
            : { projectId: e.projectId! },
        );

      const res = await fetch(`/api/users/${userId}/scope`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: userRole,
          scopeType,
          scopeEntries: cleanEntries,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update scope");
      toast.success("Scope updated", {
        description: `${userName} is now ${scopeType}-scoped${scopeType !== "COMPANY" ? ` (${cleanEntries.length} ${scopeType === "DEPARTMENT" ? "department" : "project"}${cleanEntries.length > 1 ? "s" : ""})` : " (company-wide)"}.`,
      });
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update scope";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const scopeOptions: { value: "COMPANY" | "DEPARTMENT" | "PROJECT"; label: string; icon: typeof Shield; desc: string }[] = [
    { value: "COMPANY", label: "Company-wide", icon: Building2, desc: "Sees everything in the company (default for OWNER/ADMIN)" },
    { value: "DEPARTMENT", label: "Department(s)", icon: Layers, desc: "Scoped to specific cost centres / departments" },
    { value: "PROJECT", label: "Project(s)", icon: HardHat, desc: "Scoped to specific project sites" },
  ];

  const availableDepartments = departments.filter((d) => d.active);
  const availableProjects = projects;

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Access Scope — ${userName}`}
      description="Controls what this user can see within the company. Company-wide = everything; Department/Project = only the selected items."
      className="max-w-lg"
    >
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error && !scopeType ? (
        <div className="py-4 text-center text-body text-danger">{error}</div>
      ) : (
        <div className="space-y-4">
          {/* Scope type selector */}
          <div className="space-y-2">
            <Label>Scope Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {scopeOptions.map((opt) => {
                const Icon = opt.icon;
                const active = scopeType === opt.value;
                const disabled = !canEdit || (opt.value !== "COMPANY" && (opt.value === "DEPARTMENT" ? availableDepartments.length === 0 : availableProjects.length === 0));
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleScopeTypeChange(opt.value)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors ${
                      active
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-input bg-card text-muted-foreground hover:border-border-strong"
                    } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    <Icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
                    <span className="text-caption font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-caption text-muted-foreground">
              {scopeOptions.find((o) => o.value === scopeType)?.desc}
            </p>
          </div>

          {/* Scope entries for DEPARTMENT / PROJECT */}
          {scopeType === "DEPARTMENT" && (
            <div className="space-y-2">
              <Label>Departments</Label>
              {availableDepartments.length === 0 ? (
                <p className="text-caption text-muted-foreground">No active departments. Create cost centres first in the Cost Centres tab.</p>
              ) : (
                <>
                  {entries.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Select
                        value={entry.departmentId ?? ""}
                        onChange={(e) => updateEntry(idx, "departmentId", e.target.value)}
                        disabled={!canEdit}
                      >
                        <option value="">Select department…</option>
                        {availableDepartments
                          .filter((d) => d.id === entry.departmentId || !entries.some((e, i) => i !== idx && e.departmentId === d.id))
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.code} · {d.name}
                            </option>
                          ))}
                      </Select>
                      {canEdit && entries.length > 1 && (
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeEntry(idx)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <Button type="button" variant="outline" size="sm" onClick={addEntry} disabled={entries.length >= availableDepartments.length}>
                      <Plus className="size-3.5" /> Add Department
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          {scopeType === "PROJECT" && (
            <div className="space-y-2">
              <Label>Projects</Label>
              {availableProjects.length === 0 ? (
                <p className="text-caption text-muted-foreground">No projects available. Create a project first.</p>
              ) : (
                <>
                  {entries.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Select
                        value={entry.projectId ?? ""}
                        onChange={(e) => updateEntry(idx, "projectId", e.target.value)}
                        disabled={!canEdit}
                      >
                        <option value="">Select project…</option>
                        {availableProjects
                          .filter((p) => p.id === entry.projectId || !entries.some((e, i) => i !== idx && e.projectId === p.id))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </Select>
                      {canEdit && entries.length > 1 && (
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeEntry(idx)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <Button type="button" variant="outline" size="sm" onClick={addEntry} disabled={entries.length >= availableProjects.length}>
                      <Plus className="size-3.5" /> Add Project
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          {error && <p className="text-caption text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            {canEdit && (
              <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Save Scope
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
