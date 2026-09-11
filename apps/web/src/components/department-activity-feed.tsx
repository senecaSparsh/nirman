"use client";

import { useState } from "react";
import useSWR from "swr";
import { ChevronDown, Activity, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { swrFetcher } from "@/lib/swr";
import { humanizeAction, relativeTime, DEPARTMENTS, type DepartmentKey } from "@/lib/department-activity";

interface ActivityRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userName: string | null;
  timestamp: string;
}

interface ActivityResponse {
  rows: ActivityRow[];
}

/**
 * DEPARTMENT ACTIVITY FEED
 *
 * A collapsible card that sits below the PageHeader on each department
 * dashboard. Shows a live feed of recent actions from the AuditLog, scoped
 * to the department. Polls every 60s when collapsed, 30s when expanded.
 *
 * Collapsed: a single-line "Live" chip with the count + latest action.
 * Expanded: a scrollable list of recent activity with relative timestamps.
 *
 * Data comes from /api/activity?department=X — a lightweight read over
 * the existing AuditLog table. No new infrastructure, no schema changes.
 * The feed respects the SWR offline config (isPaused when !navigator.onLine).
 */
export function DepartmentActivityFeed({ department }: { department: DepartmentKey }) {
  const [expanded, setExpanded] = useState(false);

  const { data, error, isLoading } = useSWR<ActivityResponse>(
    `/api/activity?department=${department}&limit=20`,
    swrFetcher,
    {
      // Poll slower when collapsed (60s) since the user only sees one line.
      // Poll faster when expanded (30s) since they're actively reading the list.
      refreshInterval: expanded ? 30000 : 60000,
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  const rows = data?.rows ?? [];
  const label = DEPARTMENTS[department].label;
  const latest = rows[0];

  // ── Collapsed state ──
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="group flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-left transition-colors hover:bg-muted/40 no-print"
        aria-label={`Show ${label.toLowerCase()} activity feed`}
      >
        {/* Live indicator */}
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="relative flex size-2">
            <span
              className={cn(
                "absolute inline-flex size-full animate-ping rounded-full opacity-75",
                error ? "bg-danger" : "bg-success",
              )}
            />
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                error ? "bg-danger" : "bg-success",
              )}
            />
          </span>
          <span className="text-caption font-semibold text-muted-foreground">LIVE</span>
        </span>

        <div className="h-4 w-px shrink-0 bg-border" />

        {/* Latest action, loading state, or empty state */}
        {isLoading && !data ? (
          <span className="min-w-0 flex-1 truncate text-meta text-faint">
            Loading {label.toLowerCase()} activity…
          </span>
        ) : latest ? (
          <span className="min-w-0 flex-1 truncate text-meta text-muted-foreground">
            <span className="font-medium text-foreground">
              {latest.userName ?? "Someone"}
            </span>{" "}
            {humanizeAction(latest.action)}
            <span className="ml-1 text-faint">· {relativeTime(latest.timestamp)}</span>
          </span>
        ) : error ? (
          <span className="min-w-0 flex-1 truncate text-meta text-muted-foreground">
            Activity feed unavailable
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-meta text-muted-foreground">
            No recent {label.toLowerCase()} activity
          </span>
        )}

        {/* Count badge */}
        {rows.length > 0 && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-caption font-medium tabular-nums text-muted-foreground">
            {rows.length}
          </span>
        )}

        <ChevronDown className="size-4 shrink-0 text-faint transition-transform group-hover:translate-y-0.5" />
      </button>
    );
  }

  // ── Expanded state ──
  return (
    <div className="rounded-lg border border-border bg-card no-print">
      {/* Header bar */}
      <button
        onClick={() => setExpanded(false)}
        className="flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
        aria-label={`Collapse ${label.toLowerCase()} activity feed`}
      >
        <span className="flex items-center gap-1.5 shrink-0">
          <Activity className="size-3.5 text-muted-foreground" />
          <span className="text-caption font-semibold text-muted-foreground">
            {label.toUpperCase()} ACTIVITY
          </span>
        </span>

        <div className="h-4 w-px shrink-0 bg-border" />

        <span className="min-w-0 flex-1 text-meta text-muted-foreground">
          {isLoading && !data
            ? "Loading…"
            : rows.length > 0
              ? `${rows.length} recent action${rows.length !== 1 ? "s" : ""}`
              : error
                ? "Feed unavailable"
                : "No recent activity"}
        </span>

        {/* Live dot */}
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="relative flex size-2">
            <span
              className={cn(
                "absolute inline-flex size-full animate-ping rounded-full opacity-75",
                error ? "bg-danger" : "bg-success",
              )}
            />
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                error ? "bg-danger" : "bg-success",
              )}
            />
          </span>
        </span>

        <ChevronDown className="size-4 shrink-0 rotate-180 text-faint transition-transform" />
      </button>

      {/* Feed list */}
      <div className="max-h-80 overflow-y-auto">
        {isLoading && !data ? (
          <div className="flex items-center gap-2.5 px-4 py-6 text-meta text-muted-foreground">
            <Circle className="size-2 fill-current text-faint animate-pulse" />
            Loading activity…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-2.5 px-4 py-6 text-meta text-muted-foreground">
            <Circle className="size-2 fill-current text-faint" />
            {error ? "Could not load activity. Will retry automatically." : "Nothing here yet."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-muted/30"
              >
                {/* Timestamp column (fixed width, tabular) */}
                <span className="shrink-0 pt-0.5 text-caption tabular-nums text-faint">
                  {relativeTime(row.timestamp)}
                </span>

                {/* Action description */}
                <span className="min-w-0 flex-1 text-meta leading-relaxed">
                  <span className="font-medium text-foreground">
                    {row.userName ?? "Someone"}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {humanizeAction(row.action)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
