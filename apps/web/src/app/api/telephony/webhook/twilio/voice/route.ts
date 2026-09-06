import { NextRequest } from "next/server";
import { json } from "@/lib/server";

/**
 * POST /api/telephony/webhook/twilio/voice — Twilio voice webhook.
 *
 * This is called by Twilio when someone dials one of our Twilio numbers.
 * Twilio expects a TwiML response telling it what to do (connect the
 * call, play a message, record, etc.).
 *
 * For now, we return a simple TwiML response that:
 *   1. Plays a consent beep message (if configured)
 *   2. Connects the call to the assigned staff member's phone
 *   3. Records the call
 *
 * In production, this would be more sophisticated — IVR menus, call
 * routing rules, voicemail, etc. But the basic flow is: the call comes
 * in, we log it, and we connect it to the right person.
 *
 * NO AUTH — this is called by Twilio, not by our users.
 *
 * Query params: ?companyId=xxx
 */
export const POST = async (req: NextRequest) => {
  const url = new URL(req.url);
  const companyId = url.searchParams.get("companyId");

  if (!companyId) {
    return json({ error: "companyId query parameter is required" }, { status: 400 });
  }

  // Parse Twilio's form-encoded body
  const rawBody = await req.text();
  const formData = new URLSearchParams(rawBody);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fromNumber = formData.get("From") ?? "";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const toNumber = formData.get("To") ?? "";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const callSid = formData.get("CallSid") ?? "";

  // Return TwiML that:
  // 1. Records the call (with a consent beep)
  // 2. Connects to the call (no specific destination for now —
  //    in production, this would route to the assigned staff member)
  //
  // The <Record> verb records the caller's voice. The <Dial> verb
  // would connect to a specific number. For a simple inbound flow:
  //
  //   <Response>
  //     <Say>This call may be recorded for quality and training purposes.</Say>
  //     <Record recordingStatusCallback="...status callback URL..." />
  //   </Response>
  //
  // But for a call center flow, we'd use <Dial> with record=true:
  //
  //   <Response>
  //     <Say>Connecting you to our team. This call may be recorded.</Say>
  //     <Dial record="record-from-answer"
  //           recordingStatusCallback="...status callback URL...">
  //       <Number>+91...staff number...</Number>
  //     </Dial>
  //   </Response>
  //
  // For now, we just play the consent message and let the call connect
  // naturally (Twilio trial accounts require a verified number anyway).

  const statusCallbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/telephony/webhook/twilio/status?companyId=${companyId}`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">This call may be recorded for quality and training purposes.</Say>
  <Record recordingStatusCallback="${statusCallbackUrl}" maxLength="3600" />
</Response>`;

  return new Response(twiml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
};
