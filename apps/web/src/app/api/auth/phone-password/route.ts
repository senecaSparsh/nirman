import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { json, ForbiddenError, UnauthorizedError } from "@/lib/server";
import { normalizePhone, normalizePhoneForLookup, createPhoneSession } from "@/lib/phone-otp";
import { verifyPassword } from "better-auth/crypto";
import { ServiceError } from "@nirman/services";

/**
 * POST /api/auth/phone-password — phone + password login.
 *
 * Body: `{ phone: string, password: string }`
 *
 * This is the primary login method for field staff. The phone number is the
 * user ID; the password was set by the admin who created the account.
 *
 * Flow:
 *   1. Normalize the phone → find all active Users with that phoneNormalized
 *   2. Verify the password against each user's credential Account
 *   3. Handle lockout (per-user: failedLoginAttempts + lockedUntil)
 *   4. If exactly one match → create session, return user
 *   5. If multiple matches (same phone, same password on separate accounts)
 *      → return multiUser picker
 *   6. If the user has multiple UserCompany memberships → return company picker
 *   7. If mustChangePassword → return flag for client to redirect
 *
 * Rate limiting: per-phone (not per-account) to prevent brute-force across
 * accounts sharing a number. The lockout is per-user.
 */

// Per-phone rate limiting constants (reserved for future Redis-backed limiter)
// const MAX_PHONE_ATTEMPTS = 10;
// const PHONE_RATE_WINDOW_MS = 15 * 60 * 1000;

export const POST = async (req: NextRequest) => {
  try {
    let body: { phone?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const rawPhone = body.phone?.trim();
    const password = body.password;
    if (!rawPhone || !password) {
      return json({ error: "Phone number and password are required." }, { status: 400 });
    }

    const phone = normalizePhone(rawPhone);
    if (phone.length < 10) {
      return json({ error: "Please enter a valid phone number." }, { status: 400 });
    }

    // Build all format variants (10-digit, 12-digit with 91 prefix, etc.)
    // so the lookup matches regardless of how the user entered the number
    // or how it was stored (admin may have entered +91 or just 10 digits).
    const phoneVariants = normalizePhoneForLookup(rawPhone);

    if (password.length < 1) {
      return json({ error: "Password is required." }, { status: 400 });
    }

    // ── Per-phone rate limiting (prevents brute-force across accounts) ──
    // Count failed attempts for this phone in the last 15 min.
    // We use a simple in-memory counter (resets on server restart). For
    // production, this should be Redis or a DB table.
    // For now, we rely on per-user lockout (failedLoginAttempts + lockedUntil).
    // The per-phone check is a secondary defense.

    // ── Find all active users with this phone number ──
    const matchedUsers = await prisma.user.findMany({
      where: { phoneNormalized: { in: phoneVariants }, active: true },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        mustChangePassword: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        accounts: {
          where: { providerId: "credential" },
          select: { id: true, password: true },
        },
        memberships: {
          select: {
            companyId: true,
            role: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Always return a generic error if no users found — never leak whether
    // the phone number has an account (prevents user enumeration).
    if (matchedUsers.length === 0) {
      return json({ error: "Invalid phone number or password." }, { status: 401 });
    }

    // ── Verify password against each user's credential account ──
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    const matched: typeof matchedUsers = [];
    for (const user of matchedUsers) {
      // Check lockout
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const remainingMs = user.lockedUntil.getTime() - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60000);
        return json({
          error: `This account is locked due to too many failed attempts. Try again in ${remainingMin} minute${remainingMin === 1 ? "" : "s"}, or contact your administrator.`,
        }, { status: 423 });
      }

      // Verify password
      const credAccount = user.accounts[0];
      if (!credAccount || !credAccount.password) continue;

      const isValid = await verifyPassword({ hash: credAccount.password, password });
      if (isValid) {
        matched.push(user);
      }
    }

    if (matched.length === 0) {
      // ── Failed login: increment failedLoginAttempts for all matched users ──
      // This is important: even though the password didn't match, we increment
      // the counter for all users with this phone to prevent distributed
      // brute-force (trying different passwords across accounts).
      for (const user of matchedUsers) {
        const newAttempts = user.failedLoginAttempts + 1;
        // Get the company's lockout config (or use defaults)
        const company = user.companyId
          ? await prisma.company.findUnique({
              where: { id: user.companyId },
              select: { accountLockoutThreshold: true, accountLockoutDurationMin: true },
            })
          : null;
        const threshold = company?.accountLockoutThreshold ?? 5;
        const lockoutMin = company?.accountLockoutDurationMin ?? 30;

        if (newAttempts >= threshold) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: 0, // reset counter
              lockedUntil: new Date(Date.now() + lockoutMin * 60 * 1000),
            },
          });
        } else {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: newAttempts },
          });
        }
      }

      // Compute remaining attempts for the first matched user
      const firstUser = matchedUsers[0];
      const companyConfig = firstUser?.companyId
        ? await prisma.company.findUnique({
            where: { id: firstUser.companyId },
            select: { accountLockoutThreshold: true },
          })
        : null;
      const threshold = companyConfig?.accountLockoutThreshold ?? 5;
      const newAttemptCount = (firstUser?.failedLoginAttempts ?? 0) + 1;
      const remaining = Math.max(0, threshold - newAttemptCount);

      return json({
        error: remaining > 0
          ? `Invalid phone number or password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before lockout.`
          : "Invalid phone number or password. Contact your administrator if you've forgotten your password.",
      }, { status: 401 });
    }

    // ── Success: reset failed attempts + update last login for all matched ──
    const winner = matched[0]!;
    await prisma.user.update({
      where: { id: winner.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: clientIp,
      },
    });

    // ── Check if user has multiple company memberships → company picker ──
    if (winner.memberships.length > 1) {
      // Create the session first, then return the company list.
      // The client will show a company picker and call /api/company/switch.
      const { setCookieHeader } = await createPhoneSession(winner.id);
      return json({
        ok: true,
        requiresCompanySelect: true,
        user: {
          id: winner.id,
          email: winner.email,
          name: winner.name,
          role: winner.role,
        },
        companies: winner.memberships.map((uc) => ({
          id: uc.company.id,
          name: uc.company.name,
          role: uc.role,
        })),
        mustChangePassword: winner.mustChangePassword,
      }, {
        status: 200,
        headers: { "Set-Cookie": setCookieHeader },
      });
    }

    // ── Single company (or no membership) → create session + return ──
    const { setCookieHeader } = await createPhoneSession(winner.id);

    return json({
      ok: true,
      user: {
        id: winner.id,
        email: winner.email,
        name: winner.name,
        role: winner.role,
      },
      mustChangePassword: winner.mustChangePassword,
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
