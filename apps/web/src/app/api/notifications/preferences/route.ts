import { NextRequest } from "next/server";
import { getUserPreferences, upsertNotificationPreference } from "@nirman/services";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";

// GET /api/notifications/preferences — list current user's preferences
export const GET = apiHandler(async (_req: NextRequest) => {
  const user = await requireUser();
  const prefs = await getUserPreferences(user.id);
  return json(prefs);
});

// PUT /api/notifications/preferences — upsert a preference
export const PUT = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();
  const body = await req.json();
  const { eventType, channel, enabled } = body;

  if (!eventType || !channel || typeof enabled !== "boolean") {
    return json({ error: "eventType, channel, and enabled (boolean) are required" }, { status: 400 });
  }

  const pref = await upsertNotificationPreference({
    companyId: company.id,
    userId: user.id,
    eventType,
    channel,
    enabled,
  });
  return json(pref);
});
