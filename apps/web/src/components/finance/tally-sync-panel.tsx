"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2, XCircle, Clock, Loader2, Download, ArrowDownToLine, ArrowUpDown, AlertTriangle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/page";

type TallyStats = {
  total: number;
  synced: number;
  failed: number;
  pending: number;
  imported?: number;
  variance?: number;
};

export function TallySyncPanel({ stats }: { stats: TallyStats }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [syncMode, setSyncMode] = useState<"push" | "pull" | "both" | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [logs, setLogs] = useState<Array<{
    id: string;
    entryNumber: string;
    sourceType: string;
    tallyVoucherType: string;
    tallyVoucherNumber: string | null;
    syncStatus: string;
    errorMessage: string | null;
    syncedAt: string | null;
  }>>([]);

  async function sync(direction: "push" | "pull" | "both") {
    setSyncing(true);
    setSyncMode(direction);
    try {
      const res = await fetch("/api/tally/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");

      // Build toast message based on direction
      if (direction === "push") {
        const push = data.push;
        toast.success(`Pushed ${push?.synced ?? 0} entries to Tally${push && push.failed > 0 ? `, ${push.failed} failed` : ""}`);
      } else if (direction === "pull") {
        const pull = data.pull;
        toast.success(`Imported ${pull?.imported ?? 0} vouchers from Tally${pull && pull.variances > 0 ? `, ${pull.variances} variances` : ""}${pull && pull.errors > 0 ? `, ${pull.errors} errors` : ""}`);
      } else {
        const push = data.push;
        const pull = data.pull;
        toast.success(`Two-way sync: pushed ${push?.synced ?? 0}, imported ${pull?.imported ?? 0}${pull && pull.variances > 0 ? `, ${pull.variances} variances` : ""}`);
      }
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
      setSyncMode(null);
    }
  }

  async function loadLog() {
    try {
      const res = await fetch("/api/tally/log");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load log");
      setLogs(data.rows ?? []);
      setShowLog(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Download className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-body font-semibold">Tally Sync</h3>
            <p className="text-caption text-muted-foreground">
              Two-way sync with Tally ERP — push vouchers out, pull vouchers in
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={loadLog}>
            View Log
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => sync("pull")}
            disabled={syncing}
          >
            {syncing && syncMode === "pull" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="mr-1 h-3.5 w-3.5" />}
            Pull
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => sync("both")}
            disabled={syncing}
          >
            {syncing && syncMode === "both" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ArrowUpDown className="mr-1 h-3.5 w-3.5" />}
            Two-way
          </Button>
          <Button
            size="sm"
            onClick={() => sync("push")}
            disabled={syncing || stats.pending === 0}
          >
            {syncing && syncMode === "push" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Push {stats.pending > 0 ? `(${stats.pending})` : ""}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span className="tnum text-body font-medium">{stats.synced}</span>
          <span className="text-caption text-muted-foreground">synced</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-warning" />
          <span className="tnum text-body font-medium">{stats.pending}</span>
          <span className="text-caption text-muted-foreground">pending</span>
        </div>
        {stats.failed > 0 && (
          <div className="flex items-center gap-1.5">
            <XCircle className="h-4 w-4 text-danger" />
            <span className="tnum text-body font-medium">{stats.failed}</span>
            <span className="text-caption text-muted-foreground">failed</span>
          </div>
        )}
        {stats.imported != null && stats.imported > 0 && (
          <div className="flex items-center gap-1.5">
            <Inbox className="h-4 w-4 text-info" />
            <span className="tnum text-body font-medium">{stats.imported}</span>
            <span className="text-caption text-muted-foreground">imported</span>
          </div>
        )}
        {stats.variance != null && stats.variance > 0 && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="tnum text-body font-medium">{stats.variance}</span>
            <span className="text-caption text-muted-foreground">variance</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-caption text-muted-foreground">Total entries:</span>
          <span className="tnum text-body">{stats.total}</span>
        </div>
      </div>

      {showLog && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-caption font-semibold text-muted-foreground">Sync Log</h4>
            <Button size="sm" variant="ghost" onClick={() => setShowLog(false)}>Close</Button>
          </div>
          {logs.length === 0 ? (
            <p className="text-caption text-muted-foreground py-4 text-center">No sync records yet.</p>
          ) : (
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {logs.map((l) => (
                <div key={l.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
                  <span className="font-mono text-micro text-muted-foreground">{l.entryNumber}</span>
                  <span className="text-caption">{l.sourceType}</span>
                  <StatusPill status={l.syncStatus} className="text-micro" />
                  {l.tallyVoucherNumber && (
                    <span className="font-mono text-micro text-muted-foreground">→ {l.tallyVoucherNumber}</span>
                  )}
                  {l.errorMessage && (
                    <span className="text-micro text-danger truncate">{l.errorMessage}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
