"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import {
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  description: string | null;
}

type TaskStatusFilter = "ALL" | "PENDING" | "IN_PROGRESS" | "BLOCKED";
type ActionState = "idle" | "updating" | "done";

const FILTER_CHIPS: { label: string; value: TaskStatusFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Blocked", value: "BLOCKED" },
];

// ── Component ───────────────────────────────────────────────────

export function MobileTaskList({ tasks }: { tasks: TaskItem[] }) {
  const router = useRouter();
  const [taskStates, setTaskStates] = useState<Record<string, ActionState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("ALL");

  const isFiltering = query.trim() !== "" || statusFilter !== "ALL";

  const filtered = useMemo(() => {
    let result = tasks;
    if (statusFilter !== "ALL") {
      result = result.filter((t) => t.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((t) => t.title.toLowerCase().includes(q));
    }
    return result;
  }, [tasks, query, statusFilter]);

  const byStatus = (status: string) =>
    filtered.filter((t) => {
      const s = taskStates[t.id];
      // Hide tasks that were just completed/cancelled
      if (s === "done" && (t.status === "PENDING" || t.status === "IN_PROGRESS" || t.status === "BLOCKED")) return false;
      return t.status === status;
    });

  async function updateStatus(task: TaskItem, status: string, label: string) {
    haptic(status === "COMPLETED" ? 30 : 10);
    setTaskStates((s) => ({ ...s, [task.id]: "updating" }));
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update task");
      toast.success(label);
      setTaskStates((s) => ({ ...s, [task.id]: "done" }));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
      setTaskStates((s) => ({ ...s, [task.id]: "idle" }));
    }
  }

  const sections = [
    { status: "IN_PROGRESS", label: "In Progress", icon: Play, tone: "text-info" },
    { status: "PENDING", label: "Pending", icon: Clock, tone: "text-muted-foreground" },
    { status: "BLOCKED", label: "Blocked", icon: AlertTriangle, tone: "text-danger" },
  ];

  return (
    <div>
      {tasks.length > 0 && (
        <>
          <MobileSearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search by title…"
          />

          <MobileFilterChips
            chips={FILTER_CHIPS}
            active={statusFilter}
            onChange={setStatusFilter}
          />
        </>
      )}

      {isFiltering ? (
        <FilteredView
          items={filtered}
          taskStates={taskStates}
          expanded={expanded}
          setExpanded={setExpanded}
          updateStatus={updateStatus}
        />
      ) : (
        sections.map(({ status, label, icon: Icon, tone }) => {
          const items = byStatus(status);
          return (
            <div key={status}>
              <h2 className="px-4 pb-1.5 pt-5 text-label text-muted-foreground/75">
                {label} ({items.length})
              </h2>
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
                  <CheckSquare className="mb-2 h-7 w-7 text-muted-foreground/40" />
                  <p className="text-meta text-muted-foreground">No {label.toLowerCase()} tasks</p>
                </div>
              ) : (
                <div>
                  {items.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      icon={Icon}
                      tone={tone}
                      isOpen={expanded === task.id}
                      state={taskStates[task.id] ?? "idle"}
                      onToggle={() => setExpanded(expanded === task.id ? null : task.id)}
                      updateStatus={updateStatus}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {tasks.length === 0 && (
        <MobileEmptyState
          icon={CheckSquare}
          title="No open tasks"
          hint="New assignments from your admin appear here"
        />
      )}

      {tasks.length > 0 && isFiltering && filtered.length === 0 && (
        <MobileEmptyState
          icon={CheckSquare}
          title="No matching tasks"
          hint="Try a different search or filter"
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
 * Filtered view — flat list when a search or filter is active.
 * ---------------------------------------------------------------- */
function FilteredView({
  items,
  taskStates,
  expanded,
  setExpanded,
  updateStatus,
}: {
  items: TaskItem[];
  taskStates: Record<string, ActionState>;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  updateStatus: (task: TaskItem, status: string, label: string) => void;
}) {
  const visible = items.filter((t) => {
    const s = taskStates[t.id];
    if (s === "done" && (t.status === "PENDING" || t.status === "IN_PROGRESS" || t.status === "BLOCKED")) return false;
    return true;
  });

  return (
    <div>
      <h2 className="px-4 pb-1.5 pt-3 text-label text-muted-foreground/75">
        Results ({visible.length})
      </h2>
      {visible.map((task) => {
        const sectionIcon =
          task.status === "IN_PROGRESS"
            ? Play
            : task.status === "BLOCKED"
              ? AlertTriangle
              : Clock;
        const sectionTone =
          task.status === "IN_PROGRESS"
            ? "text-info"
            : task.status === "BLOCKED"
              ? "text-danger"
              : "text-muted-foreground";
        return (
          <TaskRow
            key={task.id}
            task={task}
            icon={sectionIcon}
            tone={sectionTone}
            isOpen={expanded === task.id}
            state={taskStates[task.id] ?? "idle"}
            onToggle={() => setExpanded(expanded === task.id ? null : task.id)}
            updateStatus={updateStatus}
          />
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------
 * Single task row — expandable with status badge + action buttons.
 * ---------------------------------------------------------------- */
function TaskRow({
  task,
  icon: Icon,
  tone,
  isOpen,
  state,
  onToggle,
  updateStatus,
}: {
  task: TaskItem;
  icon: typeof Play;
  tone: string;
  isOpen: boolean;
  state: ActionState;
  onToggle: () => void;
  updateStatus: (task: TaskItem, status: string, label: string) => void;
}) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
  return (
    <div className="border-b border-border/70 bg-card">
      {/* Header row — tap to expand */}
      <button
        onClick={onToggle}
        disabled={state === "updating"}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left transition-colors active:bg-accent"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className={cn("h-4 w-4", tone)} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-semibold text-foreground">{task.title}</div>
          <div className="truncate text-caption text-muted-foreground">
            {task.priority}
            {task.dueDate && (
              <span className={cn("ml-1", isOverdue && "text-danger")}>
                · due {formatDate(task.dueDate)}
              </span>
            )}
          </div>
        </div>
        <MobileStatusBadge status={task.status} />
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
        )}
      </button>

      {/* Expanded detail + actions */}
      {isOpen && (
        <div className="px-4 pb-4">
          {task.description && (
            <div className="mb-3 rounded-md border border-border bg-background p-3 text-meta text-foreground">
              {task.description}
            </div>
          )}

          {/* Action buttons — context-dependent on current status */}
          <div className="flex gap-2">
            {task.status === "PENDING" && (
              <ActionButton
                onClick={() => updateStatus(task, "IN_PROGRESS", "Task started")}
                state={state}
                icon={Play}
                label="Start"
                variant="primary"
              />
            )}
            {task.status === "IN_PROGRESS" && (
              <ActionButton
                onClick={() => updateStatus(task, "COMPLETED", "Task completed")}
                state={state}
                icon={CheckCircle2}
                label="Complete"
                variant="success"
              />
            )}
            {task.status === "BLOCKED" && (
              <ActionButton
                onClick={() => updateStatus(task, "IN_PROGRESS", "Task unblocked — resuming")}
                state={state}
                icon={Play}
                label="Resume"
                variant="primary"
              />
            )}
            {/* Cancel — available for pending/in-progress */}
            {(task.status === "PENDING" || task.status === "IN_PROGRESS") && (
              <ActionButton
                onClick={() => updateStatus(task, "CANCELLED", "Task cancelled")}
                state={state}
                icon={XCircle}
                label="Cancel"
                variant="outline"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Action button ───────────────────────────────────────────────

function ActionButton({
  onClick,
  state,
  icon: Icon,
  label,
  variant,
}: {
  onClick: () => void;
  state: ActionState;
  icon: typeof Play;
  label: string;
  variant: "primary" | "success" | "outline";
}) {
  const cls = cn(
    "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-body font-semibold transition-colors active:scale-[0.99] disabled:opacity-50",
    variant === "success" && "bg-success text-white shadow-raised",
    variant === "primary" && "bg-primary text-primary-foreground shadow-raised",
    variant === "outline" && "border border-border bg-card text-foreground",
  );
  return (
    <button onClick={onClick} disabled={state === "updating"} className={cls}>
      {state === "updating" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
      {label}
    </button>
  );
}
