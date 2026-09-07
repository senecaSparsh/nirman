import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { json } from "@/lib/server";
import { createPhoneSession, normalizePhoneForLookup } from "@/lib/phone-otp";

/**
 * POST /api/auth/phone-otp/select-user
 *
 * Completes phone-OTP login when multiple users share the same phone number.
 * The verify route returns `{ multiUser: true, otpId, users: [...] }` instead
 * of creating a session; the client shows a user picker, then calls this
 * endpoint with the chosen `{ otpId, userId }` to create the session.
 *
 * Security:
 *   - The OTP must exist, not be used, and not be expired.
 *   - The userId must match a user with the same phoneNormalized as the OTP.
 *   - The user must be active.
 */
export const POST = async (req: NextRequest) => {
  let body: { otpId?: string; userId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { otpId, userId } = body;
  if (!otpId || !userId) {
    return json({ error: "otpId and userId are required." }, { status: 400 });
  }

  // 1. Validate the OTP is still valid (not used, not expired).
  const otp = await prisma.phoneOtp.findUnique({ where: { id: otpId } });
  if (!otp || otp.usedAt) {
    return json({ error: "This code is no longer valid. Please request a new one." }, { status: 400 });
  }
  if (otp.expiresAt < new Date()) {
    return json({ error: "This code has expired. Please request a new one." }, { status: 400 });
  }

  // 2. Validate the selected user matches the OTP's phone + is active.
  // Use variant lookup because otp.phone may be 12-digit ("917017988293")
  // while the user's phoneNormalized is 10-digit ("7017988293").
  const phoneVariants = normalizePhoneForLookup(otp.phone);
  const user = await prisma.user.findFirst({
    where: { id: userId, phoneNormalized: { in: phoneVariants }, active: true },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) {
    return json({ error: "Selected account is not valid for this phone number." }, { status: 400 });
  }

  // 3. Mark the OTP as used + create the session.
  await prisma.phoneOtp.update({
    where: { id: otpId },
    data: { usedAt: new Date(), userId: user.id },
  });

  const { setCookieHeader } = await createPhoneSession(user.id);

  return json(
    {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    },
    {
      status: 200,
      headers: { "Set-Cookie": setCookieHeader },
    },
  );
};
