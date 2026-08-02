"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  X, Plus, Trash2, Send, Play, Square, Clock, Link2, Unlink,
  CheckCircle2, Circle, MessageSquare, Activity, ListChecks,
  AlertCircle, UserCog, Loader2,
  ArrowRight, GitBranch, Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────
//  Types — mirror the shape returned by GET /api/tasks/[id]
//  (getTaskDetail in @nirman/services). Decimals are pre-
//  serialized to numbers by the server component via toNum().
// ───────────────────────────────────────────────────────────

interface TaskUser { id: string; name: string; email: string; role: string }
interface SubTask {
  id: string; title: string; completed: boolean; order: number;
  completedAt: string | null; completedBy: { name: string } | null;
}
interface TaskComment {
  id: string; body: string; createdAt: string;
  user: { id: string; name: string };
  replies?: TaskComment[];
}
interface TaskActivity {
  id: string; kind: string; message: string; createdAt: string;
  user: { id: string; name: string } | null;
}
interface TaskTimeLog {
  id: string; startedAt: string; endedAt: string | null;
  durationMins: number | null; note: string | null;
  user: { id: string; name: string };
}
interface TaskDep {
  id: string;
  blocker: { id: string; title: string; status: string };
  blockedBy: { id: string; title: string; status: string };
}

interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  estimateMins: number | null;
  nodeLabel: string | null;
  completedAt: string | null;
  createdAt: string;
  assignedTo: TaskUser | null;
  assignedBy: { id: string; name: string } | null;
  workspace: { id: string; name: string } | null;
  subtasks: SubTask[];
  comments: TaskComment[];
  activities: TaskActivity[];
  timeLogs: TaskTimeLog[];
  blockedBy: TaskDep[];
  blocking: TaskDep[];
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignedTo: TaskUser | null;
}

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  PENDING: "muted", IN_PROGRESS: "warning", COMPLETED: "success", CANCELLED: "danger",
};
const PRIORITY_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  low: "muted", medium: "default", high: "warning", urgent: "danger",
};

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

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function computeProgress(subtasks: SubTask[]): number {
  if (subtasks.length === 0) return 0;
  const done = subtasks.filter((s) => s.completed).length;
  return Math.round((done / subtasks.length) * 100);
}

function isBlocked(deps: TaskDep[]): boolean {
  return deps.some((d) => d.blocker.status !== "COMPLETED" && d.blocker.status !== "CANCELLED");
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  return `in ${diff}d`;
}

// Activity icon per kind — the feed is scannable at a glance.
const ACTIVITY_ICON: Record<string, typeof Activity> = {
  CREATED: Plus,
  STATUS_CHANGED: ArrowRight,
  COMPLETED: CheckCircle2,
  REOPENED: Circle,
  ASSIGNED: UserCog,
  SUBTASK_ADDED: ListChecks,
  SUBTASK_TOGGLED: CheckCircle2,
  SUBTASK_DELETED: Trash2,
  COMMENTED: MessageSquare,
  DEPENDENCY_ADDED: GitBranch,
  DEPENDENCY_REMOVED: Unlink,
  TIMER_STARTED: Play,
  TIMER_STOPED: Square,
};

// ───────────────────────────────────────────────────────────
//  Main drawer
// ───────────────────────────────────────────────────────────

type Tab = "steps" | "discussion" | "activity" | "dependencies" | "time";

export function TaskDetailDrawer({
  taskId, open, onClose, users, canManage, currentUserId, tasks = [],
}: {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  users: TaskUser[];
  canManage: boolean;
  currentUserId: string;
  tasks?: TaskRow[];
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("steps");
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) { toast.error("Failed to load task"); return; }
      const data = (await res.json()) as TaskDetail;
      setDetail(data);
      // Detect open timer for current user
      const openLog = data.timeLogs.find((l) => l.user.id === currentUserId && l.endedAt === null);
      if (openLog) {
        setTimerRunning(true);
        setTimerStartedAt(new Date(openLog.startedAt).getTime());
      } else {
        setTimerRunning(false);
        setTimerStartedAt(null);
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }, [taskId, currentUserId]);

  useEffect(() => {
    if (open && taskId) {
      setTab("steps");
      fetchDetail();
    } else {
      setDetail(null);
    }
  }, [open, taskId, fetchDetail]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // refreshDetail: re-fetch the drawer only (cheap, no server re-render).
  // refreshList: also re-render the server component so the kanban updates
  //   (needed for status/reassign changes that move cards between columns).
  const refreshDetail = () => { fetchDetail(); };
  const refreshList = () => { fetchDetail(); router.refresh(); };

  if (!open || !taskId) return null;

  const progress = detail ? computeProgress(detail.subtasks) : 0;
  const blocked = detail ? isBlocked(detail.blockedBy) : false;
  const isAssignee = detail?.assignedTo?.id === currentUserId;
  const canEdit = canManage || isAssignee;
  const totalLogged = detail ? detail.timeLogs.reduce((s, l) => s + (l.durationMins ?? 0), 0) : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="drawer-backdrop absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="drawer-panel relative flex h-full w-full max-w-xl flex-col bg-card shadow-2xl">
        {loading && !detail ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : detail ? (
          <>
            {/* ── Header ── */}
            <DrawerHeader
              detail={detail}
              progress={progress}
              blocked={blocked}
              canEdit={canEdit}
              canManage={canManage}
              timerRunning={timerRunning}
              timerStartedAt={timerStartedAt}
              totalLogged={totalLogged}
              onClose={onClose}
              onStatusChange={async (status) => {
                try {
                  const res = await fetch(`/api/tasks/${taskId}`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status }),
                  });
                  if (!res.ok) { const d = await res.json(); toast.error(d.error ?? "Failed"); return; }
                  toast.success(status === "COMPLETED" ? "Task completed" : "Status updated");
                  refreshList();
                } catch { toast.error("Network error"); }
              }}
              onTimerToggle={async () => {
                try {
                  const res = await fetch(`/api/tasks/${taskId}/time${timerRunning ? "?action=stop" : ""}`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: timerRunning ? JSON.stringify({}) : "",
                  });
                  if (!res.ok) { const d = await res.json(); toast.error(d.error ?? "Timer error"); return; }
                  if (timerRunning) {
                    const d = await res.json();
                    toast.success(`Logged ${formatDuration(d.durationMins ?? 0)}`);
                    setTimerRunning(false);
                    setTimerStartedAt(null);
                  } else {
                    toast.success("Timer started");
                    setTimerRunning(true);
                    setTimerStartedAt(Date.now());
                  }
                  refreshDetail();
                } catch { toast.error("Network error"); }
              }}
            />

            {/* ── Tabs ── */}
            <div className="flex items-center gap-0.5 border-b border-border px-3">
              <TabButton active={tab === "steps"} onClick={() => setTab("steps")} icon={ListChecks} label="Steps" count={detail.subtasks.length} />
              <TabButton active={tab === "discussion"} onClick={() => setTab("discussion")} icon={MessageSquare} label="Discussion" count={detail.comments.length} />
              <TabButton active={tab === "activity"} onClick={() => setTab("activity")} icon={Activity} label="Activity" count={detail.activities.length} />
              <TabButton active={tab === "dependencies"} onClick={() => setTab("dependencies")} icon={GitBranch} label="Links" count={detail.blockedBy.length + detail.blocking.length} />
              <TabButton active={tab === "time"} onClick={() => setTab("time")} icon={Clock} label="Time" count={detail.timeLogs.length} />
            </div>

            {/* ── Tab content (scrollable) ── */}
            <div className="flex-1 overflow-y-auto">
              {tab === "steps" && (
                <StepsTab detail={detail} canEdit={canEdit} currentUserId={currentUserId} onChanged={refreshDetail} />
              )}
              {tab === "discussion" && (
                <DiscussionTab detail={detail} currentUserId={currentUserId} onChanged={refreshDetail} />
              )}
              {tab === "activity" && <ActivityTab detail={detail} />}
              {tab === "dependencies" && (
                <DependenciesTab detail={detail} canManage={canManage} tasks={tasks} onChanged={refreshDetail} />
              )}
              {tab === "time" && <TimeTab detail={detail} estimateMins={detail.estimateMins} totalLogged={totalLogged} />}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">Task not found</div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Header — title, status ring, meta, primary actions
// ───────────────────────────────────────────────────────────

function DrawerHeader({
  detail, progress, blocked, canEdit, canManage, timerRunning, timerStartedAt, totalLogged,
  onClose, onStatusChange, onTimerToggle,
}: {
  detail: TaskDetail;
  progress: number;
  blocked: boolean;
  canEdit: boolean;
  canManage: boolean;
  timerRunning: boolean;
  timerStartedAt: number | null;
  totalLogged: number;
  onClose: () => void;
  onStatusChange: (status: string) => void;
  onTimerToggle: () => void;
}) {
  const isDone = detail.status === "COMPLETED";
  const isCancelled = detail.status === "CANCELLED";
  const isInProgress = detail.status === "IN_PROGRESS";
  const isPending = detail.status === "PENDING";

  // Conic progress ring
  const ringSize = 44;
  const stroke = 4;
  const r = (ringSize - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;

  return (
    <div className="border-b border-border p-4">
      {/* Top row: close + status badge */}
      <div className="flex items-start gap-3">
        {/* Progress ring (only if subtasks exist) */}
        {detail.subtasks.length > 0 ? (
          <div className="relative shrink-0" style={{ width: ringSize, height: ringSize }}>
            <svg width={ringSize} height={ringSize} className="-rotate-90">
              <circle cx={ringSize / 2} cy={ringSize / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
              <circle
                cx={ringSize / 2} cy={ringSize / 2} r={r} fill="none"
                stroke={isDone ? "var(--color-success)" : "var(--color-foreground)"}
                strokeWidth={stroke} strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={offset}
                style={{ transition: "stroke-dashoffset 0.4s ease" }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-micro font-bold tnum">
              {progress}%
            </span>
          </div>
        ) : (
          <div className="mt-0.5 shrink-0">
            {isDone ? <CheckCircle2 className="h-5 w-5 text-success" /> :
             isCancelled ? <X className="h-5 w-5 text-muted-foreground" /> :
             isInProgress ? <Loader2 className="h-5 w-5 animate-spin text-warning" /> :
             <Circle className="h-5 w-5 text-muted-foreground/40" />}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h2 className={cn("text-h3 font-semibold leading-tight", (isDone || isCancelled) && "line-through decoration-muted-foreground/40")}>
            {detail.title}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant={STATUS_VARIANT[detail.status] ?? "muted"}>{detail.status.replace("_", " ")}</Badge>
            <Badge variant={PRIORITY_VARIANT[detail.priority] ?? "muted"}>{detail.priority}</Badge>
            {detail.dueDate && (
              <Badge variant="outline">Due {relativeTime(detail.dueDate)}</Badge>
            )}
            {blocked && (
              <Badge variant="danger"><AlertCircle className="mr-1 h-3 w-3" />Blocked</Badge>
            )}
            {detail.workspace && (
              <Badge variant="outline">{detail.workspace.name}</Badge>
            )}
          </div>
        </div>

        <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Close (Esc)">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Assignee + time summary */}
      <div className="mt-3 flex items-center gap-3 text-caption text-muted-foreground">
        {detail.assignedTo ? (
          <span className="flex items-center gap-1.5">
            <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-micro font-bold", avatarColor(detail.assignedTo.name))}>
              {initials(detail.assignedTo.name)}
            </span>
            <span className="font-medium text-foreground">{detail.assignedTo.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground/60">Unassigned</span>
        )}
        <span>·</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(totalLogged)} logged</span>
        {detail.estimateMins && (
          <>
            <span>·</span>
            <span>est. {formatDuration(detail.estimateMins)}</span>
          </>
        )}
      </div>

      {/* Primary actions */}
      {canEdit && !isCancelled && (
        <div className="mt-3 flex items-center gap-2">
          {isPending && (
            <Button
              size="sm"
              disabled={blocked}
              onClick={() => onStatusChange("IN_PROGRESS")}
              title={blocked ? "Blocked by incomplete dependencies" : "Start working"}
            >
              <Play className="h-3.5 w-3.5" /> Start
            </Button>
          )}
          {isInProgress && (
            <Button size="sm" variant="success" onClick={() => onStatusChange("COMPLETED")}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Complete
            </Button>
          )}
          {isDone && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange("IN_PROGRESS")}>
              <Circle className="h-3.5 w-3.5" /> Reopen
            </Button>
          )}
          {!isDone && (
            <TimerButton running={timerRunning} startedAt={timerStartedAt} onToggle={onTimerToggle} />
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Timer button — isolated so only this re-renders every second,
//  not the entire drawer (tabs, lists, etc).
// ───────────────────────────────────────────────────────────

function TimerButton({ running, startedAt, onToggle }: {
  running: boolean;
  startedAt: number | null;
  onToggle: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running || !startedAt) { setElapsed(0); return; }
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <Button
      size="sm"
      variant={running ? "destructive" : "outline"}
      onClick={onToggle}
      className="tnum"
    >
      {running ? (
        <><Square className="h-3.5 w-3.5" /> {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</>
      ) : (
        <><Timer className="h-3.5 w-3.5" /> Track time</>
      )}
    </Button>
  );
}

// ───────────────────────────────────────────────────────────
//  Tab button
// ───────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon: Icon, label, count }: {
  active: boolean; onClick: () => void; icon: typeof Activity; label: string; count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-caption font-medium transition-colors",
        active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {count > 0 && <span className="rounded-full bg-muted px-1.5 text-micro font-semibold tnum">{count}</span>}
    </button>
  );
}

// ───────────────────────────────────────────────────────────
//  Steps tab — checkable subtasks with live progress
// ───────────────────────────────────────────────────────────

function StepsTab({ detail, canEdit, currentUserId, onChanged }: {
  detail: TaskDetail; canEdit: boolean; currentUserId: string; onChanged: () => void;
}) {
  const [newStep, setNewStep] = useState("");
  const [adding, setAdding] = useState(false);

  const addStep = async () => {
    const title = newStep.trim();
    if (!title) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/tasks/${detail.id}/subtasks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? "Failed"); return; }
      setNewStep("");
      onChanged();
    } catch { toast.error("Network error"); }
    finally { setAdding(false); }
  };

  const toggle = async (sub: SubTask) => {
    try {
      await fetch(`/api/tasks/${detail.id}/subtasks/${sub.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !sub.completed }),
      });
      onChanged();
    } catch { toast.error("Network error"); }
  };

  const remove = async (sub: SubTask) => {
    try {
      await fetch(`/api/tasks/${detail.id}/subtasks/${sub.id}`, { method: "DELETE" });
      onChanged();
    } catch { toast.error("Network error"); }
  };

  const done = detail.subtasks.filter((s) => s.completed).length;
  const total = detail.subtasks.length;

  return (
    <div className="p-4">
      {/* Progress summary */}
      {total > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <span className="text-caption font-medium text-muted-foreground">
            {done} of {total} steps complete
          </span>
          <span className="text-caption font-bold tnum text-foreground">{Math.round((done / total) * 100)}%</span>
        </div>
      )}

      {/* Step list */}
      <div className="space-y-1">
        {detail.subtasks.length === 0 && !canEdit && (
          <p className="py-6 text-center text-caption text-muted-foreground">No steps defined for this task.</p>
        )}
        {detail.subtasks.length === 0 && canEdit && (
          <p className="py-4 text-center text-caption text-muted-foreground/60">
            No steps yet. Break this task into checkable steps below to track progress.
          </p>
        )}
        {detail.subtasks.map((sub) => (
          <div
            key={sub.id}
            className="group flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-muted/40"
          >
            <button
              onClick={() => canEdit && toggle(sub)}
              disabled={!canEdit}
              className={cn(
                "shrink-0 transition-transform",
                canEdit && "hover:scale-110",
                !canEdit && "cursor-default",
              )}
            >
              {sub.completed ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/40 hover:text-foreground" />
              )}
            </button>
            <span className={cn(
              "min-w-0 flex-1 text-body",
              sub.completed && "text-muted-foreground line-through decoration-muted-foreground/40",
            )}>
              {sub.title}
            </span>
            {sub.completedBy && sub.completed && (
              <span className="shrink-0 text-micro text-muted-foreground/60">by {sub.completedBy.name}</span>
            )}
            {canEdit && (
              <button
                onClick={() => remove(sub)}
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                title="Remove step"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add step */}
      {canEdit && (
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addStep(); }}
            placeholder="Add a step…"
            className="flex-1"
            disabled={adding}
          />
          <Button size="sm" variant="outline" onClick={addStep} disabled={adding || !newStep.trim()}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      )}

      {/* Description + instructions (read-only context) */}
      {(detail.description || detail.instructions) && (
        <div className="mt-5 space-y-3 border-t border-border pt-4">
          {detail.description && (
            <div>
              <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
              <p className="text-body text-foreground/90">{detail.description}</p>
            </div>
          )}
          {detail.instructions && (
            <div>
              <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-muted-foreground">Guidance</p>
              <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-body font-mono">{detail.instructions}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Discussion tab — threaded comments
// ───────────────────────────────────────────────────────────

function DiscussionTab({ detail, currentUserId, onChanged }: {
  detail: TaskDetail; currentUserId: string; onChanged: () => void;
}) {
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [posting, setPosting] = useState(false);

  const post = async (parentId: string | null, text: string, clear: () => void) => {
    if (!text.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/tasks/${detail.id}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, parentId }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? "Failed"); return; }
      clear();
      setReplyTo(null);
      onChanged();
    } catch { toast.error("Network error"); }
    finally { setPosting(false); }
  };

  const deleteComment = async (cid: string) => {
    try {
      await fetch(`/api/tasks/${detail.id}/comments/${cid}`, { method: "DELETE" });
      onChanged();
    } catch { toast.error("Network error"); }
  };

  return (
    <div className="flex flex-col p-4">
      <div className="space-y-4">
        {detail.comments.length === 0 && (
          <p className="py-6 text-center text-caption text-muted-foreground">No discussion yet. Start the conversation below.</p>
        )}
        {detail.comments.map((comment) => (
          <CommentNode
            key={comment.id}
            comment={comment}
            currentUserId={currentUserId}
            replyTo={replyTo}
            replyBody={replyBody}
            posting={posting}
            onReplyTo={(id) => { setReplyTo(id); setReplyBody(""); }}
            onCancelReply={() => setReplyTo(null)}
            onReply={(text) => post(comment.id, text, () => setReplyBody(""))}
            onReplyBodyChange={setReplyBody}
            onDelete={deleteComment}
          />
        ))}
      </div>

      {/* New comment composer */}
      <div className="mt-4 border-t border-border pt-4">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment…  (Cmd+Enter to send)"
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(null, body, () => setBody(""));
          }}
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={() => post(null, body, () => setBody(""))} disabled={posting || !body.trim()}>
            <Send className="h-3.5 w-3.5" /> Comment
          </Button>
        </div>
      </div>
    </div>
  );
}

function CommentNode({
  comment, currentUserId, replyTo, replyBody, posting,
  onReplyTo, onCancelReply, onReply, onReplyBodyChange, onDelete,
}: {
  comment: TaskComment;
  currentUserId: string;
  replyTo: string | null;
  replyBody: string;
  posting: boolean;
  onReplyTo: (id: string) => void;
  onCancelReply: () => void;
  onReply: (text: string) => void;
  onReplyBodyChange: (s: string) => void;
  onDelete: (cid: string) => void;
}) {
  const isMine = comment.user.id === currentUserId;
  return (
    <div className="space-y-2">
      <div className="flex gap-2.5">
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-micro font-bold", avatarColor(comment.user.name))}>
          {initials(comment.user.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-body font-medium">{comment.user.name}</span>
            <span className="text-micro text-muted-foreground">{relativeTime(comment.createdAt)}</span>
            {isMine && (
              <button onClick={() => onDelete(comment.id)} className="ml-auto rounded p-0.5 text-muted-foreground hover:text-danger" title="Delete">
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-body text-foreground/90">{comment.body}</p>
          <button
            onClick={() => onReplyTo(comment.id)}
            className="mt-1 text-micro font-medium text-muted-foreground hover:text-foreground"
          >
            Reply
          </button>
        </div>
      </div>

      {/* Replies (one level) */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-9 space-y-2 border-l border-border pl-3">
          {comment.replies.map((reply) => {
            const replyMine = reply.user.id === currentUserId;
            return (
              <div key={reply.id} className="flex gap-2">
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-micro font-bold", avatarColor(reply.user.name))}>
                  {initials(reply.user.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-caption font-medium">{reply.user.name}</span>
                    <span className="text-micro text-muted-foreground">{relativeTime(reply.createdAt)}</span>
                    {replyMine && (
                      <button onClick={() => onDelete(reply.id)} className="ml-auto rounded p-0.5 text-muted-foreground hover:text-danger">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-body text-foreground/90">{reply.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline reply composer */}
      {replyTo === comment.id && (
        <div className="ml-9 flex items-end gap-2 border-l border-border pl-3">
          <Textarea
            value={replyBody}
            onChange={(e) => onReplyBodyChange(e.target.value)}
            placeholder={`Reply to ${comment.user.name}…`}
            rows={2}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onReply(replyBody);
            }}
          />
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={onCancelReply}>Cancel</Button>
            <Button size="sm" onClick={() => onReply(replyBody)} disabled={posting || !replyBody.trim()}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Activity tab — auto-generated timeline
// ───────────────────────────────────────────────────────────

function ActivityTab({ detail }: { detail: TaskDetail }) {
  if (detail.activities.length === 0) {
    return <p className="py-8 text-center text-caption text-muted-foreground">No activity yet.</p>;
  }
  // Group by day
  const groups: { label: string; items: TaskActivity[] }[] = [];
  for (const a of detail.activities) {
    const day = new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    let g = groups.find((g) => g.label === day);
    if (!g) { g = { label: day, items: [] }; groups.push(g); }
    g.items.push(a);
  }

  return (
    <div className="p-4">
      {groups.map((group) => (
        <div key={group.label} className="mb-4 last:mb-0">
          <p className="mb-2 text-micro font-semibold uppercase tracking-wide text-muted-foreground/60">{group.label}</p>
          <div className="relative space-y-3 border-l border-border pl-4">
            {group.items.map((a) => {
              const Icon = ACTIVITY_ICON[a.kind] ?? Activity;
              return (
                <div key={a.id} className="relative">
                  <span className="absolute -left-[21px] flex h-4 w-4 items-center justify-center rounded-full bg-card">
                    <Icon className="h-3 w-3 text-muted-foreground" />
                  </span>
                  <p className="text-body text-foreground/90">{a.message}</p>
                  <p className="text-micro text-muted-foreground/60">
                    {a.user?.name ?? "System"} · {new Date(a.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Dependencies tab — blockers + blocked
// ───────────────────────────────────────────────────────────

function DependenciesTab({ detail, canManage, tasks, onChanged }: {
  detail: TaskDetail; canManage: boolean; tasks: TaskRow[]; onChanged: () => void;
}) {
  const [blockerId, setBlockerId] = useState("");
  const [adding, setAdding] = useState(false);

  // Tasks available to link as blockers: not this task, not already linked.
  const existingBlockerIds = new Set(detail.blockedBy.map((d) => d.blocker.id));
  const availableTasks = tasks.filter(
    (t) => t.id !== detail.id && !existingBlockerIds.has(t.id),
  );

  const addBlocker = async () => {
    if (!blockerId) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/tasks/${detail.id}/dependencies`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockerId }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? "Failed"); return; }
      setBlockerId("");
      onChanged();
    } catch { toast.error("Network error"); }
    finally { setAdding(false); }
  };

  const removeBlocker = async (bid: string) => {
    try {
      await fetch(`/api/tasks/${detail.id}/dependencies?blockerId=${bid}`, { method: "DELETE" });
      onChanged();
    } catch { toast.error("Network error"); }
  };

  return (
    <div className="space-y-5 p-4">
      {/* Blocked by */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5" /> Blocked by
        </p>
        {detail.blockedBy.length === 0 ? (
          <p className="text-caption text-muted-foreground/60">No blockers — this task is ready to start.</p>
        ) : (
          <div className="space-y-1.5">
            {detail.blockedBy.map((dep) => {
              const done = dep.blocker.status === "COMPLETED" || dep.blocker.status === "CANCELLED";
              return (
                <div key={dep.id} className="group flex items-center gap-2 rounded-md border border-border px-3 py-2">
                  {done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-warning" />}
                  <span className={cn("min-w-0 flex-1 truncate text-body", done && "text-muted-foreground line-through")}>
                    {dep.blocker.title}
                  </span>
                  <Badge variant={STATUS_VARIANT[dep.blocker.status] ?? "muted"}>{dep.blocker.status.replace("_", " ")}</Badge>
                  {canManage && (
                    <button
                      onClick={() => removeBlocker(dep.blocker.id)}
                      className="rounded p-1 text-muted-foreground opacity-0 hover:text-danger group-hover:opacity-100"
                      title="Remove blocker"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Blocking */}
      {detail.blocking.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" /> This blocks
          </p>
          <div className="space-y-1.5">
            {detail.blocking.map((dep) => (
              <div key={dep.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-body">{dep.blockedBy.title}</span>
                <Badge variant={STATUS_VARIANT[dep.blockedBy.status] ?? "muted"}>{dep.blockedBy.status.replace("_", " ")}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add blocker (managers only) */}
      {canManage && (
        <div className="border-t border-border pt-4">
          <Label>Add a blocker</Label>
          <p className="mb-2 text-micro text-muted-foreground">Select a task that must be completed before this one can start.</p>
          <div className="flex gap-2">
            <Select value={blockerId} onChange={(e) => setBlockerId(e.target.value)} className="flex-1">
              <option value="">Select a task…</option>
              {availableTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.status.replace("_", " ")})
                </option>
              ))}
            </Select>
            <Button size="sm" variant="outline" onClick={addBlocker} disabled={adding || !blockerId}>
              <Link2 className="h-3.5 w-3.5" /> Link
            </Button>
          </div>
          {availableTasks.length === 0 && (
            <p className="mt-1.5 text-micro text-muted-foreground/60">No other tasks available to link.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Time tab — logged entries + estimate comparison
// ───────────────────────────────────────────────────────────

function TimeTab({ detail, estimateMins, totalLogged }: {
  detail: TaskDetail; estimateMins: number | null; totalLogged: number;
}) {
  const overEstimate = estimateMins !== null && totalLogged > estimateMins;
  const pct = estimateMins ? Math.min(100, Math.round((totalLogged / estimateMins) * 100)) : 0;

  return (
    <div className="p-4">
      {/* Summary card */}
      <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Total logged</p>
            <p className="text-h2 font-bold tnum">{formatDuration(totalLogged)}</p>
          </div>
          {estimateMins !== null && (
            <div className="text-right">
              <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Estimate</p>
              <p className="text-h3 font-semibold tnum text-muted-foreground">{formatDuration(estimateMins)}</p>
            </div>
          )}
        </div>
        {estimateMins !== null && (
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", overEstimate ? "bg-danger" : "bg-success")}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className={cn("mt-1 text-micro font-medium", overEstimate ? "text-danger" : "text-muted-foreground")}>
              {overEstimate
                ? `${formatDuration(totalLogged - estimateMins)} over estimate`
                : `${formatDuration(estimateMins - totalLogged)} remaining of estimate`}
            </p>
          </div>
        )}
      </div>

      {/* Log entries */}
      {detail.timeLogs.length === 0 ? (
        <p className="py-6 text-center text-caption text-muted-foreground">No time logged yet. Use the timer in the header to track work.</p>
      ) : (
        <div className="space-y-2">
          {detail.timeLogs.map((log) => {
            const isOpen = log.endedAt === null;
            return (
              <div key={log.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-micro font-bold", avatarColor(log.user.name))}>
                  {initials(log.user.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium">{log.user.name}</p>
                  <p className="text-micro text-muted-foreground">
                    {new Date(log.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {log.endedAt && ` → ${new Date(log.endedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
                  </p>
                  {log.note && <p className="mt-0.5 text-caption text-muted-foreground">{log.note}</p>}
                </div>
                <span className={cn("shrink-0 text-body font-bold tnum", isOpen && "text-warning")}>
                  {isOpen ? (
                    <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> running</span>
                  ) : (
                    formatDuration(log.durationMins ?? 0)
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
