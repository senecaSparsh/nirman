"use client";

import { useEffect, useState } from "react";
import { Loader2, History } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
};

/**
 * UserActivityDialog — shows the recent audit trail for a specific user.
 * Displays actions performed by or on this user (role changes, scope
 * changes, permission updates, password resets, etc.)
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
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/users/${userId}/activity?limit=50`);
        const data = await res.json();
        if (cancelled) return;
        setEntries(data.entries ?? []);
      } catch {
        // silent fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  function formatAction(action: string): { label: string; variant: "default" | "outline" | "success" | "warning" | "danger" | "muted" } {
    if (action.includes("CREATE")) return { label: action, variant: "success" };
    if (action.includes("DELETE") || action.includes("DEACTIVATE") || action.includes("REJECT")) return { label: action, variant: "danger" };
    if (action.includes("UPDATE") || action.includes("CHANGE") || action.includes("ASSIGN")) return { label: action, variant: "warning" };
    if (action.includes("APPROVE")) return { label: action, variant: "success" };
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
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  function summarizeChange(entry: AuditEntry): string {
    const before = entry.before as Record<string, unknown> | null;
    const after = entry.after as Record<string, unknown> | null;
    if (!after) return "";
    // Common patterns
    if (after.role && before?.role) return `${before.role} → ${after.role}`;
    if (after.scopeType) return `scope: ${after.scopeType}`;
    if (after.active !== undefined && before?.active !== undefined) {
      return `${before.active ? "active" : "inactive"} → ${after.active ? "active" : "inactive"}`;
    }
    if (Array.isArray(after.permissions)) return `${after.permissions.length} permission(s)`;
    if (after.permissions !== undefined) return "permissions updated";
    if (after.scopeEntryCount) return `${after.scopeEntryCount} scope entries`;
    return "";
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Activity Log — ${userName}`}
      description="Recent actions performed by or on this user. Most recent first."
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
                <span className="text-caption text-muted-foreground shrink-0">{formatTime(entry.createdAt)}</span>
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
