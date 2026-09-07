import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { json } from "@/lib/server";
import {
  normalizeTwilioNumber,
  mapTwilioCallStatus,
  mapTwilioDirection,
  parseTwilioPrice,
  shouldRecordCall,
  isSafeRecordingUrl,
  verifyTwilioSignature,
} from "@/lib/twilio-service";

/**
 * POST /api/telephony/webhook/twilio/status — Twilio status callback.
 *
 * Twilio sends status callbacks at every call state transition:
 *   queued → ringing → in-progress → completed
 *
 * The callback includes the final call metadata (duration, cost,
 * recording URL if recording was enabled). We upsert the CallLog
 * by `providerCallId` (the Twilio CallSid).
 *
 * NO AUTH — verified by Twilio signature (X-Twilio-Signature header).
 * In dev without TWILIO_AUTH_TOKEN configured, verification is skipped
 * so local testing still works.
 *
 * Query params: ?companyId=xxx (identifies the company)
 *
 * Twilio sends form-encoded data (application/x-www-form-urlencoded),
 * not JSON. The fields include:
 *   CallSid, From, To, Direction, CallStatus, Duration, StartTime, EndTime,
 *   RecordingUrl (if recorded), RecordingSid, Price, AccountSid
 */
export const POST = async (req: NextRequest) => {
  try {
    const url = new URL(req.url);
    const companyId = url.searchParams.get("companyId");

    if (!companyId) {
      return json({ error: "companyId query parameter is required" }, { status: 400 });
    }

    // Parse form-encoded body BEFORE signature verification — the
    // signature is computed over the raw body bytes.
    const rawBody = await req.text();
    const formData = new URLSearchParams(rawBody);
    const payload = Object.fromEntries(formData.entries());

    // Verify the request actually came from Twilio.
    if (!verifyTwilioSignature(req, rawBody)) {
      return json({ error: "Invalid Twilio signature" }, { status: 403 });
    }

    // Verify the company exists
    const company = await prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true, recordingMode: true, recordingConsentBeep: true },
    });
    if (!company) {
      return json({ error: "Company not found" }, { status: 404 });
    }

    const callSid = payload.CallSid;
    const fromNumber = payload.From ?? "";
    const toNumber = payload.To ?? "";
    const direction = payload.Direction ?? "";
    const callStatus = payload.CallStatus ?? "";
    const duration = parseInt(payload.Duration ?? "0", 10) || 0;
    const startTime = payload.StartTime ?? null;
    const endTime = payload.EndTime ?? null;
    const recordingUrl = payload.RecordingUrl ?? null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const recordingSid = payload.RecordingSid ?? null;
    const price = parseTwilioPrice(payload.Price);

    if (!callSid) {
      return json({ error: "CallSid is required" }, { status: 400 });
    }

    const fromNorm = normalizeTwilioNumber(fromNumber);
    const toNorm = normalizeTwilioNumber(toNumber);
    const mappedStatus = mapTwilioCallStatus(callStatus);
    const mappedDirection = mapTwilioDirection(direction);

    // Find the company phone number (the Twilio-owned side)
    const companyPhone = await prisma.companyPhone.findFirst({
      where: {
        companyId,
        deletedAt: null,
        OR: [{ phoneNormalized: fromNorm }, { phoneNormalized: toNorm }],
      },
      include: {
        assignedTo: { select: { id: true, phoneNormalized: true } },
      },
    });

    // Determine which side is the company number and which is external
    const companySideNumber = mappedDirection === "INBOUND" ? toNorm : fromNorm;
    const externalSideNumber = mappedDirection === "INBOUND" ? fromNorm : toNorm;

    // Match staff by the company phone's assignment, with fallback to
    // matching the user's phone number (same logic as sync-calls).
    let callerUserId: string | null = null;
    if (companyPhone?.assignedToUserId) {
      callerUserId = companyPhone.assignedToUserId;
    } else {
      // Try to match by user's phone number (the company-side number
      // is the staff member's phone for outbound calls).
      const matchedUser = await prisma.user.findFirst({
        where: { phoneNormalized: companySideNumber, active: true },
        select: { id: true },
      });
      if (matchedUser) callerUserId = matchedUser.id;
    }

    // Match external number to customers/suppliers
    const last10 = externalSideNumber.slice(-10);
    const [matchedCustomer, matchedSupplier] = await Promise.all([
      prisma.customer.findFirst({
        where: {
          companyId,
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
          companyId,
          deletedAt: null,
          OR: [
            { phone: externalSideNumber },
            ...(last10.length >= 10 ? [{ phone: { contains: last10 } }] : []),
          ],
        },
        select: { id: true },
      }).catch(() => null),
    ]);

    // Derive recordingConsent from the actual recording config, not a
    // hardcoded true. The consent beep / recording policy was in effect
    // only if the company actually records this call.
    let recordCallsFlag = false;
    if (companyPhone?.assignedToUserId && company.recordingMode === "SELECTED") {
      const membership = await prisma.userCompany.findFirst({
        where: { companyId, userId: companyPhone.assignedToUserId },
        select: { recordCalls: true },
      });
      recordCallsFlag = membership?.recordCalls ?? false;
    }
    const recordingConsent = shouldRecordCall(company.recordingMode, recordCallsFlag);

    // Validate the recording URL with the SSRF guard before storing.
    // Twilio recording URLs are on twilio.com / twiliousercontent.com.
    const safeRecordingUrl =
      recordingUrl && isSafeRecordingUrl(recordingUrl) ? recordingUrl : null;

    // Upsert the CallLog by the unique (companyId, providerCallId)
    // constraint. This is race-safe — concurrent Twilio callbacks for
    // the same CallSid (retries, near-simultaneous state transitions)
    // will serialize at the DB level instead of creating duplicates.
    const callLog = await prisma.callLog.upsert({
      where: { companyId_providerCallId: { companyId, providerCallId: callSid } },
      update: {
        status: mappedStatus,
        connectedAt: startTime ? new Date(startTime) : undefined,
        endedAt: endTime ? new Date(endTime) : undefined,
        durationSec: duration || undefined,
        callCost: price != null ? price : undefined,
        // Backfill caller/companyPhone if they weren't set on the
        // initial create (e.g. first callback had no match yet).
        ...(callerUserId ? { callerUserId } : {}),
        ...(companyPhone ? { companyPhoneId: companyPhone.id } : {}),
      },
      create: {
        companyId,
        direction: mappedDirection,
        fromNumber: fromNorm,
        toNumber: toNorm,
        companyPhoneId: companyPhone?.id ?? null,
        callerUserId,
        status: mappedStatus,
        startedAt: startTime ? new Date(startTime) : new Date(),
        connectedAt: startTime ? new Date(startTime) : null,
        endedAt: endTime ? new Date(endTime) : null,
        durationSec: duration,
        recordingConsent,
        provider: "TWILIO",
        providerCallId: callSid,
        source: "AUTO",
        relatedCustomerId: matchedCustomer?.id ?? null,
        relatedSupplierId: matchedSupplier?.id ?? null,
        callCost: price,
      },
    });

    // If a recording URL is provided and the call doesn't have one yet,
    // store it. Only store SSRF-validated URLs.
    if (safeRecordingUrl && !callLog.recordingId) {
      const recording = await prisma.callRecording.create({
        data: {
          callLogId: callLog.id,
          storageUrl: safeRecordingUrl,
          storageProvider: "twilio",
          format: "mp3",
          durationSec: duration,
        },
      });
      await prisma.callLog.update({
        where: { id: callLog.id },
        data: { recordingId: recording.id },
      });
    }

    return json({ ok: true, callLogId: callLog.id });
  } catch (err) {
    // Return 200 so Twilio doesn't retry — call metadata is non-critical
    // and can be recovered via the sync-calls backfill endpoint.
    console.error("[twilio-status-webhook] Error:", err);
    return json({ ok: false, error: "Webhook processing failed" }, { status: 200 });
  }
};
