"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Building2, ChevronRight, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ROLE_LIST, assignableRoles, canAssignRole, type Role } from "@/lib/roles";
import { usePermissions } from "@/lib/permissions";

export type CompanyRow = {
  id: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  currency: string;
  businessType: string | null;
  parentCompanyId: string | null;
  parentName: string | null;
  memberCount: number;
  hasChildren: boolean;
};

type ScopeEntry = {
  scopeKind: string;
  departmentId: string | null;
  projectId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
  projectName: string | null;
};

type MemberRow = {
  id: string;
  userId: string;
  role: string;
  scopeType: string | null;
  reportsToUserCompanyId: string | null;
  name: string;
  email: string;
  active: boolean;
  scopes: ScopeEntry[];
};

export function CompaniesManager({
  companies,
  canManage,
  actorRole,
}: {
  companies: CompanyRow[];
  canManage: boolean;
  actorRole: string;
}) {
  const router = useRouter();
  const { canManageUsers } = usePermissions();
  const canManageCompanies = canManage && canManageUsers();
  // Roles this actor can assign (hierarchical RBAC — only roles strictly
  // below the actor's tier). Used to filter the "Add member" + inline role
  // dropdowns so a Sub-Admin only sees SUPERVISOR/SALES/ACCOUNTANT.
  const assignable = assignableRoles(actorRole);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    businessType: "",
    parentCompanyId: "",
    currency: "INR",
    gstin: "",
    pan: "",
    address: "",
  });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, MemberRow[]>>({});
  const [loadingMembers, setLoadingMembers] = useState<string | null>(null);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  // Default to the first role the actor can assign (hierarchy-aware).
  const [addMemberRole, setAddMemberRole] = useState<Role>(assignable[0] ?? "MANAGER");
  const [addingMember, setAddingMember] = useState(false);

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          businessType: form.businessType.trim() || null,
          parentCompanyId: form.parentCompanyId || null,
          currency: form.currency,
          gstin: form.gstin.trim() || null,
          pan: form.pan.trim() || null,
          address: form.address.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create company");
      toast.success("Company created");
      setCreating(false);
      setForm({ name: "", businessType: "", parentCompanyId: "", currency: "INR", gstin: "", pan: "", address: "" });
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Failed"));
    } finally {
      setSaving(false);
    }
  }

  async function loadMembers(companyId: string) {
    setLoadingMembers(companyId);
    try {
      const res = await fetch(`/api/companies/${companyId}/members`);
      const data = await res.json();
      if (res.ok) setMembers((m) => ({ ...m, [companyId]: data }));
    } finally {
      setLoadingMembers(null);
    }
  }

  async function toggleExpand(companyId: string) {
    if (expanded === companyId) {
      setExpanded(null);
      return;
    }
    setExpanded(companyId);
    if (!members[companyId]) await loadMembers(companyId);
  }

  async function addMember(companyId: string) {
    if (!addMemberEmail.trim()) return toast.error("Email is required");
    setAddingMember(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addMemberEmail.trim(), role: addMemberRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add member");
      toast.success("Member added");
      setAddMemberEmail("");
      await loadMembers(companyId);
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Failed"));
    } finally {
      setAddingMember(false);
    }
  }

  async function changeMemberRole(companyId: string, memberId: string, role: string) {
    try {
      const res = await fetch(`/api/companies/${companyId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed");
        return;
      }
      toast.success("Role updated");
      await loadMembers(companyId);
    } catch {
      toast.error("Network error");
    }
  }

  async function removeMember(companyId: string, memberId: string) {
    try {
      const res = await fetch(`/api/companies/${companyId}/members/${memberId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed");
        return;
      }
      toast.success("Member removed");
      await loadMembers(companyId);
      router.refresh();
    } catch {
      toast.error("Network error");
    }
  }

  async function switchTo(companyId: string) {
    try {
      const res = await fetch("/api/companies/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (res.ok) router.refresh();
    } catch {
      toast.error("Failed to switch");
    }
  }

  // Build a tree: roots first, children indented under parents.
  const byParent = new Map<string | null, CompanyRow[]>();
  for (const c of companies) {
    const key = c.parentCompanyId;
    const arr = byParent.get(key) ?? [];
    arr.push(c);
    byParent.set(key, arr);
  }
  const roots = byParent.get(null) ?? [];
  const childrenOf = (id: string) => byParent.get(id) ?? [];

  function renderRow(c: CompanyRow, depth: number): React.ReactNode {
    return (
      <div key={c.id}>
        <div
          className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/40 cursor-pointer"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => toggleExpand(c.id)}
        >
          {c.hasChildren ? (
            <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded === c.id ? "rotate-90" : ""}`} />
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{c.name}</div>
            {c.businessType && <div className="truncate text-micro text-muted-foreground">{c.businessType}</div>}
          </div>
          <Badge variant="muted" className="shrink-0">{c.memberCount} member{c.memberCount !== 1 ? "s" : ""}</Badge>
          {c.hasChildren && <Badge variant="outline" className="shrink-0">parent</Badge>}
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={(e) => { e.stopPropagation(); switchTo(c.id); }}
          >
            Switch to
          </Button>
        </div>
        {expanded === c.id && (
          <div className="border-l border-border ml-4 pl-3 py-2 space-y-3" style={{ marginLeft: `${depth * 16 + 24}px` }}>
            {loadingMembers === c.id ? (
              <div className="text-caption text-muted-foreground px-2">Loading members…</div>
            ) : (
              <>
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>Name</TH>
                      <TH>Email</TH>
                      <TH>Role</TH>
                      <TH>Scope</TH>
                      {canManageCompanies && <TH className="text-right">Actions</TH>}
                    </TR>
                  </THead>
                  <TBody>
                    {(members[c.id] ?? []).map((m) => {
                      const scopeLabel =
                        m.scopeType === "DEPARTMENT"
                          ? `Dept${m.scopes.length > 1 ? `s (${m.scopes.length})` : ""}`
                          : m.scopeType === "PROJECT"
                            ? `Site${m.scopes.length > 1 ? `s (${m.scopes.length})` : ""}`
                            : "Company-wide";
                      const scopeDetail =
                        m.scopeType === "DEPARTMENT"
                          ? m.scopes.map((s) => s.departmentCode ?? s.departmentName ?? "?").join(", ")
                          : m.scopeType === "PROJECT"
                            ? m.scopes.map((s) => s.projectName ?? "?").join(", ")
                            : null;
                      const reportsTo = m.reportsToUserCompanyId
                        ? (members[c.id] ?? []).find((x) => x.id === m.reportsToUserCompanyId)
                        : null;
                      return (
                        <TR key={m.id}>
                          <TD className="font-medium">{m.name}</TD>
                          <TD className="text-muted-foreground">{m.email}</TD>
                          <TD>
                            {canManageCompanies && canAssignRole(actorRole, m.role) ? (
                              <Select
                                value={m.role}
                                onChange={(e) => changeMemberRole(c.id, m.id, e.target.value)}
                                className="h-8 w-32 text-caption"
                              >
                                {/* Show the member's current role + any role the
                                    actor can assign (hierarchy-filtered). */}
                                {[m.role, ...assignable]
                                  .filter((r, i, arr) => arr.indexOf(r) === i)
                                  .map((r) => {
                                    const def = ROLE_LIST.find((rl) => rl.key === r);
                                    return <option key={r} value={r}>{def?.label ?? r}</option>;
                                  })}
                              </Select>
                            ) : (
                              <Badge variant="outline">{m.role}</Badge>
                            )}
                          </TD>
                          <TD>
                            <div className="text-caption">
                              <span className="font-medium">{scopeLabel}</span>
                              {scopeDetail && (
                                <span className="block text-micro text-muted-foreground" title={scopeDetail}>
                                  {scopeDetail.length > 40 ? `${scopeDetail.slice(0, 40)}…` : scopeDetail}
                                </span>
                              )}
                              {reportsTo && (
                                <span className="block text-micro text-muted-foreground">
                                  reports to {reportsTo.name}
                                </span>
                              )}
                            </div>
                          </TD>
                          {canManageCompanies && (
                            <TD className="text-right">
                              <Button variant="ghost" size="icon-sm" onClick={() => removeMember(c.id, m.id)} title="Remove member">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TD>
                          )}
                        </TR>
                      );
                    })}
                    {(!members[c.id] || members[c.id]!.length === 0) && (
                      <TR><TD colSpan={5} className="text-center text-muted-foreground">No members yet</TD></TR>
                    )}
                  </TBody>
                </Table>
                {canManageCompanies && (
                  <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-2">
                    <div className="space-y-1">
                      <Label className="text-micro">Email</Label>
                      <Input
                        type="email"
                        value={addMemberEmail}
                        onChange={(e) => setAddMemberEmail(e.target.value)}
                        placeholder="user@example.com"
                        className="h-8 w-48"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-micro">Role</Label>
                      <Select value={addMemberRole} onChange={(e) => setAddMemberRole(e.target.value as Role)} className="h-8 w-32">
                        {assignable.length === 0 ? (
                          <option value="" disabled>Your role cannot create accounts</option>
                        ) : (
                          assignable.map((r) => {
                            const def = ROLE_LIST.find((rl) => rl.key === r);
                            return <option key={r} value={r}>{def?.label ?? r}</option>;
                          })
                        )}
                      </Select>
                    </div>
                    <Button size="sm" onClick={() => addMember(c.id)} disabled={addingMember || assignable.length === 0}>
                      <UserPlus className="h-3.5 w-3.5" /> Add member
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {childrenOf(c.id).map((child) => renderRow(child, depth + 1))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-body text-muted-foreground">
          {companies.length} compan{companies.length !== 1 ? "ies" : "y"}
        </span>
        {canManageCompanies && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New Company
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-2">
          {companies.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No companies yet</div>
          ) : (
            roots.map((c) => renderRow(c, 0))
          )}
        </CardContent>
      </Card>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCreating(false)}>
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New Company</h2>
              <button onClick={() => setCreating(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={createCompany} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Business Type</Label>
                <Input value={form.businessType} onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))} placeholder="Rice Milling & Export, Real Estate…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Parent Company</Label>
                  <Select value={form.parentCompanyId} onChange={(e) => setForm((f) => ({ ...f, parentCompanyId: e.target.value }))}>
                    <option value="">None (top-level)</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                    {["INR", "USD", "EUR", "GBP", "AED"].map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>GSTIN</Label>
                  <Input value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>PAN</Label>
                  <Input value={form.pan} onChange={(e) => setForm((f) => ({ ...f, pan: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
