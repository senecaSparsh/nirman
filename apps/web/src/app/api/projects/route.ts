import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, projectSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROJECTS_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim() ?? "";

  const projects = await prisma.project.findMany({
    take: 100,
    where: {
      companyId: company.id,
      deletedAt: null,
      ...(type ? { type: type as any } : {}),
      ...(status ? { status: status as any } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          builtUnits: { where: { deletedAt: null } },
          stockLocations: { where: { deletedAt: null } },
          phases: true,
        },
      },
    },
  });
  return json(
    projects.map((p) => ({
      ...p,
      totalBudget: toNum(p.totalBudget),
      costPerSqft: toNum(p.costPerSqft),
      totalProjectCost: toNum(p.totalProjectCost),
      totalSellableArea: toNum(p.totalSellableArea),
      unitCount: p._count.builtUnits,
      locationCount: p._count.stockLocations,
      phaseCount: p._count.phases,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROJECTS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = projectSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { startDate, endDate, totalBudget, ...rest } = parsed.data;
  const created = await prisma.project.create({
    data: {
      ...rest,
      companyId: company.id,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      totalBudget: totalBudget ?? null,
    },
  });
  return json(created, { status: 201 });
});
