import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, projectPhaseSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROJECTS_VIEW);
  const company = await getCompany();
  const { id } = await ctx.params;
  // Verify the project belongs to the user's company
  const project = await prisma.project.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!project) return json({ error: "Project not found" }, { status: 404 });
  const phases = await prisma.projectPhase.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: "asc" },
  });
  return json(phases);
});

export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROJECTS_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id, companyId: company.id, deletedAt: null } });
  if (!project) return json({ error: "Project not found" }, { status: 404 });
  const body = await req.json();
  const parsed = projectPhaseSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { startDate, endDate, budget, ...rest } = parsed.data;
  const created = await prisma.projectPhase.create({
    data: {
      ...rest,
      projectId: id,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      budget: budget ?? null,
    },
  });
  return json(created, { status: 201 });
});
