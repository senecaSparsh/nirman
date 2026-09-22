import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, assertCanManageEmployee } from "@/lib/server";
import { updateAdvanceStatus, HrError, type AdvanceStatus } from "@nirman/services";
import { PERM } from "@/lib/roles";

const VALID_STATUSES = new Set(["ACTIVE", "PAUSED", "SETTLED", "CANCELLED"]);

/**
 * PATCH /api/advances/[id] — pause / resume / settle / cancel an advance.
 * The employee-manage check keeps a junior from touching a senior's ledger
 * and bounds the action to the caller's scope.
 * Body: { status: "ACTIVE"|"PAUSED"|"SETTLED"|"CANCELLED", note? }
 */
export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;

  const advance = await prisma.employeeAdvance.findFirst({
    where: { id, companyId: company.id },
    select: { employeeId: true },
  });
  if (!advance) return json({ error: "Advance not found" }, { status: 404 });
  try {
    await assertCanManageEmployee(advance.employeeId, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Hierarchy violation" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const status = body.status as AdvanceStatus;
  if (!VALID_STATUSES.has(status)) {
    return json({ error: "status must be ACTIVE, PAUSED, SETTLED, or CANCELLED" }, { status: 400 });
  }
  try {
    const updated = await updateAdvanceStatus(id, company.id, status, user.id, body.note);
    return json({ ok: true, status: updated.status });
  } catch (err) {
    if (err instanceof HrError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});
