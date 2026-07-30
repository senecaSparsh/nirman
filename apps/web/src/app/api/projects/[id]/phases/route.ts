import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, projectPhaseSchema } from "@/lib/server";

export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const phases = await prisma.projectPhase.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: "asc" },
  });
  return json(phases);
});

export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id, deletedAt: null } });
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
