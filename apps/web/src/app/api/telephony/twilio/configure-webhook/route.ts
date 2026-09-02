import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { logAction } from "@nirman/services";
import { configureNumberWebhook, clearNumberWebhook } from "@/lib/twilio-service";

/**
 * POST /api/telephony/twilio/configure-webhook — configure or clear
 * the Twilio webhook URLs for a specific number.
 *
 * OWNER-ONLY. This is FREE — it just updates the voice URL and status
 * callback URL on the Twilio number. No calls are made, no credits used.
 *
 * Body:
 *   { companyPhoneId: string, action: "configure" | "clear" }
 *
 * - "configure": sets the voice URL and status callback to our webhook
 *   endpoints, so Twilio will send call events to us
 * - "clear": removes the webhook URLs (stops Twilio from sending events)
 */
export const POST = apiHandler(async (req: NextRequest) => {
  // Only OWNER can configure webhooks
  const user = await requirePermission(PERM.TELEPHONY_MANAGE);
  if (user.role !== "OWNER") {
    return json({ error: "Only the owner can configure Twilio webhooks" }, { status: 403 });
  }
  const company = await getCompany();

  const body = await req.json();
  const { companyPhoneId, action } = body as { companyPhoneId?: string; action?: string };

  if (!companyPhoneId) {
    return json({ error: "companyPhoneId is required" }, { status: 400 });
  }
  if (action !== "configure" && action !== "clear") {
    return json({ error: "action must be 'configure' or 'clear'" }, { status: 400 });
  }

  // Find the company phone number
  const phone = await prisma.companyPhone.findFirst({
    where: { id: companyPhoneId, companyId: company.id, provider: "TWILIO", deletedAt: null },
  });
  if (!phone) {
    return json({ error: "Twilio phone number not found" }, { status: 404 });
  }
  if (!phone.providerNumberId) {
    return json({ error: "This number is not linked to a Twilio number SID" }, { status: 400 });
  }

  const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (action === "configure") {
    const { voiceUrl, statusCallback } = await configureNumberWebhook(
      phone.providerNumberId,
      baseURL,
      company.id,
    );

    await logAction(prisma, {
      userId: user.id,
      companyId: company.id,
      action: "TWILIO_WEBHOOK_CONFIGURED",
      entityType: "CompanyPhone",
      entityId: phone.id,
      after: { voiceUrl, statusCallback },
    });

    return json({ ok: true, voiceUrl, statusCallback });
  } else {
    await clearNumberWebhook(phone.providerNumberId);

    await logAction(prisma, {
      userId: user.id,
      companyId: company.id,
      action: "TWILIO_WEBHOOK_CLEARED",
      entityType: "CompanyPhone",
      entityId: phone.id,
    });

    return json({ ok: true, message: "Webhook configuration cleared" });
  }
});
