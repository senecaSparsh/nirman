import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { normalizePhone, generateOtpCode, OTP_CONFIG } from "@/lib/phone-otp";
import { sendOtpSms } from "@/lib/otp-sms";
import { findSuppliersByPhone } from "@/lib/supplier-portal-auth";
import { apiHandler, json } from "@/lib/server";

/**
 * POST /api/supplier-portal/auth/otp/send — request an OTP for supplier
 * portal login. Shares the PhoneOtp table with the customer portal (proof of
 * phone possession is identity-agnostic); the resolved subject is stored as
 * `supplier:<id>`. Always returns { ok: true } — no account enumeration.
 */
const SEND_WINDOW_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_PHONE = 3;

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!rawPhone) return json({ error: "Phone number is required." }, { status: 400 });

  const phone = normalizePhone(rawPhone);
  if (phone.length < 10) return json({ error: "Please enter a valid phone number." }, { status: 400 });

  const windowStart = new Date(Date.now() - SEND_WINDOW_MS);
  const recentCount = await prisma.phoneOtp.count({
    where: { phone, createdAt: { gte: windowStart } },
  });
  if (recentCount >= MAX_SENDS_PER_PHONE) {
    return json({ error: "Too many code requests. Please try again in a few minutes." }, { status: 429 });
  }

  const suppliers = await findSuppliersByPhone(rawPhone);

  await prisma.phoneOtp.updateMany({
    where: { phone, usedAt: null },
    data: { usedAt: new Date() },
  });

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_CONFIG.TTL_MINUTES * 60 * 1000);
  await prisma.phoneOtp.create({
    data: {
      phone,
      code,
      expiresAt,
      userId: suppliers[0] ? `supplier:${suppliers[0].id}` : null,
      clientIp: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
    },
  });

  if (process.env.NODE_ENV !== "production") {
    console.log(`[Supplier Portal OTP] ${phone} → code: ${code} (expires in ${OTP_CONFIG.TTL_MINUTES} min) — ${suppliers.length} supplier(s) matched`);
  } else {
    const sent = await sendOtpSms(phone, code, { companyId: suppliers[0]?.companyId });
    if (!sent.sent) {
      console.error(`[Supplier Portal OTP] SMS send failed for ${phone}: ${sent.error}`);
      return json(
        { error: "We couldn't send the code right now. Please try again later or contact the site office." },
        { status: 503 },
      );
    }
  }

  return json({ ok: true });
}, { skipSession: true, rateLimit: "auth" });
