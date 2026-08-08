import { NextRequest } from "next/server";
import { createScrapGeneration, listScrapGenerations } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/**
 * GET /api/scrap-generations?from=YYYY-MM-DD&to=YYYY-MM-DD
 * List scrap / "create" material generations for the current company.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const dateRange: { from?: Date; to?: Date } = {};
  if (from) dateRange.from = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    dateRange.to = end;
  }

  const scraps = await listScrapGenerations(company.id, dateRange);
  return json({
    rows: scraps.map((s) => ({
      ...s,
      generationDate: s.generationDate.toISOString(),
      createdAt: s.createdAt.toISOString(),
      lines: s.lines.map((l) => ({
        ...l,
        qty: toNum(l.qty),
        unitCost: toNum(l.unitCost),
        lineTotal: toNum(l.qty) * toNum(l.unitCost),
      })),
    })),
    count: scraps.length,
  });
});

const lineSchema = z.object({
  materialId: z.string().min(1),
  qty: z.union([z.number(), z.string()]),
  unitCost: z.union([z.number(), z.string()]),
});

const createSchema = z.object({
  toLocationId: z.string().min(1),
  sourceMaterialId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

/**
 * POST /api/scrap-generations
 * Create a new scrap / "create" material generation.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = createSchema.parse(body);

  const scrap = await createScrapGeneration({
    companyId: company.id,
    toLocationId: parsed.toLocationId,
    sourceMaterialId: parsed.sourceMaterialId ?? undefined,
    projectId: parsed.projectId ?? undefined,
    notes: parsed.notes ?? undefined,
    createdById: user.id,
    lines: parsed.lines.map((l) => ({
      materialId: l.materialId,
      qty: l.qty,
      unitCost: l.unitCost,
    })),
  });

  return json({ id: scrap.id, scrapNumber: scrap.scrapNumber }, { status: 201 });
});
