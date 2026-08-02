"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Workflow as WorkflowIcon, Play, Clock, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

export function WorkflowsList({ workflows }: { workflows: WorkflowRow[] }) {
  const router = useRouter();
  const { canManageWorkflows } = usePermissions();
  const canEdit = canManageWorkflows();
  const [delTarget, setDelTarget] = useState<WorkflowRow | null>(null);
  const [runTarget, setRunTarget] = useState<WorkflowRow | null>(null);
  const [running, setRunning] = useState(false);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/workflows/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to delete");
      } else {
        toast.success("Workflow deleted");
        router.refresh();
      }
    } catch {
      toast.error("Network error");
    }
  };

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

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => router.push("/workflows/new")}>
            <Plus className="h-4 w-4" /> New Workflow
          </Button>
        </div>
      )}

      {workflows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <WorkflowIcon className="h-8 w-8 text-muted-foreground/40" />
            <div>
              <p className="text-body font-medium">No workflows yet</p>
              <p className="text-caption text-muted-foreground">
                Create your first workflow to automate repetitive tasks.
              </p>
            </div>
            {canEdit && (
              <Button onClick={() => router.push("/workflows/new")}>
                <Plus className="h-4 w-4" /> Create Workflow
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((w) => (
            <Card key={w.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => router.push(`/workflows/${w.id}`)}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                      <WorkflowIcon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-body font-medium">{w.name}</p>
                      {w.description && (
                        <p className="truncate text-caption text-muted-foreground">{w.description}</p>
                      )}
                    </div>
                  </div>
                  <Badge variant={w.status === "ACTIVE" ? "success" : w.status === "DRAFT" ? "muted" : "outline"}>
                    {w.status}
                  </Badge>
                </div>

                <div className="flex items-center gap-3 text-caption text-muted-foreground">
                  <span>{w.runCount} run{w.runCount !== 1 ? "s" : ""}</span>
                  {w.nextRun && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Next: {formatDate(w.nextRun)}
                    </span>
                  )}
                  {w.schedule?.intervalM && (
                    <span>every {w.schedule.intervalM}m</span>
                  )}
                </div>

                {canEdit && (
                  <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={() => setRunTarget(w)}>
                      <Play className="h-3 w-3" /> Run
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDelTarget(w)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {delTarget && (
        <DeleteConfirmDialog
          open={Boolean(delTarget)}
          onOpenChange={(o) => { if (!o) setDelTarget(null); }}
          endpoint={`/api/workflows/${delTarget.id}`}
          title="Delete workflow"
          description={`Delete “${delTarget.name}”? This cannot be undone.`}
          successMessage="Workflow deleted"
        />
      )}

      {runTarget && (
        <Dialog
          open={Boolean(runTarget)}
          onOpenChange={(o) => { if (!o) setRunTarget(null); }}
          title="Run workflow"
          description={`Run “${runTarget.name}” now? This will execute every step in the workflow graph.`}
        >
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setRunTarget(null)} disabled={running}>
              Cancel
            </Button>
            <Button type="button" onClick={() => handleRun(runTarget.id)} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? "Running…" : "Run now"}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
