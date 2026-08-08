import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getSession, json, userRoleSchema } from "@/lib/server";
import { canAssignRole } from "@/lib/roles";

/**
 * PATCH /api/users/[id] — update a user's role or active status.
 *
 * Hierarchical RBAC: the actor can only change a user's role to a role
 * STRICTLY below their own tier, AND the target's current role must also
 * be below the actor's tier (can't demote a peer or superior). Tier 3
 * roles (SUPERVISOR/SALES/ACCOUNTANT) cannot manage users at all.
 *
 * The "last OWNER" guard still applies — can't demote the final owner.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await getSession();
  const actorRole = (session?.user as { role?: string })?.role ?? "MANAGER";
  const actorId = (session?.user as { id?: string })?.id;

  const { id: userId } = await params;
  const body = await req.json();
  const parsed = userRoleSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return json({ error: "User not found" }, { status: 404 });
  }

  // If changing the role, enforce the hierarchy:
  //   1. actor must be above the target's CURRENT role
  //   2. actor must be above the NEW role being assigned
  if (body.role !== undefined && body.role !== existing.role) {
    if (!canAssignRole(actorRole, existing.role)) {
      return json(
        { error: `You cannot manage a ${existing.role} — they are at or above your tier.` },
        { status: 403 },
      );
    }
    if (!canAssignRole(actorRole, body.role)) {
      return json(
        { error: `Your role (${actorRole}) cannot assign the ${body.role} role.` },
        { status: 403 },
      );
    }
  } else if (body.active !== undefined && !canAssignRole(actorRole, existing.role)) {
    // Even toggling active/inactive requires the actor to be above the target.
    return json(
      { error: `You cannot manage a ${existing.role} — they are at or above your tier.` },
      { status: 403 },
    );
  }

  // Prevent the last OWNER from demoting themselves
  if (existing.role === "OWNER" && parsed.data.role !== "OWNER") {
    const ownerCount = await prisma.user.count({ where: { role: "OWNER", active: true } });
    if (ownerCount <= 1) {
      return json({ error: "Cannot demote the last remaining owner" }, { status: 400 });
    }
  }

  // Prevent self-demotion that would lock the actor out
  if (actorId === userId && body.role !== undefined && body.role !== actorRole) {
    return json({ error: "You cannot change your own role" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.role !== undefined) update.role = body.role;
  if (body.active !== undefined) update.active = body.active;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: update,
    select: { id: true, email: true, name: true, role: true, active: true },
  });

  return json({ ok: true, user: updated });
});
