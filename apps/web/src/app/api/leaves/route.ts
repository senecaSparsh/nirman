import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import type { LeaveStatus } from "@nirman/db";
import { createLeaveRequest, approveLeaveRequest, canAutoApprove } from "@nirman/services";
import { apiHandler, getCompany, json, leaveRequestSchema, requirePermission, requireUser, toNum, scopeWhere, getActingRole,} from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const employeeId = searchParams.get("employeeId");

  const leaves = await prisma.leaveRequest.findMany({
    where: {
      companyId: company.id,
      ...(status ? { status: status as LeaveStatus } : {}),
      ...(employeeId ? { employeeId } : {}),
      ...await scopeWhere("LeaveRequest", {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      employee: { select: { id: true, name: true, trade: true, designation: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });

  return json(
    leaves.map((l) => ({
      id: l.id,
      employeeId: l.employeeId,
      employeeName: l.employee.name,
      employeeTrade: l.employee.trade,
      employeeDesignation: l.employee.designation,
      type: l.type,
      startDate: l.startDate.toISOString(),
      endDate: l.endDate.toISOString(),
      days: toNum(l.days),
      reason: l.reason,
      status: l.status,
      approvedById: l.approvedById,
      approvedByName: l.approvedBy?.name ?? null,
      approvedAt: l.approvedAt?.toISOString() ?? null,
      rejectedReason: l.rejectedReason,
      createdAt: l.createdAt.toISOString(),
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();
  const body = await req.json();
  const canManage = hasPermission(await getActingRole(), PERM.HR_MANAGE);

  // Self-service: a caller without HR_MANAGE can only request leave for
  // themselves — the employeeId is resolved from their own employee
  // record, ignoring any id passed in the body (prevents filing leave
  // on someone else's behalf).
  const parsed = leaveRequestSchema.safeParse(canManage ? body : { ...body, employeeId: "self" });
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Verify the target employee is in scope and manageable
  const { prisma } = await import("@nirman/db");
  const employee = canManage
    ? await prisma.employee.findFirst({
        where: { id: parsed.data.employeeId, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
        select: { id: true, userId: true },
      })
    : await prisma.employee.findFirst({
        where: { userId: user.id, companyId: company.id, deletedAt: null, active: true },
        select: { id: true, userId: true },
      });
  if (!employee) {
    return json(
      { error: canManage ? "Employee not found or out of scope" : "No employee record linked to your account" },
      { status: 404 },
    );
  }

  try {
    const leave = await createLeaveRequest({
      companyId: company.id,
      employeeId: employee.id,
      type: parsed.data.type ?? "CASUAL",
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      reason: parsed.data.reason ?? undefined,
      userId: user.id,
    });
    // A tier-1 user (OWNER/ADMIN) creating their OWN leave auto-approves it —
    // they're both the requester and the top of the approval hierarchy, so no
    // higher reviewer exists. Leave created for someone else still goes through
    // that person's normal approval (the creator isn't the leave owner).
    if (canAutoApprove(await getActingRole()) && employee.userId === user.id) {
      await approveLeaveRequest({
        leaveId: leave.id,
        companyId: company.id,
        approvedById: user.id,
        approve: true,
        actorRole: await getActingRole(),
      });
      return json({ ok: true, id: leave.id, status: "APPROVED" }, { status: 201 });
    }
    return json({ ok: true, id: leave.id }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create leave request") }, { status: 400 });
  }
});
