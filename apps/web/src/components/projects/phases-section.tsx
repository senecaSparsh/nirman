"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill } from "@/components/page";
import { EmptyState } from "@/components/empty-state";
import { PhaseFormDialog, type PhaseFormValues } from "./phase-form-dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { formatCurrency, formatDate } from "@/lib/utils";

export type PhaseRow = {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  sortOrder: number;
};

export function PhasesSection({ projectId, phases }: { projectId: string; phases: PhaseRow[] }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PhaseRow | null>(null);
  const [delTarget, setDelTarget] = useState<PhaseRow | null>(null);

  const columns: Column<PhaseRow>[] = [
    {
      key: "name",
      label: "Phase",
      sortable: true,
      render: (ph) => <span className="font-medium text-foreground">{ph.name}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (ph) => <StatusPill status={ph.status} />,
    },
    {
      key: "startDate",
      label: "Start",
      sortable: true,
      render: (ph) => <span className="text-muted-foreground">{formatDate(ph.startDate)}</span>,
    },
    {
      key: "endDate",
      label: "End",
      sortable: true,
      render: (ph) => <span className="text-muted-foreground">{formatDate(ph.endDate)}</span>,
    },
    {
      key: "budget",
      label: "Budget",
      align: "right",
      sortable: true,
      render: (ph) => <span className="tnum text-foreground">{ph.budget ? formatCurrency(ph.budget) : "—"}</span>,
      exportValue: (ph) => ph.budget ?? 0,
    },
    {
      key: "actions",
      label: "",
      align: "right",
      noExport: true,
      render: (ph) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditTarget(ph)} aria-label="Edit phase">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDelTarget(ph)} aria-label="Delete phase">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {phases.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-5 w-5" />}
          title="No phases yet"
          description="Add phases like “Tower A”, “Phase 1” to organise locations, units, and budgets."
          action={
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add Phase
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={phases}
            columns={columns}
            storageKey="project-phases"
            searchable
            searchPlaceholder="Search phases…"
            initialSort={{ key: "sortOrder", direction: "asc" }}
            showTotals
            sumColumns={["budget"]}
            totalFormat={(_k, sum) => formatCurrency(sum)}
            toolbarTrailing={
              <Button size="sm" className="h-7 gap-1.5" onClick={() => setAddOpen(true)}>
                <Plus className="size-3.5" /> Add Phase
              </Button>
            }
          />
        </div>
      )}

      <PhaseFormDialog projectId={projectId} open={addOpen} onOpenChange={setAddOpen} />

      {editTarget && (
        <PhaseFormDialog
          projectId={projectId}
          phaseId={editTarget.id}
          open={Boolean(editTarget)}
          onOpenChange={(o) => !o && setEditTarget(null)}
          initial={{
            name: editTarget.name,
            status: editTarget.status as PhaseFormValues["status"],
            startDate: editTarget.startDate?.slice(0, 10) ?? "",
            endDate: editTarget.endDate?.slice(0, 10) ?? "",
            budget: editTarget.budget ?? undefined,
            sortOrder: editTarget.sortOrder,
          }}
        />
      )}

      {delTarget && (
        <ConfirmDelete
          open={Boolean(delTarget)}
          onOpenChange={(o) => !o && setDelTarget(null)}
          url={`/api/projects/${projectId}/phases/${delTarget.id}`}
          title="Delete phase"
          description={`Delete “${delTarget.name}”? Phases linked to locations, units or issues cannot be deleted.`}
          successMessage="Phase deleted"
        />
      )}
    </div>
  );
}
