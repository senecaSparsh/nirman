"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FeedbackDialog } from "./feedback-dialog";

/**
 * ═══════════════════════════════════════════════════════════════════
 * FLOATING FEEDBACK BUTTON
 *
 * A floating button available on EVERY page (desktop + mobile). When
 * clicked, it opens the FeedbackDialog which auto-captures a screenshot
 * and lets the user write feedback + record a voice note.
 *
 * The button is positioned bottom-right on desktop, and bottom-right
 * above the mobile tab bar on mobile. It's hidden on auth/print pages.
 *
 * For DEVELOPER/OWNER/ADMIN roles, a small badge shows the count of
 * unread (NEW) feedback entries — clicking the badge navigates to the
 * feedback inbox at /feedback.
 * ═══════════════════════════════════════════════════════════════════
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [role, setRole] = useState<string | null>(null);

  // Fetch the user's role + unread feedback count (for the badge)
  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.role) setRole(data.role);
      })
      .catch(() => {});
  }, []);

  // For DEVELOPER/OWNER/ADMIN, fetch unread feedback count
  useEffect(() => {
    if (role !== "OWNER" && role !== "ADMIN" && role !== "DEVELOPER") return;
    fetch("/api/feedback/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.byStatus?.NEW) setUnreadCount(data.byStatus.NEW);
      })
      .catch(() => {});
  }, [role]);

  return (
    <>
      <div data-feedback-button className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 no-print">
        {/* Feedback inbox badge for developer/owner/admin */}
        {unreadCount > 0 && (
          <a
            href="/feedback"
            className="flex items-center gap-1.5 rounded-full border border-border bg-elevated px-2.5 py-1 text-caption font-medium text-foreground shadow-floating transition-colors hover:bg-card"
          >
            <span className="flex size-2 rounded-full bg-brand" />
            {unreadCount} new feedback
          </a>
        )}

        {/* The floating feedback button */}
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "group flex size-12 items-center justify-center rounded-full shadow-floating transition-all",
            "bg-brand text-brand-foreground hover:bg-brand-strong hover:scale-105",
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/30",
            "active:scale-95",
          )}
          aria-label="Send feedback"
          title="Send feedback — take a snapshot, record voice, write what you feel"
        >
          <MessageSquare className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white ring-2 ring-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </div>

      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
