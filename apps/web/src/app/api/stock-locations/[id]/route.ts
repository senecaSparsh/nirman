import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { softDelete, logAction } from "@nirman/services";
import { apiHandler, assertScopeAllows, getCompany, json, stockLocationSchema, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";
import { withSerializableTransaction } from "@nirman/services";

/** GET /api/stock-locations/[id] — fetch a single stock location by ID */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const location = await prisma.stockLocation.findFirst({
    where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("StockLocation") },
    include: {
      project: { select: { id: true, name: true } },
      department: { select: { id: true, name: true, code: true } },
      _count: { select: { stockItems: true } },
    },
  });
  if (!location) return json({ error: "Stock location not found" }, { status: 404 });
  return json(location);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  // Verify the location belongs to the active company before updating
  const existing = await prisma.stockLocation.findFirst({
    where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("StockLocation") },
    select: { id: true },
  });
  if (!existing) return json({ error: "Stock location not found" }, { status: 404 });
  const body = await req.json();
  const parsed = stockLocationSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Only write keys the caller actually sent — previously the update always
  // wrote `projectId: parsed.data.projectId ?? null`, so ANY partial PATCH
  // (e.g. a name/address edit) silently detached a PROJECT_SITE from its
  // project, breaking scoping for that location.
  const data: Record<string, unknown> = {};
  for (const k of Object.keys(parsed.data) as (keyof typeof parsed.data)[]) {
    if (k in body) data[k] = parsed.data[k];
  }
  if (parsed.data.type === "PROJECT_SITE" && !parsed.data.projectId) {
    return json({ error: "A project site must be linked to a project" }, { status: 400 });
  }
  // Non-site types carry no project — clear it when the type is being changed.
  if (parsed.data.type && parsed.data.type !== "PROJECT_SITE") {
    data.projectId = null;
  }
  // Validate project exists, isn't deleted, and belongs to the active company
  if ("projectId" in body && parsed.data.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: parsed.data.projectId, companyId: company.id, deletedAt: null },
    });
    if (!project) {
      return json({ error: "Project not found or deleted" }, { status: 400 });
    }
    // A scoped user may only re-point a site to a project inside their scope.
    try {
      await assertScopeAllows({ projectId: parsed.data.projectId, departmentId: null });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
    }
  }
  if (Object.keys(data).length === 0) {
    return json({ error: "No updatable fields in request — check field names" }, { status: 400 });
  }
  try {
    const updated = await withSerializableTransaction(async (tx) => {
      const loc = await tx.stockLocation.update({
        where: { id },
        data,
      });
      await logAction(tx, {
        userId: user.id,
        companyId: company.id,
        action: "STOCK_LOCATION_UPDATE",
        entityType: "StockLocation",
        entityId: id,
        after: data,
      });
      return loc;
    });
    revalidatePath("/stock-locations");
    revalidatePath("/m/stock-locations");
    return json(updated);
  } catch {
    return json({ error: "Stock location not found" }, { status: 404 });
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  // Verify the location belongs to the active company before soft-deleting
  const existing = await prisma.stockLocation.findFirst({
    where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("StockLocation") },
    select: { id: true },
  });
  if (!existing) return json({ error: "Stock location not found" }, { status: 404 });
  await softDelete("StockLocation", id);
  revalidatePath("/stock-locations");
  revalidatePath("/m/stock-locations");
  return json({ ok: true });
});
