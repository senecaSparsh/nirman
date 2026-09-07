import { NextRequest } from "next/server";
import {
  archiveFeedback,
  getFeedback,
  markFeedbackRead,
  reopenFeedback,
  resolveFeedback,
} from "@nirman/services";
import { apiHandler, json, requireUser } from "@/lib/server";

/**
 * GET /api/feedback/[id] — get a single feedback entry (DEVELOPER only).
 * Also marks NEW feedback as READ on first view.
 */
export const GET = apiHandler(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (user.role !== "DEVELOPER") {
    return json({ error: "Forbidden — only the developer can view feedback." }, { status: 403 });
  }
  const { id } = await params;
  const feedback = await getFeedback(id);
  // Auto-mark as READ when first opened.
  if (feedback.status === "NEW") {
    await markFeedbackRead(id);
  }
  return json(feedback);
});

/**
 * PATCH /api/feedback/[id] — update feedback status (DEVELOPER only).
 *
 * Body: {
 *   action: "resolve" | "archive" | "reopen" | "markRead",
 *   resolutionNote?: string,  // optional note when resolving
 * }
 */
export const PATCH = apiHandler(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  if (user.role !== "DEVELOPER") {
    return json({ error: "Forbidden — only the developer can manage feedback." }, { status: 403 });
  }
  const { id } = await params;

  let body: { action?: string; resolutionNote?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  switch (body.action) {
    case "resolve":
      return json(await resolveFeedback(id, user.id, body.resolutionNote));
    case "archive":
      return json(await archiveFeedback(id));
    case "reopen":
      return json(await reopenFeedback(id));
    case "markRead":
      return json(await markFeedbackRead(id));
    default:
      return json({ error: "Invalid action. Use: resolve, archive, reopen, or markRead." }, { status: 400 });
  }
});
