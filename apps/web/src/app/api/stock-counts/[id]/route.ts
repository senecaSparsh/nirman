import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { confirmStockCount, reconcileStockCount, deleteStockCount } from "@nirman/services";
import { apiHandler, json, toNum, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { id } = await ctx.params;
  const count = await prisma.stockCount.findUnique({
    where: { id },
    include: {
      location: { select: { id: true, name: true, type: true, companyId: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true } } },
      },
    },
  });
  if (!count || count.location.companyId !== company.id) {
    return json({ error: "Stock count not found" }, { status: 404 });
  }

  // Fetch current MAC per material at this location for GL preview
  const stockItems = await prisma.stockLocationItem.findMany({
    where: { locationId: count.locationId },
    select: { materialId: true, movingAvgCost: true },
  });
  const macByMaterial = new Map(stockItems.map((s) => [s.materialId, toNum(s.movingAvgCost)]));

  return json({
    id: count.id,
    locationId: count.locationId,
    locationName: count.location.name,
    locationType: count.location.type,
    status: count.status,
    countDate: count.countDate.toISOString(),
    notes: count.notes,
    createdAt: count.createdAt.toISOString(),
    lines: count.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialCode: l.material.code,
      materialName: l.material.name,
      unit: l.material.unit,
      countedQty: toNum(l.countedQty),
      systemQty: toNum(l.systemQty),
      variance: toNum(l.variance),
      unitCost: macByMaterial.get(l.materialId) ?? 0,
    })),
  });
});

export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const { id } = await ctx.params;
  const body = await req.json();
  const action = body?.action as string;
  try {
    if (action === "confirm") {
      const c = await confirmStockCount(id, user.id);
      return json({ ok: true, status: c.status });
    }
    if (action === "reconcile") {
      const c = await reconcileStockCount(id, user.id);
      return json({ ok: true, status: c.status });
    }
    return json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Action failed") }, { status: 400 });
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  // Verify the count belongs to the current company before deleting
  const count = await prisma.stockCount.findUnique({
    where: { id },
    include: { location: { select: { companyId: true } } },
  });
  if (!count || count.location.companyId !== company.id) {
    return json({ error: "Stock count not found" }, { status: 404 });
  }
  try {
    await deleteStockCount(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";
    const status = message.includes("not found") ? 404 : 400;
    return json({ error: message }, { status });
  }
});
