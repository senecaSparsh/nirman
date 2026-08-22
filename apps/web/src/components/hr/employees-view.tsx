"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Users, UsersRound, Phone, Briefcase, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill } from "@/components/page";
import { Dialog } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { CrewsView, type CrewRow } from "@/components/hr/crews-view";
import { formatCurrency, cn } from "@/lib/utils";
import { useTabParam } from "@/lib/use-tab-param";

export type EmployeeRow = {
  id: string;
  name: string;
  trade: string | null;
  phone: string | null;
  email: string | null;
  dailyRate: number;
  wageType: string;
  monthlySalary: number | null;
  designation: string | null;
  joinDate: string | null;
  crewId: string | null;
  crewName: string | null;
  activeProjectId: string | null;
  activeProjectName: string | null;
  active: boolean;
};

const WAGE_TYPES = ["DAILY", "MONTHLY", "FIXED"] as const;

/** Deterministic avatar color from name hash. */
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

/** Column definitions for the employees DataTable. */
const employeeColumns: Column<EmployeeRow>[] = [
  {
    key: "name",
    label: "Name",
    sortable: true,
    width: "200px",
    sortValue: (e) => e.name,
    render: (e) => (
      <div className="flex items-center gap-2.5">
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-caption font-semibold", avatarColor(e.name))}>
          {initials(e.name)}
        </span>
        <div className="min-w-0">
          <div className="font-medium text-foreground">{e.name}</div>
          {e.designation && <div className="text-caption text-muted-foreground">{e.designation}</div>}
        </div>
      </div>
    ),
    exportValue: (e) => e.name,
  },
  {
    key: "trade",
    label: "Trade",
    sortable: true,
    filterable: true,
    render: (e) => e.trade ? <Badge variant="outline">{e.trade}</Badge> : <span className="text-muted-foreground">—</span>,
    filterValue: (e) => e.trade ?? "—",
    exportValue: (e) => e.trade ?? "",
  },
  {
    key: "wageType",
    label: "Wage",
    sortable: true,
    filterable: true,
    render: (e) => (
      <span className={cn(
        "rounded px-1.5 py-0.5 text-micro font-medium",
        e.wageType === "DAILY" && "bg-info/10 text-info",
        e.wageType === "MONTHLY" && "bg-brand/10 text-brand",
        e.wageType === "FIXED" && "bg-warning/10 text-warning",
      )}>
        {e.wageType}
      </span>
    ),
    filterValue: (e) => e.wageType,
    exportValue: (e) => e.wageType,
  },
  {
    key: "dailyRate",
    label: "Rate",
    align: "right",
    sortable: true,
    sortValue: (e) => (e.wageType === "DAILY" ? e.dailyRate : e.monthlySalary ?? 0),
    render: (e) => (
      <span className="tnum text-body">
        {e.wageType === "DAILY"
          ? formatCurrency(e.dailyRate) + "/day"
          : e.monthlySalary != null
            ? formatCurrency(e.monthlySalary) + "/mo"
            : formatCurrency(e.dailyRate) + "/day"}
      </span>
    ),
    exportValue: (e) => e.wageType === "DAILY" ? e.dailyRate : e.monthlySalary ?? e.dailyRate,
  },
  {
    key: "crewName",
    label: "Crew",
    sortable: true,
    filterable: true,
    render: (e) => e.crewName ? <span className="text-body text-foreground">{e.crewName}</span> : <span className="text-muted-foreground">—</span>,
    filterValue: (e) => e.crewName ?? "—",
    exportValue: (e) => e.crewName ?? "",
  },
  {
    key: "activeProjectName",
    label: "Project",
    sortable: true,
    filterable: true,
    render: (e) => e.activeProjectName ? <span className="text-body text-foreground">{e.activeProjectName}</span> : <span className="text-muted-foreground">—</span>,
    filterValue: (e) => e.activeProjectName ?? "—",
    exportValue: (e) => e.activeProjectName ?? "",
  },
  {
    key: "active",
    label: "Status",
    sortable: true,
    filterable: true,
    sortValue: (e) => (e.active ? "ACTIVE" : "INACTIVE"),
    render: (e) => <StatusPill status={e.active ? "ACTIVE" : "INACTIVE"} />,
    filterValue: (e) => (e.active ? "ACTIVE" : "INACTIVE"),
    exportValue: (e) => (e.active ? "ACTIVE" : "INACTIVE"),
  },
];

/** Summary stats bar for the employees tab. */
function EmployeeStatsBar({ employees }: { employees: EmployeeRow[] }) {
  const total = employees.length;
  const active = employees.filter((e) => e.active).length;
  const trades = new Set(employees.map((e) => e.trade).filter(Boolean)).size;
  const dailyWage = employees.filter((e) => e.wageType === "DAILY").length;
  const monthlyWage = employees.filter((e) => e.wageType === "MONTHLY").length;
  const fixedWage = employees.filter((e) => e.wageType === "FIXED").length;
  const assignedToProject = employees.filter((e) => e.activeProjectId).length;
  const inCrews = employees.filter((e) => e.crewId).length;

  return (
    <div className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4 sm:divide-x divide-y sm:divide-y-0">
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Total</span>
        <span className="text-figure text-foreground">{total}</span>
        <span className="text-micro text-muted-foreground">{active} active</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Trades</span>
        <span className="text-figure text-foreground">{trades}</span>
        <span className="text-micro text-muted-foreground">{total - trades} unspecified</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Wage Mix</span>
        <span className="text-body font-semibold text-foreground">{dailyWage}D · {monthlyWage}M · {fixedWage}F</span>
        <span className="text-micro text-muted-foreground">daily / monthly / fixed</span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-label text-muted-foreground/75">Deployed</span>
        <span className="text-figure text-foreground">{assignedToProject}</span>
        <span className="text-micro text-muted-foreground">{inCrews} in crews</span>
      </div>
    </div>
  );
}

export function EmployeesView({
  employees,
  crews,
  crewRows,
  crewEmployees,
  projects,
  permissions,
}: {
  employees: EmployeeRow[];
  crews: { id: string; name: string }[];
  crewRows: CrewRow[];
  crewEmployees: { id: string; name: string; trade: string | null }[];
  projects: { id: string; name: string }[];
  permissions?: { canCreate?: boolean; canEdit?: boolean; canManage?: boolean };
}) {
  const router = useRouter();
  const canCreate = permissions?.canCreate ?? false;
  const canEdit = permissions?.canEdit ?? false;
  const canManage = permissions?.canManage ?? false;
  const [tab, setTab] = useTabParam(["employees","crews"] as const, "employees");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeRow | null>(null);
  const [delTarget, setDelTarget] = useState<EmployeeRow | null>(null);

  function rowActions(e: EmployeeRow) {
    if (!canEdit) return null;
    return (
      <>
        <button
          onClick={(ev) => { ev.stopPropagation(); setEditTarget(e); setFormOpen(true); }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(ev) => { ev.stopPropagation(); setDelTarget(e); }}
          className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </>
    );
  }

  const trailingButtons = canCreate ? (
    <Button onClick={() => { setEditTarget(null); setFormOpen(true); }}>
      <Plus className="h-4 w-4" /> Add employee
    </Button>
  ) : null;

  const noMatch = (
    <EmptyState
      size="compact"
      icon={<SearchX />}
      title="No employees match"
      description="Adjust the search or column filters to see all employees."
    />
  );

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="employees">
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Employees
              <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-micro text-muted-foreground">{employees.length}</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="crews">
            <span className="flex items-center gap-1.5">
              <UsersRound className="h-3.5 w-3.5" /> Crews / Gangs
              <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-micro text-muted-foreground">{crewRows.length}</span>
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          {/* Summary stats bar */}
          <EmployeeStatsBar employees={employees} />

          {/* Table */}
          {employees.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No employees found"
              description="Add your first employee to get started."
              action={canCreate ? (
                <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Employee
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
              <DataTable
                data={employees}
                columns={employeeColumns}
                storageKey="employees"
                hideable
                exportFileName="employees"
                initialSort={{ key: "name", direction: "asc" }}
                searchable
                searchPlaceholder="Search name, trade, crew, project…"
                toolbarTrailing={trailingButtons}
                rowActions={rowActions}
                pageSize={50}
                emptyState={noMatch}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="crews">
          <CrewsView
            crews={crewRows}
            employees={crewEmployees}
            projects={projects}
            permissions={{ canManage }}
          />
        </TabsContent>
      </Tabs>

      {/* Form dialog */}
      {formOpen && (
        <EmployeeFormDialog
          employee={editTarget}
          crews={crews}
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
          endpoint={`/api/employees/${delTarget.id}`}
          title="Delete Employee"
          description={`Are you sure you want to delete ${delTarget.name}? This will soft-delete the record. Attendance and payroll history are preserved.`}
          successMessage="Employee deleted"
        />
      )}
    </div>
  );
}

function EmployeeFormDialog({
  employee,
  crews,
  projects,
  onClose,
  onSaved,
}: {
  employee: EmployeeRow | null;
  crews: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!employee;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: employee?.name ?? "",
    trade: employee?.trade ?? "",
    designation: employee?.designation ?? "",
    phone: employee?.phone ?? "",
    email: employee?.email ?? "",
    wageType: employee?.wageType ?? "DAILY",
    dailyRate: employee?.dailyRate?.toString() ?? "",
    monthlySalary: employee?.monthlySalary?.toString() ?? "",
    crewId: employee?.crewId ?? "",
    activeProjectId: employee?.activeProjectId ?? "",
    joinDate: employee?.joinDate ? employee.joinDate.split("T")[0] : new Date().toISOString().slice(0, 10),
    active: employee?.active ?? true,
  });

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      trade: form.trade || null,
      designation: form.designation || null,
      phone: form.phone || null,
      email: form.email || null,
      wageType: form.wageType,
      dailyRate: form.dailyRate ? parseFloat(form.dailyRate) : 0,
      monthlySalary: form.monthlySalary ? parseFloat(form.monthlySalary) : null,
      crewId: form.crewId || null,
      activeProjectId: form.activeProjectId || null,
      joinDate: form.joinDate || null,
      active: form.active,
    };
    try {
      const res = isEdit
        ? await fetch(`/api/employees/${employee!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        toast.success(isEdit ? "Employee updated" : "Employee added");
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
    <Dialog open onOpenChange={(o) => !o && onClose()} title={isEdit ? "Edit Employee" : "Add Employee"} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Identity section */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 border-b border-border pb-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-label text-muted-foreground/75">IDENTITY</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div>
              <Label>Trade</Label>
              <Input value={form.trade} onChange={(e) => set("trade", e.target.value)} placeholder="Masonry, Electrical…" />
            </div>
            <div>
              <Label>Designation</Label>
              <Input value={form.designation} onChange={(e) => set("designation", e.target.value)} placeholder="Site Engineer…" />
            </div>
          </div>
        </div>

        {/* Contact section */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 border-b border-border pb-1.5">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-label text-muted-foreground/75">CONTACT</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Mobile number" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="Email address" />
            </div>
          </div>
        </div>

        {/* Compensation section */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 border-b border-border pb-1.5">
            <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-label text-muted-foreground/75">COMPENSATION</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Wage Type</Label>
              <Select value={form.wageType} onChange={(e) => set("wageType", e.target.value)}>
                {WAGE_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
              </Select>
            </div>
            <div>
              <Label>Join Date</Label>
              <Input type="date" value={form.joinDate} onChange={(e) => set("joinDate", e.target.value)} />
            </div>
            <div>
              <Label>Daily Rate (₹)</Label>
              <Input type="number" min="0" step="0.01" value={form.dailyRate} onChange={(e) => set("dailyRate", e.target.value)} />
            </div>
            <div>
              <Label>Monthly Salary (₹)</Label>
              <Input type="number" min="0" step="0.01" value={form.monthlySalary} onChange={(e) => set("monthlySalary", e.target.value)} placeholder="For MONTHLY/FIXED" />
            </div>
          </div>
        </div>

        {/* Assignment section */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 border-b border-border pb-1.5">
            <UsersRound className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-label text-muted-foreground/75">ASSIGNMENT</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Crew</Label>
              <Select value={form.crewId} onChange={(e) => set("crewId", e.target.value)}>
                <option value="">None</option>
                {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Active Project</Label>
              <Select value={form.activeProjectId} onChange={(e) => set("activeProjectId", e.target.value)}>
                <option value="">None</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-body">
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="rounded" />
          Active employee
        </label>
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : isEdit ? "Update Employee" : "Add Employee"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
