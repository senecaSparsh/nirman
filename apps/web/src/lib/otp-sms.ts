/**
 * OTP SMS sender — delivers login codes over a real provider in production.
 *
 * Provider resolution order:
 *   1. MSG91 (India-first, DLT-compliant) — needs MSG91_AUTH_KEY +
 *      MSG91_TEMPLATE_ID (an approved DLT template containing {{otp}} or
 *      using MSG91's native OTP variable).
 *   2. Twilio SMS — needs TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN +
 *      TWILIO_PHONE_NUMBER (an SMS-capable number on the account).
 *   3. Unconfigured — returns { sent: false }; the API route must fail
 *      honestly instead of pretending the code was sent.
 *
 * In non-production nothing is sent — the route logs the code to the
 * server console instead.
 */

export function isOtpSmsConfigured(): boolean {
  if (process.env.NODE_ENV !== "production") return true; // dev console fallback
  return Boolean(
    (process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) ||
      (process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_PHONE_NUMBER),
  );
}

/** Normalise an Indian phone to the format each provider expects (E.164 / 91-prefixed). */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

async function sendViaMsg91(phone: string, code: string): Promise<{ sent: boolean; error?: string }> {
  const authKey = process.env.MSG91_AUTH_KEY!;
  const templateId = process.env.MSG91_TEMPLATE_ID!;
  const mobile = toE164(phone).replace("+", "");
  const url = `https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(templateId)}&mobile=${encodeURIComponent(mobile)}&authkey=${encodeURIComponent(authKey)}&otp=${encodeURIComponent(code)}`;
  try {
    const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { sent: false, error: `MSG91 ${res.status}` };
    const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (body.type && body.type !== "success") {
      return { sent: false, error: `MSG91: ${body.message ?? body.type}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "MSG91 network error" };
  }
}

async function sendViaTwilio(phone: string, code: string): Promise<{ sent: boolean; error?: string }> {
  try {
    const { default: TwilioSDK } = await import("twilio");
    const client = TwilioSDK(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
    await client.messages.create({
      to: toE164(phone),
      from: process.env.TWILIO_PHONE_NUMBER!,
      body: `Your Nirman login code is ${code}. It expires in 5 minutes. Do not share it.`,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "Twilio network error" };
  }
}

/**
 * Send an OTP code by SMS. Returns { sent: true } only when a real provider
 * accepted the message. Callers must treat sent:false as a hard failure.
 */
export async function sendOtpSms(phone: string, code: string): Promise<{ sent: boolean; error?: string }> {
  if (process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) {
    return sendViaMsg91(phone, code);
  }
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    return sendViaTwilio(phone, code);
  }
  return { sent: false, error: "No SMS provider configured" };
}
