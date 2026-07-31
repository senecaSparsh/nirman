"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Users, Building2, HardHat, UserPlus, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { formatCurrency } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { canManageUsers, ROLE_LIST, type Role } from "@/lib/roles";
import { useSession } from "@/lib/auth-client";
import type { StockLocationRow } from "@/lib/types";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
};

type CompanyInfo = {
  id: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  currency: string;
};

export function SettingsView({
  company,
  users,
  locations,
  projects,
  subcontractors,
  employees,
}: {
  company: CompanyInfo;
  users: UserRow[];
  locations: StockLocationRow[];
  projects: { id: string; name: string }[];
  subcontractors: { id: string; name: string; trade: string | null; phone: string | null; email: string | null }[];
  employees: { id: string; name: string; trade: string | null; phone: string | null; email: string | null; dailyRate: number; active: boolean }[];
}) {
  const [tab, setTab] = useState("company");
  const router = useRouter();

  // Subcontractor form
  const [subFormOpen, setSubFormOpen] = useState(false);
  const [subForm, setSubForm] = useState({ name: "", trade: "", phone: "", email: "", gstin: "", address: "" });
  const [savingSub, setSavingSub] = useState(false);
  const [deletingSub, setDeletingSub] = useState<string | null>(null);

  // Employee form
  const [empFormOpen, setEmpFormOpen] = useState(false);
  const [empForm, setEmpForm] = useState({ name: "", trade: "", phone: "", email: "", dailyRate: "" });
  const [savingEmp, setSavingEmp] = useState(false);
  const [deletingEmp, setDeletingEmp] = useState<string | null>(null);

  async function saveEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!empForm.name.trim()) return toast.error("Name is required");
    setSavingEmp(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: empForm.name.trim(),
          trade: empForm.trade.trim() || null,
          phone: empForm.phone.trim() || null,
          email: empForm.email.trim() || null,
          dailyRate: empForm.dailyRate ? Number(empForm.dailyRate) : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Employee added");
      setEmpFormOpen(false);
      setEmpForm({ name: "", trade: "", phone: "", email: "", dailyRate: "" });
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    } finally {
      setSavingEmp(false);
    }
  }

  async function saveSubcontractor(e: React.FormEvent) {
    e.preventDefault();
    if (!subForm.name.trim()) return toast.error("Name is required");
    setSavingSub(true);
    try {
      const res = await fetch("/api/subcontractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: subForm.name.trim(),
          trade: subForm.trade.trim() || null,
          phone: subForm.phone.trim() || null,
          email: subForm.email.trim() || null,
          gstin: subForm.gstin.trim() || null,
          address: subForm.address.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Subcontractor added");
      setSubFormOpen(false);
      setSubForm({ name: "", trade: "", phone: "", email: "", gstin: "", address: "" });
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    } finally {
      setSavingSub(false);
    }
  }

  // Company form
  const [companyForm, setCompanyForm] = useState(company);
  const [savingCompany, setSavingCompany] = useState(false);

  // Location form
  const [locFormOpen, setLocFormOpen] = useState(false);
  const [locForm, setLocForm] = useState({ type: "COMPANY_WAREHOUSE", name: "", address: "", projectId: "" });
  const [savingLoc, setSavingLoc] = useState(false);
  const [deletingLoc, setDeletingLoc] = useState<StockLocationRow | null>(null);

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!companyForm.name.trim()) return toast.error("Company name is required");
    setSavingCompany(true);
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: companyForm.name.trim(),
          gstin: companyForm.gstin?.trim() || null,
          pan: companyForm.pan?.trim() || null,
          address: companyForm.address?.trim() || null,
          currency: companyForm.currency,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update company");
      toast.success("Company profile updated");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setSavingCompany(false);
    }
  }

  async function saveLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!locForm.name.trim()) return toast.error("Location name is required");
    setSavingLoc(true);
    try {
      const res = await fetch("/api/stock-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: locForm.type,
          name: locForm.name.trim(),
          address: locForm.address.trim() || null,
          projectId: locForm.type === "PROJECT_SITE" ? locForm.projectId || null : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create location");
      toast.success("Location created");
      setLocFormOpen(false);
      setLocForm({ type: "COMPANY_WAREHOUSE", name: "", address: "", projectId: "" });
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setSavingLoc(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Company profile, users & roles, and stock locations." />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="company">
            <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Company</span>
          </TabsTrigger>
          <TabsTrigger value="users">
            <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Users</span>
          </TabsTrigger>
          <TabsTrigger value="locations">
            <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Locations</span>
          </TabsTrigger>
          <TabsTrigger value="subcontractors">
            <span className="flex items-center gap-1.5"><HardHat className="h-3.5 w-3.5" /> Subcontractors</span>
          </TabsTrigger>
          <TabsTrigger value="employees">
            <span className="flex items-center gap-1.5"><UserPlus className="h-3.5 w-3.5" /> Employees</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <Card>
            <CardContent className="p-6">
              <form onSubmit={saveCompany} className="space-y-4 max-w-lg">
                <div className="space-y-1.5">
                  <Label htmlFor="c-name">Company Name *</Label>
                  <Input id="c-name" value={companyForm.name} onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>GSTIN</Label>
                    <Input value={companyForm.gstin ?? ""} onChange={(e) => setCompanyForm((f) => ({ ...f, gstin: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>PAN</Label>
                    <Input value={companyForm.pan ?? ""} onChange={(e) => setCompanyForm((f) => ({ ...f, pan: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Input value={companyForm.address ?? ""} onChange={(e) => setCompanyForm((f) => ({ ...f, address: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={companyForm.currency} onChange={(e) => setCompanyForm((f) => ({ ...f, currency: e.target.value }))}>
                    {["INR", "USD", "EUR", "GBP", "AED"].map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
                <Button type="submit" disabled={savingCompany}>
                  {savingCompany ? "Saving…" : "Save Changes"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <UsersManager users={users} />
        </TabsContent>

        <TabsContent value="locations">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-body text-muted-foreground">{locations.length} location{locations.length !== 1 ? "s" : ""}</span>
              <Button onClick={() => setLocFormOpen(true)}><Plus className="h-4 w-4" /> New Location</Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>Name</TH>
                      <TH>Type</TH>
                      <TH>Project</TH>
                      <TH>Address</TH>
                      <TH className="text-right">Stock Value</TH>
                      <TH className="text-right">Items</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {locations.map((l) => (
                      <TR key={l.id}>
                        <TD className="font-medium">{l.name}</TD>
                        <TD><Badge variant="outline">{l.type === "COMPANY_WAREHOUSE" ? "Warehouse" : "Project Site"}</Badge></TD>
                        <TD className="text-muted-foreground">{l.projectName ?? "—"}</TD>
                        <TD className="text-muted-foreground">{l.address ?? "—"}</TD>
                        <TD className="tnum text-right">{formatCurrency(l.stockValue)}</TD>
                        <TD className="tnum text-right">{l.itemCount}</TD>
                        <TD>
                          <div className="flex justify-end">
                            <Button variant="ghost" size="icon" onClick={() => setDeletingLoc(l)} disabled={l.itemCount > 0}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="subcontractors">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-body text-muted-foreground">{subcontractors.length} subcontractor{subcontractors.length !== 1 ? "s" : ""}</span>
              <Button onClick={() => setSubFormOpen(true)}><Plus className="h-4 w-4" /> New Subcontractor</Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>Name</TH>
                      <TH>Trade</TH>
                      <TH>Phone</TH>
                      <TH>Email</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {subcontractors.map((s) => (
                      <TR key={s.id}>
                        <TD className="font-medium">{s.name}</TD>
                        <TD className="text-muted-foreground">{s.trade ?? "—"}</TD>
                        <TD className="text-muted-foreground">{s.phone ?? "—"}</TD>
                        <TD className="text-muted-foreground">{s.email ?? "—"}</TD>
                        <TD>
                          <div className="flex justify-end">
                            <Button variant="ghost" size="icon" onClick={() => setDeletingSub(s.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    ))}
                    {subcontractors.length === 0 && (
                      <TR>
                        <TD colSpan={5} className="py-10 text-center text-muted-foreground">No subcontractors yet</TD>
                      </TR>
                    )}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="employees">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-body text-muted-foreground">{employees.length} employee{employees.length !== 1 ? "s" : ""}</span>
              <Button onClick={() => setEmpFormOpen(true)}><Plus className="h-4 w-4" /> New Employee</Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>Name</TH>
                      <TH>Trade</TH>
                      <TH>Phone</TH>
                      <TH>Daily Rate</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {employees.map((e) => (
                      <TR key={e.id}>
                        <TD className="font-medium">{e.name}</TD>
                        <TD className="text-muted-foreground">{e.trade ?? "—"}</TD>
                        <TD className="text-muted-foreground">{e.phone ?? "—"}</TD>
                        <TD className="text-muted-foreground">{formatCurrency(e.dailyRate)}</TD>
                        <TD><Badge variant={e.active ? "success" : "muted"}>{e.active ? "Active" : "Inactive"}</Badge></TD>
                        <TD>
                          <div className="flex justify-end">
                            <Button variant="ghost" size="icon" onClick={() => setDeletingEmp(e.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    ))}
                    {employees.length === 0 && (
                      <TR>
                        <TD colSpan={6} className="py-10 text-center text-muted-foreground">No employees yet — add people to assign to playground task nodes</TD>
                      </TR>
                    )}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Location form dialog */}
      {locFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setLocFormOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">New Stock Location</h2>
            <form onSubmit={saveLocation} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={locForm.type} onChange={(e) => setLocForm((f) => ({ ...f, type: e.target.value, projectId: "" }))}>
                  <option value="COMPANY_WAREHOUSE">Company Warehouse</option>
                  <option value="PROJECT_SITE">Project Site</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={locForm.name} onChange={(e) => setLocForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              {locForm.type === "PROJECT_SITE" && (
                <div className="space-y-1.5">
                  <Label>Project</Label>
                  <Select value={locForm.projectId} onChange={(e) => setLocForm((f) => ({ ...f, projectId: e.target.value }))}>
                    <option value="">Select project…</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Input value={locForm.address} onChange={(e) => setLocForm((f) => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setLocFormOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={savingLoc}>{savingLoc ? "Creating…" : "Create"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingLoc && (
        <DeleteConfirmDialog
          open={deletingLoc !== null}
          onOpenChange={(o) => !o && setDeletingLoc(null)}
          endpoint={`/api/stock-locations/${deletingLoc.id}`}
          title="Delete location"
          description={`Delete "${deletingLoc.name}"? Locations with stock cannot be deleted.`}
          successMessage="Location deleted"
        />
      )}

      {/* Subcontractor form dialog */}
      {subFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSubFormOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">New Subcontractor</h2>
            <form onSubmit={saveSubcontractor} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={subForm.name} onChange={(e) => setSubForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Trade</Label>
                  <Input value={subForm.trade} onChange={(e) => setSubForm((f) => ({ ...f, trade: e.target.value }))} placeholder="Plumbing" />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={subForm.phone} onChange={(e) => setSubForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={subForm.email} onChange={(e) => setSubForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>GSTIN</Label>
                <Input value={subForm.gstin} onChange={(e) => setSubForm((f) => ({ ...f, gstin: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Input value={subForm.address} onChange={(e) => setSubForm((f) => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setSubFormOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={savingSub}>{savingSub ? "Creating…" : "Create"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingSub && (
        <DeleteConfirmDialog
          open={deletingSub !== null}
          onOpenChange={(o) => !o && setDeletingSub(null)}
          endpoint={`/api/subcontractors/${deletingSub}`}
          title="Delete subcontractor"
          description="Subcontractors with project costs cannot be deleted."
          successMessage="Subcontractor deleted"
        />
      )}

      {/* Employee form dialog */}
      {empFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEmpFormOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">New Employee</h2>
            <form onSubmit={saveEmployee} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={empForm.name} onChange={(e) => setEmpForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Trade</Label>
                  <Input value={empForm.trade} onChange={(e) => setEmpForm((f) => ({ ...f, trade: e.target.value }))} placeholder="Masonry" />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={empForm.phone} onChange={(e) => setEmpForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={empForm.email} onChange={(e) => setEmpForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Daily Rate</Label>
                  <Input type="number" min="0" step="0.01" value={empForm.dailyRate} onChange={(e) => setEmpForm((f) => ({ ...f, dailyRate: e.target.value }))} placeholder="0" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEmpFormOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={savingEmp}>{savingEmp ? "Creating…" : "Create"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingEmp && (
        <DeleteConfirmDialog
          open={deletingEmp !== null}
          onOpenChange={(o) => !o && setDeletingEmp(null)}
          endpoint={`/api/employees/${deletingEmp}`}
          title="Delete employee"
          description="This will archive the employee record. Assignments on playground nodes will show as unassigned."
          successMessage="Employee deleted"
        />
      )}
    </div>
  );
}

// ── Users Manager — role + active status management ──────────

function UsersManager({ users }: { users: UserRow[] }) {
  const { canManageUsers, userId: currentUserId } = usePermissions();
  const canManage = canManageUsers();
  const [saving, setSaving] = useState<string | null>(null);

  const handleRoleChange = async (userId: string, newRole: Role) => {
    setSaving(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to update role");
      } else {
        toast.success("Role updated");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(null);
    }
  };

  const handleActiveToggle = async (userId: string, active: boolean) => {
    setSaving(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to update status");
      } else {
        toast.success(active ? "User activated" : "User deactivated");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(null);
    }
  };

  const roleBadgeVariant = (role: string): "default" | "outline" | "success" | "warning" | "danger" | "muted" => {
    switch (role) {
      case "OWNER": return "warning";
      case "ADMIN": return "danger";
      case "MANAGER": return "default";
      case "SUPERVISOR": return "outline";
      case "SALES": return "success";
      case "ACCOUNTANT": return "muted";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="text-body text-muted-foreground">
            {users.length} user{users.length !== 1 ? "s" : ""}
            {!canManage && " · read-only (your role cannot manage users)"}
          </span>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                {canManage && <TH className="text-right">Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {users.map((u) => (
                <TR key={u.id}>
                  <TD className="font-medium">
                    {u.name}
                    {u.id === currentUserId && (
                      <span className="ml-2 text-caption text-muted-foreground">(you)</span>
                    )}
                  </TD>
                  <TD className="text-muted-foreground">{u.email}</TD>
                  <TD>
                    {canManage ? (
                      <Select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                        disabled={saving === u.id}
                        className="h-8 w-36 text-caption"
                      >
                        {ROLE_LIST.map((r) => (
                          <option key={r.key} value={r.key}>{r.label}</option>
                        ))}
                      </Select>
                    ) : (
                      <Badge variant={roleBadgeVariant(u.role)}>{u.role}</Badge>
                    )}
                  </TD>
                  <TD>
                    {canManage ? (
                      <button
                        onClick={() => handleActiveToggle(u.id, !u.active)}
                        disabled={saving === u.id}
                        className="inline-flex items-center gap-1.5"
                        title={u.active ? "Click to deactivate" : "Click to activate"}
                      >
                        {saving === u.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        <Badge variant={u.active ? "success" : "muted"}>{u.active ? "Active" : "Inactive"}</Badge>
                      </button>
                    ) : (
                      <Badge variant={u.active ? "success" : "muted"}>{u.active ? "Active" : "Inactive"}</Badge>
                    )}
                  </TD>
                  {canManage && (
                    <TD className="text-right text-caption text-muted-foreground">
                      {ROLE_LIST.find((r) => r.key === u.role)?.description}
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* Role descriptions */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Role Permissions</p>
          {ROLE_LIST.map((r) => (
            <div key={r.key} className="flex items-start gap-3 text-body">
              <Badge variant={roleBadgeVariant(r.key)} className="mt-0.5 shrink-0">{r.label}</Badge>
              <span className="text-muted-foreground">{r.description}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
