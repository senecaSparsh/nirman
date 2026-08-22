import { NextRequest } from "next/server";
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
  const body = await req.json().catch(() => ({}));
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
