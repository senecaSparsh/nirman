import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { updateRateAnalysis, deleteRateAnalysis } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const lineSchema = z.object({
  id: z.string().optional(),
  componentType: z.enum(["MATERIAL", "LABOUR", "EQUIPMENT", "OVERHEAD", "PROFIT", "OTHER"]),
  basis: z.enum(["QUANTITY", "PERCENTAGE"]).optional(),
  materialId: z.string().optional().nullable(),
  description: z.string().min(1),
  quantity: z.coerce.number().optional().nullable(),
  unit: z.string().optional().nullable(),
  rate: z.coerce.number().optional().nullable(),
  percentage: z.coerce.number().optional().nullable(),
  sortOrder: z.coerce.number().optional(),
});

const updateSchema = z.object({
  perUnit: z.string().min(1).optional(),
  wastagePct: z.coerce.number().optional(),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1).optional(),
  updateBoqRate: z.boolean().optional().default(false),
});

// PATCH /api/rate-analysis/[id] — update a rate analysis
export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Verify ownership
  const ra = await prisma.rateAnalysis.findUnique({
    where: { id },
    include: { boqItem: { include: { project: { select: { companyId: true } } } } },
  });
  if (!ra) return json({ error: "Rate analysis not found" }, { status: 404 });
  if (ra.boqItem.project.companyId !== company.id) {
    return json({ error: "Rate analysis does not belong to your company" }, { status: 403 });
  }

  try {
    const updated = await updateRateAnalysis(id, {
      perUnit: parsed.data.perUnit,
      wastagePct: parsed.data.wastagePct,
      notes: parsed.data.notes,
      lines: parsed.data.lines,
      updateBoqRate: parsed.data.updateBoqRate,
      userId: user.id,
    });
    return json(updated);
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});

// DELETE /api/rate-analysis/[id] — delete a rate analysis
export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;

  // Verify ownership
  const ra = await prisma.rateAnalysis.findUnique({
    where: { id },
    include: { boqItem: { include: { project: { select: { companyId: true } } } } },
  });
  if (!ra) return json({ error: "Rate analysis not found" }, { status: 404 });
  if (ra.boqItem.project.companyId !== company.id) {
    return json({ error: "Rate analysis does not belong to your company" }, { status: 403 });
  }

  try {
    await deleteRateAnalysis(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
