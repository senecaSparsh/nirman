"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Users, Building2, HardHat, Shield, ShieldPlus, Loader2, Network, Plug, Pencil, Layers, Warehouse, Lock, KeyRound, History, Upload, Search, Unlock, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { AddressSearchField } from "@/components/address-search-field";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { StatusPill } from "@/components/page";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { formatCurrency, displayEmail, formatEnumLabel } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { ROLE_LIST, ROLES, assignableRoles, canAssignRole, effectivePermissions, PERMISSION_MODULES, ALL_PERMISSIONS, roleTier, type Role } from "@/lib/roles";
import { CompaniesManager, type CompanyRow } from "@/components/settings/companies-manager";
import { CostCentresTab } from "@/components/settings/cost-centres-tab";
import { PeopleTab } from "@/components/settings/people-tab";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { ScopeEditorDialog } from "@/components/settings/scope-editor-dialog";
import { PermissionsEditorDialog } from "@/components/settings/permissions-editor-dialog";
import { CreateUserDialog } from "@/components/settings/create-user-dialog";
import { ResetPasswordDialog } from "@/components/settings/reset-password-dialog";
import { MemberHatsDialog } from "@/components/settings/member-hats-dialog";
import { RolePermissionsDialog } from "@/components/settings/role-permissions-dialog";
import { UserActivityDialog } from "@/components/settings/user-activity-dialog";
import { BulkImportDialog } from "@/components/settings/bulk-import-dialog";
import type { StockLocationRow, DepartmentRow } from "@/lib/types";
import { useTabParam } from "@/lib/use-tab-param";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  /** Extra hats held on this company membership (switchable via app header). */
  secondaryRoles: string[];
  active: boolean;
  phone: string | null;
  designation: string | null;
  department: string | null;
  employeeCode: string | null;
  joiningDate: string | null;
  lockedUntil: string | Date | null;
  failedLoginAttempts: number;
};

type CompanyInfo = {
  id: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  geoRadius: number | null;
  phone: string | null;
  email: string | null;
  currency: string;
  lciThresholdDefault: number | null;
  poApprovalThresholdManager: number | null;
  poApprovalThresholdAdmin: number | null;
  approvalAgingHours: number | null;
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
  managers,
  customRoles,
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
  managers: { membershipId: string; userId: string; name: string; role: string }[];
  customRoles?: { id: string; key: string; label: string; description: string; baseRole: string | null; tier: number; permissions: string[] }[];
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
  const [previewAmount, setPreviewAmount] = useState("");
  const [previewResult, setPreviewResult] = useState<{ requiredRole: string; threshold: number; reason: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Location form
  const [locFormOpen, setLocFormOpen] = useState(false);
  const [locForm, setLocForm] = useState({ type: "COMPANY_WAREHOUSE", name: "", address: "", projectId: "", lat: "", lng: "", geoRadius: "" });
  const [savingLoc, setSavingLoc] = useState(false);
  const [deletingLoc, setDeletingLoc] = useState<StockLocationRow | null>(null);
  const [editingLocId, setEditingLocId] = useState<string | null>(null);

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
          lat: companyForm.lat ?? null,
          lng: companyForm.lng ?? null,
          geoRadius: companyForm.lat != null && companyForm.lng != null ? (companyForm.geoRadius ?? 500) : null,
          phone: companyForm.phone?.trim() || null,
          email: companyForm.email?.trim() || null,
          currency: companyForm.currency,
          lciThresholdDefault: companyForm.lciThresholdDefault ?? null,
          poApprovalThresholdManager: companyForm.poApprovalThresholdManager ?? null,
          poApprovalThresholdAdmin: companyForm.poApprovalThresholdAdmin ?? null,
          approvalAgingHours: companyForm.approvalAgingHours ?? 48,
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
      const payload = {
        type: locForm.type,
        name: locForm.name.trim(),
        address: locForm.address.trim() || null,
        projectId: locForm.type === "PROJECT_SITE" ? locForm.projectId || null : null,
        lat: locForm.lat ? parseFloat(locForm.lat) : null,
        lng: locForm.lng ? parseFloat(locForm.lng) : null,
        // Coordinates present → always create a fence (default 500m).
        geoRadius: locForm.lat && locForm.lng ? (locForm.geoRadius ? parseInt(locForm.geoRadius) : 500) : (locForm.geoRadius ? parseInt(locForm.geoRadius) : null),
      };
      let res: Response;
      if (editingLocId) {
        res = await fetch(`/api/stock-locations/${editingLocId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/stock-locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save location");
      toast.success(editingLocId ? "Location updated" : "Location created");
      setLocFormOpen(false);
      setEditingLocId(null);
      setLocForm({ type: "COMPANY_WAREHOUSE", name: "", address: "", projectId: "", lat: "", lng: "", geoRadius: "" });
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setSavingLoc(false);
    }
  }

  function openEditLocation(l: StockLocationRow) {
    setEditingLocId(l.id);
    setLocForm({
      type: l.type,
      name: l.name,
      address: l.address ?? "",
      projectId: l.projectId ?? "",
      lat: l.lat != null ? String(l.lat) : "",
      lng: l.lng != null ? String(l.lng) : "",
      geoRadius: l.geoRadius != null ? String(l.geoRadius) : "",
    });
    setLocFormOpen(true);
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
            <span className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Cost Centres</span>
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
          <div className="mb-3 flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-2.5">
            <div className="text-caption text-muted-foreground">
              This tab covers identity & procurement. For the full company profile — members, hierarchy, security policy, audit — open the company profile page.
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/companies/${company.id}`}>Open company profile</Link>
            </Button>
          </div>
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
                  <Label hint="Pick a suggestion or use GPS — verified addresses only">Address</Label>
                  <AddressSearchField
                    value={companyForm.address ?? ""}
                    onPick={(s) => setCompanyForm((f) => ({ ...f, address: s.address, lat: s.lat, lng: s.lng, geoRadius: f.geoRadius ?? 500 }))}
                    onClear={() => setCompanyForm((f) => ({ ...f, address: "", lat: null, lng: null }))}
                    placeholder="Search registered office address…"
                  />
                  {companyForm.lat != null && companyForm.lng != null && (
                    <p className="text-caption text-muted-foreground tnum">
                      {companyForm.lat.toFixed(5)}, {companyForm.lng.toFixed(5)}
                    </p>
                  )}
                </div>
                {companyForm.lat != null && companyForm.lng != null && (
                  <div className="space-y-1.5">
                    <Label hint="Default: 500m — check-in geo-fence for staff without an assigned site">Geo-fence radius (m)</Label>
                    <Input
                      type="number"
                      min="10"
                      value={companyForm.geoRadius != null ? String(companyForm.geoRadius) : ""}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, geoRadius: e.target.value ? parseInt(e.target.value) : null }))}
                      placeholder="500"
                    />
                  </div>
                )}
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

                {/* ── Procurement Config ── */}
                <div className="rounded-md border border-border p-4 space-y-3">
                  <div>
                    <div className="text-body font-semibold">Procurement Configuration</div>
                    <div className="text-caption text-muted-foreground">
                      LCI threshold and PO approval routing — controls how purchase orders are routed for approval.
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>LCI Threshold Default (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      value={companyForm.lciThresholdDefault ?? ""}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, lciThresholdDefault: e.target.value === "" ? null : Number(e.target.value) }))}
                      placeholder="e.g. 2 (items below 2% of budget auto-procured)"
                    />
                    <p className="text-caption text-muted-foreground">
                      Default Low-Cost Item threshold for projects without an explicit override. Items below this % of project budget are auto-procured without PO.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>PO Approval — Manager Threshold (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={companyForm.poApprovalThresholdManager ?? ""}
                        onChange={(e) => setCompanyForm((f) => ({ ...f, poApprovalThresholdManager: e.target.value === "" ? null : Number(e.target.value) }))}
                        placeholder="50000"
                      />
                      <p className="text-caption text-muted-foreground">POs below this amount can be approved by a Manager.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>PO Approval — Admin Threshold (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={companyForm.poApprovalThresholdAdmin ?? ""}
                        onChange={(e) => setCompanyForm((f) => ({ ...f, poApprovalThresholdAdmin: e.target.value === "" ? null : Number(e.target.value) }))}
                        placeholder="500000"
                      />
                      <p className="text-caption text-muted-foreground">POs at or above this amount require the Owner.</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Approval aging threshold (hours)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={336}
                      value={companyForm.approvalAgingHours ?? ""}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, approvalAgingHours: e.target.value === "" ? null : Number(e.target.value) }))}
                      placeholder="48"
                    />
                    <p className="text-caption text-muted-foreground">
                      Approvals waiting longer than this hit the daily escalation digest to Owner/Admin/Director and any active delegates. Default 48h.
                    </p>
                  </div>
                </div>

                {/* ── Approval Routing Preview ── */}
                <div className="rounded-md border border-border p-4 space-y-3">
                  <div>
                    <div className="text-body font-semibold">Approval Routing Preview</div>
                    <div className="text-caption text-muted-foreground">
                      Test an amount to see which role would be required to approve a PO of that value.
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label>PO Amount</Label>
                      <Input
                        type="number"
                        min={0}
                        value={previewAmount}
                        onChange={(e) => setPreviewAmount(e.target.value)}
                        placeholder="e.g. 75000"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={previewLoading || !previewAmount}
                      onClick={async () => {
                        setPreviewLoading(true);
                        setPreviewResult(null);
                        try {
                          const res = await fetch(`/api/approval-routing?amount=${encodeURIComponent(previewAmount)}`);
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error ?? "Failed to fetch routing");
                          setPreviewResult(data);
                        } catch (err: unknown) {
                          toast.error(err instanceof Error ? err.message : "Failed to fetch routing");
                        } finally {
                          setPreviewLoading(false);
                        }
                      }}
                    >
                      {previewLoading ? "Checking…" : "Preview"}
                    </Button>
                  </div>
                  {previewResult && (
                    <div className="rounded-md bg-muted/50 p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-caption text-muted-foreground">Required approver:</span>
                        <span className="font-semibold text-foreground">{formatEnumLabel(previewResult.requiredRole)}</span>
                      </div>
                      <p className="text-caption text-muted-foreground mt-1">{previewResult.reason}</p>
                    </div>
                  )}
                </div>

                <Button type="submit" disabled={savingCompany}>
                  {savingCompany ? "Saving…" : "Save Changes"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <UsersManager users={users} actorRole={actorRole} companyId={company.id} projects={projects} departments={departments} managers={managers} customRoles={customRoles} />
        </TabsContent>

        <TabsContent value="locations">
          <LocationsTab locations={locations} onDelete={setDeletingLoc} onNew={() => { setEditingLocId(null); setLocForm({ type: "COMPANY_WAREHOUSE", name: "", address: "", projectId: "", lat: "", lng: "", geoRadius: "" }); setLocFormOpen(true); }} onEdit={openEditLocation} />
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
            <h2 className="mb-4 text-lg font-semibold">{editingLocId ? "Edit Stock Location" : "New Stock Location"}</h2>
            <form onSubmit={saveLocation} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={locForm.type} onChange={(e) => setLocForm((f) => ({ ...f, type: e.target.value, projectId: "" }))}>
                  <option value="CENTRAL_WAREHOUSE">Central Warehouse (Parent)</option>
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
                <Label hint="Pick a suggestion or use GPS — verified addresses only">Address</Label>
                <AddressSearchField
                  value={locForm.address}
                  onPick={(s) => setLocForm((f) => ({ ...f, address: s.address, lat: String(s.lat), lng: String(s.lng), geoRadius: f.geoRadius || "500" }))}
                  onClear={() => setLocForm((f) => ({ ...f, address: "", lat: "", lng: "" }))}
                  placeholder="Search site address…"
                />
                {locForm.lat && locForm.lng && (
                  <p className="text-caption text-muted-foreground tnum">
                    {parseFloat(locForm.lat).toFixed(5)}, {parseFloat(locForm.lng).toFixed(5)}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Geo-fence Radius (metres)</Label>
                <Input type="number" min="0" value={locForm.geoRadius} onChange={(e) => setLocForm((f) => ({ ...f, geoRadius: e.target.value }))} placeholder="Default: 500" />
                <p className="text-xs text-muted-foreground">GPS-tagged receipts are flagged if received outside this radius from the location center.</p>
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
  onEdit,
}: {
  locations: StockLocationRow[];
  onDelete: (l: StockLocationRow) => void;
  onNew: () => void;
  onEdit: (l: StockLocationRow) => void;
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
            title="Edit location"
            onClick={() => onEdit(l)}
          >
            <Pencil className="size-3.5" />
          </Button>
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
        <EmptyState
          size="compact"
          icon={<Warehouse />}
          title="No stock locations yet"
          description="Add a warehouse or project site to track inventory."
          action={<Button size="sm" onClick={onNew}><Plus className="size-4" /> New Location</Button>}
        />
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function UsersManager({ users, actorRole, companyId, projects, departments, managers, customRoles }: { users: UserRow[]; actorRole: string; companyId: string; projects: { id: string; name: string }[]; departments: DepartmentRow[]; managers: { membershipId: string; userId: string; name: string; role: string }[]; customRoles?: { id: string; key: string; label: string; description: string; baseRole: string | null; tier: number; permissions: string[] }[] }) {
  const router = useRouter();
  const { canManageUsers, userId: currentUserId } = usePermissions();
  const canManage = canManageUsers();
  const [saving, setSaving] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [scopeUser, setScopeUser] = useState<UserRow | null>(null);
  const [permsUser, setPermsUser] = useState<UserRow | null>(null);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [hatsUser, setHatsUser] = useState<UserRow | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showRolePerms, setShowRolePerms] = useState(false);
  const [activityUser, setActivityUser] = useState<UserRow | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState<UserRow | null>(null);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [editingRole, setEditingRole] = useState<NonNullable<typeof customRoles>[number] | null>(null);
  const [deletingRole, setDeletingRole] = useState<NonNullable<typeof customRoles>[number] | null>(null);

  const assignable = assignableRoles(actorRole);
  // Include custom roles the actor can assign (based on tier)
  const actorTierNum = (ROLES as Record<string, { tier: number }>)[actorRole]?.tier ?? 5;
  const assignableCustomRoles = (customRoles ?? []).filter((cr) => actorTierNum < cr.tier);
  // Mirror the server-side canManageRole check: a CUSTOM_* target resolves
  // to its stored tier — canAssignRole() would normalize it to SUPERVISOR
  // and offer the role dropdown / active toggle on users the API will 403.
  const customRoleByKey = new Map((customRoles ?? []).map((cr) => [cr.key, cr]));
  const canManageUserRole = (role: string) => {
    if (role.startsWith("CUSTOM_")) {
      const cr = customRoleByKey.get(role);
      return cr ? actorTierNum < cr.tier && actorTierNum < 5 : false;
    }
    return canAssignRole(actorRole, role);
  };
  const roleLabelFor = (role: string) =>
    customRoleByKey.get(role)?.label ??
    ROLE_LIST.find((rl) => rl.key === role)?.label ??
    formatEnumLabel(role.replace(/^CUSTOM_/, ""));

  // Custom roles the actor can manage — strictly below their own tier
  // (mirrors the server-side gate in PUT/DELETE /api/custom-roles/[id]).
  const manageableCustomRoles = (customRoles ?? []).filter((cr) => actorTierNum < cr.tier);

  const filteredUsers = userSearch.trim()
    ? users.filter((u) => {
        const q = userSearch.toLowerCase();
        return (
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.phone ?? "").toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q) ||
          roleLabelFor(u.role).toLowerCase().includes(q) ||
          (u.department ?? "").toLowerCase().includes(q) ||
          (u.designation ?? "").toLowerCase().includes(q) ||
          (u.employeeCode ?? "").toLowerCase().includes(q)
        );
      })
    : users;

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
    // Deactivation is destructive — requires confirmation
    if (!active) {
      const user = users.find((u) => u.id === userId);
      if (user) {
        setConfirmDeactivate(user);
        return;
      }
    }
    await doToggleActive(userId, active);
  };

  const doToggleActive = async (userId: string, active: boolean) => {
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

  const handleUnlock = async (userId: string, userName: string) => {
    setSaving(userId);
    try {
      const res = await fetch(`/api/users/${userId}/unlock`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to unlock");
      } else {
        toast.success(`Account unlocked for ${userName}. They can sign in now.`);
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
        {canManage && (
          <div className="flex items-center gap-2">
            {/* RolePermission is a global (cross-tenant) table — only the
                developer may edit it. Company-specific overrides use Custom
                Roles, which every tier-1/3 admin can manage below. */}
            {actorRole === "DEVELOPER" && (
              <Button size="sm" variant="outline" onClick={() => setShowRolePerms(true)}>
                <Shield className="h-3.5 w-3.5" /> Role Permissions
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowCreateRole(true)}>
              <ShieldPlus className="h-3.5 w-3.5" /> Custom Role
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowBulkImport(true)}>
              <Upload className="h-3.5 w-3.5" /> Bulk Import
            </Button>
            {assignable.length > 0 && (
              <Button size="sm" onClick={() => setShowCreateUser(true)}>
                <Plus className="h-3.5 w-3.5" /> Add User
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      {users.length > 10 && (
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by name, email, phone, role, unit…"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Custom roles — manage the roles created via "Custom Role" */}
      {manageableCustomRoles.length > 0 && (
        <Card className="mb-3">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <ShieldPlus className="h-4 w-4 text-muted-foreground" />
              <span className="text-body font-semibold">Custom Roles</span>
              <span className="text-caption text-muted-foreground">{manageableCustomRoles.length}</span>
            </div>
            <div className="divide-y divide-border">
              {manageableCustomRoles.map((cr) => (
                <div key={cr.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-body font-medium text-foreground">{cr.label}</span>
                      <Badge variant="muted" className="text-[10px] py-0 px-1.5">{cr.key}</Badge>
                      <Badge variant="muted" className="text-[10px] py-0 px-1.5">
                        {cr.baseRole ? `extends ${roleLabelFor(cr.baseRole)}` : `Tier ${cr.tier}`}
                      </Badge>
                    </div>
                    {cr.description && (
                      <p className="text-caption text-muted-foreground truncate">{cr.description}</p>
                    )}
                  </div>
                  <span className="text-caption text-muted-foreground shrink-0">
                    {cr.permissions.length} extra perm{cr.permissions.length === 1 ? "" : "s"}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon-sm" title="Edit role" onClick={() => setEditingRole(cr)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" title="Delete role" onClick={() => setDeletingRole(cr)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
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
                <TH className="hidden lg:table-cell">Unit</TH>
                <TH className="hidden xl:table-cell">Code</TH>
                <TH>Status</TH>
                {canManage && <TH className="text-right">Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {filteredUsers.map((u) => (
                <TR key={u.id}>
                  <TD className="font-medium">
                    <div className="flex flex-col">
                      <span className="flex items-center gap-1.5">
                        {u.name}
                        {u.id === currentUserId && (
                          <span className="text-caption text-muted-foreground">(you)</span>
                        )}
                      </span>
                      {u.designation && (
                        <span className="text-caption text-muted-foreground">{u.designation}</span>
                      )}
                    </div>
                  </TD>
                  <TD className="text-muted-foreground">
                    <div className="flex flex-col">
                      <span>{displayEmail(u.email) ?? "—"}</span>
                      {u.phone && (
                        <span className="text-caption text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {u.phone}
                        </span>
                      )}
                    </div>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1.5">
                    {canManage && canManageUserRole(u.role) ? (
                      <Select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                        disabled={saving === u.id}
                        className="h-8 w-36 text-caption"
                      >
                        {/* Show current role + any role the actor can assign + custom roles. */}
                        {[u.role, ...assignableRoles(actorRole), ...assignableCustomRoles.map((cr) => cr.key as Role)]
                          .filter((r, i, arr) => arr.indexOf(r) === i)
                          .map((r) => {
                            const def = ROLE_LIST.find((rl) => rl.key === r);
                            const customDef = (customRoles ?? []).find((cr) => cr.key === r);
                            return <option key={r} value={r}>{def?.label ?? customDef?.label ?? r}</option>;
                          })}
                      </Select>
                    ) : (
                      <Badge variant={roleBadgeVariant(u.role)}>{roleLabelFor(u.role)}</Badge>
                    )}
                    {(u.secondaryRoles?.length ?? 0) > 0 && (
                      <Badge
                        variant="muted"
                        className="shrink-0"
                        title={`Also holds: ${u.secondaryRoles.map((r) => roleLabelFor(r)).join(", ")}`}
                      >
                        +{u.secondaryRoles.length}
                      </Badge>
                    )}
                    </div>
                  </TD>
                  <TD className="hidden lg:table-cell text-muted-foreground text-caption">
                    {u.department ?? "—"}
                  </TD>
                  <TD className="hidden xl:table-cell text-muted-foreground text-caption">
                    {u.employeeCode ?? "—"}
                  </TD>
                  <TD>
                    {canManage && canManageUserRole(u.role) ? (
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
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Set access scope"
                          onClick={() => setScopeUser(u)}
                        >
                          <Shield className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Module permissions"
                          onClick={() => setPermsUser(u)}
                        >
                          <Lock className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Secondary roles (hats)"
                          onClick={() => setHatsUser(u)}
                        >
                          <HardHat className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Reset password"
                          onClick={() => setResetUser(u)}
                        >
                          <KeyRound className="size-3.5" />
                        </Button>
                        {(u.lockedUntil || u.failedLoginAttempts > 0) && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Unlock account"
                            onClick={() => handleUnlock(u.id, u.name)}
                            disabled={saving === u.id}
                          >
                            {saving === u.id ? <Loader2 className="size-3.5 animate-spin" /> : <Unlock className="size-3.5" />}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Activity log"
                          onClick={() => setActivityUser(u)}
                        >
                          <History className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Edit profile"
                          onClick={() => setEditUser(u)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </div>
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
          {/* DEVELOPER is the internal builder hat — hidden from catalogs. */}
          {ROLE_LIST.filter((r) => r.key !== "DEVELOPER").map((r) => (
            <div key={r.key} className="flex items-start gap-3 text-body">
              <Badge variant={roleBadgeVariant(r.key)} className="mt-0.5 shrink-0">{r.label}</Badge>
              <span className="text-muted-foreground">{r.description}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Edit user profile dialog */}
      {editUser && (
        <EditUserProfileDialog
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); router.refresh(); }}
        />
      )}

      {/* Scope editor dialog */}
      {scopeUser && (
        <ScopeEditorDialog
          userId={scopeUser.id}
          userName={scopeUser.name}
          userRole={scopeUser.role}
          projects={projects}
          departments={departments}
          canEdit={canManage}
          onClose={() => setScopeUser(null)}
          onSaved={() => { setScopeUser(null); router.refresh(); }}
        />
      )}

      {/* Permissions editor dialog */}
      {permsUser && (
        <PermissionsEditorDialog
          userId={permsUser.id}
          userName={permsUser.name}
          userRole={permsUser.role}
          canEdit={canManage}
          onClose={() => setPermsUser(null)}
          onSaved={() => { setPermsUser(null); router.refresh(); }}
        />
      )}

      {/* Secondary hats (multi-role) editor */}
      {hatsUser && (
        <MemberHatsDialog
          userId={hatsUser.id}
          userName={hatsUser.name}
          primaryRoleLabel={roleLabelFor(hatsUser.role)}
          currentSecondary={hatsUser.secondaryRoles ?? []}
          options={[
            ...assignableRoles(actorRole)
              .filter((r) => r !== hatsUser.role)
              .map((r) => ({ key: r, label: ROLE_LIST.find((rl) => rl.key === r)?.label ?? r })),
            ...assignableCustomRoles
              .filter((cr) => cr.key !== hatsUser.role)
              .map((cr) => ({ key: cr.key, label: cr.label })),
          ]}
          onClose={() => setHatsUser(null)}
          onSaved={() => { setHatsUser(null); router.refresh(); }}
        />
      )}

      {/* Reset password dialog */}
      {resetUser && (
        <ResetPasswordDialog
          userId={resetUser.id}
          userName={resetUser.name}
          onClose={() => setResetUser(null)}
          onSaved={() => { setResetUser(null); router.refresh(); }}
        />
      )}

      {/* Create user dialog */}
      {showCreateUser && (
        <CreateUserDialog
          actorRole={actorRole}
          projects={projects}
          departments={departments}
          managers={managers}
          customRoles={customRoles}
          onClose={() => setShowCreateUser(false)}
        />
      )}

      {/* Create/edit custom role dialog */}
      {(showCreateRole || editingRole) && (
        <CreateCustomRoleDialog
          actorRole={actorRole}
          editing={editingRole}
          onClose={() => { setShowCreateRole(false); setEditingRole(null); }}
          onCreated={() => { setShowCreateRole(false); setEditingRole(null); router.refresh(); }}
        />
      )}

      {/* Delete custom role confirm */}
      <DeleteConfirmDialog
        open={deletingRole != null}
        onOpenChange={(o) => { if (!o) setDeletingRole(null); }}
        endpoint={deletingRole ? `/api/custom-roles/${deletingRole.id}` : "/api/custom-roles/none"}
        title={deletingRole ? `Delete "${deletingRole.label}"?` : "Delete role?"}
        description="This removes the custom role. Users currently assigned it must be reassigned first — the delete will fail if anyone still holds it."
        successMessage={deletingRole ? `Custom role "${deletingRole.label}" deleted` : "Role deleted"}
        onSuccess={() => setDeletingRole(null)}
      />

      {/* Role permissions dialog */}
      {showRolePerms && (
        <RolePermissionsDialog
          onClose={() => setShowRolePerms(false)}
          onSaved={() => { setShowRolePerms(false); router.refresh(); }}
        />
      )}

      {/* User activity dialog */}
      {activityUser && (
        <UserActivityDialog
          userId={activityUser.id}
          userName={activityUser.name}
          onClose={() => setActivityUser(null)}
        />
      )}

      {/* Bulk import dialog */}
      {showBulkImport && (
        <BulkImportDialog
          onClose={() => setShowBulkImport(false)}
        />
      )}

      {/* Deactivation confirmation dialog */}
      {confirmDeactivate && (
        <Dialog open onOpenChange={(o) => { if (!o) setConfirmDeactivate(null); }} title={`Deactivate ${confirmDeactivate.name}?`} className="max-w-md">
          <div className="mb-4">
            <p className="text-body text-muted-foreground mt-2">
              This will immediately:
            </p>
            <ul className="text-caption text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>Log them out of all active sessions</li>
              <li>Clear their pending approvals (POs, requisitions, DPRs, expenses)</li>
              <li>Cancel their open tasks</li>
              <li>Remove their project assignments</li>
              <li>Unassign their phone numbers and sales leads</li>
              <li>Clear their reporting line</li>
            </ul>
            <p className="text-caption text-muted-foreground mt-3">
              This action cannot be undone. You can reactivate them later, but their pending work will need to be reassigned manually.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDeactivate(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={saving === confirmDeactivate.id}
              onClick={() => {
                const user = confirmDeactivate;
                setConfirmDeactivate(null);
                void doToggleActive(user.id, false);
              }}
            >
              {saving === confirmDeactivate.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Deactivate
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
 * Edit User Profile Dialog — edit name, phone, designation,
 * department, employeeCode, joiningDate via PATCH /api/users/[id]
 * ════════════════════════════════════════════════════════════ */
function EditUserProfileDialog({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [designation, setDesignation] = useState(user.designation ?? "");
  const [department, setDepartment] = useState(user.department ?? "");
  const [employeeCode, setEmployeeCode] = useState(user.employeeCode ?? "");
  const [joiningDate, setJoiningDate] = useState(user.joiningDate ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          designation: designation.trim() || null,
          department: department.trim() || null,
          employeeCode: employeeCode.trim() || null,
          joiningDate: joiningDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update user");
      toast.success("User profile updated");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Edit Profile — ${user.name}`}
      description={displayEmail(user.email) ?? "Phone sign-in account"}
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Designation</Label>
            <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Site Engineer" />
          </div>
          <div className="space-y-1.5">
            <Label>Org Unit</Label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Construction" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Employee Code</Label>
            <Input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="e.g. SRG-FIN-0001" />
          </div>
          <div className="space-y-1.5">
            <Label>Joining Date</Label>
            <Input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────
//  Create Custom Role Dialog
// ───────────────────────────────────────────────────────────────
function CreateCustomRoleDialog({
  actorRole,
  editing,
  onClose,
  onCreated,
}: {
  actorRole: string;
  /** When set, the dialog edits this role (PUT) instead of creating. */
  editing?: { id: string; key: string; label: string; description: string; baseRole: string | null; tier: number; permissions: string[] } | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const isEdit = editing != null;
  const [key, setKey] = useState(editing?.key ?? "");
  const [label, setLabel] = useState(editing?.label ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [mode, setMode] = useState<"inherit" | "scratch">(editing?.baseRole ? "inherit" : editing ? "scratch" : "inherit");
  const [baseRole, setBaseRole] = useState<string>(editing?.baseRole ?? "SITE_ENGINEER");
  const [tier, setTier] = useState<number>(editing?.tier ?? 4);
  const [grants, setGrants] = useState<Set<string>>(new Set(editing?.permissions ?? []));
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const baseRoles = ROLE_LIST.filter((r) => r.key !== "OWNER" && r.key !== "DEVELOPER");
  const basePermSet = mode === "inherit" ? new Set(effectivePermissions(baseRole)) : new Set<string>();
  const baseIsWildcard = mode === "inherit" && ROLES[baseRole as Role]?.permissions === "*";
  // Scratch tiers the actor may create — strictly below their own.
  const actorTier = roleTier(actorRole);
  const tierOptions = [2, 3, 4, 5].filter((t) => t > actorTier);

  function toggleGrant(perm: string) {
    setGrants((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || (!isEdit && !key.trim())) return;
    setSaving(true);
    try {
      const payload = {
        label: label.trim(),
        description: description.trim(),
        baseRole: mode === "inherit" ? baseRole : null,
        ...(mode === "scratch" ? { tier } : {}),
        permissions: Array.from(grants),
      };
      const res = isEdit
        ? await fetch(`/api/custom-roles/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/custom-roles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: key.trim().toUpperCase().replace(/\s+/g, "_"),
              ...payload,
            }),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Failed to ${isEdit ? "update" : "create"} role`);
      toast.success(data.message ?? (isEdit ? "Custom role updated" : "Custom role created"));
      onCreated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }} title={isEdit ? "Edit Custom Role" : "Create Custom Role"}>
      <form onSubmit={handleCreate} className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{isEdit ? "Edit Custom Role" : "Create Custom Role"}</h2>
          <p className="text-caption text-muted-foreground">
            {isEdit
              ? "Update the role's label, base, tier, and permission set. The key is fixed once created."
              : "Create a custom role — either start from a built-in role and add permissions, or build the permission set entirely from scratch."}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("inherit")}
            className={`flex-1 rounded-md px-3 py-2 text-caption font-semibold transition-colors ${
              mode === "inherit"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-foreground hover:bg-muted"
            }`}
          >
            Start from a role
          </button>
          <button
            type="button"
            onClick={() => setMode("scratch")}
            className={`flex-1 rounded-md px-3 py-2 text-caption font-semibold transition-colors ${
              mode === "scratch"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-foreground hover:bg-muted"
            }`}
          >
            Build from scratch
          </button>
        </div>

        <div className="space-y-1.5">
          <Label>Role Key *</Label>
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="e.g. SALES_LEAD"
            disabled={isEdit}
          />
          <p className="text-caption text-muted-foreground">
            {isEdit ? `Fixed key: ${editing.key}` : `Stored as CUSTOM_${key.trim().toUpperCase().replace(/\s+/g, "_") || "…"}`}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Display Label *</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Sales Lead"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>

        {mode === "inherit" ? (
          <div className="space-y-1.5">
            <Label>Base Role (inherits tier + permissions)</Label>
            <Select value={baseRole} onChange={(e) => setBaseRole(e.target.value)}>
              {baseRoles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label} (Tier {r.tier})
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Access Level *</Label>
            <Select value={tier} onChange={(e) => setTier(Number(e.target.value))}>
              {tierOptions.map((t) => (
                <option key={t} value={t}>
                  Tier {t} — {t === 2 ? "senior leadership" : t === 3 ? "department head" : t === 4 ? "staff" : "field"}
                </option>
              ))}
            </Select>
            <p className="text-caption text-muted-foreground">
              Decides who this role can manage and who can manage it — same ladder as built-in roles.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{mode === "inherit" ? "Additional Permissions" : "Permissions *"}</Label>
          <p className="text-caption text-muted-foreground">
            {mode === "inherit"
              ? "Grant permissions beyond the base role's defaults. Inherited defaults are shown checked."
              : "Pick the complete permission set — nothing is granted unless you check it."}
          </p>
          {baseIsWildcard ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
              <p className="text-caption text-foreground">
                <span className="font-semibold">{ROLES[baseRole as Role]?.label ?? baseRole}</span> already
                has all {ALL_PERMISSIONS.length} permissions — nothing to add.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto rounded-md border border-border p-1.5">
              {PERMISSION_MODULES.map((mod) => {
                const grantCount = mod.permissions.filter((p) => grants.has(p)).length;
                const defaultCount = mod.permissions.filter((p) => basePermSet.has(p)).length;
                const expanded = expandedModule === mod.key;
                return (
                  <div key={mod.key} className="rounded-md border border-border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedModule(expanded ? null : mod.key)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/30"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-body font-medium text-foreground">{mod.label}</span>
                        <span className="ml-2 text-caption text-muted-foreground">
                          {defaultCount + grantCount}/{mod.permissions.length}
                        </span>
                      </div>
                      {grantCount > 0 && (
                        <Badge variant="success" className="text-[10px] py-0 px-1.5">+{grantCount}</Badge>
                      )}
                    </button>
                    {expanded && (
                      <div className="border-t border-border bg-card">
                        {mod.permissions.map((perm) => {
                          const isBase = basePermSet.has(perm);
                          const granted = grants.has(perm);
                          const permKey = perm.split(".")[1] ?? perm;
                          const permLabel = `${mod.label.split(" ")[0]} — ${formatEnumLabel(permKey)}`;
                          return (
                            <div key={perm} className="flex items-center gap-3 px-3 py-1.5 border-b border-border last:border-0">
                              <button
                                type="button"
                                disabled={isBase}
                                onClick={() => toggleGrant(perm)}
                                className={`grid place-items-center size-4 rounded border shrink-0 transition-colors ${
                                  isBase || granted
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-input bg-card hover:border-border-strong"
                                } ${isBase ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                              >
                                {(isBase || granted) && <span className="text-[8px]">✓</span>}
                              </button>
                              <span className="flex-1 text-caption text-foreground">{permLabel}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">{perm}</span>
                              {isBase && <Badge variant="muted" className="text-[10px] py-0 px-1.5">Default</Badge>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={saving || !label.trim() || (!isEdit && !key.trim()) || (mode === "scratch" && grants.size === 0)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? "Save Changes" : "Create Role"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
