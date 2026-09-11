"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, MapPin, Users, Network, Shield, ShieldCheck,
  Layers, History, Pencil, Save, Loader2, Plus, Trash2, UserPlus,
  ChevronRight, Phone, Mail, Globe, Hash, FileText, KeyRound, Lock,
  RefreshCw, Database, Activity,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { formatCurrency, formatDate, formatDateTime, cn } from "@/lib/utils";
import { useTabParam } from "@/lib/use-tab-param";
import { useConfirm } from "@/lib/use-confirm";
import { canAssignRole, type Role } from "@/lib/roles";

// ───────────────────────────────────────────────────────────────
//  Types — serialized company profile payload from the server
// ───────────────────────────────────────────────────────────────

export type CompanyProfileData = {
  id: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  businessType: string | null;
  parentCompanyId: string | null;
  parentName: string | null;
  isCurrentCompany: boolean;
  // Procurement
  lciThresholdDefault: number | null;
  lciWeights: Record<string, number> | null;
  poApprovalThresholdManager: number | null;
  poApprovalThresholdAdmin: number | null;
  // Password policy
  passwordMinLength: number;
  passwordRequireSpecial: boolean;
  passwordExpiryDays: number | null;
  accountLockoutThreshold: number;
  accountLockoutDurationMin: number;
  // Call recording
  recordingConsentBeep: boolean;
  recordingRetentionDays: number;
  recordingAutoDelete: boolean;
  recordingStorageProvider: string;
  recordingMode: string;
  // Stats
  stats: {
    members: number; projects: number; locations: number; children: number;
    employees: number; suppliers: number; customers: number;
  };
  createdAt: string;
  // Hierarchy
  children: { id: string; name: string; businessType: string | null; currency: string; memberCount: number; hasChildren: boolean }[];
  siblings: { id: string; name: string; businessType: string | null }[];
  // Members
  members: {
    id: string; userId: string; name: string; email: string; role: string; active: boolean;
    phone: string | null; designation: string | null; lastLoginAt: string | null;
    lockedUntil: string | null; failedLoginAttempts: number;
    scopeType: string | null; reportsToName: string | null;
    scopes: { scopeKind: string; departmentId: string | null; projectId: string | null; departmentName: string | null; departmentCode: string | null; projectName: string | null }[];
  }[];
  // Locations
  locations: { id: string; type: string; name: string; address: string | null; projectId: string | null; projectName: string | null; stockValue: number; itemCount: number; lat: number | null; lng: number | null; geoRadius: number | null }[];
  // Departments
  departments: { id: string; code: string; name: string; description: string | null; active: boolean; stockLocationId: string | null; stockLocationName: string | null; issueCount: number }[];
  // Projects
  projects: { id: string; name: string; status: string }[];
  // Audit
  auditLogs: { id: string; action: string; entityType: string; entityId: string; userName: string | null; userEmail: string | null; timestamp: string }[];
  backups: { id: string; sizeBytes: number; createdAt: string }[];
};

// ───────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────

const LOCATION_TYPE_LABELS: Record<string, string> = {
  COMPANY_WAREHOUSE: "Company Warehouse",
  PROJECT_SITE: "Project Site",
  DEPARTMENT: "Department Store",
  VEHICLE: "Vehicle",
};

const RECORDING_MODE_LABELS: Record<string, { label: string; variant: string }> = {
  ALL: { label: "Everyone", variant: "success" },
  SELECTED: { label: "Selected staff", variant: "info" },
  NONE: { label: "Disabled", variant: "muted" },
};

/** Deterministic avatar color from name hash (mirrors employee profile). */
const AVATAR_COLORS = [
  "bg-primary/15 text-primary",
  "bg-success/15 text-success",
  "bg-info/15 text-info",
  "bg-warning/15 text-warning",
  "bg-brand/15 text-brand",
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

function StatPill({ icon: Icon, label, value, href }: { icon: LucideIcon; label: string; value: number; href?: string }) {
  const inner = (
    <>
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-semibold">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-caption hover:bg-muted/50">
        {inner}
      </Link>
    );
  }
  return <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-caption">{inner}</div>;
}

// ───────────────────────────────────────────────────────────────
//  Main component
// ───────────────────────────────────────────────────────────────

export function CompanyProfileClient({
  data,
  actorRole,
  permissions,
  roleOptions,
  assignableRoles: assignable,
}: {
  data: CompanyProfileData;
  actorRole: string;
  permissions: { canManage: boolean; canViewAudit: boolean; canManageTelephony: boolean; canManageCompanies: boolean };
  roleOptions: { key: string; label: string }[];
  assignableRoles: Role[];
}) {
  const [tab, setTab] = useTabParam(
    ["overview", "members", "hierarchy", "locations", "policy", "procurement", "integrations", "audit"] as const,
    "overview",
  );

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Settings
      </Link>

      {/* ── Profile Hero ── */}
      <ProfileHero data={data} />

      {/* ── Two-column: sticky sidebar + tabbed content ── */}
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <ProfileSidebar data={data} />
        </aside>

        <div className="min-w-0 space-y-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="members" count={data.members.length}>Members & Access</TabsTrigger>
              <TabsTrigger value="hierarchy" count={data.children.length}>Hierarchy</TabsTrigger>
              <TabsTrigger value="locations" count={data.locations.length}>Locations</TabsTrigger>
              <TabsTrigger value="policy">Policy & Security</TabsTrigger>
              <TabsTrigger value="procurement">Procurement</TabsTrigger>
              <TabsTrigger value="integrations">Integrations</TabsTrigger>
              {permissions.canViewAudit && <TabsTrigger value="audit" count={data.auditLogs.length}>Activity & Audit</TabsTrigger>}
            </TabsList>

            <TabsContent value="overview">
              <OverviewTab data={data} canManage={permissions.canManage} />
            </TabsContent>
            <TabsContent value="members">
              <MembersTab data={data} canManage={permissions.canManage} actorRole={actorRole} roleOptions={roleOptions} assignable={assignable} />
            </TabsContent>
            <TabsContent value="hierarchy">
              <HierarchyTab data={data} canManage={permissions.canManageCompanies} />
            </TabsContent>
            <TabsContent value="locations">
              <LocationsTab data={data} canManage={permissions.canManage} />
            </TabsContent>
            <TabsContent value="policy">
              <PolicyTab data={data} canManage={permissions.canManage} canManageTelephony={permissions.canManageTelephony} />
            </TabsContent>
            <TabsContent value="procurement">
              <ProcurementTab data={data} canManage={permissions.canManage} />
            </TabsContent>
            <TabsContent value="integrations">
              <IntegrationsTab />
            </TabsContent>
            {permissions.canViewAudit && (
              <TabsContent value="audit">
                <AuditTab data={data} />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Hero
// ───────────────────────────────────────────────────────────────

function ProfileHero({ data }: { data: CompanyProfileData }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div className={cn("flex h-14 w-14 items-center justify-center rounded-xl text-h3 font-semibold", avatarColor(data.name))}>
          {initials(data.name)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-h2 font-semibold">{data.name}</h1>
            {data.parentName && <Badge variant="muted">part of {data.parentName}</Badge>}
            {!data.isCurrentCompany && <Badge variant="info">child company</Badge>}
          </div>
          <div className="mt-1 flex items-center gap-3 flex-wrap text-caption text-muted-foreground">
            {data.businessType && <span>{data.businessType}</span>}
            {data.gstin && <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> GSTIN: {data.gstin}</span>}
            <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {data.currency}</span>
            <span>Since {formatDate(data.createdAt)}</span>
          </div>
        </div>
      </div>
      {!data.isCurrentCompany && (
        <Button variant="outline" size="sm" onClick={async () => {
          try {
            const res = await fetch("/api/companies/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: data.id }) });
            if (res.ok) router.refresh();
          } catch { toast.error("Failed to switch company"); }
        }}>
          <RefreshCw className="h-3.5 w-3.5" /> Switch to this company
        </Button>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Sidebar
// ───────────────────────────────────────────────────────────────

function ProfileSidebar({ data }: { data: CompanyProfileData }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-caption font-semibold text-muted-foreground uppercase tracking-wide">Contact</div>
          {data.phone && <div className="flex items-center gap-2 text-caption"><Phone className="h-3.5 w-3.5 text-muted-foreground" /> {data.phone}</div>}
          {data.email && <div className="flex items-center gap-2 text-caption truncate"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> {data.email}</div>}
          {data.address && <div className="flex items-start gap-2 text-caption"><MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5" /> {data.address}</div>}
          {data.pan && <div className="flex items-center gap-2 text-caption"><FileText className="h-3.5 w-3.5 text-muted-foreground" /> PAN: {data.pan}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="text-caption font-semibold text-muted-foreground uppercase tracking-wide">At a glance</div>
          <StatPill icon={Users} label="members" value={data.stats.members} />
          <StatPill icon={Building2} label="projects" value={data.stats.projects} href="/projects" />
          <StatPill icon={MapPin} label="locations" value={data.stats.locations} />
          <StatPill icon={Network} label="child companies" value={data.stats.children} />
          <StatPill icon={Users} label="employees" value={data.stats.employees} href="/hr/employees" />
          <StatPill icon={Users} label="suppliers" value={data.stats.suppliers} href="/procurement/suppliers" />
          <StatPill icon={Users} label="customers" value={data.stats.customers} href="/sales/customers" />
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Overview tab
// ───────────────────────────────────────────────────────────────

function OverviewTab({ data, canManage }: { data: CompanyProfileData; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: data.name, gstin: data.gstin ?? "", pan: data.pan ?? "", address: data.address ?? "",
    phone: data.phone ?? "", email: data.email ?? "", currency: data.currency, businessType: data.businessType ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Company name is required");
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${data.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(), gstin: form.gstin.trim() || null, pan: form.pan.trim() || null,
          address: form.address.trim() || null, phone: form.phone.trim() || null,
          email: form.email.trim() || null, currency: form.currency, businessType: form.businessType.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      toast.success("Company details saved");
      setEditing(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-body font-semibold">Company Identity</h3>
          {canManage && !editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
          )}
        </div>

        {editing ? (
          <form onSubmit={save} className="space-y-4 max-w-lg">
            <div className="space-y-1.5">
              <Label>Company Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>GSTIN</Label><Input value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>PAN</Label><Input value={form.pan} onChange={(e) => setForm((f) => ({ ...f, pan: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Currency</Label>
                <Select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                  {["INR", "USD", "EUR", "GBP", "AED"].map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Business Type</Label><Input value={form.businessType} onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))} placeholder="Real Estate, Rice Milling…" /></div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save</Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 max-w-lg">
            <DetailRow label="Name" value={data.name} />
            <DetailRow label="Business Type" value={data.businessType} />
            <DetailRow label="GSTIN" value={data.gstin} />
            <DetailRow label="PAN" value={data.pan} />
            <DetailRow label="Phone" value={data.phone} />
            <DetailRow label="Email" value={data.email} />
            <DetailRow label="Currency" value={data.currency} />
            <DetailRow label="Address" value={data.address} />
          </div>
        )}

        {/* Hierarchy position */}
        <div className="border-t pt-4 space-y-2">
          <div className="text-caption font-semibold text-muted-foreground uppercase tracking-wide">Hierarchy Position</div>
          {data.parentName ? (
            <div className="text-caption">
              <span className="text-muted-foreground">Parent: </span>
              <Link href={`/companies/${data.parentCompanyId}`} className="font-medium hover:underline">{data.parentName}</Link>
              {data.siblings.length > 0 && (
                <div className="mt-1 text-muted-foreground">
                  Siblings: {data.siblings.map((s) => (
                    <Link key={s.id} href={`/companies/${s.id}`} className="font-medium text-foreground hover:underline mr-2">{s.name}</Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-caption text-muted-foreground">Top-level company (no parent)</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-micro text-muted-foreground">{label}</div>
      <div className="text-caption">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Members & Access tab
// ───────────────────────────────────────────────────────────────

function MembersTab({
  data, canManage, actorRole, roleOptions, assignable,
}: {
  data: CompanyProfileData; canManage: boolean; actorRole: string;
  roleOptions: { key: string; label: string }[]; assignable: Role[];
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<Role>(assignable[0] ?? "PROJECT_MANAGER");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!addEmail.trim()) return toast.error("Email is required");
    setAdding(true);
    try {
      const res = await fetch(`/api/companies/${data.id}/members`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail.trim(), role: addRole }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add member");
      toast.success("Member added");
      setAddOpen(false); setAddEmail("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setAdding(false);
    }
  }

  async function changeRole(memberId: string, role: string) {
    try {
      const res = await fetch(`/api/companies/${data.id}/members/${memberId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Role updated");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function removeMember(memberId: string, name: string) {
    const ok = await confirm({
      title: `Remove ${name}?`, description: "They will lose access to this company. Their user account is preserved.",
      confirmLabel: "Remove", variant: "destructive",
    });
    if (!ok) return;
    setRemoving(memberId);
    try {
      const res = await fetch(`/api/companies/${data.id}/members/${memberId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Member removed");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-body font-semibold">Members & Access</h3>
            <p className="text-caption text-muted-foreground">People who can sign in to this company, with their role and scope.</p>
          </div>
          {canManage && assignable.length > 0 && (
            <Button size="sm" onClick={() => setAddOpen((v) => !v)}><UserPlus className="h-3.5 w-3.5" /> Add member</Button>
          )}
        </div>

        {addOpen && (
          <form onSubmit={addMember} className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
            <div className="space-y-1">
              <Label className="text-micro">Email</Label>
              <Input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="user@example.com" className="h-8 w-56" />
            </div>
            <div className="space-y-1">
              <Label className="text-micro">Role</Label>
              <Select value={addRole} onChange={(e) => setAddRole(e.target.value as Role)} className="h-8 w-40">
                {assignable.map((r) => {
                  const def = roleOptions.find((o) => o.key === r);
                  return <option key={r} value={r}>{def?.label ?? r}</option>;
                })}
              </Select>
            </div>
            <Button size="sm" type="submit" disabled={adding}>{adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add</Button>
          </form>
        )}

        {data.members.length === 0 ? (
          <EmptyState icon={<Users />} title="No members yet" />
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Name</TH><TH>Email</TH><TH>Role</TH><TH>Scope</TH><TH>Last login</TH>
                {canManage && <TH className="text-right">Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {data.members.map((m) => {
                const scopeLabel = m.scopeType === "DEPARTMENT" ? `Dept${m.scopes.length > 1 ? `s (${m.scopes.length})` : ""}` : m.scopeType === "PROJECT" ? `Site${m.scopes.length > 1 ? `s (${m.scopes.length})` : ""}` : "Company-wide";
                const scopeDetail = m.scopeType === "DEPARTMENT" ? m.scopes.map((s) => s.departmentCode ?? s.departmentName ?? "?").join(", ") : m.scopeType === "PROJECT" ? m.scopes.map((s) => s.projectName ?? "?").join(", ") : null;
                return (
                  <TR key={m.id}>
                    <TD className="font-medium">
                      {m.name}
                      {!m.active && <Badge variant="muted" className="ml-2">inactive</Badge>}
                      {m.lockedUntil && new Date(m.lockedUntil) > new Date() && <Badge variant="danger" className="ml-2">locked</Badge>}
                    </TD>
                    <TD className="text-muted-foreground">{m.email}</TD>
                    <TD>
                      {canManage && canAssignRole(actorRole, m.role) ? (
                        <Select value={m.role} onChange={(e) => changeRole(m.id, e.target.value)} className="h-8 w-36 text-caption">
                          {[m.role, ...assignable].filter((r, i, arr) => arr.indexOf(r) === i).map((r) => {
                            const def = roleOptions.find((o) => o.key === r);
                            return <option key={r} value={r}>{def?.label ?? r}</option>;
                          })}
                        </Select>
                      ) : (
                        <Badge variant="outline">{roleOptions.find((o) => o.key === m.role)?.label ?? m.role}</Badge>
                      )}
                    </TD>
                    <TD>
                      <div className="text-caption">
                        <span className="font-medium">{scopeLabel}</span>
                        {scopeDetail && <span className="block text-micro text-muted-foreground" title={scopeDetail}>{scopeDetail.length > 40 ? `${scopeDetail.slice(0, 40)}…` : scopeDetail}</span>}
                        {m.reportsToName && <span className="block text-micro text-muted-foreground">reports to {m.reportsToName}</span>}
                      </div>
                    </TD>
                    <TD className="text-caption text-muted-foreground">{m.lastLoginAt ? formatDate(m.lastLoginAt) : "—"}</TD>
                    {canManage && (
                      <TD className="text-right">
                        <Button variant="ghost" size="icon-sm" disabled={removing === m.id} onClick={() => removeMember(m.id, m.name)} title="Remove member">
                          {removing === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </TD>
                    )}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        {confirmDialog}
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────
//  Hierarchy tab
// ───────────────────────────────────────────────────────────────

function HierarchyTab({ data, canManage }: { data: CompanyProfileData; canManage: boolean }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", businessType: "", currency: "INR", gstin: "", pan: "", address: "" });
  const [saving, setSaving] = useState(false);

  async function createChild(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(), businessType: form.businessType.trim() || null,
          parentCompanyId: data.id, currency: form.currency,
          gstin: form.gstin.trim() || null, pan: form.pan.trim() || null, address: form.address.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Child company created");
      setCreating(false);
      setForm({ name: "", businessType: "", currency: "INR", gstin: "", pan: "", address: "" });
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteChild(id: string, name: string) {
    const ok = await confirm({
      title: `Delete "${name}"?`, description: "Soft-deletes the company. Companies with children cannot be deleted — remove or re-parent children first.",
      confirmLabel: "Delete", variant: "destructive",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/companies/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Company deleted");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-body font-semibold">Company Hierarchy</h3>
            <p className="text-caption text-muted-foreground">Parent, siblings, and child companies in this group.</p>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setCreating((v) => !v)}><Plus className="h-3.5 w-3.5" /> New child company</Button>
          )}
        </div>

        {creating && (
          <form onSubmit={createChild} className="rounded-md border border-dashed p-4 space-y-3 max-w-lg">
            <div className="text-caption font-medium">New child company under {data.name}</div>
            <div className="space-y-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Business Type</Label><Input value={form.businessType} onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Currency</Label>
                <Select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                  {["INR", "USD", "EUR", "GBP", "AED"].map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>GSTIN</Label><Input value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>PAN</Label><Input value={form.pan} onChange={(e) => setForm((f) => ({ ...f, pan: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </form>
        )}

        {/* Parent */}
        {data.parentName && (
          <div className="rounded-md border border-border p-3">
            <div className="text-micro text-muted-foreground uppercase tracking-wide mb-1">Parent</div>
            <Link href={`/companies/${data.parentCompanyId}`} className="flex items-center gap-2 hover:bg-muted/40 rounded px-1 py-1">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{data.parentName}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
            </Link>
          </div>
        )}

        {/* Siblings */}
        {data.siblings.length > 0 && (
          <div className="rounded-md border border-border p-3">
            <div className="text-micro text-muted-foreground uppercase tracking-wide mb-1">Siblings</div>
            <div className="space-y-1">
              {data.siblings.map((s) => (
                <Link key={s.id} href={`/companies/${s.id}`} className="flex items-center gap-2 hover:bg-muted/40 rounded px-1 py-1">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{s.name}</span>
                  {s.businessType && <span className="text-micro text-muted-foreground">{s.businessType}</span>}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Children */}
        <div className="rounded-md border border-border p-3">
          <div className="text-micro text-muted-foreground uppercase tracking-wide mb-1">Child companies ({data.children.length})</div>
          {data.children.length === 0 ? (
            <div className="text-caption text-muted-foreground py-2">No child companies.</div>
          ) : (
            <div className="space-y-1">
              {data.children.map((c) => (
                <div key={c.id} className="flex items-center gap-2 hover:bg-muted/40 rounded px-1 py-1">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <Link href={`/companies/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                  {c.businessType && <span className="text-micro text-muted-foreground">{c.businessType}</span>}
                  <Badge variant="muted" className="ml-2">{c.memberCount} member{c.memberCount !== 1 ? "s" : ""}</Badge>
                  {c.hasChildren && <Badge variant="outline">parent</Badge>}
                  {canManage && !c.hasChildren && (
                    <Button variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground hover:text-danger" onClick={() => deleteChild(c.id, c.name)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {confirmDialog}
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────
//  Locations tab
// ───────────────────────────────────────────────────────────────

function LocationsTab({ data, canManage }: { data: CompanyProfileData; canManage: boolean }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-body font-semibold">Stock Locations & Sites</h3>
            <p className="text-caption text-muted-foreground">Warehouses, project sites, and department stores for this company.</p>
          </div>
          {canManage && (
            <Button asChild size="sm" variant="outline"><Link href="/settings?tab=locations"><Pencil className="h-3.5 w-3.5" /> Manage</Link></Button>
          )}
        </div>
        {data.locations.length === 0 ? (
          <EmptyState icon={<MapPin />} title="No locations yet" />
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Name</TH><TH>Type</TH><TH>Project</TH><TH className="text-right">Items</TH><TH className="text-right">Stock value</TH>
              </TR>
            </THead>
            <TBody>
              {data.locations.map((l) => (
                <TR key={l.id}>
                  <TD className="font-medium">{l.name}</TD>
                  <TD><Badge variant="outline">{LOCATION_TYPE_LABELS[l.type] ?? l.type}</Badge></TD>
                  <TD className="text-muted-foreground">{l.projectName ?? "—"}</TD>
                  <TD className="text-right">{l.itemCount}</TD>
                  <TD className="text-right">{formatCurrency(l.stockValue, data.currency)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────
//  Policy & Security tab
// ───────────────────────────────────────────────────────────────

function PolicyTab({
  data, canManage, canManageTelephony,
}: {
  data: CompanyProfileData; canManage: boolean; canManageTelephony: boolean;
}) {
  const router = useRouter();
  const [pw, setPw] = useState({
    passwordMinLength: data.passwordMinLength,
    passwordRequireSpecial: data.passwordRequireSpecial,
    passwordExpiryDays: data.passwordExpiryDays ?? 0,
    accountLockoutThreshold: data.accountLockoutThreshold,
    accountLockoutDurationMin: data.accountLockoutDurationMin,
  });
  const [rec, setRec] = useState({
    recordingConsentBeep: data.recordingConsentBeep,
    recordingRetentionDays: data.recordingRetentionDays,
    recordingAutoDelete: data.recordingAutoDelete,
    recordingStorageProvider: data.recordingStorageProvider,
  });
  const [savingPw, setSavingPw] = useState(false);
  const [savingRec, setSavingRec] = useState(false);

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPw(true);
    try {
      const res = await fetch(`/api/companies/${data.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passwordMinLength: pw.passwordMinLength,
          passwordRequireSpecial: pw.passwordRequireSpecial,
          passwordExpiryDays: pw.passwordExpiryDays || null,
          accountLockoutThreshold: pw.accountLockoutThreshold,
          accountLockoutDurationMin: pw.accountLockoutDurationMin,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Password policy saved");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingPw(false);
    }
  }

  async function saveRecording(e: React.FormEvent) {
    e.preventDefault();
    setSavingRec(true);
    try {
      const res = await fetch(`/api/companies/${data.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordingConsentBeep: rec.recordingConsentBeep,
          recordingRetentionDays: rec.recordingRetentionDays,
          recordingAutoDelete: rec.recordingAutoDelete,
          recordingStorageProvider: rec.recordingStorageProvider,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Recording config saved");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingRec(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Password policy */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <div>
              <h3 className="text-body font-semibold">Password Policy</h3>
              <p className="text-caption text-muted-foreground">Enforced on sign-up and password reset for all members of this company.</p>
            </div>
          </div>
          <form onSubmit={savePassword} className="space-y-4 max-w-lg">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Minimum length</Label>
                <Input type="number" min={4} max={128} value={pw.passwordMinLength} disabled={!canManage}
                  onChange={(e) => setPw((f) => ({ ...f, passwordMinLength: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry (days, 0 = never)</Label>
                <Input type="number" min={0} value={pw.passwordExpiryDays} disabled={!canManage}
                  onChange={(e) => setPw((f) => ({ ...f, passwordExpiryDays: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Lockout threshold (failed attempts)</Label>
                <Input type="number" min={1} max={50} value={pw.accountLockoutThreshold} disabled={!canManage}
                  onChange={(e) => setPw((f) => ({ ...f, accountLockoutThreshold: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Lockout duration (minutes)</Label>
                <Input type="number" min={1} max={1440} value={pw.accountLockoutDurationMin} disabled={!canManage}
                  onChange={(e) => setPw((f) => ({ ...f, accountLockoutDurationMin: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-caption font-medium">Require special characters</div>
                <div className="text-micro text-muted-foreground">Off keeps passwords simple for field staff.</div>
              </div>
              <Toggle checked={pw.passwordRequireSpecial} disabled={!canManage} onChange={(v) => setPw((f) => ({ ...f, passwordRequireSpecial: v }))} />
            </div>
            {canManage && (
              <Button type="submit" size="sm" disabled={savingPw}>{savingPw ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save policy</Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Call recording config */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <div>
              <h3 className="text-body font-semibold">Call Recording Config</h3>
              <p className="text-caption text-muted-foreground">Retention, storage, and consent for recorded calls.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border p-3">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-caption font-medium">Recording mode</div>
              <div className="text-micro text-muted-foreground">Who gets recorded — managed in the Telephony page.</div>
            </div>
            <Badge variant={(RECORDING_MODE_LABELS[data.recordingMode]?.variant ?? "muted") as never}>
              {RECORDING_MODE_LABELS[data.recordingMode]?.label ?? data.recordingMode}
            </Badge>
            <Button asChild size="sm" variant="outline"><Link href="/calls">Manage</Link></Button>
          </div>
          <form onSubmit={saveRecording} className="space-y-4 max-w-lg">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Retention (days)</Label>
                <Input type="number" min={0} value={rec.recordingRetentionDays} disabled={!canManageTelephony}
                  onChange={(e) => setRec((f) => ({ ...f, recordingRetentionDays: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Storage provider</Label>
                <Select value={rec.recordingStorageProvider} disabled={!canManageTelephony}
                  onChange={(e) => setRec((f) => ({ ...f, recordingStorageProvider: e.target.value }))}>
                  {["local", "s3"].map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-caption font-medium">Play consent beep</div>
                <div className="text-micro text-muted-foreground">“Calls may be recorded” notice at call start.</div>
              </div>
              <Toggle checked={rec.recordingConsentBeep} disabled={!canManageTelephony} onChange={(v) => setRec((f) => ({ ...f, recordingConsentBeep: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-caption font-medium">Auto-delete after retention</div>
                <div className="text-micro text-muted-foreground">Automatically purge recordings past the retention window.</div>
              </div>
              <Toggle checked={rec.recordingAutoDelete} disabled={!canManageTelephony} onChange={(v) => setRec((f) => ({ ...f, recordingAutoDelete: v }))} />
            </div>
            {canManageTelephony && (
              <Button type="submit" size="sm" disabled={savingRec}>{savingRec ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save recording config</Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors", checked ? "bg-primary" : "bg-input", disabled && "opacity-50 cursor-not-allowed")}
    >
      <span className={cn("pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg transition-transform", checked ? "translate-x-4" : "translate-x-0")} />
    </button>
  );
}

// ───────────────────────────────────────────────────────────────
//  Procurement tab
// ───────────────────────────────────────────────────────────────

function ProcurementTab({ data, canManage }: { data: CompanyProfileData; canManage: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    lciThresholdDefault: data.lciThresholdDefault ?? 0,
    poApprovalThresholdManager: data.poApprovalThresholdManager ?? 0,
    poApprovalThresholdAdmin: data.poApprovalThresholdAdmin ?? 0,
  });
  const [previewAmount, setPreviewAmount] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${data.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lciThresholdDefault: form.lciThresholdDefault || null,
          poApprovalThresholdManager: form.poApprovalThresholdManager || null,
          poApprovalThresholdAdmin: form.poApprovalThresholdAdmin || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Procurement config saved");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  // Approval routing preview
  const amount = Number(previewAmount) || 0;
  let requiredRole = "Owner";
  let reason = "";
  if (amount > 0) {
    if (data.poApprovalThresholdAdmin && amount >= data.poApprovalThresholdAdmin) { requiredRole = "Owner"; reason = "at or above the admin threshold"; }
    else if (data.poApprovalThresholdManager && amount >= data.poApprovalThresholdManager) { requiredRole = "Admin"; reason = "above the manager threshold"; }
    else { requiredRole = "Manager"; reason = "below the manager threshold"; }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5 max-w-2xl">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="text-body font-semibold">Procurement Configuration</h3>
            <p className="text-caption text-muted-foreground">LCI threshold and PO approval routing for this company.</p>
          </div>
        </div>

        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label>LCI Threshold Default (%)</Label>
            <Input type="number" min={0} max={100} step="any" value={form.lciThresholdDefault || ""} disabled={!canManage}
              onChange={(e) => setForm((f) => ({ ...f, lciThresholdDefault: e.target.value === "" ? 0 : Number(e.target.value) }))}
              placeholder="e.g. 2" />
            <p className="text-caption text-muted-foreground">Default Low-Cost Item threshold for projects without an explicit override. Items below this % of project budget are auto-procured without a PO.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>PO Approval — Manager Threshold ({data.currency})</Label>
              <Input type="number" min={0} value={form.poApprovalThresholdManager || ""} disabled={!canManage}
                onChange={(e) => setForm((f) => ({ ...f, poApprovalThresholdManager: e.target.value === "" ? 0 : Number(e.target.value) }))}
                placeholder="50000" />
              <p className="text-caption text-muted-foreground">POs below this can be approved by a Manager.</p>
            </div>
            <div className="space-y-1.5">
              <Label>PO Approval — Admin Threshold ({data.currency})</Label>
              <Input type="number" min={0} value={form.poApprovalThresholdAdmin || ""} disabled={!canManage}
                onChange={(e) => setForm((f) => ({ ...f, poApprovalThresholdAdmin: e.target.value === "" ? 0 : Number(e.target.value) }))}
                placeholder="500000" />
              <p className="text-caption text-muted-foreground">POs at or above this require the Owner.</p>
            </div>
          </div>
          {canManage && (
            <Button type="submit" size="sm" disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save</Button>
          )}
        </form>

        {/* Approval routing preview */}
        <div className="rounded-md border border-border p-4 space-y-3">
          <div>
            <div className="text-body font-semibold">Approval Routing Preview</div>
            <div className="text-caption text-muted-foreground">Test an amount to see which role approves a PO of that value.</div>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label>PO Amount</Label>
              <Input type="number" min={0} value={previewAmount} onChange={(e) => setPreviewAmount(e.target.value)} placeholder="75000" />
            </div>
          </div>
          {amount > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-caption">
                Requires <span className="font-semibold">{requiredRole}</span> approval — {reason}.
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────
//  Activity & Audit tab
// ───────────────────────────────────────────────────────────────

function AuditTab({ data }: { data: CompanyProfileData }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <div>
              <h3 className="text-body font-semibold">Audit Log</h3>
              <p className="text-caption text-muted-foreground">Recent actions recorded for this company (last 100).</p>
            </div>
          </div>
          {data.auditLogs.length === 0 ? (
            <EmptyState icon={<Activity />} title="No audit entries yet" />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Time</TH><TH>Action</TH><TH>Entity</TH><TH>User</TH>
                </TR>
              </THead>
              <TBody>
                {data.auditLogs.map((l) => (
                  <TR key={l.id}>
                    <TD className="text-caption text-muted-foreground whitespace-nowrap">{formatDateTime(l.timestamp)}</TD>
                    <TD className="font-mono text-caption">{l.action}</TD>
                    <TD className="text-caption">{l.entityType}</TD>
                    <TD className="text-caption">{l.userName ?? l.userEmail ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <div>
              <h3 className="text-body font-semibold">Backups</h3>
              <p className="text-caption text-muted-foreground">Automated daily export records (30-day retention).</p>
            </div>
          </div>
          {data.backups.length === 0 ? (
            <EmptyState icon={<Database />} title="No backups recorded yet" />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Created</TH><TH className="text-right">Size</TH>
                </TR>
              </THead>
              <TBody>
                {data.backups.map((b) => (
                  <TR key={b.id}>
                    <TD className="text-caption text-muted-foreground">{formatDateTime(b.createdAt)}</TD>
                    <TD className="text-right text-caption">{b.sizeBytes > 0 ? `${(b.sizeBytes / 1024).toFixed(1)} KB` : "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
