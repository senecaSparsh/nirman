import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { createStockCount } from "@nirman/services";
import { apiHandler, assertScopeAllows, getAssignedProjectIds, getUserScope, json, stockCountSchema, toNum, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

/**
 * Scope filter for stock counts — StockCount has no projectId/departmentId of
 * its own (and isn't in SCOPE_FIELDS), so it scopes through its location:
 * project scope sees counts at their projects' locations; department scope
 * sees counts at their departments' locations; company scope sees all.
 */
async function stockCountScopeWhere(): Promise<Record<string, unknown>> {
  const scope = await getUserScope();
  if (scope.scopeType === "COMPANY") return {};
  if (scope.scopeType === "DEPARTMENT") {
    if (scope.departmentIds.length === 0) return { id: { in: [] } };
    return { location: { departmentId: { in: scope.departmentIds } } };
  }
  const effective = await getAssignedProjectIds();
  if (!effective || effective.length === 0) return { id: { in: [] } };
  return { location: { projectId: { in: effective } } };
}

export const GET = apiHandler(async () => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const counts = await prisma.stockCount.findMany({
    take: 500,
    where: {
      location: { companyId: company.id, deletedAt: null },
      AND: [await stockCountScopeWhere()],
    },
    orderBy: { createdAt: "desc" },
    include: {
      location: { select: { id: true, name: true, type: true } },
      lines: { include: { material: { select: { code: true, name: true, unit: true } } } },
      createdBy: { select: { name: true } },
      confirmedBy: { select: { name: true } },
      reconciledBy: { select: { name: true } },
    },
  });
  return json(
    counts.map((c) => ({
      id: c.id,
      locationId: c.locationId,
      locationName: c.location.name,
      locationType: c.location.type,
      status: c.status,
      countDate: c.countDate.toISOString(),
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
      createdByName: c.createdBy?.name ?? null,
      confirmedByName: c.confirmedBy?.name ?? null,
      confirmedAt: c.confirmedAt?.toISOString() ?? null,
      reconciledByName: c.reconciledBy?.name ?? null,
      reconciledAt: c.reconciledAt?.toISOString() ?? null,
      lineCount: c.lines.length,
      totalVariance: c.lines.reduce(
        (s, l) => s + toNum(l.variance),
        0,
      ),
      lines: c.lines.map((l) => ({
        id: l.id,
        materialId: l.materialId,
        materialCode: l.material.code,
        materialName: l.material.name,
        unit: l.material.unit,
        countedQty: toNum(l.countedQty),
        systemQty: toNum(l.systemQty),
        variance: toNum(l.variance),
      })),
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = stockCountSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Verify the location belongs to the current company — the service only
  // checks existence, so this is the tenancy guard.
  const location = await prisma.stockLocation.findFirst({
    where: { id: parsed.data.locationId, companyId: company.id, deletedAt: null },
    select: { id: true, projectId: true, departmentId: true },
  });
  if (!location) {
    return json({ error: "Location not found" }, { status: 404 });
  }
  // A scoped user may only count stock at locations inside their scope —
  // counting elsewhere is how stock write-offs get hidden.
  try {
    await assertScopeAllows({ projectId: location.projectId, departmentId: location.departmentId });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
  }
  try {
    const count = await createStockCount({
      locationId: parsed.data.locationId,
      notes: parsed.data.notes ?? undefined,
      userId: user.id,
      lines: parsed.data.lines,
    });
    revalidatePath("/stock-counts");
    revalidatePath("/m/stock");
    return json({ ok: true, id: count.id }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ServiceError") {
      return json({ error: err.message }, { status: 400 });
    }
    return json({ error: "Failed to create stock inventory" }, { status: 500 });
  }
});
