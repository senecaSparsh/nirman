import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, assertCanManageEmployee } from "@/lib/server";
import { decideAttendanceCorrection, HrError } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const decisionSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

/**
 * POST /api/employees/[id]/attendance-corrections/[rid] — HR decides a
 * punch-correction ask. Approve upserts the day's WorkerAttendance row
 * (one row per employee-day — a missing punch becomes the asked-for one,
 * a wrong one gets overwritten); reject closes it with a note. Either
 * way the worker gets the answer in-app — the ask had no channel before.
 */
export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string; rid: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id, rid } = await ctx.params;

  try {
    await assertCanManageEmployee(id, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Hierarchy violation" }, { status: 403 });
  }

  // The request must belong to THIS employee — a guessed rid from another
  // record must 404, not decide.
  const request = await prisma.attendanceCorrectionRequest.findFirst({
    where: { id: rid, employeeId: id, companyId: company.id },
    select: { id: true },
  });
  if (!request) return json({ error: "Correction request not found" }, { status: 404 });

  const parsed = decisionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  try {
    const updated = await decideAttendanceCorrection({
      requestId: rid,
      companyId: company.id,
      approve: parsed.data.approve,
      note: parsed.data.note,
      actorUserId: user.id,
    });
    return json({ ok: true, status: updated.status });
  } catch (err) {
    if (err instanceof HrError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});
