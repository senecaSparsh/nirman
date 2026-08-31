import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { getScrapGeneration, cancelScrapGeneration } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/scrap-generations/[id]
 * Get a single scrap generation with full details.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const id = new URL(req.url).pathname.split("/").pop()!;

  const scrap = await getScrapGeneration(id, company.id);
  return json({
    ...scrap,
    generationDate: scrap.generationDate.toISOString(),
    createdAt: scrap.createdAt.toISOString(),
    lines: scrap.lines.map((l) => ({
      ...l,
      qty: toNum(l.qty),
      unitCost: toNum(l.unitCost),
      lineTotal: toNum(l.qty) * toNum(l.unitCost),
    })),
  });
});

/**
 * PATCH /api/scrap-generations/[id]
 * Cancel a scrap generation — reverses stock and GL entries.
 */
export const PATCH = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const id = new URL(req.url).pathname.split("/").pop()!;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = body?.action as string;

  if (action === "cancel") {
    try {
      const result = await cancelScrapGeneration(id, user.id);
      return json({ id: result.id, status: result.status });
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : "Failed to cancel scrap generation" }, { status: 400 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
});

/**
 * DELETE /api/scrap-generations/[id]
 * Hard-delete a scrap generation. Only allowed when status is COMPLETED
 * (the initial state — no DRAFT status exists for this model).
 * Stock movements and GL entries are immutable audit records and remain.
 */
export const DELETE = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const id = new URL(req.url).pathname.split("/").pop()!;

  const scrap = await prisma.scrapGeneration.findFirst({
    where: { id, companyId: company.id },
    select: { id: true, status: true },
  });
  if (!scrap) return json({ error: "Scrap generation not found" }, { status: 404 });
  if (scrap.status !== "COMPLETED") {
    return json({ error: "Only completed scrap generations can be deleted" }, { status: 400 });
  }

  // Delete lines first (cascade), then the scrap generation
  await prisma.scrapGenerationLine.deleteMany({ where: { scrapGenerationId: id } });
  await prisma.scrapGeneration.delete({ where: { id } });
  return json({ ok: true });
});
