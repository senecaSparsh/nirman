"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, HardHat, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/page";
import { formatCurrency } from "@/lib/utils";

type Subcontractor = {
  id: string;
  name: string;
  trade: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
};

type Employee = {
  id: string;
  name: string;
  trade: string | null;
  phone: string | null;
  email: string | null;
  dailyRate: number;
  active: boolean;
};

/**
 * People tab — combines subcontractors (external labour) and employees
 * (internal staff) into one tab with a segmented toggle. Both are workforce
 * master data; splitting them into separate top-level tabs cluttered the
 * Settings tab bar.
 */
export function PeopleTab({
  subcontractors,
  employees,
  onNewSub,
  onEditSub,
  onDeleteSub,
  onNewEmp,
  onEditEmp,
  onDeleteEmp,
}: {
  subcontractors: Subcontractor[];
  employees: Employee[];
  onNewSub: () => void;
  onEditSub: (s: Subcontractor) => void;
  onDeleteSub: (id: string) => void;
  onNewEmp: () => void;
  onEditEmp: (e: Employee) => void;
  onDeleteEmp: (id: string) => void;
}) {
  const [subTab, setSubTab] = useState<"subcontractors" | "employees">("subcontractors");

  const subColumns: Column<Subcontractor>[] = [
    {
      key: "name",
      label: "Subcontractor",
      sortable: true,
      render: (s) => <span className="font-medium text-foreground">{s.name}</span>,
    },
    {
      key: "trade",
      label: "Trade",
      sortable: true,
      sortValue: (s) => s.trade ?? "",
      render: (s) =>
        s.trade ? (
          <span className="text-muted-foreground">{s.trade}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        ),
    },
    {
      key: "phone",
      label: "Phone",
      sortable: true,
      render: (s) =>
        s.phone ? <span className="text-muted-foreground">{s.phone}</span> : <span className="text-muted-foreground/40">—</span>,
    },
    {
      key: "email",
      label: "Email",
      sortable: true,
      render: (s) =>
        s.email ? <span className="truncate text-muted-foreground">{s.email}</span> : <span className="text-muted-foreground/40">—</span>,
    },
    {
      key: "gstin",
      label: "GSTIN",
      sortable: true,
      render: (s) =>
        s.gstin ? <span className="font-mono text-caption text-muted-foreground">{s.gstin}</span> : <span className="text-muted-foreground/40">—</span>,
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (s) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" onClick={() => onEditSub(s)} aria-label="Edit subcontractor">
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onDeleteSub(s.id)} aria-label="Delete subcontractor">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const empColumns: Column<Employee>[] = [
    {
      key: "name",
      label: "Employee",
      sortable: true,
      render: (e) => <span className="font-medium text-foreground">{e.name}</span>,
    },
    {
      key: "trade",
      label: "Trade",
      sortable: true,
      sortValue: (e) => e.trade ?? "",
      render: (e) =>
        e.trade ? <span className="text-muted-foreground">{e.trade}</span> : <span className="text-muted-foreground/40">—</span>,
    },
    {
      key: "phone",
      label: "Phone",
      sortable: true,
      render: (e) =>
        e.phone ? <span className="text-muted-foreground">{e.phone}</span> : <span className="text-muted-foreground/40">—</span>,
    },
    {
      key: "dailyRate",
      label: "Daily Rate",
      align: "right",
      sortable: true,
      render: (e) => <span className="tnum font-medium">{formatCurrency(e.dailyRate)}</span>,
    },
    {
      key: "active",
      label: "Status",
      sortable: true,
      sortValue: (e) => (e.active ? "1" : "0"),
      render: (e) => <StatusPill status={e.active ? "ACTIVE" : "INACTIVE"} />,
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (e) => (
        <div className="flex items-center justify-end gap-1" onClick={(e2) => e2.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" onClick={() => onEditEmp(e)} aria-label="Edit employee">
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onDeleteEmp(e.id)} aria-label="Delete employee">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Segmented toggle */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
        <button
          type="button"
          onClick={() => setSubTab("subcontractors")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body font-medium transition-colors ${
            subTab === "subcontractors" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <HardHat className="h-3.5 w-3.5" /> Subcontractors
          <span className="text-caption text-muted-foreground">({subcontractors.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab("employees")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body font-medium transition-colors ${
            subTab === "employees" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <UserPlus className="h-3.5 w-3.5" /> Employees
          <span className="text-caption text-muted-foreground">({employees.length})</span>
        </button>
      </div>

      {subTab === "subcontractors" ? (
        <div className="space-y-4">
          {subcontractors.length === 0 ? (
            <EmptyState
              icon={<HardHat className="h-5 w-5" />}
              title="No subcontractors yet"
              description="Add subcontractors to issue work orders and track RA bills with TDS and retention."
              action={
                <Button onClick={onNewSub} size="sm">
                  <Plus className="size-4" /> New Subcontractor
                </Button>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
              <DataTable
                data={subcontractors}
                columns={subColumns}
                storageKey="settings-subcontractors"
                searchable
                searchPlaceholder="Search name, trade, phone, GSTIN…"
                hideable
                initialSort={{ key: "name", direction: "asc" }}
                onAddRow={onNewSub}
                addRowLabel="New Subcontractor"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {employees.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="h-5 w-5" />}
              title="No employees yet"
              description="Add people to assign tasks to and track workforce costs."
              action={
                <Button onClick={onNewEmp} size="sm">
                  <Plus className="size-4" /> New Employee
                </Button>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
              <DataTable
                data={employees}
                columns={empColumns}
                storageKey="settings-employees"
                searchable
                searchPlaceholder="Search name, trade, phone…"
                hideable
                initialSort={{ key: "name", direction: "asc" }}
                showTotals
                sumColumns={["dailyRate"]}
                totalFormat={(_key, sum) => formatCurrency(sum)}
                onAddRow={onNewEmp}
                addRowLabel="New Employee"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
