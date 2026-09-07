import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { json } from "@/lib/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  normalizeTwilioNumber,
  isSafeRecordingUrl,
  shouldRecordCall,
  parseTwilioPrice,
} from "@/lib/twilio-service";

/**
 * POST /api/telephony/webhook — generic provider webhook receiver.
 *
 * NO AUTH — verified by provider signature (HMAC-SHA256).
 *
 * This is a generic/manual parser that:
 *   1. Verifies the webhook signature using the provider's secret from
 *      TelephonyProviderConfig.apiSecretRef.
 *   2. Parses the webhook body and normalizes the event.
 *   3. Upserts a CallLog with source="AUTO" by (companyId, providerCallId).
 *   4. Auto-matches parties by phone number to Users/Customers/Suppliers.
 *   5. Stores the recording URL if provided (SSRF-validated).
 *
 * Query params:
 *   ?provider=EXOTEL  — identifies which provider config to use
 *   ?companyId=xxx    — identifies the company (since webhook has no session)
 *
 * Signature verification:
 *   The provider sends an `x-signature` header (or `x-exotel-signature` for
 *   Exotel). We compute HMAC-SHA256 of the raw request body using the secret
 *   from TelephonyProviderConfig.apiSecretRef and compare in constant time.
 *
 * Since we don't have real provider SDKs yet, this implements the interface
 * and a generic/manual parser that stores the raw webhook and creates a
 * CallLog with source="AUTO".
 */
export const POST = async (req: NextRequest) => {
  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get("provider") ?? "MANUAL";
    const companyId = url.searchParams.get("companyId");

    if (!companyId) {
      return json({ error: "companyId query parameter is required" }, { status: 400 });
    }

    // Verify the company exists
    const company = await prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true, recordingMode: true },
    });
    if (!company) {
      return json({ error: "Company not found" }, { status: 404 });
    }

    // Get the raw body for signature verification
    const rawBody = await req.text();

    // Find the provider config for this company + provider
    const providerConfig = await prisma.telephonyProviderConfig.findFirst({
      where: { companyId, provider, deletedAt: null, active: true },
    });

    // Signature verification — FAIL CLOSED when a provider config exists.
    // A configured provider must sign its webhooks; an unsigned request
    // against a configured provider is treated as an attack, not a test.
    // Only the "MANUAL" provider (no config row) accepts unsigned payloads,
    // and even then only outside production.
    if (providerConfig) {
      const secret = providerConfig.apiSecretRef;
      const signatureHeader =
        req.headers.get("x-signature") ??
        req.headers.get("x-exotel-signature") ??
        req.headers.get("x-knowlarity-signature") ??
        req.headers.get("x-twilio-signature");

      if (!signatureHeader) {
        return json({ error: "Missing webhook signature" }, { status: 401 });
      }
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      const expectedBuf = Buffer.from(expected);
      const providedBuf = Buffer.from(signatureHeader);
      if (
        expectedBuf.length !== providedBuf.length ||
        !timingSafeEqual(expectedBuf, providedBuf)
      ) {
        return json({ error: "Invalid webhook signature" }, { status: 401 });
      }
    } else if (provider !== "MANUAL" || process.env.NODE_ENV === "production") {
      // No provider config AND not the explicit MANUAL provider, or we're in
      // production — reject. In production, even MANUAL requires a config row
      // with a secret, because an unsigned endpoint is an open injection point.
      return json({ error: "No telephony provider configured for this company" }, { status: 404 });
    }

    // Parse the webhook body
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      // Some providers send form-encoded data
      try {
        const formData = new URLSearchParams(rawBody);
        payload = Object.fromEntries(formData.entries());
      } catch {
        return json({ error: "Unable to parse webhook body" }, { status: 400 });
      }
    }

    // ── Generic parser: extract common fields from the webhook payload ──
    const parsed = parseGenericWebhook(payload, provider);

    if (!parsed) {
      // Store the raw webhook for debugging even if we can't parse it
      console.warn("[webhook] Unparseable webhook payload for provider:", provider, payload);
      return json({ ok: true, message: "Webhook received but could not parse call data" }, { status: 200 });
    }

    // ── Auto-match parties by phone number ──
    const fromNorm = normalizeTwilioNumber(parsed.fromNumber);
    const toNorm = normalizeTwilioNumber(parsed.toNumber);

    // Match the company phone number
    const companyPhone = await prisma.companyPhone.findFirst({
      where: {
        companyId,
        deletedAt: null,
        OR: [{ phoneNormalized: fromNorm }, { phoneNormalized: toNorm }],
      },
    });

    // Determine direction: if the company number is the "to" number → INBOUND
    // If the company number is the "from" number → OUTBOUND
    let direction = parsed.direction;
    if (!direction && companyPhone) {
      direction = companyPhone.phoneNormalized === toNorm ? "INBOUND" : "OUTBOUND";
    }
    direction = direction ?? "INBOUND";

    // Match staff by phone number (the company side)
    const companySideNumber = direction === "INBOUND" ? toNorm : fromNorm;
    const externalSideNumber = direction === "INBOUND" ? fromNorm : toNorm;

    // Find the staff user assigned to this company phone
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

    // Match external number to customers/suppliers (by phone field — may be
    // unnormalized, so we also try a contains match on the last 10 digits)
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

    // Derive recordingConsent from the company's recording mode + the
    // assigned staff member's recordCalls flag (for SELECTED mode).
    let recordCallsFlag = false;
    if (callerUserId && company.recordingMode === "SELECTED") {
      const membership = await prisma.userCompany.findFirst({
        where: { companyId, userId: callerUserId },
        select: { recordCalls: true },
      });
      recordCallsFlag = membership?.recordCalls ?? false;
    }
    const recordingConsent = shouldRecordCall(company.recordingMode, recordCallsFlag);

    // Validate the recording URL with the SSRF guard before storing.
    const safeRecordingUrl =
      parsed.recordingUrl && isSafeRecordingUrl(parsed.recordingUrl)
        ? parsed.recordingUrl
        : null;

    // ── Upsert the CallLog ──
    // If we have a providerCallId, upsert by the unique (companyId, providerCallId)
    // constraint — race-safe against concurrent callbacks. If no providerCallId,
    // just create (can't upsert without a unique key).
    let callLog;
    if (parsed.providerCallId) {
      callLog = await prisma.callLog.upsert({
        where: { companyId_providerCallId: { companyId, providerCallId: parsed.providerCallId } },
        update: {
          status: parsed.status ?? undefined,
          connectedAt: parsed.connectedAt ? new Date(parsed.connectedAt) : undefined,
          endedAt: parsed.endedAt ? new Date(parsed.endedAt) : undefined,
          durationSec: parsed.durationSec ?? undefined,
          ringDurationSec: parsed.ringDurationSec ?? undefined,
          disposition: parsed.disposition ?? undefined,
          callCost: parsed.callCost != null ? parsed.callCost : undefined,
          // Backfill caller/companyPhone if they weren't set on the initial create
          ...(callerUserId ? { callerUserId } : {}),
          ...(companyPhone ? { companyPhoneId: companyPhone.id } : {}),
        },
        create: {
          companyId,
          direction,
          fromNumber: fromNorm,
          toNumber: toNorm,
          companyPhoneId: companyPhone?.id ?? null,
          callerUserId,
          status: parsed.status ?? "RINGING",
          startedAt: parsed.startedAt ? new Date(parsed.startedAt) : new Date(),
          connectedAt: parsed.connectedAt ? new Date(parsed.connectedAt) : null,
          endedAt: parsed.endedAt ? new Date(parsed.endedAt) : null,
          durationSec: parsed.durationSec ?? 0,
          ringDurationSec: parsed.ringDurationSec ?? 0,
          disposition: parsed.disposition ?? null,
          recordingConsent,
          provider,
          providerCallId: parsed.providerCallId,
          source: "AUTO",
          relatedCustomerId: matchedCustomer?.id ?? null,
          relatedSupplierId: matchedSupplier?.id ?? null,
          callCost: parsed.callCost ?? null,
        },
      });
    } else {
      callLog = await prisma.callLog.create({
        data: {
          companyId,
          direction,
          fromNumber: fromNorm,
          toNumber: toNorm,
          companyPhoneId: companyPhone?.id ?? null,
          callerUserId,
          status: parsed.status ?? "RINGING",
          startedAt: parsed.startedAt ? new Date(parsed.startedAt) : new Date(),
          connectedAt: parsed.connectedAt ? new Date(parsed.connectedAt) : null,
          endedAt: parsed.endedAt ? new Date(parsed.endedAt) : null,
          durationSec: parsed.durationSec ?? 0,
          ringDurationSec: parsed.ringDurationSec ?? 0,
          disposition: parsed.disposition ?? null,
          recordingConsent,
          provider,
          providerCallId: null,
          source: "AUTO",
          relatedCustomerId: matchedCustomer?.id ?? null,
          relatedSupplierId: matchedSupplier?.id ?? null,
          callCost: parsed.callCost ?? null,
        },
      });
    }

    // ── Handle recording URL ──
    // Only store if the recording config says this call should be recorded
    // AND we don't already have a recording stored for this call.
    if (safeRecordingUrl && !callLog.recordingId && recordingConsent) {
      const recording = await prisma.callRecording.create({
        data: {
          callLogId: callLog.id,
          storageUrl: safeRecordingUrl,
          storageProvider: "provider",
          format: parsed.recordingFormat ?? "mp3",
          durationSec: parsed.durationSec ?? 0,
        },
      });
      await prisma.callLog.update({
        where: { id: callLog.id },
        data: { recordingId: recording.id },
      });
    }

    return json({ ok: true, callLogId: callLog.id }, { status: 200 });
  } catch (err) {
    // Return 200 so the provider doesn't retry — call metadata is non-critical
    // and can be recovered via the sync-calls backfill endpoint.
    console.error("[telephony-webhook] Error:", err);
    return json({ ok: false, error: "Webhook processing failed" }, { status: 200 });
  }
};

// ── Generic webhook parser ──
interface ParsedWebhook {
  direction?: string;
  fromNumber: string;
  toNumber: string;
  status?: string;
  startedAt?: string;
  connectedAt?: string;
  endedAt?: string;
  durationSec?: number;
  ringDurationSec?: number;
  disposition?: string;
  recordingUrl?: string;
  recordingFormat?: string;
  providerCallId?: string;
  callCost?: number;
}

/**
 * Generic webhook parser — tries to extract call data from various provider
 * payload formats by checking common field name variants.
 */
function parseGenericWebhook(payload: Record<string, unknown>, provider: string): ParsedWebhook | null {
  const get = (keys: string[]): unknown => {
    for (const k of keys) {
      if (payload[k] != null && payload[k] !== "") return payload[k];
    }
    return undefined;
  };

  const fromNumber = String(
    get(["from", "From", "caller", "Caller", "source", "src", "CallingPartyNumber", "fromNumber"]) ?? "",
  );
  const toNumber = String(
    get(["to", "To", "callee", "Callee", "destination", "dest", "CalledPartyNumber", "toNumber"]) ?? "",
  );

  if (!fromNumber && !toNumber) return null;

  const status = String(get(["status", "Status", "callStatus", "CallStatus", "state", "State"]) ?? "");
  const direction = String(get(["direction", "Direction", "type", "Type"]) ?? "");
  const startedAt = String(get(["startTime", "startedAt", "created_at", "createdAt", "timestamp", "time"]) ?? "");
  const connectedAt = String(get(["connectedAt", "answerTime", "answeredAt", "connect_time"]) ?? "");
  const endedAt = String(get(["endTime", "endedAt", "end_time", "hangupTime"]) ?? "");
  const durationSec = Number(get(["duration", "durationSec", "callDuration", "Duration", "DurationInSeconds", "duration_sec"]) ?? 0) || undefined;
  const ringDurationSec = Number(get(["ringDuration", "ringDurationSec", "RingDuration", "ring_duration"]) ?? 0) || undefined;
  const recordingUrl = String(get(["recordingUrl", "RecordingUrl", "recording_url", "record_url"]) ?? "");
  const recordingFormat = String(get(["recordingFormat", "RecordingFormat"]) ?? "");
  const providerCallId = String(get(["callId", "CallId", "call_id", "CallSid", "callUUID", "id"]) ?? "");
  const rawCost = get(["cost", "callCost", "CallCost", "price", "Price"]);
  const callCost = parseTwilioPrice(typeof rawCost === "string" ? rawCost : null);

  // Map provider-specific status names to our schema
  const statusMap: Record<string, string> = {
    // Exotel
    "in-progress": "ANSWERED",
    "completed": "ANSWERED",
    "failed": "FAILED",
    "busy": "BUSY",
    "no-answer": "MISSED",
    "canceled": "REJECTED",
    "ringing": "RINGING",
    // Twilio
    "queued": "RINGING",
    "initiated": "RINGING",
  };
  const mappedStatus = (statusMap[status.toLowerCase()] ?? (status ? status.toUpperCase() : undefined)) || undefined;

  // provider is used for signature verification above, not for parsing —
  // the generic parser extracts fields by name across all providers.
  void provider;

  return {
    direction: direction || undefined,
    fromNumber,
    toNumber,
    status: mappedStatus,
    startedAt: startedAt || undefined,
    connectedAt: connectedAt || undefined,
    endedAt: endedAt || undefined,
    durationSec,
    ringDurationSec,
    recordingUrl: recordingUrl || undefined,
    recordingFormat: recordingFormat || undefined,
    providerCallId: providerCallId || undefined,
    callCost: callCost ?? undefined,
  };
}
