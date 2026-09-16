"use client";

import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import {
  AlertOctagon,
  CheckCircle2,
  RotateCcw,
  Loader2,
  Server,
  Monitor,
  ChevronDown,
  Search,
  ExternalLink,
  Bug,
} from "lucide-react";
import { Page } from "@/components/page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { cn, formatDate, formatRelativeTime } from "@/lib/utils";
import { swrFetcher } from "@/lib/swr";

/**
 * Error Console — the developer's triage view for every error captured
 * across the platform (client ErrorCatcher + server apiHandler).
 *
 * One row = one unique error signature (fingerprint). Repeat occurrences
 * are counted, not duplicated. Resolving is verifiable — if the bug
 * recurs, the row auto-reopens and bumps reopenedCount.
 */

interface ErrorRow {
  id: string;
  type: string;
  source: string;
  message: string;
  filename: string | null;
  lineno: number | null;
  colno: number | null;
  stack: string | null;
  url: string;
  userAgent: string | null;
  fingerprint: string | null;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  resolvedAt: string | null;
  reopenedCount: number;
  user: { id: string; name: string; email: string; role: string } | null;
  company: { id: string; name: string } | null;
  resolvedBy: { id: string; name: string } | null;
}

interface ErrorListResponse {
  errors: ErrorRow[];
  total: number;
  openCount: number;
  limit: number;
  offset: number;
}

const STATUS_TABS = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
] as const;

const TYPE_LABELS: Record<string, string> = {
  error: "Error",
  unhandledrejection: "Promise",
  "console.error": "Console",
  server: "Server 500",
};

export function ErrorConsole({ bare = false }: { bare?: boolean }) {
  const [status, setStatus] = useState<string>("open");
  const [type, setType] = useState<string>("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const params = new URLSearchParams({ status, limit: "100" });
  if (type) params.set("type", type);
  if (q.trim()) params.set("q", q.trim());

  const { data, mutate, isLoading } = useSWR<ErrorListResponse>(
    `/api/error-logs?${params.toString()}`,
    swrFetcher,
  );

  const triage = async (id: string, action: "resolve" | "reopen") => {
    setBusy(id);
    try {
      const res = await fetch("/api/error-logs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(action === "resolve" ? "Marked resolved — it will reopen if it recurs" : "Reopened");
      await mutate();
    } catch {
      toast.error("Failed to update error");
    } finally {
      setBusy(null);
    }
  };

  const errors = data?.errors ?? [];

  const body = (
    <>
      {!bare && (
        <PageHeader
          title="Error Console"
          description={`${data?.openCount ?? 0} open signatures · every client + server error, deduplicated`}
        />
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border p-0.5" style={{ borderColor: "var(--color-line, hsl(var(--border)))" }}>
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                status === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-40"
        >
          <option value="">All types</option>
          <option value="error">Error</option>
          <option value="unhandledrejection">Promise rejection</option>
          <option value="console.error">console.error</option>
          <option value="server">Server 500</option>
        </Select>
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search messages…"
            className="pl-8"
          />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Loading errors…
        </div>
      ) : errors.length === 0 ? (
        <EmptyState
          icon={<Bug className="size-6" />}
          title={status === "open" ? "No open errors" : "No errors found"}
          description={
            status === "open"
              ? "Every captured error signature is resolved. Nothing is on fire."
              : "Try a different filter."
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {errors.map((e) => {
            const isOpen = expanded === e.id;
            const resolved = e.resolvedAt !== null;
            return (
              <div
                key={e.id}
                className={cn(
                  "rounded-xl border bg-card",
                  resolved && "opacity-70",
                )}
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : e.id)}
                  className="flex w-full items-start gap-3 p-3 text-left"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                      e.source === "server" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning",
                    )}
                  >
                    {e.source === "server" ? <Server className="size-4" /> : <Monitor className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.message}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{TYPE_LABELS[e.type] ?? e.type}</span>
                      <span>·</span>
                      <span>{e.url ? new URL(e.url, "https://x").pathname : "/"}</span>
                      {e.user && (
                        <>
                          <span>·</span>
                          <span>{e.user.name}</span>
                        </>
                      )}
                      {e.company && (
                        <>
                          <span>·</span>
                          <span>{e.company.name}</span>
                        </>
                      )}
                      <span>·</span>
                      <span title={formatDate(e.lastSeenAt)}>{formatRelativeTime(new Date(e.lastSeenAt))}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {e.reopenedCount > 0 && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                        regressed ×{e.reopenedCount}
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        e.occurrenceCount > 10
                          ? "bg-destructive/10 text-destructive"
                          : e.occurrenceCount > 3
                            ? "bg-warning/10 text-warning"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      ×{e.occurrenceCount}
                    </span>
                    {resolved ? (
                      <CheckCircle2 className="size-4 text-success" />
                    ) : (
                      <AlertOctagon className="size-4 text-destructive" />
                    )}
                    <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t px-4 py-3 text-sm">
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                      <div className="flex gap-2"><dt className="text-muted-foreground">First seen</dt><dd>{formatDate(e.firstSeenAt)}</dd></div>
                      <div className="flex gap-2"><dt className="text-muted-foreground">Last seen</dt><dd>{formatDate(e.lastSeenAt)}</dd></div>
                      <div className="flex gap-2"><dt className="text-muted-foreground">URL</dt><dd className="truncate">{e.url}</dd></div>
                      <div className="flex gap-2"><dt className="text-muted-foreground">Location</dt><dd>{e.filename ? `${e.filename}:${e.lineno ?? "?"}:${e.colno ?? "?"}` : "—"}</dd></div>
                      {e.user && <div className="flex gap-2"><dt className="text-muted-foreground">User</dt><dd>{e.user.name} ({e.user.email}) · {e.user.role}</dd></div>}
                      {e.userAgent && <div className="flex gap-2"><dt className="text-muted-foreground">Device</dt><dd className="truncate">{e.userAgent}</dd></div>}
                      {resolved && e.resolvedBy && (
                        <div className="flex gap-2"><dt className="text-muted-foreground">Resolved</dt><dd>by {e.resolvedBy.name} · {formatDate(e.resolvedAt!)}</dd></div>
                      )}
                      <div className="flex gap-2"><dt className="text-muted-foreground">Fingerprint</dt><dd className="font-mono text-xs">{e.fingerprint ?? "legacy"}</dd></div>
                    </dl>
                    {e.stack && (
                      <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">{e.stack}</pre>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {resolved ? (
                        <Button size="sm" variant="outline" disabled={busy === e.id} onClick={() => triage(e.id, "reopen")}>
                          {busy === e.id ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                          Reopen
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={busy === e.id} onClick={() => triage(e.id, "resolve")}>
                          {busy === e.id ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                          Mark resolved
                        </Button>
                      )}
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-3" /> Open page
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  return bare ? <div className="p-4">{body}</div> : <Page>{body}</Page>;
}
