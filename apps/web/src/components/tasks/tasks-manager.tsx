"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Search, Download, Trash2, UserCog, Eye, X,
  CheckCircle2, Clock, AlertCircle, Loader2, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { KpiCard } from "@/components/kpi-card";
import { AssignTaskDialog } from "@/components/tasks/assign-task-dialog";
import { downloadCSV } from "@/lib/export";
import { cn } from "@/lib/utils";

interface TaskUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  dueDateRaw: string | null;
  assignedTo: TaskUser | null;
  assignedBy: { id: string; name: string } | null;
  workspace: { id: string; name: string } | null;
  nodeLabel: string | null;
  completedAt: string | null;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  PENDING: "muted",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  CANCELLED: "danger",
};

const PRIORITY_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  low: "muted",
  medium: "default",
  high: "warning",
  urgent: "danger",
};

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  PENDING: Clock,
  IN_PROGRESS: Loader2,
  COMPLETED: CheckCircle2,
  CANCELLED: AlertCircle,
};

export function TasksManager({ tasks, users, canAssign = true }: { tasks: TaskRow[]; users: TaskUser[]; canAssign?: boolean }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [query, setQuery] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [viewTask, setViewTask] = useState<TaskRow | null>(null);
  const [reassignTask, setReassignTask] = useState<TaskRow | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [reassigning, setReassigning] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (assigneeFilter && t.assignedTo?.id !== assigneeFilter) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false) ||
        (t.assignedTo?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [tasks, statusFilter, assigneeFilter, priorityFilter, query]);

  const counts = useMemo(() => ({
    total: tasks.length,
    pending: tasks.filter((t) => t.status === "PENDING").length,
    inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    completed: tasks.filter((t) => t.status === "COMPLETED").length,
  }), [tasks]);

  const handleReassign = async () => {
    if (!reassignTask || !reassignTo) return;
    setReassigning(true);
    try {
      const res = await fetch(`/api/tasks/${reassignTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: reassignTo }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to reassign");
      } else {
        toast.success(`Task reassigned to ${users.find((u) => u.id === reassignTo)?.name ?? "user"}`);
        setReassignTask(null);
        setReassignTo("");
        // Refresh the page to get updated data
        window.location.reload();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setReassigning(false);
    }
  };

  const handleStatusChange = async (taskId: string, status: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to update status");
      } else {
        toast.success("Task status updated");
        window.location.reload();
      }
    } catch {
      toast.error("Network error");
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to delete");
      } else {
        toast.success("Task deleted");
        window.location.reload();
      }
    } catch {
      toast.error("Network error");
    }
  };

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Tasks" value={String(counts.total)} />
        <KpiCard label="Pending" value={String(counts.pending)} accent="muted" />
        <KpiCard label="In Progress" value={String(counts.inProgress)} accent="warning" />
        <KpiCard label="Completed" value={String(counts.completed)} accent="success" />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks…" className="pl-8" />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:max-w-[160px]">
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
          <Select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All assignees</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
            ))}
          </Select>
          <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="sm:max-w-[140px]">
            <option value="">All priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadCSV(`tasks-${new Date().toISOString().slice(0,10)}.csv`, filtered as unknown as Record<string, unknown>[], [
            { key: "title", label: "Title" },
            { key: "status", label: "Status" },
            { key: "priority", label: "Priority" },
            { key: "assignedTo.name", label: "Assignee" },
            { key: "assignedTo.role", label: "Role" },
            { key: "assignedBy.name", label: "Assigned By" },
            { key: "dueDate", label: "Due Date" },
            { key: "createdAt", label: "Created" },
            { key: "workspace.name", label: "Workspace" },
          ])} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Export
          </Button>
          {canAssign && (
            <Button onClick={() => setAssignOpen(true)}>
              <Plus className="h-4 w-4" /> Assign Task
            </Button>
          )}
        </div>
      </div>

      <div className="text-body text-muted-foreground">
        {filtered.length} task{filtered.length !== 1 ? "s" : ""}
      </div>

      {/* Tasks table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5" />}
              title={tasks.length === 0 ? "No tasks yet" : "No tasks match the filters"}
              description={
                tasks.length === 0
                  ? "Assign tasks to team members from the playground canvas or using the Assign Task button."
                  : "Try different filters."
              }
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Task</TH>
                  <TH>Assignee</TH>
                  <TH>Priority</TH>
                  <TH>Status</TH>
                  <TH>Due</TH>
                  <TH>Assigned By</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((t) => {
                  const StatusIcon = STATUS_ICON[t.status] ?? Clock;
                  const isOverdue = t.dueDateRaw && new Date(t.dueDateRaw) < new Date() && t.status !== "COMPLETED";
                  return (
                    <TR key={t.id}>
                      <TD>
                        <div className="font-medium">{t.title}</div>
                        {t.nodeLabel && (
                          <div className="text-caption text-muted-foreground">From: {t.nodeLabel}</div>
                        )}
                        {t.workspace && (
                          <div className="text-caption text-muted-foreground">Workspace: {t.workspace.name}</div>
                        )}
                      </TD>
                      <TD>
                        {t.assignedTo ? (
                          <div>
                            <div className="text-body font-medium">{t.assignedTo.name}</div>
                            <div className="text-caption text-muted-foreground">{t.assignedTo.role}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TD>
                      <TD>
                        <Badge variant={PRIORITY_VARIANT[t.priority] ?? "muted"}>{t.priority}</Badge>
                      </TD>
                      <TD>
                        <div className="flex items-center gap-1.5">
                          <StatusIcon className={cn("h-3.5 w-3.5", t.status === "IN_PROGRESS" && "animate-spin")} />
                          <Badge variant={STATUS_VARIANT[t.status] ?? "muted"}>
                            {t.status.replace("_", " ")}
                          </Badge>
                        </div>
                      </TD>
                      <TD className={cn("text-caption", isOverdue && "text-destructive font-medium")}>
                        {t.dueDate ?? "—"}
                        {isOverdue && <span className="block">overdue</span>}
                      </TD>
                      <TD className="text-caption text-muted-foreground">
                        {t.assignedBy?.name ?? "—"}
                      </TD>
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewTask(t)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="View details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => { setReassignTask(t); setReassignTo(t.assignedTo?.id ?? ""); }}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Reassign"
                          >
                            <UserCog className="h-3.5 w-3.5" />
                          </button>
                          {t.status !== "COMPLETED" && (
                            <button
                              onClick={() => handleStatusChange(t.id, "COMPLETED")}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-success"
                              title="Mark completed"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Assign task dialog */}
      <AssignTaskDialog open={assignOpen} onOpenChange={setAssignOpen} />

      {/* View task dialog */}
      {viewTask && (
        <Dialog
          open={!!viewTask}
          onOpenChange={(o) => { if (!o) setViewTask(null); }}
          title={viewTask.title}
          description={`Assigned to ${viewTask.assignedTo?.name ?? "Unassigned"} · ${viewTask.status.replace("_", " ")}`}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={STATUS_VARIANT[viewTask.status] ?? "muted"}>{viewTask.status.replace("_", " ")}</Badge>
              <Badge variant={PRIORITY_VARIANT[viewTask.priority] ?? "muted"}>{viewTask.priority} priority</Badge>
              {viewTask.dueDate && (
                <Badge variant="outline">Due: {viewTask.dueDate}</Badge>
              )}
              {viewTask.workspace && (
                <Badge variant="outline">Workspace: {viewTask.workspace.name}</Badge>
              )}
            </div>

            {viewTask.description && (
              <div>
                <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
                <p className="text-body">{viewTask.description}</p>
              </div>
            )}

            {viewTask.instructions && (
              <div>
                <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Guidance</p>
                <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-body font-mono">{viewTask.instructions}</pre>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-caption">
              <div>
                <span className="text-muted-foreground">Assigned by: </span>
                <span className="font-medium">{viewTask.assignedBy?.name ?? "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Created: </span>
                <span className="font-medium">{viewTask.createdAt}</span>
              </div>
              {viewTask.completedAt && (
                <div>
                  <span className="text-muted-foreground">Completed: </span>
                  <span className="font-medium">{viewTask.completedAt}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              {viewTask.status !== "COMPLETED" && (
                <>
                  {viewTask.status === "PENDING" && (
                    <Button size="sm" onClick={() => { handleStatusChange(viewTask.id, "IN_PROGRESS"); setViewTask(null); }}>
                      Start
                    </Button>
                  )}
                  <Button size="sm" variant="success" onClick={() => { handleStatusChange(viewTask.id, "COMPLETED"); setViewTask(null); }}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                  </Button>
                </>
              )}
              <Button size="sm" variant="outline" onClick={() => { setReassignTask(viewTask); setReassignTo(viewTask.assignedTo?.id ?? ""); setViewTask(null); }}>
                <UserCog className="h-3.5 w-3.5" /> Reassign
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Reassign dialog */}
      {reassignTask && (
        <Dialog
          open={!!reassignTask}
          onOpenChange={(o) => { if (!o) { setReassignTask(null); setReassignTo(""); } }}
          title="Reassign Task"
          description={reassignTask.title}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Current Assignee</Label>
              <p className="text-body text-muted-foreground">
                {reassignTask.assignedTo?.name ?? "Unassigned"}
                {reassignTask.assignedTo && ` (${reassignTask.assignedTo.role})`}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>New Assignee</Label>
              <Select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                <option value="">Select user…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => { setReassignTask(null); setReassignTo(""); }}>
                Cancel
              </Button>
              <Button onClick={handleReassign} disabled={!reassignTo || reassigning}>
                {reassigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Reassign
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
