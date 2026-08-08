"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, AlertTriangle } from "lucide-react";

export interface AttentionItem {
  title: string;
  subtitle?: string;
  meta?: string;
  href: string;
}

/**
 * MobileAttentionBanner — a smart "needs your attention" strip.
 *
 * Surfaces urgent items at the top of a persona home page: overdue POs,
 * pending approvals, low stock, unpaid invoices. Unlike a flat list, this
 * uses the design system's alert colour (warning) to draw the eye,
 * and deep-links to the action surface so the user doesn't have to hunt.
 *
 * Pass `items` — if empty, the banner renders nothing (no empty state).
 * The banner collapses multiple items into the top item, with a
 * "+N more" expand for the rest.
 */
export function MobileAttentionBanner({
  items,
}: {
  items: AttentionItem[];
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, 1);
  const remaining = items.length - visible.length;

  return (
    <div className="border-b border-border/70 bg-warning/5">
      <div className="px-4 py-2">
        <div className="mb-1.5 flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-warning">
          <AlertTriangle className="h-3 w-3" />
          Needs your attention
        </div>
        <div className="space-y-1">
          {visible.map((item, i) => (
            <Link
              key={i}
              href={item.href}
              className="flex items-center gap-2 rounded-md bg-card px-3 py-2 text-body transition-colors active:bg-accent"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{item.title}</span>
                {item.subtitle && (
                  <span className="block truncate text-caption text-muted-foreground">{item.subtitle}</span>
                )}
              </span>
              {item.meta && (
                <span className="shrink-0 text-meta font-medium text-muted-foreground">{item.meta}</span>
              )}
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
            </Link>
          ))}
        </div>
        {remaining > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="mt-1 w-full text-center text-caption text-muted-foreground transition-colors hover:text-foreground"
          >
            +{remaining} more
          </button>
        )}
      </div>
    </div>
  );
}
