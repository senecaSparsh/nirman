import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { json } from "@/lib/server";
import { normalizeTwilioNumber, mapTwilioCallStatus, mapTwilioDirection } from "@/lib/twilio-service";

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
 * For now, we accept all callbacks (in production, verify the signature
 * using the auth token).
 *
 * Query params: ?companyId=xxx (identifies the company)
 *
 * Twilio sends form-encoded data (application/x-www-form-urlencoded),
 * not JSON. The fields include:
 *   CallSid, From, To, Direction, CallStatus, Duration, StartTime, EndTime,
 *   RecordingUrl (if recorded), RecordingSid, Price, AccountSid
 */
export const POST = async (req: NextRequest) => {
  const url = new URL(req.url);
  const companyId = url.searchParams.get("companyId");

  if (!companyId) {
    return json({ error: "companyId query parameter is required" }, { status: 400 });
  }

  // Verify the company exists
  const company = await prisma.company.findFirst({
    where: { id: companyId, deletedAt: null },
  });
  if (!company) {
    return json({ error: "Company not found" }, { status: 404 });
  }

  // Parse form-encoded body (Twilio sends application/x-www-form-urlencoded)
  const rawBody = await req.text();
  const formData = new URLSearchParams(rawBody);
  const payload = Object.fromEntries(formData.entries());

  const callSid = payload.CallSid;
  const fromNumber = payload.From ?? "";
  const toNumber = payload.To ?? "";
  const direction = payload.Direction ?? "";
  const callStatus = payload.CallStatus ?? "";
  const duration = parseInt(payload.Duration ?? "0", 10) || 0;
  const startTime = payload.StartTime ?? null;
  const endTime = payload.EndTime ?? null;
  const recordingUrl = payload.RecordingUrl ?? null;
  const recordingSid = payload.RecordingSid ?? null;
  const price = payload.Price ? parseFloat(payload.Price.replace("-", "")) : null;

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
  });

  // Determine which side is the company number and which is external
  const companySideNumber = mappedDirection === "INBOUND" ? toNorm : fromNorm;
  const externalSideNumber = mappedDirection === "INBOUND" ? fromNorm : toNorm;

  // Match staff by the company phone's assignment
  let callerUserId: string | null = null;
  if (companyPhone?.assignedToUserId) {
    callerUserId = companyPhone.assignedToUserId;
  } else {
    // Try to match by user's phone number
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

  // Upsert the CallLog by providerCallId
  const existingCall = await prisma.callLog.findFirst({
    where: { companyId, providerCallId: callSid },
  });

  if (existingCall) {
    // Update the existing call with new status/timing
    const updated = await prisma.callLog.update({
      where: { id: existingCall.id },
      data: {
        status: mappedStatus,
        connectedAt: startTime ? new Date(startTime) : existingCall.connectedAt,
        endedAt: endTime ? new Date(endTime) : existingCall.endedAt,
        durationSec: duration || existingCall.durationSec,
        callCost: price != null ? price : undefined,
      },
    });

    // If a recording URL is provided and we don't have one yet, store it
    if (recordingUrl && !existingCall.recordingId) {
      const recording = await prisma.callRecording.create({
        data: {
          callLogId: updated.id,
          storageUrl: recordingUrl,
          storageProvider: "twilio",
          format: "mp3",
          durationSec: duration,
        },
      });
      await prisma.callLog.update({
        where: { id: updated.id },
        data: { recordingId: recording.id },
      });
    }

    return json({ ok: true, callLogId: updated.id });
  }

  // Create a new CallLog
  const callLog = await prisma.callLog.create({
    data: {
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
      recordingConsent: true, // Twilio records the consent beep config
      provider: "TWILIO",
      providerCallId: callSid,
      source: "AUTO",
      relatedCustomerId: matchedCustomer?.id ?? null,
      relatedSupplierId: matchedSupplier?.id ?? null,
      callCost: price,
    },
  });

  // Store recording if provided
  if (recordingUrl) {
    const recording = await prisma.callRecording.create({
      data: {
        callLogId: callLog.id,
        storageUrl: recordingUrl,
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

  return json({ ok: true, callLogId: callLog.id }, { status: 201 });
};
