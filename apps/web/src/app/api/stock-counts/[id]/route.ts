import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { confirmStockCount, reconcileStockCount, deleteStockCount } from "@nirman/services";
import { apiHandler, assertScopeAllows, json, toNum, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

/**
 * Load a stock count only when its location belongs to `companyId`.
 * StockCount carries no companyId of its own — tenancy flows through the
 * location. Every handler MUST go through this guard before reading or
 * mutating: the service functions (confirm/reconcile/delete) take a bare id
 * and would otherwise act on any tenant's count, writing stock movements and
 * GL entries into the victim company's books.
 */
async function findCountInCompany(id: string, companyId: string) {
  return prisma.stockCount.findFirst({
    where: { id, location: { companyId, deletedAt: null } },
    select: {
      id: true,
      location: {
        select: { id: true, name: true, type: true, companyId: true, projectId: true, departmentId: true },
      },
    },
  });
}

/** 404 for foreign counts; 403 when the count's location is outside the caller's scope. */
async function assertCountAccess(id: string, companyId: string) {
  const count = await findCountInCompany(id, companyId);
  if (!count) return null;
  await assertScopeAllows({
    projectId: count.location.projectId,
    departmentId: count.location.departmentId,
  });
  return count;
}

export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { id } = await ctx.params;
  let count;
  try {
    count = await assertCountAccess(id, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
  }
  if (!count) {
    return json({ error: "Stock inventory not found" }, { status: 404 });
  }
  const full = await prisma.stockCount.findUnique({
    where: { id: count.id },
    include: {
      location: { select: { id: true, name: true, type: true, companyId: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true } } },
      },
      createdBy: { select: { name: true } },
      confirmedBy: { select: { name: true } },
      reconciledBy: { select: { name: true } },
    },
  });
  if (!full) {
    return json({ error: "Stock inventory not found" }, { status: 404 });
  }

  // Fetch current MAC per material at this location for GL preview
  const stockItems = await prisma.stockLocationItem.findMany({
    where: { locationId: full.locationId },
    select: { materialId: true, movingAvgCost: true },
  });
  const macByMaterial = new Map(stockItems.map((s) => [s.materialId, toNum(s.movingAvgCost)]));

  return json({
    id: full.id,
    locationId: full.locationId,
    locationName: full.location.name,
    locationType: full.location.type,
    status: full.status,
    countDate: full.countDate.toISOString(),
    notes: full.notes,
    createdAt: full.createdAt.toISOString(),
    createdByName: full.createdBy?.name ?? null,
    confirmedByName: full.confirmedBy?.name ?? null,
    confirmedAt: full.confirmedAt?.toISOString() ?? null,
    reconciledByName: full.reconciledBy?.name ?? null,
    reconciledAt: full.reconciledAt?.toISOString() ?? null,
    lines: full.lines.map((l) => ({
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
  const company = await getCompany();
  const { id } = await ctx.params;
  const body = await req.json();
  const action = body?.action as string;
  // Confirm/reconcile write stock movements + GL entries — verify the count
  // belongs to this company (and the caller's scope) BEFORE delegating to the
  // service, which takes a bare id and cannot re-check tenancy.
  let count;
  try {
    count = await assertCountAccess(id, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
  }
  if (!count) {
    return json({ error: "Stock inventory not found" }, { status: 404 });
  }
  try {
    if (action === "confirm") {
      const c = await confirmStockCount(id, user.id);
      revalidatePath("/stock-counts");
      revalidatePath("/m/stock");
      return json({ ok: true, status: c.status });
    }
    if (action === "reconcile") {
      const c = await reconcileStockCount(id, user.id);
      revalidatePath("/stock-counts");
      revalidatePath("/m/stock");
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
  // Verify the count belongs to the current company + caller's scope before deleting
  let count;
  try {
    count = await assertCountAccess(id, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
  }
  if (!count) {
    return json({ error: "Stock inventory not found" }, { status: 404 });
  }
  try {
    await deleteStockCount(id, user.id);
    revalidatePath("/stock-counts");
    revalidatePath("/m/stock");
    return json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";
    const status = message.includes("not found") ? 404 : 400;
    return json({ error: message }, { status });
  }
});
