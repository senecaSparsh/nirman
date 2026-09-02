import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { logAction } from "@nirman/services";
import {
  fetchRecentCalls,
  fetchCallRecordings,
  normalizeTwilioNumber,
  mapTwilioCallStatus,
  mapTwilioDirection,
} from "@/lib/twilio-service";

/**
 * POST /api/telephony/twilio/sync-calls — sync recent Twilio call
 * history into our CallLog table.
 *
 * OWNER-ONLY. Fetches recent calls from Twilio (read-only, no credits)
 * and upserts them into CallLog. This is useful for backfilling call
 * history when the webhook wasn't configured yet, or for recovering
 * missed webhooks.
 *
 * Body: { limit?: number } (default 50, max 100)
 */
export const POST = apiHandler(async (req: NextRequest) => {
  // Only OWNER can sync calls
  const user = await requirePermission(PERM.TELEPHONY_MANAGE);
  if (user.role !== "OWNER") {
    return json({ error: "Only the owner can sync Twilio calls" }, { status: 403 });
  }
  const company = await getCompany();

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(100, Math.max(1, (body as { limit?: number }).limit ?? 50));

  // Fetch recent calls from Twilio (read-only, no credits)
  const twilioCalls = await fetchRecentCalls(limit);
  if (twilioCalls.length === 0) {
    return json({ message: "No recent calls found on the Twilio account", synced: 0 });
  }

  // Get all company Twilio numbers for matching
  const companyNumbers = await prisma.companyPhone.findMany({
    where: { companyId: company.id, provider: "TWILIO", deletedAt: null },
    select: { id: true, phoneNormalized: true, assignedToUserId: true },
  });
  const companyNumberMap = new Map(companyNumbers.map((n) => [n.phoneNormalized, n]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const call of twilioCalls) {
    const fromNorm = normalizeTwilioNumber(call.from);
    const toNorm = normalizeTwilioNumber(call.to);

    // Check if either number belongs to this company
    const companyPhone = companyNumberMap.get(fromNorm) ?? companyNumberMap.get(toNorm);
    if (!companyPhone) {
      // This call doesn't involve any of our company numbers — skip
      skipped++;
      continue;
    }

    const mappedDirection = mapTwilioDirection(call.direction);
    const mappedStatus = mapTwilioCallStatus(call.status);
    const companySideNumber = mappedDirection === "INBOUND" ? toNorm : fromNorm;
    const externalSideNumber = mappedDirection === "INBOUND" ? fromNorm : toNorm;

    // Match external number to customers/suppliers
    const last10 = externalSideNumber.slice(-10);
    const [matchedCustomer, matchedSupplier] = await Promise.all([
      prisma.customer.findFirst({
        where: {
          companyId: company.id,
          deletedAt: null,
          OR: [
            { phone: externalSideNumber },
            ...(last10.length >= 10 ? [{ phone: { contains: last10 } }] : []),
          ],
        },
        select: { id: true },
      }).catch(() => null),
      prisma.supplier.findFirst({
        where: {
          companyId: company.id,
          deletedAt: null,
          OR: [
            { phone: externalSideNumber },
            ...(last10.length >= 10 ? [{ phone: { contains: last10 } }] : []),
          ],
        },
        select: { id: true },
      }).catch(() => null),
    ]);

    // Check if this call already exists (by providerCallId)
    const existing = await prisma.callLog.findFirst({
      where: { companyId: company.id, providerCallId: call.sid },
    });

    if (existing) {
      // Update with any new info
      await prisma.callLog.update({
        where: { id: existing.id },
        data: {
          status: mappedStatus,
          durationSec: parseInt(call.duration, 10) || existing.durationSec,
          endedAt: call.endTime ? new Date(call.endTime) : existing.endedAt,
          callCost: call.price ? parseFloat(call.price) : undefined,
        },
      });
      updated++;
      continue;
    }

    // Create new CallLog
    const callLog = await prisma.callLog.create({
      data: {
        companyId: company.id,
        direction: mappedDirection,
        fromNumber: fromNorm,
        toNumber: toNorm,
        companyPhoneId: companyPhone.id,
        callerUserId: companyPhone.assignedToUserId,
        status: mappedStatus,
        startedAt: call.startTime ? new Date(call.startTime) : new Date(),
        connectedAt: call.startTime ? new Date(call.startTime) : null,
        endedAt: call.endTime ? new Date(call.endTime) : null,
        durationSec: parseInt(call.duration, 10),
        recordingConsent: true,
        provider: "TWILIO",
        providerCallId: call.sid,
        source: "AUTO",
        relatedCustomerId: matchedCustomer?.id ?? null,
        relatedSupplierId: matchedSupplier?.id ?? null,
        callCost: call.price ? parseFloat(call.price) : null,
      },
    });

    // Try to fetch recording for this call (read-only).
    // Respects the company's recording mode (ALL/SELECTED/NONE).
    try {
      const companyData = await prisma.company.findUnique({
        where: { id: company.id },
        select: { recordingMode: true },
      });
      const mode = companyData?.recordingMode ?? "ALL";

      let shouldRecord = false;
      if (mode === "ALL") {
        shouldRecord = true;
      } else if (mode === "SELECTED" && companyPhone.assignedToUserId) {
        const membership = await prisma.userCompany.findFirst({
          where: { companyId: company.id, userId: companyPhone.assignedToUserId },
          select: { recordCalls: true },
        });
        shouldRecord = membership?.recordCalls ?? false;
      }

      if (shouldRecord) {
        const recordings = await fetchCallRecordings(call.sid);
        if (recordings.length > 0) {
          const rec = recordings[0]!;
          const recording = await prisma.callRecording.create({
            data: {
              callLogId: callLog.id,
              storageUrl: `https://api.twilio.com${rec.uri.replace(".json", "")}`,
              storageProvider: "twilio",
              format: "mp3",
              durationSec: parseInt(rec.duration, 10) || 0,
            },
          });
          await prisma.callLog.update({
            where: { id: callLog.id },
            data: { recordingId: recording.id },
          });
        }
      }
    } catch {
      // Recording fetch failure shouldn't fail the sync
    }

    created++;
  }

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "TWILIO_CALLS_SYNCED",
    entityType: "CallLog",
    entityId: company.id,
    after: { total: twilioCalls.length, created, updated, skipped },
  });

  return json({
    total: twilioCalls.length,
    created,
    updated,
    skipped,
  });
});
