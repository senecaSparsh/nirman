import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, workflowSchema } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/workflows — list workflows scoped to the active company
 */
export const GET = apiHandler(async () => {
  await requirePermission(PERM.CANVAS_VIEW);
  const company = await getCompany();
  const workflows = await prisma.workflow.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { runs: true, schedules: true } },
      schedules: { where: { enabled: true }, select: { id: true, nextRunAt: true, cron: true, intervalM: true } },
    },
  });
  return json(
    workflows.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      icon: w.icon,
      status: w.status,
      runCount: w._count.runs,
      scheduleCount: w._count.schedules,
      nextRun: w.schedules[0]?.nextRunAt?.toISOString() ?? null,
      schedule: w.schedules[0] ?? null,
      createdAt: w.createdAt.toISOString(),
    })),
  );
});

/**
 * POST /api/workflows — create a new workflow (managers+ only)
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.WORKFLOWS_MANAGE);
  const company = await getCompany();

  const body = await req.json();
  const parsed = workflowSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const created = await prisma.workflow.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      icon: parsed.data.icon,
      graphJson: parsed.data.graphJson,
      status: "DRAFT",
      companyId: company.id,
      createdBy: user.id,
    },
  });

  return json({ ok: true, id: created.id }, { status: 201 });
});
