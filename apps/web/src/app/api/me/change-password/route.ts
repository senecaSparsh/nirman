import { NextRequest } from "next/server";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { prisma } from "@nirman/db";
import { apiHandler, json, requireUser, getCompany } from "@/lib/server";

/**
 * POST /api/me/change-password — change the current user's password.
 *
 * Body: `{ currentPassword: string, newPassword: string }`
 *
 * Used for:
 *   - First-login forced password change (mustChangePassword = true)
 *   - Voluntary password change from Settings → Security
 *
 * Validates the current password, enforces the company's password policy
 * (min length, special chars), updates the credential Account, clears
 * mustChangePassword, and optionally revokes other sessions.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();

  const body = await req.json();
  const { currentPassword, newPassword } = body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    return json({ error: "Current password and new password are required." }, { status: 400 });
  }

  // ── Get the company's password policy ──
  const company = await getCompany();
  const minLength = company.passwordMinLength ?? 8;
  const requireSpecial = company.passwordRequireSpecial ?? false;

  if (newPassword.length < minLength) {
    return json({ error: `Password must be at least ${minLength} characters long.` }, { status: 400 });
  }

  if (requireSpecial && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword)) {
    return json({ error: "Password must contain at least one special character." }, { status: 400 });
  }

  if (currentPassword === newPassword) {
    return json({ error: "New password must be different from the current password." }, { status: 400 });
  }

  // ── Verify current password ──
  const credAccount = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
    select: { id: true, password: true },
  });

  if (!credAccount || !credAccount.password) {
    return json({ error: "No credential account found. Contact your administrator." }, { status: 400 });
  }

  const isValid = await verifyPassword({ hash: credAccount.password, password: currentPassword });
  if (!isValid) {
    return json({ error: "Current password is incorrect." }, { status: 401 });
  }

  // ── Update password ──
  const hashed = await hashPassword(newPassword);
  await prisma.account.update({
    where: { id: credAccount.id },
    data: { password: hashed },
  });

  // Clear mustChangePassword + record when the password was changed
  await prisma.user.update({
    where: { id: user.id },
    data: {
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  return json({ ok: true, message: "Password changed successfully." });
});
