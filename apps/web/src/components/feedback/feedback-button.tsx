"use client";

import { useState } from "react";
import useSWR from "swr";
import { MessageSquare, } from "lucide-react";
import { cn } from "@/lib/utils";
import { swrFetcher } from "@/lib/swr";
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
 * For the DEVELOPER role, a small badge shows the count of
 * unread (NEW) feedback entries — clicking the badge navigates to the
 * feedback inbox at /feedback.
 *
 * Reads `/api/me` via SWR so the role is available instantly from the
 * root layout's SWR fallback (no client fetch, no badge pop-in).
 * ═══════════════════════════════════════════════════════════════════
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  // Read the user's role from SWR — pre-seeded by the root layout's
  // fallback so the role (and thus the badge visibility) is correct on
  // first paint instead of popping in after a client fetch.
  const { data: meData } = useSWR<{ role?: string | null } | null>("/api/me", swrFetcher);
  const role = meData?.role ?? null;
  const canSeeInbox = role === "DEVELOPER";

  // Fetch unread feedback count only for the developer.
  // Conditional key (null when not eligible) → SWR skips the fetch.
  const { data: statsData } = useSWR(
    canSeeInbox ? "/api/feedback/stats" : null,
    swrFetcher,
  );
  const unreadCount = (statsData as { byStatus?: { NEW?: number } } | null)?.byStatus?.NEW ?? 0;

  return (
    <>
      <div data-feedback-button className="fixed z-40 flex flex-col items-start gap-2 no-print" style={{ left: "1rem", bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px) + 0.75rem)" }}>
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

        {/* The floating feedback button — smaller than the FAB, sits on the left */}
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "group flex size-11 items-center justify-center rounded-full shadow-floating transition-all",
            "bg-brand text-brand-foreground hover:bg-brand-strong hover:scale-105",
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/30",
            "active:scale-95",
          )}
          style={{ transition: "transform 160ms ease-out" }}
          aria-label="Send feedback"
          title="Send feedback — take a snapshot, record voice, write what you feel"
        >
          <MessageSquare className="size-4" />
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
