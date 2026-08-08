import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import type { LeaveStatus } from "@nirman/db";
import { createLeaveRequest } from "@nirman/services";
import { apiHandler, getCompany, json, leaveRequestSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

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
    },
    orderBy: { createdAt: "desc" },
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
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = leaveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const leave = await createLeaveRequest({
      companyId: company.id,
      employeeId: parsed.data.employeeId,
      type: parsed.data.type ?? "CASUAL",
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      reason: parsed.data.reason ?? undefined,
      userId: user.id,
    });
    return json({ ok: true, id: leave.id }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create leave request") }, { status: 400 });
  }
});
