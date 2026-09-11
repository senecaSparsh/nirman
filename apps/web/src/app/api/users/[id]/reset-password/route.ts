import { NextRequest } from "next/server";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/users/[id]/reset-password — admin resets a user's password.
 *
 * Body: `{ password: string, mustChange?: boolean }`
 *
 * Requires `PERM.USERS_MANAGE`. The admin sets a new password and
 * communicates it to the staff member out-of-band (in person, by phone).
 * The system never sends the password via SMS/email.
 *
 * Sets `mustChangePassword = true` by default so the staff member is
 * forced to set their own password on next login. The admin can opt out
 * by passing `mustChange: false`.
 *
 * Revokes all existing sessions for the user (security best practice).
 * Logs a `USER_PASSWORD_RESET` audit entry.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requirePermission(PERM.USERS_MANAGE);
  const company = await getCompany();
  const { id: userId } = await params;

  const body = await req.json();
  const { password, mustChange } = body as { password?: string; mustChange?: boolean };

  if (!password || password.length < 8) {
    return json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  // ── Get the company's password policy ──
  const minLength = company.passwordMinLength ?? 8;
  if (password.length < minLength) {
    return json({ error: `Password must be at least ${minLength} characters.` }, { status: 400 });
  }

  // ── Verify the target user exists ──
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, companyId: true },
  });
  if (!target) {
    return json({ error: "User not found." }, { status: 404 });
  }

  // ── Tenancy guard: the target must belong to the actor's company ──
  // Same pattern as PATCH /api/users/[id] — prevents cross-tenant
  // password resets (an admin in company A cannot reset company B's
  // user password or revoke their sessions).
  const membership = await prisma.userCompany.findFirst({
    where: { userId, companyId: company.id },
    select: { id: true },
  });
  if (!membership && target.companyId !== company.id) {
    return json({ error: "User not found." }, { status: 404 });
  }

  // ── Update the credential account password ──
  const hashed = await hashPassword(password);
  const credAccount = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { id: true },
  });

  if (credAccount) {
    await prisma.account.update({
      where: { id: credAccount.id },
      data: { password: hashed },
    });
  } else {
    // Create a credential account if one doesn't exist
    await prisma.account.create({
      data: {
        userId,
        providerId: "credential",
        accountId: userId,
        password: hashed,
      },
    });
  }

  // ── Set mustChangePassword + reset lockout ──
  const forceChange = mustChange !== false; // default true
  await prisma.user.update({
    where: { id: userId },
    data: {
      mustChangePassword: forceChange,
      failedLoginAttempts: 0,
      lockedUntil: null,
      passwordChangedAt: new Date(),
    },
  });

  // ── Revoke all existing sessions (security) ──
  await prisma.session.deleteMany({ where: { userId } });

  // ── Audit log ──
  await logAction(prisma, {
    userId: actor.id,
    companyId: company.id,
    action: "USER_PASSWORD_RESET",
    entityType: "User",
    entityId: userId,
    after: { mustChangePassword: forceChange },
  });

  return json({
    ok: true,
    message: `Password reset for ${target.name}. ${forceChange ? "They will be asked to set a new password on next login." : "They can sign in with the new password immediately."}`,
  });
});
