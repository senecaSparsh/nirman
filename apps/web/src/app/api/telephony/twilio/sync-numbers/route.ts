import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { logAction } from "@nirman/services";
import { fetchTwilioNumbers, normalizeTwilioNumber, configureNumberWebhook } from "@/lib/twilio-service";

/**
 * POST /api/telephony/twilio/sync-numbers — sync Twilio numbers into
 * our CompanyPhone table.
 *
 * OWNER-ONLY. Fetches all phone numbers from the Twilio account and
 * creates/updates CompanyPhone rows for each one. Numbers that already
 * exist (by providerNumberId) are updated; new numbers are created.
 *
 * Optionally configures webhooks for newly synced numbers (set
 * `configureWebhooks: true` in the body).
 *
 * This is READ-ONLY on the Twilio side (fetching numbers is free).
 * Webhook configuration is also free (just updating a URL).
 *
 * Body: { configureWebhooks?: boolean }
 */
export const POST = apiHandler(async (req: NextRequest) => {
  // Only OWNER can sync Twilio numbers
  const user = await requirePermission(PERM.TELEPHONY_MANAGE);
  if (user.role !== "OWNER") {
    return json({ error: "Only the owner can sync Twilio numbers" }, { status: 403 });
  }
  const company = await getCompany();

  const body = await req.json().catch(() => ({}));
  const { configureWebhooks = false } = body as { configureWebhooks?: boolean };

  // Fetch all Twilio numbers (read-only, no credits)
  const twilioNumbers = await fetchTwilioNumbers();
  if (twilioNumbers.length === 0) {
    return json({ message: "No phone numbers found on the Twilio account", synced: 0 });
  }

  const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const results: { sid: string; phoneNumber: string; action: "created" | "updated" | "unchanged" }[] = [];

  for (const twilioNum of twilioNumbers) {
    const normalized = normalizeTwilioNumber(twilioNum.phoneNumber);

    // Check if this number already exists in ANY company (Twilio SIDs are globally unique).
    // A Twilio number can only belong to one company — if another company already
    // has it, we skip it instead of creating a duplicate.
    const existing = await prisma.companyPhone.findFirst({
      where: {
        provider: "TWILIO",
        providerNumberId: twilioNum.sid,
        deletedAt: null,
      },
      select: { id: true, companyId: true, label: true },
    });

    if (existing) {
      // If the number belongs to a DIFFERENT company, skip it
      if (existing.companyId !== company.id) {
        results.push({ sid: twilioNum.sid, phoneNumber: twilioNum.phoneNumber, action: "unchanged" });
        continue;
      }
      // Same company — update the phone number display and label if needed
      // Update the phone number display and label if needed
      await prisma.companyPhone.update({
        where: { id: existing.id },
        data: {
          phoneNumber: twilioNum.phoneNumber,
          phoneNormalized: normalized,
          label: existing.label ?? twilioNum.friendlyName,
        },
      });
      results.push({ sid: twilioNum.sid, phoneNumber: twilioNum.phoneNumber, action: "updated" });
    } else {
      // Create a new CompanyPhone
      await prisma.companyPhone.create({
        data: {
          companyId: company.id,
          phoneNumber: twilioNum.phoneNumber,
          phoneNormalized: normalized,
          numberType: "VIRTUAL",
          provider: "TWILIO",
          providerNumberId: twilioNum.sid,
          label: twilioNum.friendlyName ?? null,
          status: "ACTIVE",
        },
      });
      results.push({ sid: twilioNum.sid, phoneNumber: twilioNum.phoneNumber, action: "created" });
    }

    // Optionally configure webhooks (free — just updating URLs)
    if (configureWebhooks) {
      try {
        await configureNumberWebhook(twilioNum.sid, baseURL, company.id);
      } catch (err) {
        // Webhook config failure shouldn't fail the sync
        console.error(`[twilio-sync] Failed to configure webhook for ${twilioNum.phoneNumber}:`, err);
      }
    }
  }

  // Ensure a TelephonyProviderConfig row exists for TWILIO
  const existingConfig = await prisma.telephonyProviderConfig.findFirst({
    where: { companyId: company.id, provider: "TWILIO", deletedAt: null },
  });

  if (!existingConfig) {
    await prisma.telephonyProviderConfig.create({
      data: {
        companyId: company.id,
        provider: "TWILIO",
        apiKeyRef: `env:TWILIO_ACCOUNT_SID`,
        apiSecretRef: `env:TWILIO_AUTH_TOKEN`,
        webhookUrl: `${baseURL}/api/telephony/webhook/twilio/status?companyId=${company.id}`,
        active: true,
      },
    });
  }

  const created = results.filter((r) => r.action === "created").length;
  const updated = results.filter((r) => r.action === "updated").length;

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "TWILIO_NUMBERS_SYNCED",
    entityType: "CompanyPhone",
    entityId: company.id,
    after: { total: results.length, created, updated },
  });

  return json({
    synced: results.length,
    created,
    updated,
    numbers: results,
  });
});
