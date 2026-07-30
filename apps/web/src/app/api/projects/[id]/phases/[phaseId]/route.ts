import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, projectPhaseSchema } from "@/lib/server";

export const PATCH = apiHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string; phaseId: string }> }) => {
    const { phaseId } = await ctx.params;
    const body = await req.json();
    const parsed = projectPhaseSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const existing = await prisma.projectPhase.findUnique({ where: { id: phaseId } });
    if (!existing) return json({ error: "Phase not found" }, { status: 404 });
    const { startDate, endDate, budget, ...rest } = parsed.data;
    const updated = await prisma.projectPhase.update({
      where: { id: phaseId },
      data: {
        ...rest,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        budget: budget ?? null,
      },
    });
    return json(updated);
  },
);

export const DELETE = apiHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string; phaseId: string }> }) => {
    const { phaseId } = await ctx.params;
    const phase = await prisma.projectPhase.findUnique({
      where: { id: phaseId },
      include: {
        _count: {
          select: { stockLocations: true, builtUnits: true, materialIssues: true },
        },
      },
    });
    if (!phase) return json({ error: "Phase not found" }, { status: 404 });
    const inUse = phase._count.stockLocations + phase._count.builtUnits + phase._count.materialIssues;
    if (inUse > 0) {
      return json(
        { error: "Cannot delete phase with linked locations, units, or material issues." },
        { status: 400 },
      );
    }
    await prisma.projectPhase.delete({ where: { id: phaseId } });
    return json({ ok: true });
  },
);
