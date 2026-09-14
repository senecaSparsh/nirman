"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {Bell, Check, CheckCheck} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { resolveLinkForSurface } from "@/components/surface-adapter";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";

type Notification = {
  id: string;
  eventType: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

export type BellAlertItem = {
  href: string;
  label: string;
  count: number;
  /** "blocking" = red, "soon" = amber, "info" = blue. */
  urgency: "blocking" | "soon" | "info";
};

const URGENCY_DOT: Record<BellAlertItem["urgency"], string> = {
  blocking: "bg-danger",
  soon: "bg-warning",
  info: "bg-info",
};

/**
 * NotificationBell — the single bell in the topbar.
 *
 * One bell, two kinds of content in one dropdown:
 *   · "Needs attention" — aggregate work-queue counts (pending approvals,
 *     low stock, ready-to-order POs) computed by the AppShell from badge
 *     endpoints. These are worklists, not events — each links to its page.
 *   · "My notifications" — notifications addressed to this specific user
 *     (task assignments, DPR approvals, payment confirmations), polled
 *     every 30s from /api/notifications/in-app.
 *
 * Two bells with identical icons used to sit side by side; merging them
 * removes the "which bell do I open" guess and gives the badge a single
 * meaning: things that need you (unread + attention counts combined).
 */
export function NotificationBell({ className, alertItems = [] }: { className?: string; alertItems?: BellAlertItem[] }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [_loading, _setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    // Skip the tick when the tab is backgrounded or the device is
    // offline — hidden-tab polling wastes DB connections and battery.
    if (document.hidden) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    try {
      const res = await fetch("/api/notifications/in-app");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // silent fail — notification polling should not disrupt the user
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    const onVisible = () => {
      if (!document.hidden) void fetchNotifications();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function markAsRead(id: string) {
    try {
      await fetch("/api/notifications/in-app", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      toast.error("Failed to mark notification as read");
    }
  }

  async function markAllAsRead() {
    try {
      await fetch("/api/notifications/in-app", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })));
      setUnreadCount(0);
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark all as read");
    }
  }

  const alertTotal = alertItems.reduce((sum, i) => sum + i.count, 0);
  const badgeCount = unreadCount + alertTotal;
  const hasBlocking = alertItems.some((i) => i.urgency === "blocking");
  const blocking = alertItems.filter((i) => i.urgency === "blocking");
  const soon = alertItems.filter((i) => i.urgency === "soon");
  const info = alertItems.filter((i) => i.urgency === "info");

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) fetchNotifications();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`Notifications${badgeCount > 0 ? ` (${badgeCount} need attention)` : ""}`}
      >
        <Bell className="h-4 w-4" />
        {badgeCount > 0 && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-micro font-semibold text-white",
              hasBlocking ? "bg-danger" : "bg-info",
            )}
            aria-hidden
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-border bg-card shadow-overlay">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-label font-semibold text-foreground">
              Notifications{badgeCount > 0 ? ` (${badgeCount})` : ""}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 text-caption text-muted-foreground transition-colors hover:text-foreground"
                title="Mark all as read"
              >
                <CheckCheck className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>

          {alertItems.length > 0 && (
            <div className="border-b border-border">
              <p className="px-3 pt-2.5 pb-1 text-caption font-medium text-muted-foreground/70">
                Needs attention
              </p>
              <div className="max-h-44 overflow-y-auto scrollbar-thin">
              {[...blocking, ...soon, ...info].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-2.5 px-3 py-2 transition-colors hover:bg-subtle"
                >
                  <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", URGENCY_DOT[item.urgency])} />
                  <div className="min-w-0 flex-1">
                    <p className="text-meta font-medium text-foreground">
                      {item.count} {item.label}
                    </p>
                  </div>
                  <span className="shrink-0 text-caption text-muted-foreground/50">→</span>
                </Link>
              ))}
              </div>
            </div>
          )}

          {notifications.length === 0 && alertItems.length === 0 ? (
            <EmptyState
              icon={<Bell />}
              title="All clear — nothing needs you"
              size="compact"
            />
          ) : notifications.length === 0 ? null : (
            <>
              {alertItems.length > 0 && (
                <p className="px-3 pt-2.5 pb-1 text-caption font-medium text-muted-foreground/70">
                  Recent
                </p>
              )}
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              {notifications.map((n) => {
                const content = (
                  <div
                    className={cn(
                      "flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-subtle",
                      !n.isRead && "bg-info/5",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        n.isRead ? "bg-muted-foreground/30" : "bg-info",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-meta font-medium text-foreground">{n.title}</p>
                      <p className="mt-0.5 text-caption text-muted-foreground line-clamp-2">{n.message}</p>
                      <p className="mt-1 text-micro text-muted-foreground/60">
                        {formatRelativeTime(new Date(n.createdAt))}
                      </p>
                    </div>
                    {!n.isRead && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          markAsRead(n.id);
                        }}
                        className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
                        title="Mark as read"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );

                // Notification links are stored as mobile paths (/m/...).
                // resolveLinkForSurface converts to the desktop route when the
                // bell is open on a desktop viewport, and returns the mobile
                // path as-is on a phone — so a mobile user never lands on a
                // desktop page.
                const href = resolveLinkForSurface(n.link);
                if (href) {
                  return (
                    <Link
                      key={n.id}
                      href={href}
                      onClick={() => {
                        setOpen(false);
                        if (!n.isRead) markAsRead(n.id);
                      }}
                    >
                      {content}
                    </Link>
                  );
                }
                return (
                  <div key={n.id} onClick={() => { if (!n.isRead) markAsRead(n.id); }}>
                    {content}
                  </div>
                );
              })}
            </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
