import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { submitDPR } from "@nirman/services";
import { apiHandler, getCompany, json, dprSchema, requirePermission, toNum, scopeWhere, assertScopeAllows } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { parseCursorParams, cursorToWhere, buildCursorResponse } from "@/lib/cursor-pagination";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.DPR_VIEW);
  const company = await getCompany();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const approvalStatus = url.searchParams.get("approvalStatus");

  // Cursor pagination — backward compatible. If `cursor` param is present,
  // return { items, nextCursor, hasMore }. Otherwise return flat array.
  const { take, cursor, skip } = parseCursorParams(req);
  const usePagination = url.searchParams.has("cursor") || url.searchParams.has("take");

  const dprs = await prisma.dailyProgressReport.findMany({
    where: {
      companyId: company.id,
      ...(projectId ? { projectId } : {}),
      ...(startDate && endDate ? { date: { gte: new Date(startDate), lte: new Date(endDate) } } : {}),
      ...(approvalStatus ? { approvalStatus: approvalStatus as "SUBMITTED" | "SUB_ADMIN_APPROVED" | "APPROVED" | "REJECTED" } : {}),
      ...(cursorToWhere(cursor, "date") ?? {}),
      ...await scopeWhere("DailyProgressReport"),
    },
    orderBy: { date: "desc" },
    take: usePagination ? take + 1 : 500,
    skip: usePagination ? skip : undefined,
    include: {
      project: { select: { id: true, name: true, totalProjectCost: true, costPerSqft: true, totalBudget: true, totalSellableArea: true } },
      submittedBy: { select: { id: true, name: true } },
      subAdminApprovedBy: { select: { name: true } },
      adminApprovedBy: { select: { name: true } },
      _count: { select: { materialLines: true, laborLines: true } },
    },
  });

  const mapped = dprs.map((d) => ({
      id: d.id,
      projectId: d.projectId,
      projectName: d.project?.name ?? null,
      date: d.date,
      submittedByName: d.submittedBy?.name ?? null,
      weather: d.weather,
      workSummary: d.workSummary,
      progressPct: toNum(d.progressPct),
      blockers: d.blockers,
      tomorrowPlan: d.tomorrowPlan,
      photoUrls: d.photoUrls,
      approvalStatus: d.approvalStatus,
      subAdminApprovedByName: d.subAdminApprovedBy?.name ?? null,
      adminApprovedByName: d.adminApprovedBy?.name ?? null,
      materialLineCount: d._count.materialLines,
      laborLineCount: d._count.laborLines,
      totalProjectCost: d.project?.totalProjectCost ? toNum(d.project.totalProjectCost) : null,
      costPerSqft: d.project?.costPerSqft ? toNum(d.project.costPerSqft) : null,
      projectBudget: d.project?.totalBudget ? toNum(d.project.totalBudget) : null,
      totalSellableArea: d.project?.totalSellableArea ? toNum(d.project.totalSellableArea) : null,
    }));

  if (usePagination) {
    const { items, nextCursor, hasMore } = buildCursorResponse(mapped, take, (r) => ({
      createdAt: r.date instanceof Date ? r.date.toISOString() : r.date,
      id: r.id,
    }));
    return json({ items, nextCursor, hasMore });
  }
  return json(mapped);
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.DPR_SUBMIT);
  const company = await getCompany();
  const body = await req.json();
  const parsed = dprSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const dprDate = new Date(parsed.data.date);
  if (isNaN(dprDate.getTime())) {
    return json({ error: "Invalid date format" }, { status: 400 });
  }
  try {
    await assertScopeAllows({ projectId: parsed.data.projectId ?? null, departmentId: null });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
  }
  try {
    const dpr = await submitDPR({
      companyId: company.id,
      projectId: parsed.data.projectId,
      date: dprDate,
      submittedById: user.id,
      weather: parsed.data.weather ?? undefined,
      workSummary: parsed.data.workSummary,
      workType: parsed.data.workType ?? undefined,
      workQty: parsed.data.workQty ?? undefined,
      workUnit: parsed.data.workUnit ?? undefined,
      progressPct: parsed.data.progressPct ?? undefined,
      blockers: parsed.data.blockers ?? undefined,
      tomorrowPlan: parsed.data.tomorrowPlan ?? undefined,
      notes: parsed.data.notes ?? undefined,
      photoUrls: parsed.data.photoUrls,
      materialLines: parsed.data.materialLines?.map((l) => ({
        materialId: l.materialId,
        qty: l.qty,
        unitCost: l.unitCost,
      })),
      laborLines: parsed.data.laborLines?.map((l) => ({
        employeeId: l.employeeId ?? undefined,
        crewId: l.crewId ?? undefined,
        hoursWorked: l.hoursWorked,
        taskDescription: l.taskDescription,
      })),
      skipAttendanceCheck: parsed.data.skipAttendanceCheck ?? false,
      userId: user.id,
    });
    revalidatePath("/dprs");
    revalidatePath("/m/dprs");
    revalidatePath("/m/hr?tab=dprs");
    return json({ ok: true, id: dpr.id }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to submit DPR") }, { status: 400 });
  }
});
