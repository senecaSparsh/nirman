import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, assertCanManageEmployee } from "@/lib/server";
import { decideAdvanceRequest, HrError } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const decisionSchema = z.object({
  approve: z.boolean(),
  /** Required on approve — the payroll deduction per month. */
  monthlyRecovery: z.number().positive().optional(),
  note: z.string().trim().max(500).optional(),
});

/**
 * POST /api/employees/[id]/advances/[aid] — HR decides a pending request.
 * approve: the row turns ACTIVE, the cash-out JE posts (same legs as a
 *   directly-issued advance), and payroll recovery starts next period.
 * reject: the row is CANCELLED with the reason on the notes — nothing
 *   ever hit the ledger. The id + aid double-key stops a wrong-employee
 *   decision; the scope/hierarchy check stops a junior deciding a senior's.
 */
export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string; aid: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id, aid } = await ctx.params;

  try {
    await assertCanManageEmployee(id, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Hierarchy violation" }, { status: 403 });
  }

  // The advance must belong to THIS employee — a guessed aid from another
  // record must 404, not decide.
  const advance = await prisma.employeeAdvance.findFirst({
    where: { id: aid, employeeId: id, companyId: company.id },
    select: { id: true },
  });
  if (!advance) return json({ error: "Advance request not found" }, { status: 404 });

  const parsed = decisionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  if (parsed.data.approve && parsed.data.monthlyRecovery == null) {
    return json({ error: "monthlyRecovery is required when approving" }, { status: 400 });
  }

  try {
    const updated = await decideAdvanceRequest({
      advanceId: aid,
      companyId: company.id,
      approve: parsed.data.approve,
      monthlyRecovery: parsed.data.monthlyRecovery,
      note: parsed.data.note,
      actorUserId: user.id,
    });
    return json({ ok: true, status: updated.status });
  } catch (err) {
    if (err instanceof HrError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});
