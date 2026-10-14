"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { allowedScopeTypes, type ScopeChoice } from "@/lib/roles";
import type { MemberScopeDraft, ScopeEntry } from "@/lib/member-scope";

const SCOPE_LABEL: Record<ScopeChoice, string> = { COMPANY: "Company-wide", PROJECT: "Projects", DEPARTMENT: "Departments" };

/**
 * Access scope for a member being added. Offers only the scope types the role
 * may hold. Projects or departments are chosen row by row, so one person can
 * be limited to several.
 */
export function MemberScopeFields({
  scopeRole,
  value,
  onChange,
  projects,
  departments,
  touch = false,
}: {
  scopeRole: string | null | undefined;
  value: MemberScopeDraft;
  onChange: (next: MemberScopeDraft) => void;
  projects: { id: string; name: string }[];
  departments: { id: string; code: string; name: string; active: boolean }[];
  touch?: boolean;
}) {
  const allowed = allowedScopeTypes(scopeRole);
  const byDepartment = value.scopeType === "DEPARTMENT";
  const isEntryScope = value.scopeType === "PROJECT" || byDepartment;
  const key = byDepartment ? "departmentId" : "projectId";
  const options = byDepartment
    ? departments.filter((d) => d.active).map((d) => ({ id: d.id, label: `${d.code} · ${d.name}` }))
    : projects.map((p) => ({ id: p.id, label: p.name }));
  const chosen = new Set(value.entries.map((e) => e[key]).filter(Boolean));
  const size = touch ? "touch" : "sm";

  function choose(type: ScopeChoice) {
    if (type !== value.scopeType) onChange({ scopeType: type, entries: type === "COMPANY" ? [] : [{}] });
  }

  function setEntry(idx: number, id: string) {
    const entry: ScopeEntry = byDepartment ? { departmentId: id || undefined } : { projectId: id || undefined };
    onChange({ ...value, entries: value.entries.map((e, i) => (i === idx ? entry : e)) });
  }

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-micro">Access scope</Label>
      {allowed.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {allowed.map((type) => (
            <Button
              key={type}
              type="button"
              size={size}
              variant={value.scopeType === type ? "secondary" : "outline"}
              className="flex-1"
              aria-pressed={value.scopeType === type}
              onClick={() => choose(type)}
            >
              {SCOPE_LABEL[type]}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-caption text-muted-foreground">Owners and admins always see the whole company.</p>
      )}
      {value.scopeType === null && (
        <p className="text-caption text-muted-foreground">Choose the whole company, or the projects or departments this person can see.</p>
      )}
      {value.scopeType === "COMPANY" && allowed.length > 1 && (
        <p className="text-caption text-muted-foreground">Sees every project and department in the company.</p>
      )}
      {isEntryScope && (
        <div className="flex flex-col gap-2">
          {value.entries.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Select value={entry[key] ?? ""} onChange={(e) => setEntry(idx, e.target.value)} className="flex-1">
                <option value="">{byDepartment ? "Select department…" : "Select project…"}</option>
                {options.filter((o) => o.id === entry[key] || !chosen.has(o.id)).map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </Select>
              {value.entries.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size={touch ? "icon-touch" : "icon-sm"}
                  aria-label="Remove"
                  onClick={() => onChange({ ...value, entries: value.entries.filter((_, i) => i !== idx) })}
                >
                  <X />
                </Button>
              )}
            </div>
          ))}
          {options.length === 0 ? (
            <p className="text-caption text-muted-foreground">
              {byDepartment ? "No active departments yet — create one first." : "No projects yet — create one first."}
            </p>
          ) : (
            <Button
              type="button"
              variant="outline"
              size={size}
              className="self-start"
              disabled={value.entries.length >= options.length}
              onClick={() => onChange({ ...value, entries: [...value.entries, {}] })}
            >
              {byDepartment ? "Add department" : "Add project"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
