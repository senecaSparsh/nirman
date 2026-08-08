import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createDailyReport } from "@nirman/services";
import { apiHandler, getCompany, json, dailyReportSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.DPR_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const limit = Number(searchParams.get("limit") ?? 100);

  const reports = await prisma.dailyReport.findMany({
    where: {
      companyId: company.id,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { date: "desc" },
    take: Math.min(limit, 500),
    include: {
      project: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
    },
  });

  return json(
    reports.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      date: r.date.toISOString(),
      attendanceSummary: r.attendanceSummary,
      workDone: r.workDone,
      materialUsed: r.materialUsed,
      equipment: r.equipment,
      delay: r.delay,
      remarks: r.remarks,
      submittedByName: r.submittedBy?.name ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.DPR_SUBMIT);
  const company = await getCompany();
  const body = await req.json();
  const parsed = dailyReportSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const report = await createDailyReport({
      companyId: company.id,
      projectId: parsed.data.projectId ?? undefined,
      date: parsed.data.date,
      attendanceSummary: parsed.data.attendanceSummary ?? undefined,
      workDone: parsed.data.workDone,
      materialUsed: parsed.data.materialUsed ?? undefined,
      equipment: parsed.data.equipment ?? undefined,
      delay: parsed.data.delay ?? undefined,
      remarks: parsed.data.remarks ?? undefined,
      userId: user.id,
    });
    return json({ ok: true, id: report.id }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create daily report") }, { status: 400 });
  }
});
