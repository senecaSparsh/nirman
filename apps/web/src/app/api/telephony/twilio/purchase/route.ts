import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getActingRole, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { logAction } from "@nirman/services";
import {
  isTwilioConfigured,
  normalizeTwilioNumber,
  purchaseTwilioNumber,
} from "@/lib/twilio-service";

/**
 * POST /api/telephony/twilio/purchase — buy a number on the platform's
 * shared Twilio account and provision it for this company.
 *
 * OWNER-only. This spends real money on the platform's Twilio account —
 * that's the "get a number from Nirman" path: we own the number, the
 * company uses it, we control routing (voice webhook → staff <Dial>).
 *
 * The purchase sets the number's voice + status webhooks immediately, so
 * the number is routable the moment it lands — inbound calls hit our
 * voice webhook, which <Dial>s whoever the number is assigned to.
 *
 * Body: { phoneNumber: string, label?: string }
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.TELEPHONY_MANAGE);
  if ((await getActingRole()) !== "OWNER") {
    return json({ error: "Only the owner can purchase Twilio numbers" }, { status: 403 });
  }
  if (!isTwilioConfigured()) {
    return json({ error: "Twilio is not configured" }, { status: 503 });
  }
  const company = await getCompany();

  const body = await req.json().catch(() => ({}));
  const { phoneNumber, label } = body as { phoneNumber?: string; label?: string };
  if (!phoneNumber || typeof phoneNumber !== "string") {
    return json({ error: "phoneNumber is required" }, { status: 400 });
  }

  const normalized = normalizeTwilioNumber(phoneNumber);

  // Guard against double-provisioning: the number must not already be a
  // CompanyPhone for ANY company (providerNumberId is globally unique).
  const existing = await prisma.companyPhone.findFirst({
    where: { provider: "TWILIO", phoneNormalized: normalized, deletedAt: null },
    select: { id: true, companyId: true },
  });
  if (existing) {
    return json(
      { error: existing.companyId === company.id
          ? "This number is already provisioned for your company"
          : "This number is already in use by another company" },
      { status: 409 },
    );
  }

  const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Purchase on Twilio — this bills the platform account. The webhook is
  // configured in the same call so the number is routable immediately.
  let purchased: { sid: string; phoneNumber: string; friendlyName: string | null };
  try {
    purchased = await purchaseTwilioNumber(phoneNumber, baseURL, company.id);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Twilio purchase failed";
    const status = (err as { status?: number })?.status;
    if (status === 400) {
      // e.g. trial account can't buy, or number requires verification
      return json({ error: `Twilio could not provision this number: ${msg}` }, { status: 400 });
    }
    throw err;
  }

  const phone = await prisma.companyPhone.create({
    data: {
      companyId: company.id,
      phoneNumber: purchased.phoneNumber,
      phoneNormalized: normalizeTwilioNumber(purchased.phoneNumber),
      numberType: "VIRTUAL",
      provider: "TWILIO",
      providerNumberId: purchased.sid,
      label: label ?? purchased.friendlyName ?? null,
      status: "ACTIVE",
    },
  });

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "TWILIO_NUMBER_PURCHASED",
    entityType: "CompanyPhone",
    entityId: phone.id,
    after: { phoneNumber: phone.phoneNumber, sid: purchased.sid },
  });

  return json({ phone, sid: purchased.sid }, { status: 201 });
});
