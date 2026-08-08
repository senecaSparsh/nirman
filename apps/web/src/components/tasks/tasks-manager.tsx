"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Search, Download, Trash2, UserCog, X,
  CheckCircle2, Loader2, Send,
  LayoutGrid, List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { AssignTaskDialog } from "@/components/tasks/assign-task-dialog";
import { TaskDetailDrawer } from "@/components/tasks/task-detail-drawer";
import { downloadCSV } from "@/lib/export";
import { cn, formatDate } from "@/lib/utils";

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

const AVATAR_COLORS = [
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!;
}

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
}

function relativeTime(dueDateRaw: string | null, status: string): { text: string; tone: "overdue" | "soon" | "normal" | "none" } {
  if (!dueDateRaw || status === "COMPLETED" || status === "CANCELLED") return { text: "", tone: "none" };
  const due = new Date(dueDateRaw);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    return { text: abs === 0 ? "overdue" : `${abs}d overdue`, tone: "overdue" };
  }
  if (diffDays === 0) return { text: "today", tone: "soon" };
  if (diffDays === 1) return { text: "tomorrow", tone: "soon" };
  if (diffDays <= 7) return { text: `in ${diffDays}d`, tone: "normal" };
  return { text: formatDate(dueDateRaw), tone: "normal" };
}

export function TasksManager({ tasks, users, canAssign = true, canManage = false, currentUserId = "" }: { tasks: TaskRow[]; users: TaskUser[]; canAssign?: boolean; canManage?: boolean; currentUserId?: string }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [query, setQuery] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [reassignTask, setReassignTask] = useState<TaskRow | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [delTarget, setDelTarget] = useState<TaskRow | null>(null);
  const [groupBy, setGroupBy] = useState<"status" | "assignee">("status");
  const [view, setView] = useState<"board" | "list">("board");

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
        router.refresh();
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
        router.refresh();
      }
    } catch {
      toast.error("Network error");
    }
  };

  const hasActiveFilters = statusFilter || assigneeFilter || priorityFilter || query;

  return (
    <div className="space-y-4">
      {/* ── Single compact toolbar ── */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: search + filters */}
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 lg:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks…" className="h-9 pl-8" />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 w-[130px]">
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
          <Select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="h-9 w-[140px]">
            <option value="">Everyone</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
          <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="h-9 w-[120px]">
            <option value="">Any priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
          {hasActiveFilters && (
            <button
              onClick={() => { setQuery(""); setStatusFilter(""); setAssigneeFilter(""); setPriorityFilter(""); }}
              className="text-caption text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        {/* Right: grouping + view + actions */}
        <div className="flex items-center gap-2">
          {/* Group toggle — minimal segmented control */}
          <div className="flex items-center rounded-md border border-border p-0.5">
            <button
              onClick={() => setGroupBy("status")}
              className={cn("rounded px-2 py-1 text-caption font-medium transition-colors", groupBy === "status" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              Status
            </button>
            <button
              onClick={() => setGroupBy("assignee")}
              className={cn("rounded px-2 py-1 text-caption font-medium transition-colors", groupBy === "assignee" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              Assignee
            </button>
          </div>
          {/* View toggle — icon only */}
          <div className="flex items-center rounded-md border border-border p-0.5">
            <button
              onClick={() => setView("board")}
              className={cn("rounded p-1.5 transition-colors", view === "board" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
              title="Board view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn("rounded p-1.5 transition-colors", view === "list" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button variant="outline" size="sm" className="h-9"
            onClick={() => downloadCSV(`tasks-${new Date().toISOString().slice(0,10)}.csv`, filtered as unknown as Record<string, unknown>[], [
              { key: "title", label: "Title" },
              { key: "status", label: "Status" },
              { key: "priority", label: "Priority" },
              { key: "assignedTo.name", label: "Assignee" },
              { key: "dueDate", label: "Due Date" },
              { key: "createdAt", label: "Created" },
            ])}
            disabled={filtered.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          {canAssign && tasks.length > 0 && (
            <Button size="sm" className="h-9" onClick={() => setAssignOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Assign
            </Button>
          )}
        </div>
      </div>

      {/* ── Task board or list ── */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5" />}
          title={tasks.length === 0 ? "No tasks yet" : "No tasks match the filters"}
          description={
            tasks.length === 0
              ? "Assign tasks to team members from the playground canvas or using the Assign button."
              : "Try different filters or clear them."
          }
          action={tasks.length === 0 && canAssign ? (
            <Button size="sm" onClick={() => setAssignOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Assign Task
            </Button>
          ) : undefined}
        />
      ) : view === "board" ? (
        <TaskBoard
          tasks={filtered}
          users={users}
          groupBy={groupBy}
          onView={(t) => setDrawerTaskId(t.id)}
          onComplete={(t) => handleStatusChange(t.id, "COMPLETED")}
          onReassign={(t) => { setReassignTask(t); setReassignTo(t.assignedTo?.id ?? ""); }}
          onDelete={setDelTarget}
        />
      ) : (
        <TaskList
          tasks={filtered}
          onView={(t) => setDrawerTaskId(t.id)}
          onComplete={(t) => handleStatusChange(t.id, "COMPLETED")}
          onReassign={(t) => { setReassignTask(t); setReassignTo(t.assignedTo?.id ?? ""); }}
          onDelete={setDelTarget}
        />
      )}

      {/* Assign task dialog */}
      <AssignTaskDialog open={assignOpen} onOpenChange={setAssignOpen} />

      {/* Task detail drawer */}
      <TaskDetailDrawer
        taskId={drawerTaskId}
        open={drawerTaskId !== null}
        onClose={() => setDrawerTaskId(null)}
        users={users}
        canManage={canManage}
        currentUserId={currentUserId}
        tasks={tasks}
      />

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

      {delTarget && (
        <DeleteConfirmDialog
          open={Boolean(delTarget)}
          onOpenChange={(o) => { if (!o) setDelTarget(null); }}
          endpoint={`/api/tasks/${delTarget.id}`}
          title="Delete task"
          description={`Delete "${delTarget.title}"? This cannot be undone.`}
          successMessage="Task deleted"
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Task Board — kanban columns
// ───────────────────────────────────────────────────────────

const STATUS_COLUMNS = [
  { status: "PENDING", label: "Pending", color: "var(--color-muted-foreground)" },
  { status: "IN_PROGRESS", label: "In Progress", color: "var(--color-warning)" },
  { status: "COMPLETED", label: "Completed", color: "var(--color-success)" },
  { status: "CANCELLED", label: "Cancelled", color: "var(--color-danger)" },
];

function TaskBoard({
  tasks, groupBy, onView, onComplete, onReassign, onDelete,
}: {
  tasks: TaskRow[];
  users: TaskUser[];
  groupBy: "status" | "assignee";
  onView: (t: TaskRow) => void;
  onComplete: (t: TaskRow) => void;
  onReassign: (t: TaskRow) => void;
  onDelete: (t: TaskRow) => void;
}) {
  if (groupBy === "status") {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {STATUS_COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.status);
          return (
            <div key={col.status} className="flex w-72 shrink-0 flex-col">
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: col.color }} />
                <span className="text-label text-muted-foreground">{col.label}</span>
                <span className="ml-auto text-caption font-semibold tnum text-muted-foreground">{items.length}</span>
              </div>
              <div className="flex-1 space-y-2">
                {items.length === 0 && (
                  <div className="rounded-md border border-dashed border-border/40 py-8 text-center text-micro text-muted-foreground/40">
                    Empty
                  </div>
                )}
                {items.map((t) => (
                  <TaskCard key={t.id} task={t} onView={onView} onComplete={onComplete} onReassign={onReassign} onDelete={onDelete} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Group by assignee
  const groups: { assignee: TaskUser | null; tasks: TaskRow[] }[] = [];
  const unassigned: TaskRow[] = [];
  for (const t of tasks) {
    if (!t.assignedTo) {
      unassigned.push(t);
    } else {
      let g = groups.find((g) => g.assignee?.id === t.assignedTo!.id);
      if (!g) {
        g = { assignee: t.assignedTo, tasks: [] };
        groups.push(g);
      }
      g.tasks.push(t);
    }
  }
  groups.sort((a, b) => a.assignee!.name.localeCompare(b.assignee!.name));
  if (unassigned.length > 0) groups.push({ assignee: null, tasks: unassigned });

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {groups.map((g) => (
        <div key={g.assignee?.id ?? "unassigned"} className="flex w-72 shrink-0 flex-col">
          <div className="mb-2 flex items-center gap-2 px-1">
            {g.assignee ? (
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-micro font-bold", avatarColor(g.assignee.name))}>
                {initials(g.assignee.name)}
              </span>
            ) : (
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border text-micro text-muted-foreground">
                ?
              </span>
            )}
            <span className="text-label text-muted-foreground">{g.assignee?.name ?? "Unassigned"}</span>
            <span className="ml-auto text-caption font-semibold tnum text-muted-foreground">{g.tasks.length}</span>
          </div>
          <div className="flex-1 space-y-2">
            {g.tasks.length === 0 && (
              <div className="rounded-md border border-dashed border-border/40 py-8 text-center text-micro text-muted-foreground/40">
                No tasks
              </div>
            )}
            {g.tasks.map((t) => (
              <TaskCard key={t.id} task={t} onView={onView} onComplete={onComplete} onReassign={onReassign} onDelete={onDelete} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Task Card — compact, 2 rows: title + meta
//  Priority shown via left border only (no redundant bar).
//  No animate-ping — static dots keep CPU idle.
// ───────────────────────────────────────────────────────────

function TaskCard({
  task, onView, onComplete, onReassign, onDelete,
}: {
  task: TaskRow;
  onView: (t: TaskRow) => void;
  onComplete: (t: TaskRow) => void;
  onReassign: (t: TaskRow) => void;
  onDelete: (t: TaskRow) => void;
}) {
  const time = relativeTime(task.dueDateRaw, task.status);
  const isDone = task.status === "COMPLETED";
  const isCancelled = task.status === "CANCELLED";
  const isInProgress = task.status === "IN_PROGRESS";
  const isPending = task.status === "PENDING";
  const isUrgent = task.priority === "urgent";
  const isHigh = task.priority === "high";

  return (
    <div
      className={cn(
        "group cursor-pointer rounded-lg border bg-card p-2.5 transition-all hover:shadow-sm",
        isPending && "border-dashed border-border",
        !isPending && "border-border",
        // Priority — left border only, no separate bar
        isUrgent && !isDone && !isCancelled && "border-l-[3px] border-l-danger",
        isHigh && !isUrgent && !isDone && !isCancelled && "border-l-[3px] border-l-warning",
        // Overdue tint
        time.tone === "overdue" && "bg-danger/5",
        isDone && "opacity-50",
        isCancelled && "opacity-40",
      )}
      onClick={() => onView(task)}
    >
      {/* Row 1: status dot + title */}
      <div className="flex items-start gap-2">
        <div className="mt-1 shrink-0">
          {isDone ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          ) : isCancelled ? (
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          ) : isInProgress ? (
            <span className="h-2 w-2 rounded-full bg-warning" />
          ) : isUrgent ? (
            <span className="h-2 w-2 rounded-full bg-danger" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          )}
        </div>
        <p className={cn(
          "min-w-0 flex-1 text-body font-medium leading-snug",
          (isDone || isCancelled) && "line-through decoration-muted-foreground/40",
        )}>
          {task.title}
        </p>
      </div>

      {/* Row 2: assignee + due date — single muted line */}
      <div className="mt-1.5 flex items-center gap-1.5 pl-5">
        {task.assignedTo ? (
          <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-micro font-bold", avatarColor(task.assignedTo.name))}>
            {initials(task.assignedTo.name)}
          </span>
        ) : (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-micro text-muted-foreground">
            ?
          </span>
        )}
        {task.assignedTo && (
          <span className="truncate text-caption text-muted-foreground">{task.assignedTo.name.split(" ")[0]}</span>
        )}
        {!task.assignedTo && (
          <span className="text-caption text-muted-foreground/50">Unassigned</span>
        )}
        {time.tone !== "none" && (
          <span className={cn(
            "ml-auto shrink-0 text-caption font-medium tnum",
            time.tone === "overdue" && "text-danger",
            time.tone === "soon" && "text-warning",
            time.tone === "normal" && "text-muted-foreground",
          )}>
            {time.text}
          </span>
        )}
      </div>

      {/* Hover actions — subtle, no border-t */}
      <div className="mt-1.5 flex gap-0.5 pl-5 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
        {task.status !== "COMPLETED" && (
          <button onClick={() => onComplete(task)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-success" title="Mark completed">
            <CheckCircle2 className="h-3 w-3" />
          </button>
        )}
        <button onClick={() => onReassign(task)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Reassign">
          <UserCog className="h-3 w-3" />
        </button>
        <button onClick={() => onDelete(task)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger" title="Delete">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Task List — compact divided rows
// ───────────────────────────────────────────────────────────

function TaskList({
  tasks, onView, onComplete, onReassign, onDelete,
}: {
  tasks: TaskRow[];
  onView: (t: TaskRow) => void;
  onComplete: (t: TaskRow) => void;
  onReassign: (t: TaskRow) => void;
  onDelete: (t: TaskRow) => void;
}) {
  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {tasks.map((t) => {
        const time = relativeTime(t.dueDateRaw, t.status);
        const isDone = t.status === "COMPLETED";
        const isCancelled = t.status === "CANCELLED";
        const isUrgent = t.priority === "urgent";
        const isOverdue = time.tone === "overdue";
        return (
          <div
            key={t.id}
            className={cn(
              "group flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30",
              isOverdue && "bg-danger/5",
              isDone && "opacity-50",
              isCancelled && "opacity-40",
            )}
            onClick={() => onView(t)}
          >
            {/* Priority bar — left edge only */}
            <div className={cn(
              "h-6 w-0.5 shrink-0 rounded-full",
              isUrgent && !isDone && !isCancelled && "bg-danger",
              t.priority === "high" && !isUrgent && !isDone && !isCancelled && "bg-warning",
              t.priority === "medium" && !isDone && !isCancelled && "bg-foreground/20",
              (isDone || isCancelled || t.priority === "low") && "bg-transparent",
            )} />

            {/* Status dot — static, no animation */}
            <div className="shrink-0">
              {isDone ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              ) : isCancelled ? (
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              ) : t.status === "IN_PROGRESS" ? (
                <span className="h-2 w-2 rounded-full bg-warning" />
              ) : (
                <span className={cn("h-2 w-2 rounded-full", isUrgent ? "bg-danger" : "bg-muted-foreground/30")} />
              )}
            </div>

            {/* Title + assignee */}
            <div className="min-w-0 flex-1">
              <span className={cn("truncate text-body font-medium", (isDone || isCancelled) && "line-through decoration-muted-foreground/40")}>
                {t.title}
              </span>
              {t.assignedTo && (
                <span className="ml-2 text-caption text-muted-foreground">{t.assignedTo.name.split(" ")[0]}</span>
              )}
            </div>

            {/* Due date */}
            {time.tone !== "none" && (
              <span className={cn(
                "shrink-0 text-caption font-medium tnum",
                time.tone === "overdue" && "text-danger",
                time.tone === "soon" && "text-warning",
                time.tone === "normal" && "text-muted-foreground",
              )}>
                {time.text}
              </span>
            )}

            {/* Hover actions */}
            <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
              {t.status !== "COMPLETED" && (
                <button onClick={() => onComplete(t)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-success" title="Mark completed">
                  <CheckCircle2 className="h-3 w-3" />
                </button>
              )}
              <button onClick={() => onReassign(t)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Reassign">
                <UserCog className="h-3 w-3" />
              </button>
              <button onClick={() => onDelete(t)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger" title="Delete">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
