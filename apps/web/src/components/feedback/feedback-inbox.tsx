"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import {
  MessageSquare,
  Camera,
  Mic,
  CheckCircle2,
  Archive,
  RotateCcw,
  ExternalLink,
  Loader2,
  Inbox,
  Filter,
} from "lucide-react";
import { Page } from "@/components/page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/page";
import { cn } from "@/lib/utils";
import { swrFetcher } from "@/lib/swr";
import { EmptyState } from "@/components/empty-state";

/**
 * Feedback Inbox — the developer/owner's triage view.
 *
 * Fetches all feedback from /api/feedback, displays each entry with
 * screenshot, voice note, text, user info, and page URL. Supports
 * filtering by status + category, and resolving/archiving/reopening.
 */

const STATUS_FILTERS = [
  { key: "ALL", label: "All" },
  { key: "NEW", label: "New" },
  { key: "READ", label: "Read" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "ARCHIVED", label: "Archived" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  BUG: "Bug",
  FEATURE: "Feature Request",
  UX: "UX / Design",
  PRAISE: "Praise",
  QUESTION: "Question",
  OTHER: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  BUG: "text-danger",
  FEATURE: "text-warning",
  UX: "text-info",
  PRAISE: "text-success",
  QUESTION: "text-muted-foreground",
  OTHER: "text-muted-foreground",
};

interface FeedbackItem {
  id: string;
  message: string;
  category: string;
  status: string;
  currentUrl: string;
  userAgent: string | null;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  user: { id: string; name: string; email: string; role: string };
  company: { id: string; name: string } | null;
  screenshotUpload: { id: string; url: string; mimeType: string } | null;
  voiceUpload: { id: string; url: string; mimeType: string } | null;
  resolvedBy: { id: string; name: string } | null;
}

interface FeedbackStats {
  total: number;
  byStatus: Record<string, number>;
}

export function FeedbackInbox() {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Fetch stats for the header
  const { data: stats } = useSWR<FeedbackStats>("/api/feedback/stats", swrFetcher);

  // Fetch feedback list (refetch when filter changes or after mutations)
  const { data, mutate, isLoading } = useSWR<{ items: FeedbackItem[]; total: number }>(
    `/api/feedback${statusFilter !== "ALL" ? `?status=${statusFilter}` : ""}`,
    swrFetcher,
  );

  const items = data?.items ?? [];
  const selected = items.find((i) => i.id === selectedId) ?? null;

  const updateStatus = useCallback(
    async (id: string, action: "resolve" | "archive" | "reopen" | "markRead", resolutionNote?: string) => {
      try {
        const res = await fetch(`/api/feedback/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, resolutionNote }),
        });
        if (!res.ok) throw new Error("Failed to update feedback");
        toast.success(
          action === "resolve" ? "Feedback resolved" :
          action === "archive" ? "Feedback archived" :
          action === "reopen" ? "Feedback reopened" :
          "Marked as read",
        );
        mutate();
      } catch (err) {
        toast.error("Failed to update feedback status.");
      }
    },
    [mutate],
  );

  const newCount = stats?.byStatus?.NEW ?? 0;
  const resolvedCount = stats?.byStatus?.RESOLVED ?? 0;

  return (
    <Page>
      <PageHeader
        title="Feedback Inbox"
        description="User feedback from across the platform — screenshots, voice notes, and text."
        stats={[
          { label: "New", value: newCount, tone: newCount > 0 ? "warning" : "muted", hint: "Unread feedback entries" },
          { label: "Resolved", value: resolvedCount, tone: "success", hint: "Feedback that has been triaged and closed" },
          { label: "Total", value: stats?.total ?? 0, hint: "All feedback ever submitted" },
        ]}
      />

      {/* ── Status filter tabs ─────────────────────────────── */}
      <div className="mb-4 flex items-center gap-1 border-b border-border">
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.key;
          const count = f.key === "ALL" ? stats?.total ?? 0 : stats?.byStatus?.[f.key] ?? 0;
          return (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              {count > 0 && (
                <span className={cn(
                  "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                  active ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                )}>
                  {count}
                </span>
              )}
              {active && <span className="absolute bottom-0 left-0 h-0.5 w-full bg-brand" />}
            </button>
          );
        })}
      </div>

      {/* ── Feedback list + detail ────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="No feedback yet"
          description="User feedback will appear here when submitted via the floating button."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          {/* ── List ─────────────────────────────────────── */}
          <div className="space-y-2 lg:max-h-[calc(100vh-280px)] lg:overflow-y-auto lg:pr-2 scrollbar-thin">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedId(item.id);
                  if (item.status === "NEW") updateStatus(item.id, "markRead");
                }}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-colors",
                  selectedId === item.id
                    ? "border-brand bg-brand-soft/50"
                    : "border-border bg-card hover:border-border-strong",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-caption font-semibold", CATEGORY_COLORS[item.category])}>
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </span>
                      {item.status === "NEW" && (
                        <span className="flex size-1.5 rounded-full bg-brand" />
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px] text-foreground">
                      {item.message}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-caption text-faint">
                      <span className="font-medium text-muted-foreground">{item.user.name}</span>
                      <span>·</span>
                      <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {item.screenshotUpload && <Camera className="size-3.5 text-faint" />}
                    {item.voiceUpload && <Mic className="size-3.5 text-faint" />}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* ── Detail panel ─────────────────────────────── */}
          {selected ? (
            <div className="rounded-lg border border-border bg-card p-5 lg:max-h-[calc(100vh-280px)] lg:overflow-y-auto scrollbar-thin">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-caption font-semibold", CATEGORY_COLORS[selected.category])}>
                      {CATEGORY_LABELS[selected.category] ?? selected.category}
                    </span>
                    <StatusPill status={selected.status.toLowerCase()} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-meta text-muted-foreground">
                    <span className="font-medium text-foreground">{selected.user.name}</span>
                    <span>·</span>
                    <span>{selected.user.email}</span>
                    <span>·</span>
                    <span>{selected.user.role}</span>
                  </div>
                  <div className="mt-0.5 text-caption text-faint">
                    {new Date(selected.createdAt).toLocaleString()}
                    {selected.company && <> · {selected.company.name}</>}
                  </div>
                </div>
              </div>

              {/* Message */}
              <div className="mt-4">
                <h3 className="text-label text-faint">Message</h3>
                <p className="mt-1.5 whitespace-pre-wrap text-body leading-relaxed text-foreground">
                  {selected.message}
                </p>
              </div>

              {/* Screenshot */}
              {selected.screenshotUpload && (
                <div className="mt-4">
                  <h3 className="mb-1.5 text-label text-faint">Screenshot</h3>
                  <img
                    src={selected.screenshotUpload.url}
                    alt="Feedback screenshot"
                    className="w-full rounded-md border border-border"
                  />
                </div>
              )}

              {/* Voice note */}
              {selected.voiceUpload && (
                <div className="mt-4">
                  <h3 className="mb-1.5 text-label text-faint">Voice note</h3>
                  <audio src={selected.voiceUpload.url} controls className="w-full" />
                </div>
              )}

              {/* Context */}
              <div className="mt-4 rounded-md bg-muted/40 px-3 py-2.5">
                <h3 className="text-label text-faint">Context</h3>
                <div className="mt-1.5 space-y-1 text-meta text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">Page:</span>
                    <a
                      href={selected.currentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-brand hover:underline"
                    >
                      {selected.currentUrl}
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                  {selected.userAgent && (
                    <div>
                      <span className="font-medium">Browser:</span> {selected.userAgent.slice(0, 120)}
                    </div>
                  )}
                </div>
              </div>

              {/* Resolution */}
              {selected.status === "RESOLVED" && selected.resolvedBy && (
                <div className="mt-4 rounded-md border border-success/20 bg-success/5 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-caption font-semibold text-success">
                    <CheckCircle2 className="size-3.5" />
                    Resolved by {selected.resolvedBy.name}
                  </div>
                  {selected.resolutionNote && (
                    <p className="mt-1 text-meta text-muted-foreground">{selected.resolutionNote}</p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {selected.status !== "RESOLVED" && selected.status !== "ARCHIVED" && (
                  <Button onClick={() => updateStatus(selected.id, "resolve")} size="sm">
                    <CheckCircle2 className="size-3.5" />
                    Resolve
                  </Button>
                )}
                {selected.status === "RESOLVED" && (
                  <Button variant="outline" size="sm" onClick={() => updateStatus(selected.id, "reopen")}>
                    <RotateCcw className="size-3.5" />
                    Reopen
                  </Button>
                )}
                {selected.status !== "ARCHIVED" && (
                  <Button variant="ghost" size="sm" onClick={() => updateStatus(selected.id, "archive")}>
                    <Archive className="size-3.5" />
                    Archive
                  </Button>
                )}
                {selected.status === "ARCHIVED" && (
                  <Button variant="outline" size="sm" onClick={() => updateStatus(selected.id, "reopen")}>
                    <RotateCcw className="size-3.5" />
                    Reopen
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="hidden items-center justify-center rounded-lg border border-dashed border-border lg:flex">
              <EmptyState
                icon={<MessageSquare />}
                title="Select a feedback entry"
                description="Choose an item from the list to view its details."
                size="compact"
              />
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
