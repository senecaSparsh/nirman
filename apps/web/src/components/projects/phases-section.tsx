"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
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

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted"> = {
  PLANNED: "muted",
  ACTIVE: "success",
  COMPLETED: "default",
  ON_HOLD: "warning",
};

export function PhasesSection({ projectId, phases }: { projectId: string; phases: PhaseRow[] }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PhaseRow | null>(null);
  const [delTarget, setDelTarget] = useState<PhaseRow | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Phases</h3>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Phase
        </Button>
      </div>

      {phases.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No phases yet. Add phases like “Tower A”, “Phase 1” to organise locations and units.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Status</TH>
              <TH>Start</TH>
              <TH>End</TH>
              <TH>Budget</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {phases.map((ph) => (
              <TR key={ph.id}>
                <TD className="font-medium">{ph.name}</TD>
                <TD>
                  <Badge variant={STATUS_VARIANT[ph.status] ?? "muted"}>{ph.status.replace("_", " ")}</Badge>
                </TD>
                <TD className="text-muted-foreground">{formatDate(ph.startDate)}</TD>
                <TD className="text-muted-foreground">{formatDate(ph.endDate)}</TD>
                <TD>{ph.budget ? formatCurrency(ph.budget) : "—"}</TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditTarget(ph)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDelTarget(ph)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
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
