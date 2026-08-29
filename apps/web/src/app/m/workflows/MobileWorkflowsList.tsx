"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Workflow as WorkflowIcon,
  Play,
  Clock,
  Trash2,
  X,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { MobileLink as Link } from "@/components/mobile/mobile-link";
import {
  MobileSearchHeader,
  MobileNoResults,
  MobileSummaryStrip,
  MobileFab,
  type SummaryStat,
} from "@/components/mobile/v2/scaffold";
import { formatDate, formatRelativeTime, cn } from "@/lib/utils";

export type WorkflowListItem = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  status: string;
  runCount: number;
  nextRun: string | null;
  schedule: { intervalM?: number | null; cron?: string | null } | null;
  createdAt: string;
};

const STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  ACTIVE: { color: "var(--color-go)", bg: "color-mix(in srgb, var(--color-go) 10%, transparent)", label: "Active" },
  DRAFT: { color: "var(--color-ink-500)", bg: "var(--color-paper-2)", label: "Draft" },
  PAUSED: { color: "var(--color-warning, #f59e0b)", bg: "color-mix(in srgb, var(--color-warning, #f59e0b) 10%, transparent)", label: "Paused" },
  ARCHIVED: { color: "var(--color-ink-400)", bg: "var(--color-paper-2)", label: "Archived" },
};

function statusStyle(status: string) {
  return STATUS_STYLES[status.toUpperCase()] ?? { color: "var(--color-ink-500)", bg: "var(--color-paper-2)", label: status };
}

function scheduleLabel(w: WorkflowListItem): string {
  if (w.schedule?.intervalM) {
    const m = w.schedule.intervalM;
    if (m >= 1440 && m % 1440 === 0) return `every ${m / 1440}d`;
    if (m >= 60 && m % 60 === 0) return `every ${m / 60}h`;
    return `every ${m}m`;
  }
  if (w.schedule?.cron) return `cron: ${w.schedule.cron}`;
  return "Manual";
}

/**
 * Workflows list — automation chains with status, schedule, and run count.
 */
export function MobileWorkflowsList({
  items,
  canManage,
}: {
  items: WorkflowListItem[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [runTarget, setRunTarget] = useState<WorkflowListItem | null>(null);
  const [delTarget, setDelTarget] = useState<WorkflowListItem | null>(null);
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.description?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  const activeCount = items.filter((w) => w.status === "ACTIVE").length;
  const totalRuns = items.reduce((s, w) => s + w.runCount, 0);

  const summaryStats: SummaryStat[] = [
    { label: "Workflows", value: String(items.length) },
    { label: "Active", value: String(activeCount) },
    { label: "Total Runs", value: String(totalRuns) },
  ];

  async function handleRun(id: string) {
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
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/workflows/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete");
      }
      toast.success("Workflow deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
      setDelTarget(null);
    }
  }

  return (
    <div>
      <MobileSummaryStrip stats={summaryStats} />

      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search workflows…"
        showClear={!!query}
        onClear={() => setQuery("")}
      />

      {filtered.length === 0 ? (
        <MobileNoResults
          title={query ? "No matching workflows" : "No workflows yet"}
          hint={query
            ? "Try a different search"
            : canManage
              ? "Create your first workflow to automate repetitive tasks"
              : "Workflows will appear here once created"}
        />
      ) : (
        <div className="space-y-2 px-3.5">
          {filtered.map((w) => {
            const st = statusStyle(w.status);
            return (
              <Link
                key={w.id}
                href={`/m/workflows/${w.id}`}
                className="block rounded-[0.625rem] border p-3 active:scale-[0.98] transition-transform"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div className="flex items-start gap-2.5">
                  {/* Icon */}
                  <div
                    className="size-9 rounded-[0.5rem] text-m-body flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "color-mix(in srgb, var(--color-steel) 10%, transparent)" }}
                  >
                    <WorkflowIcon className="size-4" style={{ color: "var(--color-steel)" }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-m-section font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                        {w.name}
                      </p>
                      <span
                        className="text-m-caption font-bold uppercase px-1.5 py-0.5 rounded-[0.25rem] shrink-0"
                        style={{ color: st.color, backgroundColor: st.bg }}
                      >
                        {st.label}
                      </span>
                    </div>

                    {w.description && (
                      <p className="text-m-caption mt-0.5 line-clamp-1" style={{ color: "var(--color-ink-500)" }}>
                        {w.description}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-m-caption flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
                        <Clock className="size-2.5" />
                        {scheduleLabel(w)}
                      </span>
                      <span className="text-m-caption tabular-nums" style={{ color: "var(--color-steel)" }}>
                        {w.runCount} run{w.runCount !== 1 ? "s" : ""}
                      </span>
                      {w.nextRun && (
                        <span className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
                          next: {formatRelativeTime(new Date(w.nextRun))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                {canManage && (
                  <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t" style={{ borderColor: "var(--color-line)" }}>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRunTarget(w); }}
                      className="flex items-center gap-1 px-2 py-1 rounded-[0.375rem] text-m-caption font-medium press"
                      style={{ color: "var(--color-steel)" }}
                    >
                      <Play className="size-3" /> Run
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDelTarget(w); }}
                      className="flex items-center gap-1 px-2 py-1 rounded-[0.375rem] text-m-caption font-medium press"
                      style={{ color: "var(--color-danger, #ef4444)" }}
                    >
                      <Trash2 className="size-3" /> Delete
                    </button>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Create workflow FAB ── */}
      {canManage ? (
        <MobileFab href="/m/workflows/new" label="Create workflow" />
      ) : null}

      {/* ── Run confirmation dialog ── */}
      {runTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
          onClick={() => setRunTarget(null)}
        >
          <div
            className="w-full rounded-t-[0.75rem] mx-auto max-w-md p-4"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>Run workflow</p>
              <button onClick={() => setRunTarget(null)} className="text-m-body press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <p className="text-m-body mb-4" style={{ color: "var(--color-ink-500)" }}>
              Run &ldquo;{runTarget.name}&rdquo; now? This will execute every step in the workflow graph.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRunTarget(null)}
                className="px-4 h-10 rounded-[0.5rem] text-m-section font-medium press"
                style={{ color: "var(--color-ink-500)" }}
                disabled={running}
              >
                Cancel
              </button>
              <button
                onClick={() => handleRun(runTarget.id)}
                disabled={running}
                className="px-4 h-10 rounded-[0.5rem] text-m-section font-bold flex items-center gap-1.5 press"
                style={{ backgroundColor: "var(--color-steel)", color: "white" }}
              >
                {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                {running ? "Running…" : "Run now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation dialog ── */}
      {delTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
          onClick={() => setDelTarget(null)}
        >
          <div
            className="w-full rounded-t-[0.75rem] mx-auto max-w-md p-4"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>Delete workflow</p>
              <button onClick={() => setDelTarget(null)} className="text-m-body press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <p className="text-m-body mb-4" style={{ color: "var(--color-ink-500)" }}>
              Delete &ldquo;{delTarget.name}&rdquo;? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDelTarget(null)}
                className="px-4 h-10 rounded-[0.5rem] text-m-section font-medium press"
                style={{ color: "var(--color-ink-500)" }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(delTarget.id)}
                disabled={deleting}
                className="px-4 h-10 rounded-[0.5rem] text-m-section font-bold flex items-center gap-1.5 press"
                style={{ backgroundColor: "var(--color-danger, #ef4444)", color: "white" }}
              >
                {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
