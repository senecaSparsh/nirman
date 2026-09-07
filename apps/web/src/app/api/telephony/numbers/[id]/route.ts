import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { logAction } from "@nirman/services";
import { clearNumberWebhook } from "@/lib/twilio-service";

/**
 * GET /api/telephony/numbers/[id] — number detail with assignment history.
 * Requires TELEPHONY_VIEW.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.TELEPHONY_VIEW);
  const company = await getCompany();
  const { id } = await params;

  const phone = await prisma.companyPhone.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      assignments: {
        orderBy: { assignedAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
          assignedBy: { select: { id: true, name: true } },
        },
      },
      _count: { select: { calls: true, smsLogs: true } },
    },
  });

  if (!phone) return json({ error: "Phone number not found" }, { status: 404 });

  return json(phone);
});

/**
 * PATCH /api/telephony/numbers/[id] — update a company phone number.
 * Requires TELEPHONY_MANAGE.
 *
 * Body: {
 *   label?, department?, status?, consentBeep?,
 *   assignToUserId?: string | null  — assign/unassign the number to a user,
 *   assignReason?: string           — reason for the assignment change
 * }
 *
 * When assignToUserId is provided:
 *   - If null → unassign (create PhoneAssignment with returnedAt = now)
 *   - If a userId → assign (close previous assignment, create new one)
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.TELEPHONY_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const existing = await prisma.companyPhone.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });
  if (!existing) return json({ error: "Phone number not found" }, { status: 404 });

  const body = await req.json();
  const { label, department, status, consentBeep, assignToUserId, unassign, assignReason } = body as {
    label?: string;
    department?: string;
    status?: string;
    consentBeep?: boolean;
    assignToUserId?: string | null;
    unassign?: boolean;
    assignReason?: string;
  };

  // Handle unassign (frontend sends { unassign: true })
  const effectiveAssignToUserId = unassign ? null : assignToUserId;

  // Handle assignment changes
  if (effectiveAssignToUserId !== undefined || unassign) {
    if (effectiveAssignToUserId === null) {
      // Unassign: close the current assignment
      if (existing.assignedToUserId) {
        await prisma.phoneAssignment.updateMany({
          where: {
            companyPhoneId: id,
            userId: existing.assignedToUserId,
            returnedAt: null,
          },
          data: { returnedAt: new Date(), reason: assignReason ?? "Unassigned" },
        });
      }
      await prisma.companyPhone.update({
        where: { id },
        data: { assignedToUserId: null, assignedAt: null },
      });
    } else {
      // Validate the user is an ACTIVE member of this company
      const member = await prisma.userCompany.findFirst({
        where: { userId: effectiveAssignToUserId!, companyId: company.id },
        include: { user: { select: { active: true, name: true } } },
      });
      if (!member) {
        return json({ error: "The specified user is not a member of this company" }, { status: 400 });
      }
      if (!member.user.active) {
        return json({ error: `${member.user.name} is deactivated and cannot be assigned a phone number` }, { status: 400 });
      }

      // Close any existing open assignment for this number
      await prisma.phoneAssignment.updateMany({
        where: { companyPhoneId: id, returnedAt: null },
        data: { returnedAt: new Date(), reason: "Reassigned" },
      });

      // Create new assignment
      await prisma.phoneAssignment.create({
        data: {
          companyPhoneId: id,
          userId: effectiveAssignToUserId!,
          assignedById: user.id,
          reason: assignReason ?? "Assigned",
        },
      });

      await prisma.companyPhone.update({
        where: { id },
        data: { assignedToUserId: effectiveAssignToUserId, assignedAt: new Date() },
      });
    }
  }

  // Update other fields
  const data: Record<string, unknown> = {};
  if (label !== undefined) data.label = label;
  if (department !== undefined) data.department = department;
  if (status !== undefined) {
    const validStatuses = ["ACTIVE", "INACTIVE", "RECYCLED", "SUSPENDED"];
    if (!validStatuses.includes(status)) {
      return json({ error: `status must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
    }
    data.status = status;
  }
  if (consentBeep !== undefined) data.consentBeep = consentBeep;

  if (Object.keys(data).length > 0) {
    await prisma.companyPhone.update({
      where: { id },
      data,
    });
  }

  // Always re-fetch with relations to return the current state
  const result = await prisma.companyPhone.findFirstOrThrow({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true } },
      _count: { select: { calls: true, assignments: true } },
    },
  });

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "COMPANY_PHONE_UPDATE",
    entityType: "CompanyPhone",
    entityId: id,
    before: { label: existing.label, department: existing.department, status: existing.status },
    after: data,
  });

  return json(result);
});

/**
 * DELETE /api/telephony/numbers/[id] — soft delete a company phone number.
 * Requires TELEPHONY_MANAGE. Sets deletedAt = now().
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.TELEPHONY_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const existing = await prisma.companyPhone.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });
  if (!existing) return json({ error: "Phone number not found" }, { status: 404 });

  await prisma.companyPhone.update({
    where: { id },
    data: { deletedAt: new Date(), status: "INACTIVE", assignedToUserId: null, assignedAt: null },
  });

  // Close any open assignments
  await prisma.phoneAssignment.updateMany({
    where: { companyPhoneId: id, returnedAt: null },
    data: { returnedAt: new Date(), reason: "Number deleted" },
  });

  // If this is a Twilio number, clear the webhook configuration on the
  // Twilio side so Twilio stops sending call events for a deleted number.
  // This is a free operation (just updating a URL). Failures are logged
  // but don't block the delete — the number is already soft-deleted locally.
  if (existing.provider === "TWILIO" && existing.providerNumberId) {
    try {
      await clearNumberWebhook(existing.providerNumberId);
    } catch (err) {
      console.error(`[numbers-delete] Failed to clear Twilio webhook for ${existing.phoneNumber}:`, err);
    }
  }

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "COMPANY_PHONE_DELETE",
    entityType: "CompanyPhone",
    entityId: id,
  });

  return json({ ok: true });
});
