"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, History, ChevronDown } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  timestamp: string;
};

const PAGE_SIZE = 50;

/**
 * UserActivityDialog — shows the audit trail for a specific user.
 * Displays actions performed by or on this user (role changes, scope
 * changes, permission updates, password resets, etc.)
 *
 * Paginated with "Load more" — fetches PAGE_SIZE entries at a time.
 */
export function UserActivityDialog({
  userId,
  userName,
  onClose,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);

  const loadEntries = useCallback(async (limit: number, offset: number) => {
    const res = await fetch(`/api/users/${userId}/activity?limit=${limit}&offset=${offset}`);
    const data = await res.json();
    return (data.entries ?? []) as AuditEntry[];
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const initial = await loadEntries(PAGE_SIZE, 0);
        if (cancelled) return;
        setEntries(initial);
        setHasMore(initial.length === PAGE_SIZE);
      } catch {
        // silent fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadEntries]);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const more = await loadEntries(PAGE_SIZE, entries.length);
      setEntries((prev) => [...prev, ...more]);
      setHasMore(more.length === PAGE_SIZE);
    } catch {
      // silent fail
    } finally {
      setLoadingMore(false);
    }
  }

  function formatAction(action: string): { label: string; variant: "default" | "outline" | "success" | "warning" | "danger" | "muted" } {
    if (action.includes("CREATE")) return { label: action, variant: "success" };
    if (action.includes("DELETE") || action.includes("DEACTIVATE") || action.includes("REJECT") || action.includes("CANCEL")) return { label: action, variant: "danger" };
    if (action.includes("UPDATE") || action.includes("CHANGE") || action.includes("ASSIGN")) return { label: action, variant: "warning" };
    if (action.includes("APPROVE") || action.includes("ACTIVATE")) return { label: action, variant: "success" };
    if (action.includes("CLEANUP") || action.includes("AUTO")) return { label: action, variant: "outline" };
    return { label: action, variant: "muted" };
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  }

  function summarizeChange(entry: AuditEntry): string {
    const before = entry.before as Record<string, unknown> | null;
    const after = entry.after as Record<string, unknown> | null;
    if (!after) return "";
    if (after.role && before?.role) return `${before.role} → ${after.role}`;
    if (after.scopeType) return `scope: ${after.scopeType}`;
    if (after.active !== undefined && before?.active !== undefined) {
      return `${before.active ? "active" : "inactive"} → ${after.active ? "active" : "inactive"}`;
    }
    if (Array.isArray(after.permissions)) return `${after.permissions.length} permission(s)`;
    if (after.permissions !== undefined) return "permissions updated";
    if (after.scopeEntryCount) return `${after.scopeEntryCount} scope entries`;
    if (after.sessionsRevoked) return `${after.sessionsRevoked} sessions revoked`;
    if (after.tasksCancelled) return `${after.tasksCancelled} tasks cancelled`;
    if (after.projectAssignmentsRemoved) return `${after.projectAssignmentsRemoved} assignments removed`;
    if (after.unassignedCount) return `${after.unassignedCount} items unassigned`;
    return "";
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Activity Log — ${userName}`}
      description={`${entries.length} action${entries.length !== 1 ? "s" : ""} shown. Most recent first.`}
      className="max-w-lg"
    >
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="py-8 text-center">
          <History className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-body text-muted-foreground">No activity recorded yet.</p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {entries.map((entry) => {
              const { label, variant } = formatAction(entry.action);
              const change = summarizeChange(entry);
              return (
                <div key={entry.id} className="flex items-start gap-3 rounded-md border border-border p-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={variant} className="text-[10px] py-0 px-1.5">{label}</Badge>
                      <span className="text-caption text-muted-foreground">{entry.entityType}</span>
                    </div>
                    {change && (
                      <p className="text-caption text-foreground mt-1 font-mono">{change}</p>
                    )}
                  </div>
                  <span className="text-caption text-muted-foreground shrink-0">{formatTime(entry.timestamp)}</span>
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-3">
              <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
