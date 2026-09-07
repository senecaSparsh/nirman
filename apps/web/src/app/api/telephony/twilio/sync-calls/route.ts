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
  parseTwilioPrice,
  isSafeRecordingUrl,
  shouldRecordCall,
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

  // Fetch the company's recording mode once (same for all calls in this sync).
  const companyData = await prisma.company.findUnique({
    where: { id: company.id },
    select: { recordingMode: true },
  });
  const recordingMode = companyData?.recordingMode ?? "ALL";

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

    // Match staff by the company phone's assignment, with fallback to
    // matching the user's phone number — same logic as the status
    // webhook, so the same call gets the same callerUserId regardless
    // of whether it arrived via webhook or sync-calls.
    let callerUserId: string | null = companyPhone.assignedToUserId ?? null;
    if (!callerUserId) {
      const matchedUser = await prisma.user.findFirst({
        where: { phoneNormalized: companySideNumber, active: true },
        select: { id: true },
      });
      callerUserId = matchedUser?.id ?? null;
    }

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

    // Derive recordingConsent from the company's recording mode + the
    // assigned staff member's recordCalls flag (for SELECTED mode).
    let recordCallsFlag = false;
    if (companyPhone.assignedToUserId && recordingMode === "SELECTED") {
      const membership = await prisma.userCompany.findFirst({
        where: { companyId: company.id, userId: companyPhone.assignedToUserId },
        select: { recordCalls: true },
      });
      recordCallsFlag = membership?.recordCalls ?? false;
    }
    const recordingConsent = shouldRecordCall(recordingMode, recordCallsFlag);

    // Check if this call already exists (for accurate created/updated counts).
    // The actual write uses upsert (race-safe) — this findFirst is only
    // for reporting, so a rare race may miscount by one but won't duplicate.
    const existed = await prisma.callLog.findFirst({
      where: { companyId: company.id, providerCallId: call.sid },
      select: { id: true, recordingId: true },
    });

    // Upsert by the unique (companyId, providerCallId) constraint —
    // race-safe against concurrent sync-calls or webhook callbacks.
    const callLog = await prisma.callLog.upsert({
      where: { companyId_providerCallId: { companyId: company.id, providerCallId: call.sid } },
      update: {
        status: mappedStatus,
        durationSec: parseInt(call.duration, 10) || undefined,
        endedAt: call.endTime ? new Date(call.endTime) : undefined,
        callCost: parseTwilioPrice(call.price) ?? undefined,
      },
      create: {
        companyId: company.id,
        direction: mappedDirection,
        fromNumber: fromNorm,
        toNumber: toNorm,
        companyPhoneId: companyPhone.id,
        callerUserId,
        status: mappedStatus,
        startedAt: call.startTime ? new Date(call.startTime) : new Date(),
        connectedAt: call.startTime ? new Date(call.startTime) : null,
        endedAt: call.endTime ? new Date(call.endTime) : null,
        durationSec: parseInt(call.duration, 10),
        recordingConsent,
        provider: "TWILIO",
        providerCallId: call.sid,
        source: "AUTO",
        relatedCustomerId: matchedCustomer?.id ?? null,
        relatedSupplierId: matchedSupplier?.id ?? null,
        callCost: parseTwilioPrice(call.price),
      },
    });

    if (existed) {
      updated++;
    } else {
      created++;
    }

    // Try to fetch recording for this call (read-only).
    // Only fetch if the recording config says this call should be recorded
    // AND we don't already have a recording stored for this call.
    if (recordingConsent && !callLog.recordingId) {
      try {
        const recordings = await fetchCallRecordings(call.sid);
        if (recordings.length > 0) {
          const rec = recordings[0]!;
          // Construct the full recording URL and validate it with the
          // SSRF guard before storing (only allows twilio.com domains).
          const fullUrl = `https://api.twilio.com${rec.uri.replace(".json", "")}`;
          if (isSafeRecordingUrl(fullUrl)) {
            const recording = await prisma.callRecording.create({
              data: {
                callLogId: callLog.id,
                storageUrl: fullUrl,
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
    }
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
