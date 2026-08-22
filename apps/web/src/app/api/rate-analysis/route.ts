import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createRateAnalysis, getRateAnalysis } from "@nirman/services";
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

const createSchema = z.object({
  boqItemId: z.string().min(1),
  perUnit: z.string().min(1),
  wastagePct: z.coerce.number().optional().default(0),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1),
  updateBoqRate: z.boolean().optional().default(false),
});

// GET /api/rate-analysis?boqItemId=xxx
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const boqItemId = req.nextUrl.searchParams.get("boqItemId");
  if (!boqItemId) return json({ error: "boqItemId is required" }, { status: 400 });
  const ra = await getRateAnalysis(boqItemId);
  return json(ra);
});

// POST /api/rate-analysis — create a new rate analysis
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Verify the BOQ item belongs to a project in the user's company
  const boqItem = await prisma.boqItem.findFirst({
    where: { id: parsed.data.boqItemId },
    include: { project: { select: { companyId: true } } },
  });
  if (!boqItem) return json({ error: "BOQ item not found" }, { status: 404 });
  if (boqItem.project.companyId !== company.id) {
    return json({ error: "BOQ item does not belong to your company" }, { status: 403 });
  }
  if (boqItem.type !== "LINE_ITEM") {
    return json({ error: "Rate analysis can only be created for LINE_ITEM type BOQ items" }, { status: 400 });
  }

  try {
    const ra = await createRateAnalysis({
      boqItemId: parsed.data.boqItemId,
      perUnit: parsed.data.perUnit,
      wastagePct: parsed.data.wastagePct,
      notes: parsed.data.notes ?? null,
      lines: parsed.data.lines,
      updateBoqRate: parsed.data.updateBoqRate,
      userId: user.id,
    });
    return json(ra, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
