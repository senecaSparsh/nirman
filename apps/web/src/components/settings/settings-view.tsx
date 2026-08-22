"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Users, Building2, HardHat, Shield, Loader2, Network, UserPlus, X, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { StatusPill } from "@/components/page";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { formatCurrency } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { ROLE_LIST, assignableRoles, canAssignRole, type Role } from "@/lib/roles";
import { CompaniesManager, type CompanyRow } from "@/components/settings/companies-manager";
import { CostCentresTab } from "@/components/settings/cost-centres-tab";
import { PeopleTab } from "@/components/settings/people-tab";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import type { StockLocationRow, DepartmentRow } from "@/lib/types";
import { useTabParam } from "@/lib/use-tab-param";

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
  phone: string | null;
  email: string | null;
  currency: string;
};

export function SettingsView({
  company,
  users,
  locations,
  projects,
  subcontractors,
  employees,
  companies,
  departments,
  canManageCompanies,
  actorRole,
}: {
  company: CompanyInfo;
  users: UserRow[];
  locations: StockLocationRow[];
  projects: { id: string; name: string }[];
  subcontractors: { id: string; name: string; trade: string | null; phone: string | null; email: string | null; gstin: string | null; address: string | null }[];
  employees: { id: string; name: string; trade: string | null; phone: string | null; email: string | null; dailyRate: number; active: boolean }[];
  companies: CompanyRow[];
  departments: DepartmentRow[];
  canManageCompanies: boolean;
  actorRole: string;
}) {
  const [tab, setTab] = useTabParam(
    ["company","users","locations","cost-centres","people","companies","integrations"] as const,
    "company",
  );
  const router = useRouter();

  // Subcontractor form
  const [subFormOpen, setSubFormOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<{ id: string } | null>(null);
  const [subForm, setSubForm] = useState({ name: "", trade: "", phone: "", email: "", gstin: "", address: "" });
  const [savingSub, setSavingSub] = useState(false);
  const [deletingSub, setDeletingSub] = useState<string | null>(null);

  // Employee form
  const [empFormOpen, setEmpFormOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<{ id: string } | null>(null);
  const [empForm, setEmpForm] = useState({ name: "", trade: "", phone: "", email: "", dailyRate: "" });
  const [savingEmp, setSavingEmp] = useState(false);
  const [deletingEmp, setDeletingEmp] = useState<string | null>(null);

  async function saveEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!empForm.name.trim()) return toast.error("Name is required");
    setSavingEmp(true);
    try {
      const payload = {
        name: empForm.name.trim(),
        trade: empForm.trade.trim() || null,
        phone: empForm.phone.trim() || null,
        email: empForm.email.trim() || null,
        dailyRate: empForm.dailyRate ? Number(empForm.dailyRate) : 0,
      };
      const res = editingEmp
        ? await fetch(`/api/employees/${editingEmp.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(editingEmp ? "Employee updated" : "Employee added");
      setEmpFormOpen(false);
      setEditingEmp(null);
      setEmpForm({ name: "", trade: "", phone: "", email: "", dailyRate: "" });
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Failed"));
    } finally {
      setSavingEmp(false);
    }
  }

  function openEditEmp(e: { id: string; name: string; trade: string | null; phone: string | null; email: string | null; dailyRate: number }) {
    setEditingEmp({ id: e.id });
    setEmpForm({ name: e.name, trade: e.trade ?? "", phone: e.phone ?? "", email: e.email ?? "", dailyRate: e.dailyRate.toString() });
    setEmpFormOpen(true);
  }

  async function saveSubcontractor(e: React.FormEvent) {
    e.preventDefault();
    if (!subForm.name.trim()) return toast.error("Name is required");
    setSavingSub(true);
    try {
      const payload = {
        name: subForm.name.trim(),
        trade: subForm.trade.trim() || null,
        phone: subForm.phone.trim() || null,
        email: subForm.email.trim() || null,
        gstin: subForm.gstin.trim() || null,
        address: subForm.address.trim() || null,
      };
      const res = editingSub
        ? await fetch(`/api/subcontractors/${editingSub.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/subcontractors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(editingSub ? "Subcontractor updated" : "Subcontractor added");
      setSubFormOpen(false);
      setEditingSub(null);
      setSubForm({ name: "", trade: "", phone: "", email: "", gstin: "", address: "" });
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Failed"));
    } finally {
      setSavingSub(false);
    }
  }

  function openEditSub(s: { id: string; name: string; trade: string | null; phone: string | null; email: string | null; gstin?: string | null; address?: string | null }) {
    setEditingSub({ id: s.id });
    setSubForm({ name: s.name, trade: s.trade ?? "", phone: s.phone ?? "", email: s.email ?? "", gstin: s.gstin ?? "", address: s.address ?? "" });
    setSubFormOpen(true);
  }

  // Company form
  const [companyForm, setCompanyForm] = useState(company);
  const [savingCompany, setSavingCompany] = useState(false);

  // Location form
  const [locFormOpen, setLocFormOpen] = useState(false);
  const [locForm, setLocForm] = useState({ type: "COMPANY_WAREHOUSE", name: "", address: "", projectId: "" });
  const [savingLoc, setSavingLoc] = useState(false);
  const [deletingLoc, setDeletingLoc] = useState<StockLocationRow | null>(null);

  // Local copy of projects so freshly created ones appear without a refresh
  const [localProjects, setLocalProjects] = useState(projects);
  useEffect(() => { setLocalProjects(projects); }, [projects]);

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
          phone: companyForm.phone?.trim() || null,
          email: companyForm.email?.trim() || null,
          currency: companyForm.currency,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update company");
      toast.success("Company profile updated");
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
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
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setSavingLoc(false);
    }
  }

  return (
    <div className="space-y-5">
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
          <TabsTrigger value="cost-centres">
            <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Cost Centres</span>
          </TabsTrigger>
          <TabsTrigger value="people">
            <span className="flex items-center gap-1.5"><HardHat className="h-3.5 w-3.5" /> People</span>
          </TabsTrigger>
          {canManageCompanies && (
            <TabsTrigger value="companies">
              <span className="flex items-center gap-1.5"><Network className="h-3.5 w-3.5" /> Companies</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="integrations">
            <span className="flex items-center gap-1.5"><Plug className="h-3.5 w-3.5" /> Integrations</span>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input value={companyForm.phone ?? ""} onChange={(e) => setCompanyForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input type="email" value={companyForm.email ?? ""} onChange={(e) => setCompanyForm((f) => ({ ...f, email: e.target.value }))} placeholder="accounts@company.com" />
                  </div>
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
          <UsersManager users={users} actorRole={actorRole} companyId={company.id} />
        </TabsContent>

        <TabsContent value="locations">
          <LocationsTab locations={locations} onDelete={setDeletingLoc} onNew={() => setLocFormOpen(true)} />
        </TabsContent>
        <TabsContent value="cost-centres">
          <CostCentresTab departments={departments} canCreate canEdit canDelete />
        </TabsContent>
        <TabsContent value="people">
          <PeopleTab
            subcontractors={subcontractors}
            employees={employees}
            onNewSub={() => { setEditingSub(null); setSubForm({ name: "", trade: "", phone: "", email: "", gstin: "", address: "" }); setSubFormOpen(true); }}
            onEditSub={openEditSub}
            onDeleteSub={setDeletingSub}
            onNewEmp={() => { setEditingEmp(null); setEmpForm({ name: "", trade: "", phone: "", email: "", dailyRate: "" }); setEmpFormOpen(true); }}
            onEditEmp={openEditEmp}
            onDeleteEmp={setDeletingEmp}
          />
        </TabsContent>

        {canManageCompanies && (
          <TabsContent value="companies">
            <CompaniesManager companies={companies} canManage={canManageCompanies} actorRole={actorRole} />
          </TabsContent>
        )}

        <TabsContent value="integrations">
          <IntegrationsTab />
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
                  <SelectWithCreate
                    value={locForm.projectId}
                    onChange={(v) => setLocForm((f) => ({ ...f, projectId: v }))}
                    placeholder="Select project…"
                    createLabel="project"
                    options={localProjects.map((p) => ({ value: p.id, label: p.name }))}
                    renderCreateDialog={({ open: o, onCreated, onClose }) => (
                      <ProjectFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalProjects((p) => [...p, { id: e.id, name: e.label ?? "" }]); onCreated(e); }} />
                    )}
                  />
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
            <h2 className="mb-4 text-lg font-semibold">{editingSub ? "Edit Subcontractor" : "New Subcontractor"}</h2>
            <form onSubmit={saveSubcontractor} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={subForm.name} onChange={(e) => setSubForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <Button type="submit" disabled={savingSub}>{savingSub ? "Saving…" : editingSub ? "Save Changes" : "Create"}</Button>
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
            <h2 className="mb-4 text-lg font-semibold">{editingEmp ? "Edit Employee" : "New Employee"}</h2>
            <form onSubmit={saveEmployee} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={empForm.name} onChange={(e) => setEmpForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Trade</Label>
                  <Input value={empForm.trade} onChange={(e) => setEmpForm((f) => ({ ...f, trade: e.target.value }))} placeholder="Masonry" />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={empForm.phone} onChange={(e) => setEmpForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <Button type="submit" disabled={savingEmp}>{savingEmp ? "Saving…" : editingEmp ? "Save Changes" : "Create"}</Button>
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
          description="This will archive the employee record. Task assignments will show as unassigned."
          successMessage="Employee deleted"
        />
      )}
    </div>
  );
}

// ── Locations Tab — stock locations as a sortable table ──────

function LocationsTab({
  locations,
  onDelete,
  onNew,
}: {
  locations: StockLocationRow[];
  onDelete: (l: StockLocationRow) => void;
  onNew: () => void;
}) {
  const columns: Column<StockLocationRow>[] = [
    {
      key: "name",
      label: "Location",
      sortable: true,
      render: (l) => (
        <div>
          <div className="font-medium text-foreground">{l.name}</div>
          {l.address && <div className="truncate text-caption text-muted-foreground">{l.address}</div>}
        </div>
      ),
    },
    {
      key: "type",
      label: "Type",
      sortable: true,
      render: (l) => (
        <Badge variant="outline">
          {l.type === "COMPANY_WAREHOUSE" ? "Warehouse" : l.type === "PROJECT_SITE" ? "Project Site" : "Department"}
        </Badge>
      ),
    },
    {
      key: "projectName",
      label: "Project",
      sortable: true,
      sortValue: (l) => l.projectName ?? "",
      render: (l) =>
        l.projectName ? <span className="text-muted-foreground">{l.projectName}</span> : <span className="text-muted-foreground/40">—</span>,
    },
    {
      key: "itemCount",
      label: "Items",
      align: "right",
      sortable: true,
      render: (l) => <span className="tnum text-muted-foreground">{l.itemCount}</span>,
    },
    {
      key: "stockValue",
      label: "Stock Value",
      align: "right",
      sortable: true,
      render: (l) => <span className="tnum font-medium">{formatCurrency(l.stockValue)}</span>,
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (l) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon-sm"
            title={l.itemCount > 0 ? "Cannot delete location with stock items" : "Delete location"}
            onClick={() => onDelete(l)}
            disabled={l.itemCount > 0}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {locations.length > 0 && (
        <div className="flex justify-end">
          <Button size="sm" onClick={onNew}>
            <Plus className="size-4" /> New Location
          </Button>
        </div>
      )}
      {locations.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground">No stock locations yet</p>
          <Button size="sm" onClick={onNew}>
            <Plus className="size-4" /> New Location
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={locations}
            columns={columns}
            storageKey="settings-locations"
            searchable
            searchPlaceholder="Search name, project, address…"
            hideable
            initialSort={{ key: "stockValue", direction: "desc" }}
            showTotals
            sumColumns={["itemCount", "stockValue"]}
            totalFormat={(key, sum) =>
              key === "itemCount" ? sum.toLocaleString("en-IN") : formatCurrency(sum)
            }
          />
        </div>
      )}
    </div>
  );
}

// ── Users Manager — role + active status management ──────────

function UsersManager({ users, actorRole, companyId }: { users: UserRow[]; actorRole: string; companyId: string }) {
  const router = useRouter();
  const { canManageUsers, userId: currentUserId } = usePermissions();
  const canManage = canManageUsers();
  const [saving, setSaving] = useState<string | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<Role>(assignableRoles(actorRole)[0] ?? "PROJECT_MANAGER");
  const [adding, setAdding] = useState(false);

  const assignable = assignableRoles(actorRole);

  async function addUser() {
    if (!addEmail.trim()) {
      toast.error("Email is required");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail.trim(), role: addRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add user");
      toast.success("User added", {
        description: `${addEmail.trim()} added as ${addRole}`,
      });
      setAddEmail("");
      setShowAddUser(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add user");
    } finally {
      setAdding(false);
    }
  }

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
        router.refresh();
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
        router.refresh();
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
      case "PROJECT_DIRECTOR": return "default";
      case "FINANCE_HEAD": return "default";
      case "PROJECT_MANAGER": return "default";
      case "PROCUREMENT_MANAGER": return "default";
      case "HR_MANAGER": return "default";
      case "SITE_ENGINEER": return "outline";
      case "STORE_KEEPER": return "outline";
      case "ACCOUNTANT": return "muted";
      case "SALES_MANAGER": return "success";
      case "SUPERVISOR": return "outline";
      case "QAQC_ENGINEER": return "outline";
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
        {canManage && assignable.length > 0 && (
          <Button size="sm" onClick={() => setShowAddUser(true)}>
            <Plus className="h-3.5 w-3.5" /> Add User
          </Button>
        )}
      </div>

      {/* Add User Dialog */}
      {showAddUser && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-body font-semibold">Add User to Company</span>
              <button onClick={() => setShowAddUser(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-caption text-muted-foreground">
              Enter the email of the person to add. If they already have an account, they&apos;ll be added to this company. If not, a new account will be created.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="add-user-email">Email *</Label>
                <Input
                  id="add-user-email"
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="user@example.com"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-user-role">Role</Label>
                <Select
                  id="add-user-role"
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as Role)}
                  className="h-8"
                >
                  {assignable.map((r) => {
                    const def = ROLE_LIST.find((rl) => rl.key === r);
                    return <option key={r} value={r}>{def?.label ?? r}</option>;
                  })}
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddUser(false)} disabled={adding}>
                Cancel
              </Button>
              <Button size="sm" onClick={addUser} disabled={adding || !addEmail.trim()}>
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                {adding ? "Adding…" : "Add User"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                    {canManage && canAssignRole(actorRole, u.role) ? (
                      <Select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                        disabled={saving === u.id}
                        className="h-8 w-36 text-caption"
                      >
                        {/* Show current role + any role the actor can assign. */}
                        {[u.role, ...assignableRoles(actorRole)]
                          .filter((r, i, arr) => arr.indexOf(r) === i)
                          .map((r) => {
                            const def = ROLE_LIST.find((rl) => rl.key === r);
                            return <option key={r} value={r}>{def?.label ?? r}</option>;
                          })}
                      </Select>
                    ) : (
                      <Badge variant={roleBadgeVariant(u.role)}>{u.role}</Badge>
                    )}
                  </TD>
                  <TD>
                    {canManage && canAssignRole(actorRole, u.role) ? (
                      <button
                        onClick={() => handleActiveToggle(u.id, !u.active)}
                        disabled={saving === u.id}
                        className="inline-flex items-center gap-1.5"
                        title={u.active ? "Click to deactivate" : "Click to activate"}
                      >
                        {saving === u.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        <StatusPill status={u.active ? "ACTIVE" : "INACTIVE"} />
                      </button>
                    ) : (
                      <StatusPill status={u.active ? "ACTIVE" : "INACTIVE"} />
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
