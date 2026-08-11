"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Workflow as WorkflowIcon, Play, Clock, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/page";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";

interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  status: string;
  runCount: number;
  nextRun: string | null;
  schedule: { intervalM?: number | null; cron?: string | null } | null;
  createdAt: string;
}

/** Human-readable schedule label, e.g. "every 30m" or "cron: 0 9 * * 1". */
function scheduleLabel(w: WorkflowRow): string {
  if (w.schedule?.intervalM) {
    const m = w.schedule.intervalM;
    if (m >= 1440 && m % 1440 === 0) return `every ${m / 1440}d`;
    if (m >= 60 && m % 60 === 0) return `every ${m / 60}h`;
    return `every ${m}m`;
  }
  if (w.schedule?.cron) return `cron: ${w.schedule.cron}`;
  return "Manual";
}

export function WorkflowsList({ workflows }: { workflows: WorkflowRow[] }) {
  const router = useRouter();
  const { canManageWorkflows } = usePermissions();
  const canEdit = canManageWorkflows();
  const [delTarget, setDelTarget] = useState<WorkflowRow | null>(null);
  const [runTarget, setRunTarget] = useState<WorkflowRow | null>(null);
  const [running, setRunning] = useState(false);

  const handleRun = async (id: string) => {
    setRunning(true);
    try {
      const res = await fetch(`/api/workflows/${id}/runs`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to run");
      } else {
        toast.success(`Workflow run: ${data.status}`);
        router.refresh();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setRunning(false);
      setRunTarget(null);
    }
  };

  const columns: Column<WorkflowRow>[] = [
    {
      key: "name",
      label: "Workflow",
      sortable: true,
      render: (w) => (
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <WorkflowIcon className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{w.name}</div>
            {w.description && (
              <div className="truncate text-caption text-muted-foreground">{w.description}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (w) => <StatusPill status={w.status} />,
    },
    {
      key: "schedule",
      label: "Schedule",
      sortable: true,
      sortValue: (w) => scheduleLabel(w),
      render: (w) => <span className="text-muted-foreground">{scheduleLabel(w)}</span>,
    },
    {
      key: "runCount",
      label: "Runs",
      align: "right",
      sortable: true,
      render: (w) => <span className="tnum text-muted-foreground">{w.runCount}</span>,
    },
    {
      key: "nextRun",
      label: "Next Run",
      sortable: true,
      sortValue: (w) => w.nextRun ?? "",
      render: (w) =>
        w.nextRun ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-3.5" /> {formatDate(w.nextRun)}
          </span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        ),
    },
    {
      key: "createdAt",
      label: "Created",
      sortable: true,
      sortValue: (w) => w.createdAt,
      render: (w) => <span className="text-muted-foreground">{formatDate(w.createdAt)}</span>,
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (w) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {canEdit && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Run now"
                onClick={() => setRunTarget(w)}
              >
                <Play className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Delete"
                onClick={() => setDelTarget(w)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {workflows.length === 0 ? (
        <EmptyState
          icon={<WorkflowIcon />}
          title="No workflows yet"
          description="Create your first workflow to automate repetitive tasks — schedule them, run them on demand, and track every execution."
          action={
            canEdit ? (
              <Button onClick={() => router.push("/workflows/new")}>
                <Plus className="size-4" /> Create Workflow
              </Button>
            ) : undefined
          }
        />
      ) : (
        /*
         * A workflow list is a schedule, not a gallery. Cards hid the two
         * facts that determine whether automation is healthy — how often
         * each runs and when it last ran — behind a click. As rows, "which
         * workflow hasn't run this week" is a sort on the Next Run column,
         * not six card scrolls.
         */
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={workflows}
            columns={columns}
            storageKey="workflows"
            searchable
            searchPlaceholder="Search workflow name or description…"
            hideable
            initialSort={{ key: "nextRun", direction: "asc" }}
            onRowClick={(w) => router.push(`/workflows/${w.id}`)}
            onAddRow={canEdit ? () => router.push("/workflows/new") : undefined}
            addRowLabel="New Workflow"
          />
        </div>
      )}

      {delTarget && (
        <DeleteConfirmDialog
          open={Boolean(delTarget)}
          onOpenChange={(o) => { if (!o) setDelTarget(null); }}
          endpoint={`/api/workflows/${delTarget.id}`}
          title="Delete workflow"
          description={`Delete "${delTarget.name}"? This cannot be undone.`}
          successMessage="Workflow deleted"
        />
      )}

      {runTarget && (
        <Dialog
          open={Boolean(runTarget)}
          onOpenChange={(o) => { if (!o) setRunTarget(null); }}
          title="Run workflow"
          description={`Run "${runTarget.name}" now? This will execute every step in the workflow graph.`}
        >
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setRunTarget(null)} disabled={running}>
              Cancel
            </Button>
            <Button type="button" onClick={() => handleRun(runTarget.id)} disabled={running}>
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {running ? "Running…" : "Run now"}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
