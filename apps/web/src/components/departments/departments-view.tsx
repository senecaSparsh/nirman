"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Building2, Search, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { cn } from "@/lib/utils";

export type DepartmentRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  stockLocationId: string | null;
  stockLocationName: string | null;
  issueCount: number;
};

export function DepartmentsView({
  departments,
  canCreate,
  canEdit,
  canDelete,
}: {
  departments: DepartmentRow[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [deleting, setDeleting] = useState<DepartmentRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) =>
      [d.code, d.name, d.description].filter(Boolean).some((v) => v!.toLowerCase().includes(q))
    );
  }, [departments, query]);

  const baseColumns: Column<DepartmentRow>[] = [
    {
      key: "code",
      label: "Code",
      sortable: true,
      render: (d) => <span className="font-mono text-caption font-medium text-foreground">{d.code}</span>,
      exportValue: (d) => d.code,
    },
    {
      key: "name",
      label: "Department",
      sortable: true,
      render: (d) => (
        <div>
          <div className="font-medium text-foreground">{d.name}</div>
          {d.description && <div className="text-caption text-muted-foreground line-clamp-1">{d.description}</div>}
        </div>
      ),
      exportValue: (d) => d.name,
    },
    {
      key: "stockLocationName",
      label: "Stock Room",
      sortable: true,
      render: (d) => d.stockLocationName ? (
        <span className="flex items-center gap-1 text-body text-foreground">
          <Package className="h-3 w-3 text-muted-foreground" /> {d.stockLocationName}
        </span>
      ) : <span className="text-muted-foreground">—</span>,
      exportValue: (d) => d.stockLocationName ?? "",
    },
    {
      key: "issueCount",
      label: "Issues",
      sortable: true,
      align: "right",
      render: (d) => (
        <span className={cn("tnum", d.issueCount > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
          {d.issueCount}
        </span>
      ),
      exportValue: (d) => d.issueCount,
    },
    {
      key: "active",
      label: "Status",
      sortable: true,
      render: (d) => (
        <span className={cn(
          "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-caption font-medium",
          d.active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
        )}>
          <span className={cn("h-1.5 w-1.5 rounded-full", d.active ? "bg-success" : "bg-muted-foreground")} />
          {d.active ? "Active" : "Inactive"}
        </span>
      ),
      filterValue: (d) => (d.active ? "ACTIVE" : "INACTIVE"),
      exportValue: (d) => (d.active ? "ACTIVE" : "INACTIVE"),
    },
  ];

  const actionColumn: Column<DepartmentRow> = {
    key: "actions",
    label: "",
    align: "right",
    render: (d) => (
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        {canEdit && (
          <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => { setEditing(d); setFormOpen(true); }}>
            <Pencil className="size-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button variant="ghost" size="icon-sm" title="Delete" onClick={() => setDeleting(d)} className="hover:text-danger">
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    ),
  };

  const columns = canEdit || canDelete ? [...baseColumns, actionColumn] : baseColumns;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code, name, description…"
            className="pl-9"
          />
        </div>
        {canCreate && (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Add Department
          </Button>
        )}
      </div>

      {filtered.length === 0 && !query ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6" />}
          title="No departments yet"
          description="Departments are operational cost centers — manufacturing lines, workshop, lab. Materials issued to a department hit Operating Expenses (not WIP)."
          action={canCreate ? (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Add your first department
            </Button>
          ) : undefined}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(d) => d.id}
          initialSort={{ key: "code", direction: "asc" }}
          emptyState={
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No departments found"
              description="Try a different search."
            />
          }
        />
      )}

      <DepartmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        department={editing}
        canEdit={canEdit}
      />

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => { if (!o) setDeleting(null); }}
        endpoint={deleting ? `/api/departments/${deleting.id}` : ""}
        title="Delete department"
        description={`Delete "${deleting?.name}" (${deleting?.code})? If this department has a stock room with stock, you'll need to transfer stock out first.`}
        successMessage="Department deleted"
      />
    </div>
  );
}

function DepartmentFormDialog({
  open,
  onOpenChange,
  department,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: DepartmentRow | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCode(department?.code ?? "");
      setName(department?.name ?? "");
      setDescription(department?.description ?? "");
      setActive(department?.active ?? true);
    }
  }, [open, department]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || null,
        active,
      };
      const url = department ? `/api/departments/${department.id}` : "/api/departments";
      const method = department ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save department");
      }
      toast.success(department ? "Department updated" : "Department created");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save department");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={department ? "Edit Department" : "Add Department"}
      description={department ? department.name : "Add an operational cost center (manufacturing line, workshop, lab)."}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" required>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="BOILER, MP-2, WORKSHOP…"
              className="font-mono"
              required
              disabled={!!department}
            />
          </Field>
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Boiler House" required />
          </Field>
        </div>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What this department does, what materials it consumes…"
          />
        </Field>
        <label className="flex items-center gap-2 text-body">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="rounded"
          />
          Active department
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving || !canEdit}>
            {saving ? "Saving…" : department ? "Update Department" : "Create Department"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
