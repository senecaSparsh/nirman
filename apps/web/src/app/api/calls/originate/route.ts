import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, getCurrentUser, getUserPermissions, json } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { normalizePhone } from "@/lib/phone-otp";
import { isTwilioConfigured, originateBridgedCall } from "@/lib/twilio-service";

/**
 * POST /api/calls/originate — click-to-call.
 *
 * The staff member taps a number in the app → we call THEIR phone first;
 * when they answer, the bridge TwiML dials the customer with the staff
 * member's verified number as the caller ID. The customer sees a normal
 * call from the staff member — tracked + recorded on our side.
 *
 * Body: {
 *   toNumber: string            // customer/supplier/any E.164 or 10-digit IN
 *   relatedCustomerId? relatedSupplierId? relatedProjectId?
 * }
 *
 * Requires CALL_CREATE. The caller must have a phone number on their
 * user record (that's the first leg).
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const perms = await getUserPermissions();
  if (!perms.includes(PERM.CALL_CREATE)) {
    return json({ error: "Forbidden" }, { status: 403 });
  }
  const company = await getCompany();

  const body = await req.json().catch(() => ({}));
  const { toNumber, relatedCustomerId, relatedSupplierId, relatedProjectId } = body as {
    toNumber?: string;
    relatedCustomerId?: string;
    relatedSupplierId?: string;
    relatedProjectId?: string;
  };
  if (!toNumber?.trim()) {
    return json({ error: "toNumber is required" }, { status: 400 });
  }

  // Staff leg = the caller's own phone (must be set on their user record)
  let staffRaw = user.phone;
  if (!staffRaw) {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { phone: true, phoneNormalized: true },
    });
    staffRaw = dbUser?.phone ?? (dbUser?.phoneNormalized ? `+${dbUser.phoneNormalized}` : null);
  }
  if (!staffRaw) {
    return json({ error: "Your user account has no phone number to call back on" }, { status: 400 });
  }
  const staffE164 = toE164(staffRaw);
  const customerE164 = toE164(toNumber);
  if (!staffE164 || !customerE164) {
    return json({ error: "Could not parse phone numbers" }, { status: 400 });
  }

  // Find the company's Twilio number to place the staff leg from
  const twilioPhone = await prisma.companyPhone.findFirst({
    where: { companyId: company.id, provider: "TWILIO", status: "ACTIVE", deletedAt: null },
    select: { id: true, phoneNumber: true },
  });
  if (!twilioPhone || !isTwilioConfigured()) {
    return json({ error: "No calling provider configured for this company" }, { status: 503 });
  }

  const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const call = await originateBridgedCall({
    staffPhoneE164: staffE164,
    customerNumberE164: customerE164,
    callerIdE164: staffE164, // customer sees the staff member's own number
    twilioNumberE164: twilioPhone.phoneNumber.startsWith("+")
      ? twilioPhone.phoneNumber
      : `+${twilioPhone.phoneNumber}`,
    bridgeBaseUrl: baseURL,
    companyId: company.id,
  });

  // Pre-create the CallLog — the status webhook upserts lifecycle +
  // recording onto this same row via providerCallId.
  const callLog = await prisma.callLog.create({
    data: {
      companyId: company.id,
      direction: "OUTBOUND",
      fromNumber: normalizePhone(staffE164),
      toNumber: normalizePhone(customerE164),
      companyPhoneId: twilioPhone.id,
      callerUserId: user.id,
      status: "RINGING",
      startedAt: new Date(),
      provider: "TWILIO",
      providerCallId: call.sid,
      source: "APP",
      relatedCustomerId: relatedCustomerId ?? null,
      relatedSupplierId: relatedSupplierId ?? null,
      relatedProjectId: relatedProjectId ?? null,
    },
  });

  return json({ callSid: call.sid, status: call.status, callLogId: callLog.id }, { status: 201 });
});

/** Normalize to E.164 — India default for 10-digit numbers. */
function toE164(raw: string): string | null {
  const src = raw.trim();
  const digits = src.replace(/\D/g, "");
  if (!digits) return null;
  if (src.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return `+${digits}`;
}
