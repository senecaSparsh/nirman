import { NextRequest } from "next/server";
import { approveLeaveRequest, cancelLeaveRequest } from "@nirman/services";
import { apiHandler, getCompany, json, leaveActionSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

// POST /api/leaves/[id] — approve or reject a leave request
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;
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
    });
    return json({ ok: true, id: leave.id, status: leave.status });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to update leave request") }, { status: 400 });
  }
});

// DELETE /api/leaves/[id] — cancel a pending leave request
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  try {
    const leave = await cancelLeaveRequest(id, company.id, user.id);
    return json({ ok: true, id: leave.id, status: leave.status });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to cancel leave request") }, { status: 400 });
  }
});
