import { NextRequest } from "next/server";
import { approveLeaveRequest, cancelLeaveRequest } from "@nirman/services";
import { apiHandler, ForbiddenError, getActingRole, getActingRoleForProject, getCompany, getUserPermissions, json, leaveActionSchema, requireUser, scopeWhere } from "@/lib/server";
import { hasPermission } from "@/lib/roles";
import { PERM } from "@/lib/roles";
import { prisma } from "@nirman/db";

// POST /api/leaves/[id] — approve or reject a leave request
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const company = await getCompany();
  const { id } = await params;

  // Scoped pre-fetch (LeaveRequest scopes through employee.activeProjectId)
  const existing = await prisma.leaveRequest.findFirst({
    where: { id, companyId: company.id, ...await scopeWhere("LeaveRequest") },
    select: { id: true, employee: { select: { activeProjectId: true } } },
  });
  if (!existing) return json({ error: "Leave request not found or out of scope" }, { status: 404 });

  const body = await req.json();
  const parsed = leaveActionSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Scoped-role lift — a scoped HR_MANAGER/PM hat on the employee's project
  // grants leave-approval authority locally without global hr.manage.
  const actingRole =
    (await getActingRoleForProject(existing.employee.activeProjectId)) ?? (await getActingRole());
  const perms = await getUserPermissions();
  if (!perms.includes(PERM.HR_MANAGE) && !hasPermission(actingRole, PERM.HR_MANAGE)) {
    throw new ForbiddenError("You need leave approval rights on this project");
  }
  try {
    const leave = await approveLeaveRequest({
      leaveId: id,
      companyId: company.id,
      approvedById: user.id,
      approve: parsed.data.approve,
      rejectedReason: parsed.data.rejectedReason ?? undefined,
      actorRole: actingRole,
    });
    return json({ ok: true, id: leave.id, status: leave.status });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to update leave request") }, { status: 400 });
  }
});

// DELETE /api/leaves/[id] — cancel a pending leave request
// HR_MANAGE cancels any in-scope leave; a worker can withdraw their OWN
// request only while it's still PENDING (approved leave affects attendance
// + payroll, so withdrawal stays an HR action).
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const company = await getCompany();
  const { id } = await params;

  const canManage = hasPermission(await getActingRole(), PERM.HR_MANAGE);
  const existing = await prisma.leaveRequest.findFirst({
    where: {
      id,
      companyId: company.id,
      ...(canManage ? { ...await scopeWhere("LeaveRequest") } : {}),
    },
    include: { employee: { select: { userId: true } } },
  });
  if (!existing) return json({ error: "Leave request not found or out of scope" }, { status: 404 });
  if (!canManage) {
    if (existing.employee?.userId !== user.id || existing.status !== "PENDING") {
      return json({ error: "You can only withdraw your own pending leave" }, { status: 403 });
    }
  }

  try {
    const leave = await cancelLeaveRequest(id, company.id, user.id);
    return json({ ok: true, id: leave.id, status: leave.status });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to cancel leave request") }, { status: 400 });
  }
});
