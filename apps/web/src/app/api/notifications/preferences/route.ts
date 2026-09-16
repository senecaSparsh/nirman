import { NextRequest } from "next/server";
import { getUserPreferences, listIntegrationConfigsMasked, upsertNotificationPreference } from "@nirman/services";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";

// GET /api/notifications/preferences — list current user's preferences plus
// which delivery channels are actually configured for this company, so the UI
// can flag toggles that opt into a channel that can't deliver.
export const GET = apiHandler(async (_req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();
  const [prefs, configs] = await Promise.all([
    getUserPreferences(user.id),
    listIntegrationConfigsMasked(company.id),
  ]);
  const enabled = new Set(configs.filter((c) => c.enabled).map((c) => c.key));
  return json({
    preferences: prefs,
    channels: {
      IN_APP: true,
      WHATSAPP: enabled.has("WHATSAPP") || !!process.env.WHATSAPP_ACCESS_TOKEN,
      EMAIL: enabled.has("EMAIL_SMTP"),
    },
  });
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
