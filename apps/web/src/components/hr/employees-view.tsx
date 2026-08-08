"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Pencil, Trash2, Users, UsersRound, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill } from "@/components/page";
import { Dialog } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { CrewsView, type CrewRow } from "@/components/hr/crews-view";
import { formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";

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

/** Column definitions for the employees DataTable. */
const employeeColumns: Column<EmployeeRow>[] = [
  {
    key: "name",
    label: "Name",
    sortable: true,
    render: (e) => (
      <div>
        <div className="font-medium">{e.name}</div>
        {e.designation && <div className="text-caption text-muted-foreground">{e.designation}</div>}
      </div>
    ),
  },
  {
    key: "trade",
    label: "Trade",
    sortable: true,
    render: (e) => e.trade || <span className="text-muted-foreground">—</span>,
  },
  {
    key: "wageType",
    label: "Wage",
    sortable: true,
    render: (e) => <Badge variant="outline">{e.wageType}</Badge>,
  },
  {
    key: "dailyRate",
    label: "Rate",
    align: "right",
    sortable: true,
    sortValue: (e) => (e.wageType === "DAILY" ? e.dailyRate : e.monthlySalary ?? 0),
    render: (e) => (
      <span className="tnum">
        {e.wageType === "DAILY"
          ? formatCurrency(e.dailyRate) + "/day"
          : e.monthlySalary != null
            ? formatCurrency(e.monthlySalary) + "/mo"
            : formatCurrency(e.dailyRate) + "/day"}
      </span>
    ),
  },
  {
    key: "crewName",
    label: "Crew",
    sortable: true,
    render: (e) => e.crewName || <span className="text-muted-foreground">—</span>,
  },
  {
    key: "activeProjectName",
    label: "Project",
    sortable: true,
    render: (e) => e.activeProjectName || <span className="text-muted-foreground">—</span>,
  },
  {
    key: "active",
    label: "Status",
    sortable: true,
    sortValue: (e) => (e.active ? "ACTIVE" : "INACTIVE"),
    render: (e) => <StatusPill status={e.active ? "ACTIVE" : "INACTIVE"} />,
  },
];

/** Columns with edit/delete actions appended — used when canEdit is true. */
function employeeColumnsWithActions(
  setEditTarget: (e: EmployeeRow | null) => void,
  setFormOpen: (open: boolean) => void,
  setDelTarget: (e: EmployeeRow | null) => void,
): Column<EmployeeRow>[] {
  return [
    ...employeeColumns,
    {
      key: "actions",
      label: "",
      align: "right",
      render: (e) => (
        <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
          <button
            onClick={() => { setEditTarget(e); setFormOpen(true); }}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setDelTarget(e)}
            className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];
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
  const canCreate = permissions?.canCreate ?? true;
  const canEdit = permissions?.canEdit ?? true;
  const canManage = permissions?.canManage ?? true;
  const [tab, setTab] = useState("employees");
  const [search, setSearch] = useState("");
  const [tradeFilter, setTradeFilter] = useState("");
  const [wageFilter, setWageFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeRow | null>(null);
  const [delTarget, setDelTarget] = useState<EmployeeRow | null>(null);

  const trades = useMemo(
    () => [...new Set(employees.map((e) => e.trade).filter(Boolean))] as string[],
    [employees],
  );

  const filtered = useMemo(
    () => employees.filter((e) => {
      if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.phone?.includes(search)) return false;
      if (tradeFilter && e.trade !== tradeFilter) return false;
      if (wageFilter && e.wageType !== wageFilter) return false;
      return true;
    }),
    [employees, search, tradeFilter, wageFilter],
  );

  const handleExport = () => {
    downloadCSV("employees", filtered, [
      { key: "name", label: "Name" },
      { key: "trade", label: "Trade" },
      { key: "designation", label: "Designation" },
      { key: "phone", label: "Phone" },
      { key: "wageType", label: "Wage Type" },
      { key: "dailyRate", label: "Daily Rate" },
      { key: "monthlySalary", label: "Monthly Salary" },
      { key: "crewName", label: "Crew" },
      { key: "activeProjectName", label: "Active Project" },
      { key: "active", label: "Active" },
    ]);
  };

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="employees">
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Employees
            </span>
          </TabsTrigger>
          <TabsTrigger value="crews">
            <span className="flex items-center gap-1.5">
              <UsersRound className="h-3.5 w-3.5" /> Crews / Gangs
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={tradeFilter} onChange={(e) => setTradeFilter(e.target.value)} className="w-auto">
          <option value="">All trades</option>
          {trades.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
        <Select value={wageFilter} onChange={(e) => setWageFilter(e.target.value)} className="w-auto">
          <option value="">All wage types</option>
          {WAGE_TYPES.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </Select>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1 h-3.5 w-3.5" /> Export
        </Button>
        {canCreate && (
          <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Employee
          </Button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No employees found"
          description={search || tradeFilter || wageFilter ? "Try adjusting your filters." : "Add your first employee to get started."}
          action={canCreate && !search && !tradeFilter && !wageFilter ? (
            <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Employee
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <DataTable
            data={filtered}
            initialSort={{ key: "name", direction: "asc" }}
            columns={canEdit ? employeeColumnsWithActions(setEditTarget, setFormOpen, setDelTarget) : employeeColumns}
            searchable
            searchPlaceholder="Search by name, trade, crew…"
            hideable
            pageSize={50}
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
    joinDate: employee?.joinDate ? employee.joinDate.split("T")[0] : "",
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
        <form onSubmit={handleSubmit} className="space-y-3">
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
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
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
          <label className="flex items-center gap-2 text-body">
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
            Active
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </form>
    </Dialog>
  );
}
