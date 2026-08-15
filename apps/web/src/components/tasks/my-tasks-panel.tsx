"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2, Circle, AlertCircle, PlayCircle,
  Calendar, Flag, MessageSquare, Loader2,
  ClipboardList,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TaskDetailDrawer } from "@/components/tasks/task-detail-drawer";
import { usePermissions } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface MyTask {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  dueDateRaw: string | null;
  assignedBy: string | null;
  completedAt: string | null;
  createdAt: string;
}

const STATUS_CONFIG = {
  PENDING: { label: "Pending", icon: Circle, color: "#64748b" },
  IN_PROGRESS: { label: "In Progress", icon: PlayCircle, color: "#2563eb" },
  COMPLETED: { label: "Completed", icon: CheckCircle2, color: "#16a34a" },
  CANCELLED: { label: "Cancelled", icon: AlertCircle, color: "#ef4444" },
} as const;

const PRIORITY_CONFIG = {
  low: { label: "Low", color: "#64748b" },
  medium: { label: "Medium", color: "#0ea5e9" },
  high: { label: "High", color: "#f59e0b" },
  urgent: { label: "Urgent", color: "#ef4444" },
} as const;

function getStatusCfg(status: string) {
  return STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.PENDING;
}

function getPriCfg(priority: string) {
  return PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;
}

function dueDateStatus(dueDateRaw: string | null): { label: string; color: string; overdue: boolean } {
  if (!dueDateRaw) return { label: "No due date", color: "#64748b", overdue: false };
  const due = new Date(dueDateRaw);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, color: "#ef4444", overdue: true };
  if (diffDays === 0) return { label: "Due today", color: "#f59e0b", overdue: false };
  if (diffDays <= 3) return { label: `${diffDays}d left`, color: "#f59e0b", overdue: false };
  return { label: `${diffDays}d left`, color: "#64748b", overdue: false };
}

export function MyTasksPanel({ limit }: { limit?: number }) {
  const router = useRouter();
  const { userId, canAssignTasks } = usePermissions();
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/my-tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const updateStatus = async (taskId: string, status: string) => {
    setUpdating(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to update task");
      } else {
        toast.success(`Task marked as ${status.toLowerCase().replace("_", " ")}`);
        fetchTasks();
        router.refresh();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10 text-meta text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your tasks…
        </CardContent>
      </Card>
    );
  }

  const activeTasks = tasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS");
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED");
  const displayTasks = limit ? activeTasks.slice(0, limit) : activeTasks;

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <CheckCircle2 className="h-6 w-6 text-muted-foreground/40" />
          <p className="text-body text-muted-foreground">No tasks assigned to you.</p>
          <p className="text-caption text-muted-foreground/60">Tasks assigned by your manager will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          My Tasks
        </CardTitle>
        <Badge variant="warning">{activeTasks.length} active</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {displayTasks.map((task) => {
          const statusCfg = getStatusCfg(task.status);
          const priCfg = getPriCfg(task.priority);
          const ddStatus = dueDateStatus(task.dueDateRaw);
          const StatusIcon = statusCfg.icon;
          const isExpanded = expandedTask === task.id;

          return (
            <div
              key={task.id}
              className={cn(
                "rounded-lg border p-3 transition-colors",
                ddStatus.overdue && task.status !== "COMPLETED"
                  ? "border-danger/30 bg-danger/5"
                  : "border-border/60 hover:bg-muted/40",
              )}
            >
              <div className="flex items-start gap-3">
                {/* Status toggle button */}
                <button
                  onClick={() => {
                    if (task.status === "PENDING") updateStatus(task.id, "IN_PROGRESS");
                    else if (task.status === "IN_PROGRESS") updateStatus(task.id, "COMPLETED");
                    else updateStatus(task.id, "PENDING");
                  }}
                  disabled={updating === task.id}
                  className="mt-0.5 shrink-0"
                  title="Click to advance status"
                >
                  {updating === task.id ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    <StatusIcon className="h-5 w-5" style={{ color: statusCfg.color }} />
                  )}
                </button>

                {/* Task content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        onClick={() => setDrawerTaskId(task.id)}
                        className={cn("text-left text-body font-medium hover:text-primary hover:underline", task.status === "COMPLETED" && "text-muted-foreground line-through")}
                      >
                        {task.title}
                      </button>
                      {task.description && (
                        <p className="truncate text-caption text-muted-foreground">{task.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Flag className="h-3 w-3" style={{ color: priCfg.color }} />
                      <span className="text-caption" style={{ color: priCfg.color }}>{priCfg.label}</span>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
                    {task.assignedBy && (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> from {task.assignedBy}
                      </span>
                    )}
                    {task.dueDate && (
                      <span className="flex items-center gap-1" style={{ color: ddStatus.color }}>
                        <Calendar className="h-3 w-3" /> {ddStatus.label}
                      </span>
                    )}
                  </div>

                  {/* Instructions (expandable) */}
                  {task.instructions && (
                    <div className="mt-2">
                      <button
                        onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                        className="text-caption text-primary hover:underline"
                      >
                        {isExpanded ? "Hide guidance" : "Show guidance from admin"}
                      </button>
                      {isExpanded && (
                        <div className="mt-1.5 rounded-md bg-muted/50 p-2.5 text-body whitespace-pre-wrap">
                          {task.instructions}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons for active tasks */}
                  {task.status !== "COMPLETED" && (
                    <div className="mt-2 flex gap-2">
                      {task.status === "PENDING" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(task.id, "IN_PROGRESS")} disabled={updating === task.id}>
                          <PlayCircle className="h-3.5 w-3.5" /> Start
                        </Button>
                      )}
                      <Button size="sm" variant="success" onClick={() => updateStatus(task.id, "COMPLETED")} disabled={updating === task.id}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {limit && activeTasks.length > limit && (
          <div className="pt-2 text-center">
            <Button variant="ghost" size="sm" onClick={() => router.push("/my-tasks")}>
              View all {activeTasks.length} tasks →
            </Button>
          </div>
        )}

        {completedTasks.length > 0 && !limit && (
          <>
            <div className="pt-3 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
              Completed ({completedTasks.length})
            </div>
            {completedTasks.slice(0, 10).map((task) => {
              const statusCfg = getStatusCfg(task.status);
              const StatusIcon = statusCfg.icon;
              return (
                <div key={task.id} className="flex items-center gap-3 rounded-lg border border-border/40 p-2.5">
                  <StatusIcon className="h-4 w-4 shrink-0" style={{ color: statusCfg.color }} />
                  <span className="flex-1 truncate text-body text-muted-foreground line-through">{task.title}</span>
                  {task.completedAt && (
                    <span className="text-caption text-muted-foreground">{task.completedAt}</span>
                  )}
                </div>
              );
            })}
          </>
        )}
      </CardContent>

      <TaskDetailDrawer
        taskId={drawerTaskId}
        open={drawerTaskId !== null}
        onClose={() => setDrawerTaskId(null)}
        users={[]}
        canManage={canAssignTasks()}
        currentUserId={userId ?? ""}
      />
    </Card>
  );
}
