import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, projectPhaseSchema, requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string; phaseId: string }> }) => {
    await requirePermission(PERM.PROJECTS_MANAGE);
    const company = await getCompany();
    const { id, phaseId } = await ctx.params;
    const body = await req.json();
    const parsed = projectPhaseSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    // The URL parent {id} must match the phase's own project — otherwise a
    // caller could PATCH a phase on project B through /projects/A/phases/B.
    const existing = await prisma.projectPhase.findFirst({
      where: { id: phaseId, projectId: id, project: { companyId: company.id }, ...await scopeWhere("ProjectPhase") },
    });
    if (!existing) return json({ error: "Phase not found" }, { status: 404 });
    // PATCH semantics: `undefined` = preserve, `null`/`""` = explicit clear.
    // `status` carries a zod default ("PLANNED") — an absent key parses to the
    // default and would silently reset an ACTIVE phase; distinguish "not sent"
    // from "sent" by inspecting the raw body.
    const { startDate, endDate, budget, status, sortOrder, ...rest } = parsed.data;
    const updated = await prisma.projectPhase.update({
      where: { id: phaseId },
      data: {
        ...rest,
        ...(status !== undefined && "status" in body ? { status } : {}),
        ...(sortOrder !== undefined && "sortOrder" in body ? { sortOrder } : {}),
        ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
        ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
        ...(budget !== undefined ? { budget } : {}),
      },
    });
    return json(updated);
  },
);

export const DELETE = apiHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string; phaseId: string }> }) => {
    await requirePermission(PERM.PROJECTS_MANAGE);
    const company = await getCompany();
    const { id, phaseId } = await ctx.params;
    const phase = await prisma.projectPhase.findFirst({
      where: { id: phaseId, projectId: id, project: { companyId: company.id }, ...await scopeWhere("ProjectPhase") },
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
