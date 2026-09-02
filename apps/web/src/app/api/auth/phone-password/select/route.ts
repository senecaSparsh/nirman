import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { json } from "@/lib/server";
import { normalizePhone, createPhoneSession } from "@/lib/phone-otp";

/**
 * POST /api/auth/phone-password/select — select a specific user account
 * when multiple users share the same phone number AND password.
 *
 * Body: `{ phone: string, userId: string }`
 *
 * This is the Shape C scenario from the design doc: two separate User rows
 * with the same phone and password. The phone-password route returns a
 * multiUser list; the client shows an account picker; the user picks one
 * and this endpoint creates the session for that specific user.
 *
 * Security: we re-verify that the userId actually has the given phone
 * number (prevents session hijacking by passing an arbitrary userId).
 */
export const POST = async (req: NextRequest) => {
  let body: { phone?: string; userId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawPhone = body.phone?.trim();
  const userId = body.userId?.trim();
  if (!rawPhone || !userId) {
    return json({ error: "Phone number and user ID are required." }, { status: 400 });
  }

  const phone = normalizePhone(rawPhone);
  if (phone.length < 10) {
    return json({ error: "Invalid phone number." }, { status: 400 });
  }

  // Verify the user exists, is active, and has this phone number
  const user = await prisma.user.findFirst({
    where: { id: userId, phoneNormalized: phone, active: true },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      mustChangePassword: true,
      memberships: {
        select: {
          companyId: true,
          role: true,
          company: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!user) {
    return json({ error: "Account not found or phone number mismatch." }, { status: 404 });
  }

  // Update last login
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: clientIp,
    },
  });

  const { setCookieHeader } = await createPhoneSession(user.id);

  // If user has multiple memberships, return company picker
  if (user.memberships.length > 1) {
    return json({
      ok: true,
      requiresCompanySelect: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      companies: user.memberships.map((uc) => ({
        id: uc.company.id,
        name: uc.company.name,
        role: uc.role,
      })),
      mustChangePassword: user.mustChangePassword,
    }, {
      status: 200,
      headers: { "Set-Cookie": setCookieHeader },
    });
  }

  return json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    mustChangePassword: user.mustChangePassword,
  }, {
    status: 200,
    headers: { "Set-Cookie": setCookieHeader },
  });
};
