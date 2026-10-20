"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2, XCircle, Clock, Loader2, Download, ArrowDownToLine, ArrowUpDown, AlertTriangle, Inbox, AlertCircle, Settings, FileClock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardToolbar } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/page";
import Link from "next/link";

type TallyStats = {
  total: number;
  synced: number;
  failed: number;
  pending: number;
  imported?: number;
  variance?: number;
  configured?: boolean;
};

export function TallySyncPanel({ stats }: { stats: TallyStats }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [syncMode, setSyncMode] = useState<"push" | "pull" | "both" | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
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

  async function autoSync() {
    setAutoSyncing(true);
    try {
      const res = await fetch("/api/tally/auto-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Auto-sync failed");
      toast.success(`Auto-synced ${data.synced ?? 0} entries${data.failed > 0 ? `, ${data.failed} failed` : ""}`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Auto-sync failed");
    } finally {
      setAutoSyncing(false);
    }
  }

  return (
    <Card>
      <CardHeader divided>
        <CardToolbar className="flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="flex items-center gap-2">
                <Download className="size-4 text-muted-foreground" />
                Tally Sync
              </CardTitle>
              {stats.configured ? (
                <Badge variant="success" className="text-[10px]">
                  <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Connected
                </Badge>
              ) : (
                <Badge variant="warning" className="text-[10px]">
                  <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> Not configured
                </Badge>
              )}
            </div>
            <CardDescription className="mt-0.5">
              Two-way sync with Tally ERP — push vouchers out, pull vouchers in.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {!stats.configured && (
              <Link href="/settings?tab=integrations">
                <Button size="sm" variant="outline">
                  <Settings className="size-3.5" /> Configure
                </Button>
              </Link>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={autoSync}
              disabled={autoSyncing || !stats.configured}
              title="Automatically sync all pending entries to Tally"
            >
              {autoSyncing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
              Auto-sync
            </Button>
            <Button size="sm" variant="outline" onClick={loadLog}>
              View Log
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                // FY-to-date (Apr 1 → today) — the range a CA actually wants.
                // File import path: works without a live Tally connection.
                const now = new Date();
                const fyStart = `${now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear()}-04-01`;
                const to = now.toISOString().slice(0, 10);
                window.open(`/api/export?type=tally-xml&format=xml&from=${fyStart}&to=${to}`, "_blank");
              }}
              title="Download all vouchers as a Tally import file (FY to date)"
            >
              <Download className="size-3.5" /> Export XML
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => sync("pull")}
              disabled={syncing}
            >
              {syncing && syncMode === "pull" ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowDownToLine className="size-3.5" />}
              Pull
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => sync("both")}
              disabled={syncing}
            >
              {syncing && syncMode === "both" ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUpDown className="size-3.5" />}
              Two-way
            </Button>
            <Button
              size="sm"
              onClick={() => sync("push")}
              disabled={syncing || (stats.pending === 0 && stats.failed === 0)}
              title={stats.pending === 0 && stats.failed === 0 ? "No pending or failed entries to push — all journal entries are already synced." : undefined}
            >
              {syncing && syncMode === "push" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Push {stats.pending > 0 ? `(${stats.pending})` : stats.failed > 0 ? `(${stats.failed} retry)` : ""}
            </Button>
          </div>
        </CardToolbar>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 rounded-md border border-border bg-subtle/40 px-3.5 py-2">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            <span className="tnum text-body font-medium">{stats.synced}</span>
            <span className="text-caption text-muted-foreground">synced</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-warning" />
            <span className="tnum text-body font-medium">{stats.pending}</span>
            <span className="text-caption text-muted-foreground">pending</span>
          </div>
          {stats.failed > 0 && (
            <div className="flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5 text-danger" />
              <span className="tnum text-body font-medium">{stats.failed}</span>
              <span className="text-caption text-muted-foreground">failed</span>
            </div>
          )}
          {stats.imported != null && stats.imported > 0 && (
            <div className="flex items-center gap-1.5">
              <Inbox className="h-3.5 w-3.5 text-info" />
              <span className="tnum text-body font-medium">{stats.imported}</span>
              <span className="text-caption text-muted-foreground">imported</span>
            </div>
          )}
          {stats.variance != null && stats.variance > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              <span className="tnum text-body font-medium">{stats.variance}</span>
              <span className="text-caption text-muted-foreground">variance</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-caption text-muted-foreground">Total entries:</span>
            <span className="tnum text-body font-medium">{stats.total}</span>
          </div>
        </div>

        {showLog && (
          <div className="border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-caption font-semibold text-muted-foreground">Sync Log</h4>
              <Button size="sm" variant="ghost" onClick={() => setShowLog(false)}>Close</Button>
            </div>
            {logs.length === 0 ? (
              <EmptyState size="compact" icon={<FileClock />} title="No sync records yet" description="Journal entries synced to Tally will appear here." />
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
      </CardContent>
    </Card>
  );
}
