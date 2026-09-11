import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, scopeWhere } from "@/lib/server";
import { PERM, canAssignRole, isCustomRole } from "@/lib/roles";
import { normalizePhone, generateOtpCode, OTP_CONFIG } from "@/lib/phone-otp";
import { isTwilioConfigured, normalizeTwilioNumber } from "@/lib/twilio-service";

/**
 * Phone verification + Twilio/call-tracking sync for a user.
 *
 * Two actions via ?action= query param:
 *   1. "send"  — generate + store an OTP, return it (dev) or send via SMS (prod)
 *   2. "verify" — validate the OTP, mark phoneVerified=true, attempt Twilio sync
 *
 * Requires USERS_MANAGE permission (or self).
 */

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.USERS_VIEW);
  const company = await getCompany();
  const { id: userId } = await params;

  // Load the target user
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, phoneNormalized: true, phoneVerified: true, role: true, active: true },
  });

  if (!target) {
    return json({ error: "User not found" }, { status: 404 });
  }

  // Authorization: must have USERS_MANAGE or be the user themselves
  const isSelf = session.id === userId;
  if (!isSelf) {
    await requirePermission(PERM.USERS_MANAGE);
    // For custom roles, check tier
    if (isCustomRole(target.role)) {
      const customRole = await prisma.customRole.findFirst({
        where: { companyId: company.id, key: target.role },
        select: { tier: true },
      }).catch(() => null);
      if (!customRole || customRole.tier <= 1) {
        return json({ error: "Cannot manage this user" }, { status: 403 });
      }
    } else if (!canAssignRole(session.role, target.role)) {
      return json({ error: "Cannot manage this user" }, { status: 403 });
    }
  }

  if (!target.phone) {
    return json({ error: "This user has no phone number to verify." }, { status: 400 });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "send";
  const body = await req.json().catch(() => ({}));

  // ── Action: send OTP ──
  if (action === "send") {
    const normalized = normalizePhone(target.phone);
    if (normalized.length < 10) {
      return json({ error: "Invalid phone number format." }, { status: 400 });
    }

    // Rate limit: max 3 sends per phone per 10 min
    const recentOtps = await prisma.phoneOtp.count({
      where: {
        phone: normalized,
        createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
      },
    }).catch(() => 0);

    if (recentOtps >= 3) {
      return json({ error: "Too many verification attempts. Please wait 10 minutes." }, { status: 429 });
    }

    const code = generateOtpCode();

    // Invalidate prior unused codes for this phone
    await prisma.phoneOtp.updateMany({
      where: { phone: normalized, usedAt: null },
      data: { usedAt: new Date() },
    }).catch(() => {});

    // Store the new code
    await prisma.phoneOtp.create({
      data: {
        phone: normalized,
        code,
        expiresAt: new Date(Date.now() + OTP_CONFIG.TTL_MINUTES * 60 * 1000),
      },
    });

    // In production, send via SMS. In dev, log to console.
    if (process.env.NODE_ENV === "production") {
      // SMS via Twilio is not yet wired — return an error instead of
      // pretending the code was sent. The OTP is stored in the DB so
      // when SMS is wired, the verify step will work. For now, the
      // admin must use the dev environment or wire up Twilio SMS.
      // TODO: send SMS via Twilio when SMS provider is wired
      console.warn(`[phone-verify] OTP for ${normalized}: ${code} (SMS not yet wired — returning error to client)`);
      return json({ error: "SMS verification is not yet configured. Contact your administrator." }, { status: 501 });
    } else {
      console.log(`[phone-verify] OTP for ${normalized}: ${code}`);
    }

    return json({ ok: true, message: "Verification code sent.", devCode: code });
  }

  // ── Action: verify OTP ──
  if (action === "verify") {
    const { code } = body as { code?: string };
    if (!code || !/^\d{6}$/.test(code)) {
      return json({ error: "Please enter the 6-digit verification code." }, { status: 400 });
    }

    const normalized = normalizePhone(target.phone);

    // Find the most recent unused code for this phone
    const otpRecord = await prisma.phoneOtp.findFirst({
      where: {
        phone: normalized,
        code,
        usedAt: null,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord) {
      return json({ error: "Invalid or expired verification code." }, { status: 400 });
    }

    // Mark the code as used
    await prisma.phoneOtp.update({
      where: { id: otpRecord.id },
      data: { usedAt: new Date() },
    });

    // Mark the phone as verified
    await prisma.user.update({
      where: { id: userId },
      data: {
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
      },
    });

    // Attempt Twilio sync — check if this phone matches any CompanyPhone
    let syncedWithTwilio = false;
    if (isTwilioConfigured()) {
      const normalizedForTwilio = normalizeTwilioNumber(target.phone);
      const matchingCompanyPhone = await prisma.companyPhone.findFirst({
        where: {
          companyId: company.id,
          phoneNormalized: normalizedForTwilio,
          deletedAt: null,
        },
        select: { id: true, provider: true },
      }).catch(() => null);

      if (matchingCompanyPhone) {
        // The phone is a company number synced with Twilio
        await prisma.user.update({
          where: { id: userId },
          data: { phoneSyncedAt: new Date() },
        });
        syncedWithTwilio = true;
      }
    }

    // Revalidate employee pages
    const linkedEmployee = await prisma.employee.findFirst({
      where: { userId, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
      select: { id: true },
    });
    if (linkedEmployee) {
      revalidatePath(`/m/hr/employees/${linkedEmployee.id}`);
    }
    revalidatePath("/m/hr/employees");

    return json({
      ok: true,
      message: syncedWithTwilio
        ? "Phone number verified and synced with Twilio."
        : "Phone number verified. Not synced with Twilio — use the Sync button to connect.",
      verified: true,
      syncedWithTwilio,
    });
  }

  // ── Action: sync with Twilio/call-tracking ──
  if (action === "sync") {
    if (!isTwilioConfigured()) {
      return json({ error: "Twilio is not configured. Add your Twilio numbers in Settings → Telephony first." }, { status: 400 });
    }

    const normalizedForTwilio = normalizeTwilioNumber(target.phone);

    // Check if the phone exists as a CompanyPhone (synced from Twilio)
    const companyPhone = await prisma.companyPhone.findFirst({
      where: {
        companyId: company.id,
        phoneNormalized: normalizedForTwilio,
        deletedAt: null,
      },
      select: { id: true, provider: true, status: true, providerNumberId: true },
    });

    if (!companyPhone) {
      // Phone not found in company phones — not synced with Twilio
      await prisma.user.update({
        where: { id: userId },
        data: { phoneSyncedAt: null },
      });

      return json({
        ok: true,
        synced: false,
        message: "This phone number is not registered as a company phone in Twilio. Sync Twilio numbers first from Settings → Telephony.",
      });
    }

    // Phone exists in CompanyPhone — mark as synced
    await prisma.user.update({
      where: { id: userId },
      data: { phoneSyncedAt: new Date() },
    });

    // Revalidate
    const linkedEmployee = await prisma.employee.findFirst({
      where: { userId, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
      select: { id: true },
    });
    if (linkedEmployee) {
      revalidatePath(`/m/hr/employees/${linkedEmployee.id}`);
    }
    revalidatePath("/m/hr/employees");

    return json({
      ok: true,
      synced: true,
      provider: companyPhone.provider,
      status: companyPhone.status,
      message: `Phone synced with ${companyPhone.provider}. Number status: ${companyPhone.status}.`,
    });
  }

  return json({ error: "Unknown action. Use ?action=send, ?action=verify, or ?action=sync." }, { status: 400 });
});

/**
 * GET /api/users/[id]/verify-phone — get the current phone verification status.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.USERS_VIEW);
  const company = await getCompany();
  const { id: userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true, phoneNormalized: true, phoneVerified: true, phoneVerifiedAt: true, phoneSyncedAt: true },
  });

  if (!user) {
    return json({ error: "User not found" }, { status: 404 });
  }

  // Check if the phone is in CompanyPhone (synced with Twilio)
  let twilioSynced = false;
  let companyPhoneProvider: string | null = null;
  let companyPhoneStatus: string | null = null;

  if (user.phoneNormalized && user.phone) {
    const normalizedForTwilio = normalizeTwilioNumber(user.phone);
    const companyPhone = await prisma.companyPhone.findFirst({
      where: {
        companyId: company.id,
        phoneNormalized: normalizedForTwilio,
        deletedAt: null,
      },
      select: { provider: true, status: true },
    }).catch(() => null);

    if (companyPhone) {
      twilioSynced = true;
      companyPhoneProvider = companyPhone.provider;
      companyPhoneStatus = companyPhone.status;
    }
  }

  return json({
    phone: user.phone,
    verified: user.phoneVerified ?? false,
    verifiedAt: user.phoneVerifiedAt?.toISOString() ?? null,
    syncedAt: user.phoneSyncedAt?.toISOString() ?? null,
    twilioSynced,
    twilioProvider: companyPhoneProvider,
    twilioStatus: companyPhoneStatus,
  });
});
