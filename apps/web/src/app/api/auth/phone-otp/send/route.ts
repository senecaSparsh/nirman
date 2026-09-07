import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { json } from "@/lib/server";
import { normalizePhone, normalizePhoneForLookup, generateOtpCode, OTP_CONFIG } from "@/lib/phone-otp";

/**
 * POST /api/auth/phone-otp/send — request an OTP code.
 *
 * Body: `{ phone: string }`
 *
 * Finds active User(s) by normalised phone (via the indexed `phoneNormalized`
 * column), generates a 6-digit code, stores it in `PhoneOtp` with a 5-minute
 * TTL, and invalidates prior unused codes for that phone (only the newest
 * code is valid).
 *
 * **Always returns `{ ok: true }`** — never leaks whether the phone number
 * has an account. This prevents user-enumeration attacks.
 *
 * Rate limited: max 3 sends per phone per 10 minutes, and max 10 sends per
 * IP address per 10 minutes. Exceeding either returns 429.
 *
 * The OTP is logged to the server console for dev (no SMS provider wired in
 * yet). Before production, wire MSG91/Twilio/Gupshup to actually send the
 * code via SMS.
 */

const SEND_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SENDS_PER_PHONE = 3;
const MAX_SENDS_PER_IP = 10;

export const POST = async (req: NextRequest) => {
  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawPhone = body.phone?.trim();
  if (!rawPhone) {
    return json({ error: "Phone number is required." }, { status: 400 });
  }

  const phone = normalizePhone(rawPhone);
  if (phone.length < 10) {
    return json({ error: "Please enter a valid phone number." }, { status: 400 });
  }

  // ── Rate limiting ──
  // Per-phone: count OTP records created for this phone in the last 10 min.
  const windowStart = new Date(Date.now() - SEND_WINDOW_MS);
  const recentByPhone = await prisma.phoneOtp.count({
    where: { phone, createdAt: { gte: windowStart } },
  });
  if (recentByPhone >= MAX_SENDS_PER_PHONE) {
    return json(
      { error: "Too many code requests for this phone number. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  // Per-IP: use the x-forwarded-for header (or fall back to the connection IP).
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const recentByIp = await prisma.phoneOtp.count({
    where: { clientIp, createdAt: { gte: windowStart } },
  });
  if (recentByIp >= MAX_SENDS_PER_IP) {
    return json(
      { error: "Too many code requests from this device. Please try again later." },
      { status: 429 },
    );
  }

  // ── Find the user by normalized phone (indexed lookup, no full-table scan) ──
  // Use variant lookup so "+91 70179 88293" matches a user stored as "7017988293".
  const phoneVariants = normalizePhoneForLookup(rawPhone);
  const matchedUser = await prisma.user.findFirst({
    where: { phoneNormalized: { in: phoneVariants }, active: true },
    select: { id: true, name: true },
  });

  // Invalidate prior unused codes for this phone — only the newest is valid.
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
      userId: matchedUser?.id ?? null,
      clientIp,
    },
  });

  // Dev only: log the OTP to the server console since there's no SMS provider.
  // In production, replace this with an actual SMS send (MSG91/Twilio/Gupshup).
  if (process.env.NODE_ENV !== "production") {
    console.log(`[Phone OTP] ${phone} → code: ${code} (expires in ${OTP_CONFIG.TTL_MINUTES} min)`);
  }

  // Always return ok — never leak whether the phone has an account.
  return json({ ok: true }, { status: 200 });
};
