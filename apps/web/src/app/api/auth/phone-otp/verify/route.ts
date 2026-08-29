import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { json } from "@/lib/server";
import { normalizePhone, createPhoneSession, OTP_CONFIG } from "@/lib/phone-otp";
import { timingSafeEqual } from "node:crypto";

/**
 * POST /api/auth/phone-otp/verify — verify an OTP code and create a session.
 *
 * Body: `{ phone: string, code: string }`
 *
 * Finds the latest unused code for the phone, checks expiry + attempt
 * lockout (max 5), and does a constant-time code comparison. On success:
 * marks the code used, creates a real Better-Auth session, and attaches the
 * signed `Set-Cookie` header to the response.
 *
 * Returns `{ ok: true, user }` on success — the client then routes to
 * company selection / role home world (same as email login).
 */
export const POST = async (req: NextRequest) => {
  let body: { phone?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawPhone = body.phone?.trim();
  const code = body.code?.trim();
  if (!rawPhone || !code) {
    return json({ error: "Phone number and code are required." }, { status: 400 });
  }

  const phone = normalizePhone(rawPhone);
  if (phone.length < 10) {
    return json({ error: "Invalid phone number." }, { status: 400 });
  }

  if (code.length !== OTP_CONFIG.CODE_LENGTH) {
    return json({ error: `Code must be ${OTP_CONFIG.CODE_LENGTH} digits.` }, { status: 400 });
  }

  // Find the latest unused code for this phone.
  const otp = await prisma.phoneOtp.findFirst({
    where: { phone, usedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    return json({ error: "No active code found. Please request a new one." }, { status: 400 });
  }

  // Check expiry.
  if (otp.expiresAt < new Date()) {
    return json({ error: "This code has expired. Please request a new one." }, { status: 400 });
  }

  // Check attempt lockout.
  if (otp.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
    // Invalidate the code so it can't be retried.
    await prisma.phoneOtp.update({
      where: { id: otp.id },
      data: { usedAt: new Date() },
    });
    return json({ error: "Too many attempts. Please request a new code." }, { status: 429 });
  }

  // Constant-time code comparison.
  const expected = Buffer.from(otp.code, "utf-8");
  const provided = Buffer.from(code, "utf-8");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    // Increment attempts.
    await prisma.phoneOtp.update({
      where: { id: otp.id },
      data: { attempts: otp.attempts + 1 },
    });
    const remaining = OTP_CONFIG.MAX_ATTEMPTS - (otp.attempts + 1);
    return json({
      error: remaining > 0
        ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
        : "Incorrect code. Please request a new one.",
    }, { status: 400 });
  }

  // ── Resolve matching users by normalized phone ──
  // The send route stored a single userId (the first match), but multiple
  // users may share a phone number (e.g. one person with accounts at
  // multiple companies). In that case, return a user list so the client
  // can pick which account to log into — same UX as the email flow's
  // company picker.
  const matchedUsers = await prisma.user.findMany({
    where: { phoneNormalized: phone, active: true },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      companyId: true,
      memberships: {
        select: {
          companyId: true,
          role: true,
          company: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (matchedUsers.length === 0) {
    // Don't mark as used — let them retry with a different code if they
    // typed it wrong. But return a generic error that doesn't leak whether
    // the phone has an account.
    return json({ error: "Verification failed. Please request a new code and try again." }, { status: 400 });
  }

  if (matchedUsers.length === 1) {
    // ── Single user — mark code used + create session immediately ──
    await prisma.phoneOtp.update({
      where: { id: otp.id },
      data: { usedAt: new Date() },
    });

    const user = matchedUsers[0]!;
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
  }

  // ── Multiple users — return a picker list (don't mark code as used yet) ──
  // The client will show a user/company picker, then call
  // POST /api/auth/phone-otp/select-user with { otpId, userId } to
  // complete the login. The OTP stays valid until expiry or selection.
  return json({
    multiUser: true,
    otpId: otp.id,
    users: matchedUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      companies: u.memberships.map((uc) => ({
        id: uc.company.id,
        name: uc.company.name,
        role: uc.role,
      })),
    })),
  });
};
