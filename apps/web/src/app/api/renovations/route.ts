import { NextRequest } from "next/server";
import { prisma, type RenovationStatus } from "@nirman/db";
import { createRenovation } from "@nirman/services";
import { apiHandler, getCompany, json, renovationSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const projectId = searchParams.get("projectId");

  const renovations = await prisma.renovationProject.findMany({
    where: {
      companyId: company.id,
      ...(status ? { status: status as RenovationStatus } : {}),
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      builtUnit: { select: { id: true, unitNumber: true, unitType: true, currentValuation: true } },
      landParcel: { select: { id: true, number: true, currentValuation: true } },
      project: { select: { id: true, name: true } },
      costs: { orderBy: { createdAt: "desc" }, take: 50 },
      _count: { select: { costs: true } },
    },
  });

  return json(
    renovations.map((r) => ({
      id: r.id,
      renovationNumber: r.renovationNumber,
      type: r.type,
      status: r.status,
      title: r.title,
      description: r.description,
      builtUnitId: r.builtUnitId,
      builtUnitNumber: r.builtUnit?.unitNumber ?? null,
      builtUnitType: r.builtUnit?.unitType ?? null,
      landParcelId: r.landParcelId,
      landParcelNumber: r.landParcel?.number ?? null,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      budget: toNum(r.budget),
      actualCost: toNum(r.actualCost),
      originalValuation: toNum(r.originalValuation),
      newValuation: r.newValuation ? toNum(r.newValuation) : null,
      startDate: r.startDate?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      costCount: r._count.costs,
      costs: r.costs.map((c) => ({
        id: c.id,
        costType: c.costType,
        amount: toNum(c.amount),
        vendor: c.vendor,
        notes: c.notes,
        date: c.date.toISOString(),
      })),
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = renovationSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const renovation = await createRenovation({
      companyId: company.id,
      projectId: parsed.data.projectId,
      type: parsed.data.type,
      title: parsed.data.title,
      description: parsed.data.description ?? undefined,
      builtUnitId: parsed.data.builtUnitId ?? undefined,
      landParcelId: parsed.data.landParcelId ?? undefined,
      budget: parsed.data.budget ?? 0,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      userId: user.id,
    });
    return json({ ok: true, id: renovation.id, renovationNumber: renovation.renovationNumber }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create renovation";
    return json({ error: message }, { status: 400 });
  }
});
