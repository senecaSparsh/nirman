import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { FeedbackInbox } from "@/components/feedback/feedback-inbox";

export const metadata = {
  title: "Feedback Inbox · Nirman OS",
  description: "User feedback — screenshots, voice notes, and text from across the platform.",
};

/**
 * Feedback Inbox — the developer/owner's view of all user feedback.
 * Shows screenshots, voice note playback, text, user info, and the
 * page URL where the feedback was submitted. Supports filtering by
 * status + category, and resolving/archiving/reopening feedback.
 *
 * Access: DEVELOPER, OWNER, ADMIN only (enforced in the API routes).
 */
export default function FeedbackPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading feedback inbox…" variant="list" />}>
      <FeedbackInbox />
    </Suspense>
  );
}
