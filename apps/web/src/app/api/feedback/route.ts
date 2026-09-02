import { NextRequest } from "next/server";
import { createFeedback, listFeedback } from "@nirman/services";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";

/**
 * POST /api/feedback — submit instant feedback (any authenticated user).
 *
 * Body: {
 *   message: string,           // free-text feedback
 *   category?: string,         // BUG | FEATURE | UX | PRAISE | QUESTION | OTHER
 *   screenshotUploadId?: string, // Upload ID from /api/uploads
 *   voiceUploadId?: string,      // Upload ID from /api/uploads
 *   currentUrl: string,        // the page URL when feedback was submitted
 * }
 *
 * The screenshot + voice note are uploaded separately via /api/uploads
 * (multipart/form-data) before this endpoint is called. This endpoint
 * just stores the upload IDs alongside the text feedback.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();

  let body: {
    message?: string;
    category?: string;
    screenshotUploadId?: string;
    voiceUploadId?: string;
    currentUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.message || !body.message.trim()) {
    return json({ error: "Feedback message is required." }, { status: 400 });
  }
  if (!body.currentUrl) {
    return json({ error: "Current URL is required for context." }, { status: 400 });
  }

  const userAgent = req.headers.get("user-agent") ?? null;

  const feedback = await createFeedback({
    userId: user.id,
    companyId: company.id,
    message: body.message,
    category: body.category,
    screenshotUploadId: body.screenshotUploadId,
    voiceUploadId: body.voiceUploadId,
    currentUrl: body.currentUrl,
    userAgent,
  });

  return json({ id: feedback.id, status: "created" }, { status: 201 });
});

/**
 * GET /api/feedback — list feedback entries (DEVELOPER/OWNER/ADMIN only).
 *
 * Query params:
 *   - status: NEW | READ | RESOLVED | ARCHIVED
 *   - category: BUG | FEATURE | UX | PRAISE | QUESTION | OTHER
 *   - limit: number (default 50, max 200)
 *   - offset: number (default 0)
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  // Only god-mode / executive roles can view the feedback inbox.
  if (user.role !== "OWNER" && user.role !== "ADMIN" && user.role !== "DEVELOPER") {
    return json({ error: "Forbidden — only developers and owners can view feedback." }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined;
  const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : undefined;

  const result = await listFeedback({ status, category, limit, offset });
  return json(result);
});
