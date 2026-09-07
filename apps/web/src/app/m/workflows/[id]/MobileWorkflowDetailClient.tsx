"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  Trash2,
  Clock,
  Loader2,
  ChevronLeft,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import {formatDate, formatRelativeTime} from "@/lib/utils";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { useMobileBack } from "@/components/mobile/v2/mobile-back-button";
import { DetailHeroCard, DetailKeyValueCard } from "@/components/mobile/v2/detail-primitives";

export type WorkflowDetail = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  schedule: {
    intervalM: number | null;
    cron: string | null;
    enabled: boolean;
    nextRunAt: string | null;
  } | null;
};

export type WorkflowRunRow = {
  id: string;
  status: string;
  currentStep: number | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  triggeredBy: string | null;
  createdAt: string;
};

const STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  ACTIVE: { color: "var(--color-go)", bg: "color-mix(in srgb, var(--color-go) 10%, transparent)", label: "Active" },
  DRAFT: { color: "var(--color-ink-500)", bg: "var(--color-paper-2)", label: "Draft" },
  PAUSED: { color: "var(--color-warning, #f59e0b)", bg: "color-mix(in srgb, var(--color-warning, #f59e0b) 10%, transparent)", label: "Paused" },
  ARCHIVED: { color: "var(--color-ink-400)", bg: "var(--color-paper-2)", label: "Archived" },
};

const RUN_STATUS_ICONS: Record<string, React.ReactNode> = {
  COMPLETED: <CheckCircle className="size-3" style={{ color: "var(--color-go)" }} />,
  FAILED: <XCircle className="size-3" style={{ color: "var(--color-danger, #ef4444)" }} />,
  RUNNING: <Loader2 className="size-3 animate-spin" style={{ color: "var(--color-steel)" }} />,
  PENDING: <Clock className="size-3" style={{ color: "var(--color-ink-400)" }} />,
};

function statusStyle(status: string) {
  return STATUS_STYLES[status.toUpperCase()] ?? { color: "var(--color-ink-500)", bg: "var(--color-paper-2)", label: status };
}

function scheduleLabel(w: WorkflowDetail): string {
  if (w.schedule?.intervalM) {
    const m = w.schedule.intervalM;
    if (m >= 1440 && m % 1440 === 0) return `every ${m / 1440}d`;
    if (m >= 60 && m % 60 === 0) return `every ${m / 60}h`;
    return `every ${m}m`;
  }
  if (w.schedule?.cron) return `cron: ${w.schedule.cron}`;
  return "Manual";
}

export function MobileWorkflowDetailClient({
  workflow,
  runs,
  canManage,
}: {
  workflow: WorkflowDetail;
  runs: WorkflowRunRow[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const goBack = useMobileBack("/m/workflows");
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const st = statusStyle(workflow.status);

  async function handleRun() {
    setRunning(true);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}/runs`, { method: "POST" });
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
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete");
      }
      toast.success("Workflow deleted");
      router.push("/m/workflows");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 border-b px-4 py-3"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <button onClick={goBack} className="text-m-body press p-1 -ml-1">
            <ChevronLeft className="size-5" style={{ color: "var(--color-ink-500)" }} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-m-section font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
              {workflow.name}
            </p>
          </div>
          <span
            className="text-m-caption font-bold uppercase px-1.5 py-0.5 rounded-[0.25rem] shrink-0"
            style={{ color: st.color, backgroundColor: st.bg }}
          >
            {st.label}
          </span>
        </div>
      </div>

      <div className="p-3 space-y-4">
        {/* Info card */}
        <DetailKeyValueCard
          entries={[
            { label: "Schedule", value: scheduleLabel(workflow) },
            { label: "Created", value: formatDate(workflow.createdAt) },
            ...(workflow.schedule?.nextRunAt
              ? [{ label: "Next run", value: formatRelativeTime(new Date(workflow.schedule.nextRunAt)) }]
              : []),
          ]}
        />
        {workflow.description && (
          <p className="text-m-body -mt-2" style={{ color: "var(--color-ink-700)" }}>
            {workflow.description}
          </p>
        )}

        {/* Actions */}
        {canManage && (
          <div className="flex flex-col gap-2">
            <button
              onClick={handleRun}
              disabled={running}
              className="w-full h-11 rounded-[0.5rem] text-m-section font-bold flex items-center justify-center gap-1.5 press"
              style={{ backgroundColor: "var(--color-steel)", color: "var(--color-paper)" }}
            >
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {running ? "Running…" : "Run Now"}
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
              className="h-11 px-4 rounded-[0.5rem] text-m-section font-bold flex items-center gap-1.5 press"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-danger, #ef4444) 10%, transparent)", color: "var(--color-danger, #ef4444)" }}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}

        {/* Run history */}
        <div>
          <p className="text-m-caption font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-steel)" }}>
            Run History ({runs.length})
          </p>
          {runs.length === 0 ? (
            <MobileEmptyState
              icon={Clock}
              title="No runs yet"
              description="This workflow hasn't been executed yet."
              size="compact"
            />
          ) : (
            <div className="space-y-2">
              {runs.map((r) => (
                <div
                  key={r.id}
                  className="rounded-[0.5rem] border p-2.5"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {RUN_STATUS_ICONS[r.status.toUpperCase()] ?? <AlertCircle className="size-3" style={{ color: "var(--color-ink-400)" }} />}
                      <span className="text-m-label font-bold uppercase" style={{ color: "var(--color-ink-950)" }}>
                        {r.status}
                      </span>
                    </div>
                    <span className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
                      {formatRelativeTime(new Date(r.createdAt))}
                    </span>
                  </div>
                  {r.error && (
                    <p className="text-m-caption mt-1 line-clamp-2" style={{ color: "var(--color-danger, #ef4444)" }}>
                      {r.error}
                    </p>
                  )}
                  {r.triggeredBy && (
                    <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                      by {r.triggeredBy}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <MobileDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete workflow">
            <p className="text-m-body mb-4" style={{ color: "var(--color-ink-500)" }}>
              Delete &ldquo;{workflow.name}&rdquo;? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 h-10 rounded-[0.5rem] text-m-section font-medium press"
                style={{ color: "var(--color-ink-500)" }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 h-10 rounded-[0.5rem] text-m-section font-bold flex items-center gap-1.5 press"
                style={{ backgroundColor: "var(--color-danger, #ef4444)", color: "var(--color-paper)" }}
              >
                {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
      </MobileDialog>
    </div>
  );
}
