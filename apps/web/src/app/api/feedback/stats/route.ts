import { NextRequest } from "next/server";
import { getFeedbackStats } from "@nirman/services";
import { apiHandler, json, requireUser } from "@/lib/server";

/**
 * GET /api/feedback/stats — feedback counts by status (DEVELOPER only).
 * Used by the feedback inbox page header + the floating button badge.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  const user = await requireUser();
  if (user.role !== "DEVELOPER") {
    return json({ error: "Forbidden" }, { status: 403 });
  }
  return json(await getFeedbackStats());
});
