"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw, Loader2, WifiOff, CheckCircle2, XCircle, AlertTriangle,
  Package, Send, ShoppingCart, ArrowRightLeft, ClipboardCheck, Undo2,
  ChevronLeft, Trash2,
} from "lucide-react";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { formatRelativeTime } from "@/lib/utils";
import { clearCompleted } from "@/lib/offline/queue";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import type { QueuedOperation } from "@/lib/offline/queue";

const KIND_LABELS: Record<QueuedOperation["kind"], { label: string; icon: typeof Package }> = {
  "goods-receipt": { label: "Goods Receipt", icon: Package },
  "material-issue": { label: "Material Issue", icon: Send },
  "stock-transfer": { label: "Stock Transfer", icon: ArrowRightLeft },
  "material-sale": { label: "Material Sale", icon: ShoppingCart },
  "requisition": { label: "Requisition", icon: ClipboardCheck },
  "stock-count": { label: "Stock Count", icon: ClipboardCheck },
  "supplier-return": { label: "Supplier Return", icon: Undo2 },
  "purchase-order": { label: "Purchase Order", icon: ShoppingCart },
};

const STATUS_STYLES: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
  PENDING: { color: "var(--color-signal-dark)", icon: WifiOff, label: "Pending" },
  SYNCING: { color: "var(--color-steel)", icon: Loader2, label: "Syncing" },
  COMPLETED: { color: "var(--color-go)", icon: CheckCircle2, label: "Completed" },
  FAILED: { color: "var(--color-stop)", icon: XCircle, label: "Failed" },
};

export function MobileOfflineQueueClient() {
  const router = useRouter();
  const { queue, pending, online, syncing, sync, refresh } = useOfflineQueue();
  const [clearing, setClearing] = useState(false);

  async function handleClearCompleted() {
    haptic(10);
    setClearing(true);
    try {
      await clearCompleted();
      await refresh();
      toast.success("Completed operations cleared");
    } catch {
      toast.error("Failed to clear completed operations");
    } finally {
      setClearing(false);
    }
  }

  const completedCount = queue.filter((op) => op.status === "COMPLETED").length;
  const failedCount = queue.filter((op) => op.status === "FAILED").length;

  return (
    <div className="space-y-4 p-4">
      {/* Back */}
      <div>
        <button onClick={() => router.back()} className="flex items-center" style={{ color: "var(--color-ink-700)" }}>
          <ChevronLeft className="size-5" />
        </button>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-[1rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
          Offline Queue
        </h1>
        <p className="text-[0.6875rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
          {pending > 0
            ? `${pending} operation${pending > 1 ? "s" : ""} waiting to sync`
            : online
              ? "All caught up — no pending operations"
              : "You're offline. Operations will sync when back online."}
        </p>
      </div>

      {/* Status bar */}
      <div
        className="flex items-center gap-2 rounded-[0.625rem] border p-3"
        style={{
          borderColor: online ? "color-mix(in srgb, var(--color-go) 30%, transparent)" : "color-mix(in srgb, var(--color-signal) 30%, transparent)",
          backgroundColor: online ? "color-mix(in srgb, var(--color-go) 5%, transparent)" : "color-mix(in srgb, var(--color-signal) 5%, transparent)",
        }}
      >
        {online ? (
          <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--color-go)" }} />
        ) : (
          <WifiOff className="size-4 shrink-0" style={{ color: "var(--color-signal-dark)" }} />
        )}
        <span className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
          {online ? "Online" : "Offline"}
        </span>
        {pending > 0 && online ? (
          <button
            onClick={() => { haptic(10); void sync(); }}
            disabled={syncing}
            className="ml-auto flex items-center gap-1 rounded-[0.375rem] px-2.5 py-1 text-[0.625rem] font-bold press active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            {syncing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
        ) : null}
      </div>

      {/* Failed operations warning */}
      {failedCount > 0 ? (
        <div
          className="flex items-start gap-2 rounded-[0.625rem] border p-3"
          style={{
            borderColor: "color-mix(in srgb, var(--color-stop) 30%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--color-stop) 5%, transparent)",
          }}
        >
          <AlertTriangle className="size-4 shrink-0 mt-0.5" style={{ color: "var(--color-stop)" }} />
          <div>
            <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
              {failedCount} failed operation{failedCount > 1 ? "s" : ""}
            </p>
            <p className="text-[0.625rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
              These were rejected by the server. Review the errors below — you may need to redo these operations from the relevant form.
            </p>
          </div>
        </div>
      ) : null}

      {/* Queue list */}
      {queue.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-16 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <CheckCircle2 className="size-8 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            Queue is empty
          </p>
          <p className="text-[0.6875rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
            Operations created while offline will appear here
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {queue.map((op) => {
            const kindInfo = KIND_LABELS[op.kind];
            const statusInfo = STATUS_STYLES[op.status] ?? STATUS_STYLES.PENDING!;
            const KindIcon = kindInfo.icon;
            const StatusIcon = statusInfo.icon;
            return (
              <div
                key={op.id}
                className="rounded-[0.625rem] border p-3"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className="grid place-items-center size-8 rounded-[0.5rem] shrink-0"
                    style={{ backgroundColor: "var(--color-paper-2)" }}
                  >
                    <KindIcon className="size-4" style={{ color: "var(--color-ink-700)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                        {kindInfo.label}
                      </p>
                      <span
                        className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase tracking-wide"
                        style={{ color: statusInfo.color }}
                      >
                        <StatusIcon className={`size-2.5 ${op.status === "SYNCING" ? "animate-spin" : ""}`} />
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-[0.5625rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                      {formatRelativeTime(new Date(op.createdAt))}
                      {op.attempts > 0 ? ` · ${op.attempts} attempt${op.attempts > 1 ? "s" : ""}` : ""}
                    </p>
                    {op.error ? (
                      <p className="text-[0.5625rem] mt-1 font-medium" style={{ color: "var(--color-stop)" }}>
                        {op.error}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Clear completed */}
      {completedCount > 0 ? (
        <button
          onClick={handleClearCompleted}
          disabled={clearing}
          className="flex items-center justify-center gap-1.5 w-full h-10 rounded-[0.5rem] border font-bold text-[0.75rem] press active:scale-95 disabled:opacity-50"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
        >
          {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Clear {completedCount} completed
        </button>
      ) : null}
    </div>
  );
}
