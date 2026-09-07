import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { json, ForbiddenError, UnauthorizedError } from "@/lib/server";
import { normalizePhone, normalizePhoneForLookup, createPhoneSession } from "@/lib/phone-otp";
import { ServiceError } from "@nirman/services";

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
  try {
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

    // Build all format variants so the lookup matches regardless of how the
    // phone was entered or stored (10-digit vs 12-digit with 91 prefix).
    const phoneVariants = normalizePhoneForLookup(rawPhone);

    // Verify the user exists, is active, and has this phone number
    const user = await prisma.user.findFirst({
      where: { id: userId, phoneNormalized: { in: phoneVariants }, active: true },
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
  } catch (err: unknown) {
    if (err instanceof ServiceError) {
      return json({ error: err.message }, { status: err.status ?? 400 });
    }
    if (err instanceof SyntaxError && err.message.includes("JSON")) {
      return json({ error: "Malformed JSON in request body" }, { status: 400 });
    }
    if (err instanceof ForbiddenError) {
      return json({ error: err.message }, { status: 403 });
    }
    if (err instanceof UnauthorizedError) {
      return json({ error: err.message }, { status: 401 });
    }
    const prismaCode = (err as { code?: string })?.code;
    if (prismaCode === "P2024") {
      console.error("[auth] Prisma P2024: connection pool exhausted");
      return json({ error: "Database busy — please retry shortly", retryable: true }, { status: 503, headers: { "Retry-After": "5" } });
    }
    if (prismaCode === "P1001") {
      console.error("[auth] Prisma P1001: database unreachable");
      return json({ error: "Database unreachable — please retry shortly", retryable: true }, { status: 503, headers: { "Retry-After": "10" } });
    }
    if (prismaCode === "P1002") {
      console.error("[auth] Prisma P1002: database timeout");
      return json({ error: "Database request timed out — please retry", retryable: true }, { status: 504 });
    }
    console.error("[auth] Unhandled error:", err);
    return json({ error: "Authentication failed" }, { status: 500 });
  }
};
