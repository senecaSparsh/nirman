import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/users/[id]/unlock — admin unlocks a locked account.
 *
 * Requires `PERM.USERS_MANAGE`. Clears the lockout (lockedUntil + 
 * failedLoginAttempts) so the user can sign in immediately.
 * Logs a `USER_ACCOUNT_UNLOCK` audit entry.
 */
export const POST = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requirePermission(PERM.USERS_MANAGE);
  const company = await getCompany();
  const { id: userId } = await params;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, lockedUntil: true, failedLoginAttempts: true, companyId: true },
  });
  if (!target) {
    return json({ error: "User not found." }, { status: 404 });
  }

  // ── Tenancy guard: the target must belong to the actor's company ──
  const membership = await prisma.userCompany.findFirst({
    where: { userId, companyId: company.id },
    select: { id: true },
  });
  if (!membership && target.companyId !== company.id) {
    return json({ error: "User not found." }, { status: 404 });
  }

  if (!target.lockedUntil && target.failedLoginAttempts === 0) {
    return json({ error: "This account is not locked." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      lockedUntil: null,
      failedLoginAttempts: 0,
    },
  });

  await logAction(prisma, {
    userId: actor.id,
    companyId: company.id,
    action: "USER_ACCOUNT_UNLOCK",
    entityType: "User",
    entityId: userId,
  });

  return json({ ok: true, message: `Account unlocked for ${target.name}. They can sign in now.` });
});
