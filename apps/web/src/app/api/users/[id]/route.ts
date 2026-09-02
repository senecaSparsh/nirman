import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, requireUser, json, userRoleSchema } from "@/lib/server";
import { canAssignRole } from "@/lib/roles";
import { normalizePhone } from "@/lib/phone-otp";

/**
 * PATCH /api/users/[id] — update a user's role, profile, or active status.
 *
 * Hierarchical RBAC: the actor can only change a user's role to a role
 * STRICTLY below their own tier, AND the target's current role must also
 * be below the actor's tier (can't demote a peer or superior). Tier 5
 * roles cannot manage users at all.
 *
 * The "last OWNER" guard still applies — can't demote the final owner.
 *
 * All role changes are written to the AuditLog for compliance.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireUser();
  const actorRole = actor.role;
  const actorId = actor.id;

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

  // Profile editing requires the actor to be above the target's tier
  // (or editing their own profile — self-edit is always allowed)
  const isProfileEdit = body.name !== undefined || body.phone !== undefined ||
    body.designation !== undefined || body.department !== undefined ||
    body.employeeCode !== undefined || body.joiningDate !== undefined;
  if (isProfileEdit && actorId !== userId) {
    if (!canAssignRole(actorRole, existing.role)) {
      return json(
        { error: `You cannot edit a ${existing.role}'s profile — they are at or above your tier.` },
        { status: 403 },
      );
    }
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
  if (body.name !== undefined) update.name = body.name;
  if (body.phone !== undefined) {
    update.phone = body.phone;
    update.phoneNormalized = body.phone ? normalizePhone(body.phone) : null;
  }
  if (body.designation !== undefined) update.designation = body.designation || null;
  if (body.department !== undefined) update.department = body.department || null;
  if (body.employeeCode !== undefined) update.employeeCode = body.employeeCode || null;
  if (body.joiningDate !== undefined) update.joiningDate = body.joiningDate ? new Date(body.joiningDate) : null;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: update,
    select: { id: true, email: true, name: true, role: true, active: true, phone: true, designation: true, department: true, employeeCode: true, companyId: true },
  });

  // When deactivating a user, auto-unassign all their company phone numbers.
  // This prevents deactivated users from remaining the "assignedTo" of numbers
  // that are still receiving calls. The numbers return to the unassigned pool.
  if (body.active === false && body.active !== existing.active) {
    const assignedPhones = await prisma.companyPhone.findMany({
      where: { assignedToUserId: userId, deletedAt: null },
      select: { id: true, companyId: true },
    });
    if (assignedPhones.length > 0) {
      // Close all open PhoneAssignment records for this user
      await prisma.phoneAssignment.updateMany({
        where: { userId, returnedAt: null },
        data: { returnedAt: new Date(), reason: "User deactivated" },
      });
      // Clear the assignedToUserId on all their numbers
      await prisma.companyPhone.updateMany({
        where: { assignedToUserId: userId, deletedAt: null },
        data: { assignedToUserId: null, assignedAt: null },
      });
      // Audit log the auto-unassignment
      if (actorId) {
        await logAction(prisma, {
          userId: actorId,
          companyId: updated.companyId ?? undefined,
          action: "PHONE_AUTO_UNASSIGN_ON_DEACTIVATION",
          entityType: "User",
          entityId: userId,
          after: { unassignedCount: assignedPhones.length, phoneIds: assignedPhones.map((p) => p.id) },
        });
      }
    }
  }

  // Audit log for role changes
  if (body.role !== undefined && body.role !== existing.role && actorId) {
    await logAction(prisma, {
      userId: actorId,
      companyId: updated.companyId ?? undefined,
      action: "USER_ROLE_CHANGE",
      entityType: "User",
      entityId: userId,
      before: { role: existing.role },
      after: { role: body.role },
    });
  }

  // Audit log for activation/deactivation
  if (body.active !== undefined && body.active !== existing.active && actorId) {
    await logAction(prisma, {
      userId: actorId,
      companyId: updated.companyId ?? undefined,
      action: body.active ? "USER_ACTIVATE" : "USER_DEACTIVATE",
      entityType: "User",
      entityId: userId,
      before: { active: existing.active },
      after: { active: body.active },
    });
  }

  return json({ ok: true, user: updated });
});
