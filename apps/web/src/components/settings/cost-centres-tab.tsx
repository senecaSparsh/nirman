"use client";

import { useState } from "react";
import { Plus, Building2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/page";
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-body text-muted-foreground">
          {departments.length} cost centre{departments.length !== 1 ? "s" : ""}
        </p>
        {canCreate && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New Cost Centre
          </Button>
        )}
      </div>

      {departments.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title="No cost centres yet"
          description="Add departments like Boiler, Dryer, MP-2, Workshop to track raw-material consumption by operational line."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {departments.map((d) => (
            <div key={d.id} className="group rounded-lg border border-border bg-card p-3.5 transition-all hover:border-foreground/20">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-micro text-muted-foreground">{d.code}</div>
                  <div className="truncate text-body font-semibold text-foreground">{d.name}</div>
                </div>
                <StatusPill status={d.active ? "ACTIVE" : "INACTIVE"} className="shrink-0" />
              </div>

              {d.description && (
                <div className="mt-2 line-clamp-2 text-caption text-muted-foreground">{d.description}</div>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-body font-semibold tnum text-foreground">{d.issueCount}</span>
                  <span className="text-caption text-muted-foreground">issues</span>
                </div>
                {d.stockLocationName && (
                  <span className="text-caption text-muted-foreground">{d.stockLocationName}</span>
                )}
              </div>

              <div className="mt-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                {canEdit && (
                  <button
                    onClick={() => { setEditing(d); setFormOpen(true); }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => setDeleting(d)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
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
            ? `“${deleting.name}” will be archived. Cost centres with stock in their stock room cannot be deleted.`
            : ""
        }
        successMessage="Cost centre archived"
      />
    </div>
  );
}
