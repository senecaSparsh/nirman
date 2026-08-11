"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck, X } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

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

/**
 * NotificationBell — shows user-specific in-app notifications.
 *
 * This is separate from the AlertBell (which shows system-wide badge counts
 * like pending approvals). NotificationBell shows notifications addressed to
 * this specific user — task assignments, DPR approvals, payment confirmations, etc.
 *
 * Polls every 30 seconds for new notifications. Shows a red badge with the
 * unread count. Clicking the bell opens a dropdown with the notification list.
 */
export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
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
    return () => clearInterval(interval);
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

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) fetchNotifications();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`In-app notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-info px-1 text-micro font-semibold text-white"
            aria-hidden
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-overlay">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-label font-semibold text-foreground">
              My Notifications{unreadCount > 0 ? ` (${unreadCount} new)` : ""}
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

          {notifications.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <Bell className="mx-auto mb-2 h-5 w-5 text-muted-foreground/40" />
              <p className="text-meta text-muted-foreground">No notifications yet.</p>
            </div>
          ) : (
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

                if (n.link) {
                  return (
                    <Link
                      key={n.id}
                      href={n.link}
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
          )}
        </div>
      )}
    </div>
  );
}
