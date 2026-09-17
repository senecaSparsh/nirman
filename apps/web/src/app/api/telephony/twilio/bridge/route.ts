import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { json } from "@/lib/server";
import { verifyTwilioSignature } from "@/lib/twilio-service";

/**
 * POST /api/telephony/twilio/bridge — TwiML for the second leg of a
 * click-to-call bridge.
 *
 * Flow: /api/calls/originate creates an outbound call TO THE STAFF
 * MEMBER's phone with this URL as the answer TwiML. When staff answers,
 * Twilio fetches this TwiML, which <Dial>s the customer with the staff
 * member's verified Indian number as the caller ID — the customer sees
 * a normal Indian call, never the platform/Twilio number.
 *
 * Query params: companyId, to (customer E.164), callerId (staff E.164).
 *
 * Signature-verified like the other Twilio webhooks.
 */
export const POST = async (req: NextRequest) => {
  try {
    const url = new URL(req.url);
    const companyId = url.searchParams.get("companyId");
    const to = url.searchParams.get("to");
    const callerId = url.searchParams.get("callerId");
    if (!companyId || !to || !callerId) {
      return json({ error: "companyId, to and callerId are required" }, { status: 400 });
    }

    const rawBody = await req.text();
    if (!verifyTwilioSignature(req, rawBody)) {
      return new Response("<!-- Invalid Twilio signature -->", {
        status: 403,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    const company = await prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { recordingConsentBeep: true },
    });
    const consentSay = company?.recordingConsentBeep !== false
      ? `<Say voice="alice">This call may be recorded.</Say>`
      : "";

    const statusCallback = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/telephony/webhook/twilio/status?companyId=${encodeURIComponent(companyId)}`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${consentSay}
  <Dial callerId="${escapeXml(callerId)}" record="record-from-answer" recordingStatusCallback="${escapeXml(statusCallback)}" maxLength="3600">
    <Number>${escapeXml(to)}</Number>
  </Dial>
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  } catch (err) {
    console.error("[twilio-bridge] Error:", err);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">We could not connect your call. Please try again.</Say><Hangup /></Response>`,
      { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } },
    );
  }
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
