import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, getCurrentUser, json } from "@/lib/server";
import { requestAttendanceCorrection, listMyAttendanceCorrections, HrError } from "@nirman/services";
import { z } from "zod";

const requestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a day"),
  status: z.enum(["PRESENT", "HALF_DAY", "LATE", "OVERTIME", "PAID_LEAVE"]),
  checkIn: z.string().datetime().optional(),
  checkOut: z.string().datetime().optional(),
  reason: z.string().trim().min(1, "Give a reason").max(500),
});

/**
 * GET/POST /api/me/attendance-corrections — the worker's "I forgot to punch"
 * asks + their history. The request is auditable intent; HR deciding is the
 * actual correction (upserts the day's WorkerAttendance row).
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const company = await getCompany();

  const employee = await prisma.employee.findFirst({
    where: { companyId: company.id, deletedAt: null, userId: user.id },
    select: { id: true },
  });
  if (!employee) return json({ requests: [] });

  const requests = await listMyAttendanceCorrections(employee.id, company.id);
  return json({
    requests: requests.map((r) => ({
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      status: r.status,
      requestedStatus: r.requestedStatus,
      reason: r.reason,
      reviewNote: r.reviewNote,
      reviewedBy: r.reviewedBy?.name ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

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
    const request = await requestAttendanceCorrection({
      employeeId: employee.id,
      companyId: company.id,
      date: parsed.data.date,
      status: parsed.data.status,
      checkIn: parsed.data.checkIn ?? null,
      checkOut: parsed.data.checkOut ?? null,
      reason: parsed.data.reason,
      actorUserId: user.id,
    });
    return json({ ok: true, requestId: request.id }, { status: 201 });
  } catch (err) {
    if (err instanceof HrError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});
