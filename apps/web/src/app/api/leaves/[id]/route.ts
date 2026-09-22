import { NextRequest } from "next/server";
import { approveLeaveRequest, cancelLeaveRequest } from "@nirman/services";
import { apiHandler, getActingRole, getCompany, json, leaveActionSchema, requirePermission, requireUser, scopeWhere } from "@/lib/server";
import { hasPermission } from "@/lib/roles";
import { PERM } from "@/lib/roles";
import { prisma } from "@nirman/db";

// POST /api/leaves/[id] — approve or reject a leave request
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  // Scoped pre-fetch
  const existing = await prisma.leaveRequest.findFirst({
    where: { id, companyId: company.id, ...await scopeWhere("LeaveRequest") },
  });
  if (!existing) return json({ error: "Leave request not found or out of scope" }, { status: 404 });

  const body = await req.json();
  const parsed = leaveActionSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const leave = await approveLeaveRequest({
      leaveId: id,
      companyId: company.id,
      approvedById: user.id,
      approve: parsed.data.approve,
      rejectedReason: parsed.data.rejectedReason ?? undefined,
      actorRole: await getActingRole(),
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
