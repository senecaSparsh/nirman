import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { json } from "@/lib/server";
import { verifyTwilioSignature, normalizeTwilioNumber } from "@/lib/twilio-service";

/**
 * POST /api/telephony/webhook/twilio/voice — Twilio voice webhook.
 *
 * This is called by Twilio when someone dials one of our Twilio numbers.
 * Twilio expects a TwiML response telling it what to do (connect the
 * call, play a message, record, etc.).
 *
 * Flow:
 *   1. Verify the request came from Twilio (X-Twilio-Signature).
 *   2. Look up the company + the dialed number (To) → CompanyPhone.
 *   3. If the number is assigned to a staff member with a phone number,
 *      <Dial> the staff member's phone with call recording enabled
 *      (record="record-from-answer") and a consent announcement.
 *   4. If no staff member is assigned (or they have no phone), fall back
 *      to voicemail-style <Record> so the caller can leave a message.
 *
 * NO AUTH — verified by Twilio signature (X-Twilio-Signature header).
 * In dev without TWILIO_AUTH_TOKEN configured, verification is skipped
 * so local testing with the Twilio CLI still works.
 *
 * Query params: ?companyId=xxx
 */
export const POST = async (req: NextRequest) => {
  try {
    const url = new URL(req.url);
    const companyId = url.searchParams.get("companyId");

    if (!companyId) {
      return json({ error: "companyId query parameter is required" }, { status: 400 });
    }

    // Parse Twilio's form-encoded body BEFORE signature verification —
    // the signature is computed over the raw body bytes.
    const rawBody = await req.text();
    const formData = new URLSearchParams(rawBody);
    const fromNumber = formData.get("From") ?? "";
    const toNumber = formData.get("To") ?? "";
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const callSid = formData.get("CallSid") ?? "";

    // Reference fromNumber so it's available for future caller-ID logic
    // without triggering the unused-var lint. Currently only `toNumber`
    // is used to look up the assigned staff member.
    void fromNumber;

    // Verify the request actually came from Twilio.
    if (!verifyTwilioSignature(req, rawBody)) {
      return new Response("<!-- Invalid Twilio signature -->", {
        status: 403,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    const statusCallbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/telephony/webhook/twilio/status?companyId=${companyId}`;

    // Look up the company + the dialed Twilio number to find the
    // assigned staff member. The `To` field is the Twilio number that
    // was dialed — match it to a CompanyPhone by normalized number.
    const toNorm = normalizeTwilioNumber(toNumber);
    const companyPhone = await prisma.companyPhone.findFirst({
      where: {
        companyId,
        deletedAt: null,
        phoneNormalized: toNorm,
      },
      include: {
        assignedTo: {
          select: { id: true, phone: true, phoneNormalized: true, name: true },
        },
      },
    });

    // Resolve the company's recording config to decide whether to
    // record + whether to play the consent beep.
    const company = await prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: {
        recordingMode: true,
        recordingConsentBeep: true,
      },
    });

    // Per-number consent beep override (null = use company default).
    const consentBeep =
      companyPhone?.consentBeep ?? company?.recordingConsentBeep ?? true;

    // Determine the staff member's phone to dial. We use the assigned
    // user's phone number. If the CompanyPhone has no assignee, or the
    // assignee has no phone, we fall back to voicemail recording.
    const staffPhone = companyPhone?.assignedTo?.phoneNormalized
      ?? companyPhone?.assignedTo?.phone;

    const hasStaffToDial = !!staffPhone && staffPhone.replace(/\D/g, "").length >= 8;

    if (hasStaffToDial) {
      // ── Live call routing: <Dial> the staff member with recording ──
      // record-from-answer records both legs once the call is answered.
      // The recordingStatusCallback sends the recording URL to our
      // status webhook, which stores it on the CallLog.
      const consentSay = consentBeep
        ? `<Say voice="alice">This call may be recorded for quality and training purposes.</Say>`
        : "";

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${consentSay}
  <Dial record="record-from-answer" recordingStatusCallback="${statusCallbackUrl}" maxLength="3600">
    <Number>${escapeXml(staffPhone!)}</Number>
  </Dial>
</Response>`;

      return new Response(twiml, {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    // ── Voicemail fallback: no staff member assigned/available ──
    // Record the caller's message. The recordingStatusCallback will
    // send the recording URL to our status webhook.
    const consentSay = consentBeep
      ? `<Say voice="alice">No one is available to take your call. Please leave a message after the beep. This call may be recorded.</Say>`
      : `<Say voice="alice">Please leave a message after the beep.</Say>`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${consentSay}
  <Record recordingStatusCallback="${statusCallbackUrl}" maxLength="120" />
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  } catch (err) {
    // Fallback TwiML so Twilio doesn't retry. A 500 + empty body would
    // cause Twilio to retry the webhook up to 5 times, amplifying load.
    console.error("[twilio-voice-webhook] Error:", err);
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're sorry, we couldn't connect your call right now. Please try again later.</Say>
  <Hangup />
</Response>`;
    return new Response(fallbackTwiml, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }
};

/** Escape special XML characters for safe inclusion in TwiML. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
