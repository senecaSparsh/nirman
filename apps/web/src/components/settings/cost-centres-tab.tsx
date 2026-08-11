"use client";

import { useState } from "react";
import { Plus, Building2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/page";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { DepartmentFormDialog } from "@/components/materials/department-form-dialog";
import type { DepartmentRow } from "@/lib/types";

/**
 * Cost Centres tab — departments (Boiler, Dryer, Workshop, …) that raw
 * materials are issued to for operating expenses. Moved here from the old
 * Materials page so the catalogue stays pure and org structure lives with
 * the rest of company setup.
 */
export function CostCentresTab({
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
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [deleting, setDeleting] = useState<DepartmentRow | null>(null);

  const columns: Column<DepartmentRow>[] = [
    {
      key: "code",
      label: "Code",
      sortable: true,
      render: (d) => <span className="font-mono text-caption font-semibold text-foreground">{d.code}</span>,
    },
    {
      key: "name",
      label: "Cost Centre",
      sortable: true,
      render: (d) => (
        <div>
          <div className="font-medium text-foreground">{d.name}</div>
          {d.description && <div className="truncate text-caption text-muted-foreground">{d.description}</div>}
        </div>
      ),
    },
    {
      key: "stockLocationName",
      label: "Stock Room",
      sortable: true,
      sortValue: (d) => d.stockLocationName ?? "",
      render: (d) =>
        d.stockLocationName ? (
          <span className="text-muted-foreground">{d.stockLocationName}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        ),
    },
    {
      key: "issueCount",
      label: "Issues",
      align: "right",
      sortable: true,
      render: (d) => <span className="tnum text-muted-foreground">{d.issueCount}</span>,
    },
    {
      key: "active",
      label: "Status",
      sortable: true,
      sortValue: (d) => (d.active ? "1" : "0"),
      render: (d) => <StatusPill status={d.active ? "ACTIVE" : "INACTIVE"} />,
    },
    ...(canEdit || canDelete
      ? [
          {
            key: "actions" as const,
            label: "" as const,
            align: "right" as const,
            render: (d: DepartmentRow) => (
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Edit"
                    onClick={() => { setEditing(d); setFormOpen(true); }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Delete"
                    onClick={() => setDeleting(d)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      {departments.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title="No cost centres yet"
          description="Add departments like Boiler, Dryer, MP-2, Workshop to track raw-material consumption by operational line."
          action={
            canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="size-4" /> New Cost Centre
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={departments}
            columns={columns}
            storageKey="settings-cost-centres"
            searchable
            searchPlaceholder="Search code, name, stock room…"
            hideable
            initialSort={{ key: "name", direction: "asc" }}
            showTotals
            sumColumns={["issueCount"]}
            totalFormat={(_key, sum) => sum.toLocaleString("en-IN")}
            onAddRow={canCreate ? () => { setEditing(null); setFormOpen(true); } : undefined}
            addRowLabel="New Cost Centre"
          />
        </div>
      )}

      <DepartmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        department={editing}
      />
      <DeleteConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        endpoint={deleting ? `/api/departments/${deleting.id}` : ""}
        title="Delete cost centre?"
        description={
          deleting
            ? `"${deleting.name}" will be archived. Cost centres with stock in their stock room cannot be deleted.`
            : ""
        }
        successMessage="Cost centre archived"
      />
    </div>
  );
}
