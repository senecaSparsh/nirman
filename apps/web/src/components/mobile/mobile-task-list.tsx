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
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { MobileEmptyState, MobileCta, MobileStatusBadge } from "@/components/mobile/v2/primitives";

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
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
      setTaskStates((s) => ({ ...s, [task.id]: "idle" }));
    }
  }

  const sections = [
    { status: "IN_PROGRESS", label: "In Progress", icon: Play, tone: "var(--color-signal-dark)" },
    { status: "PENDING", label: "Pending", icon: Clock, tone: "var(--color-ink-500)" },
    { status: "BLOCKED", label: "Blocked", icon: AlertTriangle, tone: "var(--color-stop)" },
  ];

  return (
    <div>
      {tasks.length > 0 && (
        <>
          {/* ── Sticky search header ── */}
          <div
            className="sticky top-0 z-20 border-b backdrop-blur-sm -mx-3.5 px-3.5 py-2 mb-2"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-paper) 95%, transparent)",
              borderColor: "var(--color-line)",
            }}
          >
            {/* Search row */}
            <div className="relative mb-2">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 size-4"
                style={{ color: "var(--color-ink-500)" }}
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title…"
                className="w-full h-9 rounded-[0.625rem] border-2 pl-9 pr-9 text-[0.8125rem] focus:outline-none"
                style={{
                  borderColor: query ? "var(--color-ink-950)" : "var(--color-line)",
                  backgroundColor: "var(--color-paper)",
                  color: "var(--color-ink-950)",
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 press"
                  aria-label="Clear"
                >
                  <X className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
                </button>
              )}
            </div>

            {/* Filter chips */}
            <div className="-mx-3.5 px-3.5 overflow-x-auto scrollbar-hide">
              <div className="flex gap-1.5 w-max items-center">
                {FILTER_CHIPS.map((chip) => {
                  const isActive = chip.value === statusFilter;
                  return (
                    <button
                      key={chip.value}
                      type="button"
                      onClick={() => { setStatusFilter(chip.value); haptic(10); }}
                      className="h-7 shrink-0 rounded-full border px-3 text-[0.5625rem] font-bold press"
                      style={{
                        borderColor: isActive ? "var(--color-ink-950)" : "var(--color-line)",
                        backgroundColor: isActive ? "var(--color-ink-950)" : "var(--color-paper)",
                        color: isActive ? "#fff" : "var(--color-ink-500)",
                      }}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
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
              <h2
                className="text-[0.5625rem] font-bold uppercase tracking-wide pb-1.5 pt-4"
                style={{ color: "var(--color-ink-500)" }}
              >
                {label} ({items.length})
              </h2>
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
                  <CheckSquare className="mb-2 size-6" style={{ color: "var(--color-ink-300)" }} />
                  <p className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                    No {label.toLowerCase()} tasks
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
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
          hint="New assignments from your admin appear here. Pull to refresh or tap below to check for updates."
          action={
            <MobileCta href="/m/tasks" icon={CheckSquare} variant="secondary">
              Refresh Tasks
            </MobileCta>
          }
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
      <h2
        className="text-[0.5625rem] font-bold uppercase tracking-wide pb-1.5 pt-3"
        style={{ color: "var(--color-ink-500)" }}
      >
        Results ({visible.length})
      </h2>
      <div className="flex flex-col gap-2">
        {visible.map((task) => {
          const sectionIcon =
            task.status === "IN_PROGRESS"
              ? Play
              : task.status === "BLOCKED"
                ? AlertTriangle
                : Clock;
          const sectionTone =
            task.status === "IN_PROGRESS"
              ? "var(--color-signal-dark)"
              : task.status === "BLOCKED"
                ? "var(--color-stop)"
                : "var(--color-ink-500)";
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
    <div
      className="rounded-[0.625rem] border overflow-hidden"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      {/* Header row — tap to expand */}
      <button
        onClick={onToggle}
        disabled={state === "updating"}
        className="flex w-full items-center gap-2.5 p-2.5 text-left press"
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-[0.375rem]"
          style={{ backgroundColor: "var(--color-concrete)" }}
        >
          <Icon className="size-4" style={{ color: tone }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
            {task.title}
          </div>
          <div className="truncate text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
            {task.priority}
            {task.dueDate && (
              <span style={{ color: isOverdue ? "var(--color-stop)" : undefined }}>
                {" · due "}{formatDate(task.dueDate)}
              </span>
            )}
          </div>
        </div>
        <MobileStatusBadge status={task.status} />
        {isOpen ? (
          <ChevronDown className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
        )}
      </button>

      {/* Expanded detail + actions */}
      {isOpen && (
        <div className="px-2.5 pb-2.5">
          {task.description && (
            <div
              className="mb-2.5 rounded-[0.375rem] border p-2.5 text-[0.5625rem]"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
            >
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
  const baseCls = "flex flex-1 items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-[0.6875rem] font-bold press disabled:opacity-50";
  const variantStyle: React.CSSProperties =
    variant === "success"
      ? { backgroundColor: "var(--color-go)", color: "#fff", borderColor: "var(--color-go)" }
      : variant === "primary"
        ? { backgroundColor: "var(--color-ink-950)", color: "#fff", borderColor: "var(--color-ink-950)" }
        : { backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)", borderColor: "var(--color-line)" };

  return (
    <button
      onClick={onClick}
      disabled={state === "updating"}
      className={`${baseCls} border-2`}
      style={variantStyle}
    >
      {state === "updating" ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Icon className="size-3.5" />
      )}
      {label}
    </button>
  );
}
