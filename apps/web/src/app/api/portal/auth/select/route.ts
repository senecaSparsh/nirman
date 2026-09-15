import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { ServiceError } from "@nirman/services";
import { PORTAL_COOKIE_NAME, PORTAL_COOKIE_MAX_AGE, PORTAL_PREAUTH_COOKIE_NAME, signPortalCookie, verifyPortalPreauthToken } from "@/lib/portal-auth";
import { json, ForbiddenError, UnauthorizedError } from "@/lib/server";
import { normalizePhone } from "@/lib/phone-otp";

/**
 * POST /api/portal/auth/select — select which customer to log in as
 * (when multiple customers share the same phone number).
 *
 * Body: `{ customerId: string, phone: string }`
 *
 * Security: requires a valid pre-auth cookie (issued by otp/verify when
 * multiple customers match the phone). This proves the caller completed
 * OTP verification before selecting a customer — prevents IDOR attacks
 * where an attacker who knows a customer ID could impersonate them.
 */
export const POST = async (req: NextRequest) => {
  try {
    let body: { customerId?: string; phone?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (!body.customerId) {
      return NextResponse.json({ error: "Customer ID is required." }, { status: 400 });
    }
    if (!body.phone?.trim()) {
      return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
    }

    // Verify the pre-auth cookie — proves OTP was completed for this phone
    const preauthToken = req.cookies.get(PORTAL_PREAUTH_COOKIE_NAME)?.value;
    if (!preauthToken) {
      return NextResponse.json({ error: "OTP verification required. Please request a new code." }, { status: 401 });
    }
    const normalizedPhone = normalizePhone(body.phone);
    if (!verifyPortalPreauthToken(preauthToken, normalizedPhone)) {
      return NextResponse.json({ error: "OTP session expired. Please request a new code." }, { status: 401 });
    }

    // Look up the customer and verify their phone matches the verified phone
    const customer = await prisma.customer.findUnique({
      where: { id: body.customerId, deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        company: { select: { name: true } },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    // Verify the selected customer's phone matches the OTP-verified phone
    const customerPhoneDigits = customer.phone?.replace(/\D/g, "").slice(-10) ?? "";
    const verifiedPhoneDigits = normalizedPhone.slice(-10);
    if (!customerPhoneDigits || customerPhoneDigits !== verifiedPhoneDigits) {
      return NextResponse.json({ error: "Customer does not match the verified phone number." }, { status: 403 });
    }

    const res = NextResponse.json({
      customer: {
        id: customer.id,
        name: customer.name,
        companyName: customer.company.name,
      },
    });
    res.cookies.set(PORTAL_COOKIE_NAME, signPortalCookie(customer.id), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: PORTAL_COOKIE_MAX_AGE,
      path: "/",
    });
    // Clear the pre-auth cookie — it's single-use
    res.cookies.delete(PORTAL_PREAUTH_COOKIE_NAME);
    return res;
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
