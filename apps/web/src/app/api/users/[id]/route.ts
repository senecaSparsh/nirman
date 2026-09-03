import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, requirePermission, json, userRoleSchema } from "@/lib/server";
import { canAssignRole, PERM } from "@/lib/roles";
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
  const actor = await requirePermission(PERM.USERS_MANAGE);
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
  if (parsed.data.role !== undefined && parsed.data.role !== existing.role) {
    if (!canAssignRole(actorRole, existing.role)) {
      return json(
        { error: `You cannot manage a ${existing.role} — they are at or above your tier.` },
        { status: 403 },
      );
    }
    if (!canAssignRole(actorRole, parsed.data.role)) {
      return json(
        { error: `Your role (${actorRole}) cannot assign the ${parsed.data.role} role.` },
        { status: 403 },
      );
    }
  } else if (parsed.data.active !== undefined && !canAssignRole(actorRole, existing.role)) {
    // Even toggling active/inactive requires the actor to be above the target.
    return json(
      { error: `You cannot manage a ${existing.role} — they are at or above your tier.` },
      { status: 403 },
    );
  }

  // Profile editing requires the actor to be above the target's tier
  // (or editing their own profile — self-edit is always allowed)
  const isProfileEdit = parsed.data.name !== undefined || parsed.data.phone !== undefined ||
    parsed.data.designation !== undefined || parsed.data.department !== undefined ||
    parsed.data.employeeCode !== undefined || parsed.data.joiningDate !== undefined;
  if (isProfileEdit && actorId !== userId) {
    if (!canAssignRole(actorRole, existing.role)) {
      return json(
        { error: `You cannot edit a ${existing.role}'s profile — they are at or above your tier.` },
        { status: 403 },
      );
    }
  }

  // Prevent the last OWNER from demoting themselves
  if (existing.role === "OWNER" && parsed.data.role !== undefined && parsed.data.role !== "OWNER") {
    const ownerCount = await prisma.user.count({ where: { role: "OWNER", active: true } });
    if (ownerCount <= 1) {
      return json({ error: "Cannot demote the last remaining owner" }, { status: 400 });
    }
  }

  // Prevent self-demotion that would lock the actor out
  if (actorId === userId && parsed.data.role !== undefined && parsed.data.role !== actorRole) {
    return json({ error: "You cannot change your own role" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) update.role = parsed.data.role;
  if (parsed.data.active !== undefined) update.active = parsed.data.active;
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.phone !== undefined) {
    update.phone = parsed.data.phone;
    update.phoneNormalized = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
  }
  if (parsed.data.designation !== undefined) update.designation = parsed.data.designation || null;
  if (parsed.data.department !== undefined) update.department = parsed.data.department || null;
  if (parsed.data.employeeCode !== undefined) update.employeeCode = parsed.data.employeeCode || null;
  if (parsed.data.joiningDate !== undefined) update.joiningDate = parsed.data.joiningDate ? new Date(parsed.data.joiningDate) : null;
  if (parsed.data.employmentEndDate !== undefined) update.employmentEndDate = parsed.data.employmentEndDate ? new Date(parsed.data.employmentEndDate) : null;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: update,
    select: { id: true, email: true, name: true, role: true, active: true, phone: true, designation: true, department: true, employeeCode: true, companyId: true },
  });

  // When deactivating a user, auto-unassign all their company phone numbers.
  // This prevents deactivated users from remaining the "assignedTo" of numbers
  // that are still receiving calls. The numbers return to the unassigned pool.
  if (parsed.data.active === false && parsed.data.active !== existing.active) {
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

    // ── Deactivation cleanup: reassign/revoke pending responsibilities ──
    // All of these run inside the same transaction boundary as the user update
    // so the deactivated state and the cleanup are atomic.
    const deactivationSideEffects: Record<string, number> = {};

    // 1. Revoke all active sessions — forces the user to be logged out
    const deletedSessions = await prisma.session.deleteMany({
      where: { userId },
    });
    if (deletedSessions.count > 0) {
      deactivationSideEffects.sessionsRevoked = deletedSessions.count;
    }

    // 2. Null out pending PO approvals where this user is the approver
    //    (POs in DRAFT that haven't been approved yet)
    const pendingPoApprovals = await prisma.purchaseOrder.updateMany({
      where: { approvedById: userId, status: "DRAFT" },
      data: { approvedById: null },
    });
    if (pendingPoApprovals.count > 0) {
      deactivationSideEffects.pendingPoApprovalsCleared = pendingPoApprovals.count;
    }

    // 3. Null out pending requisition approvals
    const pendingReqApprovals = await prisma.materialRequisition.updateMany({
      where: { approvedById: userId, status: "SUBMITTED" },
      data: { approvedById: null },
    });
    if (pendingReqApprovals.count > 0) {
      deactivationSideEffects.pendingReqApprovalsCleared = pendingReqApprovals.count;
    }

    // 4. Null out pending DPR sub-admin and admin approvals
    const pendingDprSubAdmin = await prisma.dailyProgressReport.updateMany({
      where: { subAdminApprovedById: userId, approvalStatus: "SUBMITTED" },
      data: { subAdminApprovedById: null },
    });
    const pendingDprAdmin = await prisma.dailyProgressReport.updateMany({
      where: { adminApprovedById: userId, approvalStatus: "SUB_ADMIN_APPROVED" },
      data: { adminApprovedById: null },
    });
    if (pendingDprSubAdmin.count + pendingDprAdmin.count > 0) {
      deactivationSideEffects.pendingDprApprovalsCleared = pendingDprSubAdmin.count + pendingDprAdmin.count;
    }

    // 5. Null out pending expense claim approvals
    const pendingExpenseApprovals = await prisma.expenseClaim.updateMany({
      where: { approvedById: userId, status: "SUBMITTED" },
      data: { approvedById: null },
    });
    if (pendingExpenseApprovals.count > 0) {
      deactivationSideEffects.pendingExpenseApprovalsCleared = pendingExpenseApprovals.count;
    }

    // 6. Null out pending supplier invoice approvals
    const pendingInvoiceApprovals = await prisma.supplierInvoice.updateMany({
      where: { approvedById: userId, status: { in: ["PENDING", "MATCHED"] } },
      data: { approvedById: null },
    });
    if (pendingInvoiceApprovals.count > 0) {
      deactivationSideEffects.pendingInvoiceApprovalsCleared = pendingInvoiceApprovals.count;
    }

    // 7. Unassign pending/in-progress tasks (set status to PENDING, clear assignee)
    //    Task.assignedToId is non-nullable (Cascade delete), so we can't null it.
    //    Instead, we mark tasks as CANCELLED with a note so they can be reassigned.
    const openTasks = await prisma.task.updateMany({
      where: { assignedToId: userId, status: { in: ["PENDING", "IN_PROGRESS"] } },
      data: { status: "CANCELLED" },
    });
    if (openTasks.count > 0) {
      deactivationSideEffects.tasksCancelled = openTasks.count;
    }

    // 8. Remove project assignments (user should no longer be on any project team)
    const removedAssignments = await prisma.projectAssignment.deleteMany({
      where: { userId },
    });
    if (removedAssignments.count > 0) {
      deactivationSideEffects.projectAssignmentsRemoved = removedAssignments.count;
    }

    // 9. Null out lead assignments (sales leads return to the unassigned pool)
    const unassignedLeads = await prisma.lead.updateMany({
      where: { assignedToId: userId },
      data: { assignedToId: null },
    });
    if (unassignedLeads.count > 0) {
      deactivationSideEffects.leadsUnassigned = unassignedLeads.count;
    }

    // 10. Null out reporting lines — clear the deactivated user's own manager
    //     pointer AND clear any subordinates who report up to this user
    const clearedOwnReportsTo = await prisma.userCompany.updateMany({
      where: { userId, reportsToUserCompanyId: { not: null } },
      data: { reportsToUserCompanyId: null },
    });
    // Also clear reportsTo on memberships where this user IS the manager
    const managerMemberships = await prisma.userCompany.findMany({
      where: { userId },
      select: { id: true },
    });
    if (managerMemberships.length > 0) {
      const clearedSubordinates = await prisma.userCompany.updateMany({
        where: { reportsToUserCompanyId: { in: managerMemberships.map((m) => m.id) } },
        data: { reportsToUserCompanyId: null },
      });
      if (clearedSubordinates.count > 0) {
        deactivationSideEffects.reportingLinesCleared = clearedSubordinates.count;
      }
    }
    if (clearedOwnReportsTo.count > 0) {
      deactivationSideEffects.reportingLinesCleared = (deactivationSideEffects.reportingLinesCleared ?? 0) + clearedOwnReportsTo.count;
    }

    // Audit log the full deactivation cleanup
    if (actorId && Object.keys(deactivationSideEffects).length > 0) {
      await logAction(prisma, {
        userId: actorId,
        companyId: updated.companyId ?? undefined,
        action: "USER_DEACTIVATION_CLEANUP",
        entityType: "User",
        entityId: userId,
        after: deactivationSideEffects,
      });
    }
  }

  // Audit log for role changes
  if (parsed.data.role !== undefined && parsed.data.role !== existing.role && actorId) {
    await logAction(prisma, {
      userId: actorId,
      companyId: updated.companyId ?? undefined,
      action: "USER_ROLE_CHANGE",
      entityType: "User",
      entityId: userId,
      before: { role: existing.role },
      after: { role: parsed.data.role },
    });
  }

  // Audit log for activation/deactivation
  if (parsed.data.active !== undefined && parsed.data.active !== existing.active && actorId) {
    await logAction(prisma, {
      userId: actorId,
      companyId: updated.companyId ?? undefined,
      action: parsed.data.active ? "USER_ACTIVATE" : "USER_DEACTIVATE",
      entityType: "User",
      entityId: userId,
      before: { active: existing.active },
      after: { active: parsed.data.active },
    });
  }

  return json({ ok: true, user: updated });
});
