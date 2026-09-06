import { } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { getAccountInfo, isTwilioConfigured, getTwilioAccountSid, fetchTwilioNumbers } from "@/lib/twilio-service";

/**
 * GET /api/telephony/twilio/status — check Twilio connection status.
 *
 * OWNER-ONLY. Returns:
 *   - Whether Twilio env credentials are configured
 *   - The Twilio account info (name, status, type)
 *   - How many Twilio numbers exist on the account
 *   - How many of those are synced to CompanyPhone rows
 *   - Whether webhooks are configured for each number
 */
export const GET = apiHandler(async () => {
  // Only OWNER can view Twilio config
  const user = await requirePermission(PERM.TELEPHONY_MANAGE);
  if (user.role !== "OWNER") {
    return json({ error: "Only the owner can manage Twilio integration" }, { status: 403 });
  }
  const company = await getCompany();

  const configured = isTwilioConfigured();
  const accountSid = getTwilioAccountSid();

  if (!configured || !accountSid) {
    return json({
      configured: false,
      account: null,
      numbers: [],
      syncedCount: 0,
      unsyncedCount: 0,
    });
  }

  // Fetch account info (read-only, no credits)
  const account = await getAccountInfo();

  // Fetch all Twilio numbers (read-only)
  const twilioNumbers = await fetchTwilioNumbers();

  // Check which numbers are already synced to our DB
  const syncedNumbers = await prisma.companyPhone.findMany({
    where: {
      companyId: company.id,
      provider: "TWILIO",
      deletedAt: null,
    },
    select: {
      id: true,
      phoneNumber: true,
      providerNumberId: true,
      label: true,
      assignedTo: { select: { id: true, name: true } },
      status: true,
    },
  });

  const syncedSids = new Set(syncedNumbers.map((n) => n.providerNumberId));

  // Mark which numbers are synced and which have webhooks configured
  const numbersWithStatus = twilioNumbers.map((n) => ({
    ...n,
    synced: syncedSids.has(n.sid),
    webhookConfigured: !!(n.voiceUrl || n.statusCallback),
  }));

  return json({
    configured: true,
    accountSid,
    account,
    numbers: numbersWithStatus,
    syncedCount: syncedNumbers.length,
    unsyncedCount: twilioNumbers.length - syncedNumbers.length,
    syncedNumbers,
  });
});
