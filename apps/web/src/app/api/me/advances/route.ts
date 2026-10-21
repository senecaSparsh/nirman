import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, getCurrentUser, json } from "@/lib/server";
import { requestAdvance, HrError } from "@nirman/services";
import { z } from "zod";

const requestSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0").max(10_000_000),
  notes: z.string().trim().max(500).optional(),
});

/**
 * POST /api/me/advances — the employee's own advance request. This is the
 * ask that otherwise lives in WhatsApp: worker → HR, no middleman. The row
 * lands as REQUESTED — no cash moves and no payroll deduction until HR
 * approves and sets the recovery terms. Anyone with an Employee record can
 * use it; HR still decides on the dossier.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const company = await getCompany();

  const employee = await prisma.employee.findFirst({
    where: { companyId: company.id, deletedAt: null, userId: user.id },
    select: { id: true },
  });
  if (!employee) return json({ error: "No employee record is linked to your account" }, { status: 404 });

  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  try {
    const advance = await requestAdvance({
      employeeId: employee.id,
      companyId: company.id,
      amount: parsed.data.amount,
      notes: parsed.data.notes ?? null,
      actorUserId: user.id,
    });
    return json({ ok: true, advanceId: advance.id }, { status: 201 });
  } catch (err) {
    if (err instanceof HrError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});
