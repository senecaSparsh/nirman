import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { ServiceError } from "@nirman/services";
import { normalizePhone, generateOtpCode, OTP_CONFIG } from "@/lib/phone-otp";
import { json, ForbiddenError, UnauthorizedError } from "@/lib/server";

/**
 * POST /api/portal/auth/otp/send — request an OTP for customer portal login.
 *
 * Body: `{ phone: string }`
 *
 * Finds Customer(s) by phone number. If found, generates an OTP and stores it.
 * Always returns `{ ok: true }` to prevent user enumeration.
 */
const SEND_WINDOW_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_PHONE = 3;

export const POST = async (req: NextRequest) => {
  try {
    let body: { phone?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const rawPhone = body.phone?.trim();
    if (!rawPhone) {
      return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
    }

    const phone = normalizePhone(rawPhone);
    if (phone.length < 10) {
      return NextResponse.json({ error: "Please enter a valid phone number." }, { status: 400 });
    }

    // Rate limit
    const windowStart = new Date(Date.now() - SEND_WINDOW_MS);
    const recentCount = await prisma.phoneOtp.count({
      where: { phone, createdAt: { gte: windowStart } },
    });
    if (recentCount >= MAX_SENDS_PER_PHONE) {
      return NextResponse.json(
        { error: "Too many code requests. Please try again in a few minutes." },
        { status: 429 },
      );
    }

    // Find customers by phone — match on last 10 digits (ignoring spaces/country code).
    // Customer phones are stored as "+91 98220 22222" so we can't do a direct equality.
    // We search by the last 4 unique digits which is enough for a small customer base,
    // then filter precisely in JS.
    const digitsOnly = rawPhone.replace(/\D/g, "");
    const last10 = digitsOnly.slice(-10);
    const last4 = digitsOnly.slice(-4);
    const candidates = await prisma.customer.findMany({
      where: {
        phone: { contains: last4 },
        deletedAt: null,
      },
      select: { id: true, name: true, companyId: true, phone: true },
      take: 50,
    });
    // Filter to exact last-10-digit match
    const customers = candidates.filter(
      (c) => c.phone && c.phone.replace(/\D/g, "").slice(-10) === last10,
    );

    // Invalidate prior unused codes
    await prisma.phoneOtp.updateMany({
      where: { phone, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_CONFIG.TTL_MINUTES * 60 * 1000);

    // Store the OTP with the first matched customer's ID (if multiple, the
    // verify route will let them pick which company to log in as)
    await prisma.phoneOtp.create({
      data: {
        phone,
        code,
        expiresAt,
        userId: customers[0]?.id ?? null, // reuse userId field for customerId
        clientIp: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
      },
    });

    if (process.env.NODE_ENV !== "production") {
      console.log(`[Portal OTP] ${phone} → code: ${code} (expires in ${OTP_CONFIG.TTL_MINUTES} min) — ${customers.length} customer(s) matched`);
    }

    // Always return ok — never leak whether the phone has an account
    return NextResponse.json({ ok: true });
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
      console.error("[apiHandler] Prisma P2024: connection pool exhausted");
      return json({ error: "Database busy — please retry shortly", retryable: true }, { status: 503, headers: { "Retry-After": "5" } });
    }
    if (prismaCode === "P1001") {
      console.error("[apiHandler] Prisma P1001: database unreachable");
      return json({ error: "Database unreachable — please retry shortly", retryable: true }, { status: 503, headers: { "Retry-After": "10" } });
    }
    if (prismaCode === "P1002") {
      console.error("[apiHandler] Prisma P1002: database timeout");
      return json({ error: "Database request timed out — please retry", retryable: true }, { status: 504 });
    }
    console.error("[apiHandler] Unhandled error:", err);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};
