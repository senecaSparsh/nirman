"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════
 * ALERT BELL — the topbar notification center (§44.4)
 *
 * Shows a bell icon with a badge count of all pending attention items
 * across every world. Clicking opens a dropdown grouped by urgency:
 *
 *   🔴 blocking  — approvals, overdue deliveries
 *   🟡 soon      — low stock, ready-to-order, sales dues
 *   🔵 info      — sync pending, portal failures
 *
 * The data comes from the AppShell's existing badge-count fetch — no
 * extra API call needed. Each item links to the relevant page.
 * ═══════════════════════════════════════════════════════════════════
 */

type AlertItem = {
  href: string;
  label: string;
  count: number;
  /** "blocking" = red, "soon" = amber, "info" = blue. */
  urgency: "blocking" | "soon" | "info";
};

const URGENCY_DOT: Record<AlertItem["urgency"], string> = {
  blocking: "bg-danger",
  soon: "bg-warning",
  info: "bg-info",
};

export function AlertBell({
  items,
  className,
}: {
  items: AlertItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const total = items.reduce((sum, i) => sum + i.count, 0);

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

  // Group by urgency
  const blocking = items.filter((i) => i.urgency === "blocking");
  const soon = items.filter((i) => i.urgency === "soon");
  const info = items.filter((i) => i.urgency === "info");

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`Notifications${total > 0 ? ` (${total} pending)` : ""}`}
      >
        <Bell className="h-4 w-4" />
        {total > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-micro font-semibold text-white"
            aria-hidden
          >
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-overlay">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-label font-semibold text-foreground">
              Notifications{total > 0 ? ` (${total})` : ""}
            </span>
            {total > 0 && (
              <button
                onClick={() => setOpen(false)}
                className="text-caption text-muted-foreground transition-colors hover:text-foreground"
              >
                Dismiss
              </button>
            )}
          </div>

          {total === 0 ? (
            <div className="px-3 py-8 text-center">
              <Bell className="mx-auto mb-2 h-5 w-5 text-muted-foreground/40" />
              <p className="text-meta text-muted-foreground">All clear — nothing needs you.</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              {blocking.length > 0 && (
                <AlertGroup items={blocking} title="Needs your attention" onNavigate={() => setOpen(false)} />
              )}
              {soon.length > 0 && (
                <AlertGroup items={soon} title="Coming up" onNavigate={() => setOpen(false)} />
              )}
              {info.length > 0 && (
                <AlertGroup items={info} title="For your information" onNavigate={() => setOpen(false)} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AlertGroup({
  items,
  title,
  onNavigate,
}: {
  items: AlertItem[];
  title: string;
  onNavigate: () => void;
}) {
  return (
    <div className="border-b border-border/50 last:border-0">
      <p className="px-3 pt-2.5 pb-1 text-caption font-medium text-muted-foreground/70">{title}</p>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className="flex items-start gap-2.5 px-3 py-2 transition-colors hover:bg-subtle"
        >
          <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", URGENCY_DOT[item.urgency])} />
          <div className="min-w-0 flex-1">
            <p className="text-meta font-medium text-foreground">
              {item.count} {item.label}
              {item.count > 1 ? "s" : ""}
            </p>
          </div>
          <span className="shrink-0 text-caption text-muted-foreground/50">→</span>
        </Link>
      ))}
    </div>
  );
}
