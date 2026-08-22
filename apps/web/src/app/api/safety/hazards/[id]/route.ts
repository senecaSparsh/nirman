import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { getHazard, updateHazard, startMitigation, resolveHazard, deleteHazard } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  likelihood: z.coerce.number().min(1).max(5).optional(),
  severity: z.coerce.number().min(1).max(5).optional(),
  location: z.string().optional().nullable(),
  wbsNodeId: z.string().optional().nullable(),
  mitigationPlan: z.string().optional().nullable(),
  targetResolutionDate: z.string().optional().nullable(),
  attachments: z.array(z.string()).optional(),
});

const actionSchema = z.object({
  action: z.enum(["mitigate", "resolve", "delete"]),
  mitigationPlan: z.string().optional(),
  resolutionNotes: z.string().optional(),
});

export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const { id } = await ctx.params;
  const hazard = await getHazard(id);
  if (!hazard) return json({ error: "Hazard not found" }, { status: 404 });
  return json(hazard);
});

export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  const body = await req.json();

  const existing = await prisma.safetyHazard.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing) return json({ error: "Hazard not found" }, { status: 404 });
  if (existing.companyId !== company.id) return json({ error: "Hazard does not belong to your company" }, { status: 403 });

  if (body.action && typeof body.action === "string") {
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid action" }, { status: 400 });
    try {
      switch (parsed.data.action) {
        case "mitigate":
          return json(await startMitigation(id, user.id, parsed.data.mitigationPlan));
        case "resolve":
          if (!parsed.data.resolutionNotes) return json({ error: "resolutionNotes required" }, { status: 400 });
          return json(await resolveHazard(id, user.id, parsed.data.resolutionNotes));
        case "delete":
          await deleteHazard(id, user.id);
          return json({ ok: true });
      }
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
    }
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    return json(await updateHazard(id, {
      ...parsed.data,
      targetResolutionDate: parsed.data.targetResolutionDate ? new Date(parsed.data.targetResolutionDate) : undefined,
    }));
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  const existing = await prisma.safetyHazard.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing) return json({ error: "Hazard not found" }, { status: 404 });
  if (existing.companyId !== company.id) return json({ error: "Hazard does not belong to your company" }, { status: 403 });
  try {
    await deleteHazard(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
