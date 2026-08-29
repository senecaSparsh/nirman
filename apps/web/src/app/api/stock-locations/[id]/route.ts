import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { softDelete, logAction } from "@nirman/services";
import { apiHandler, json, stockLocationSchema } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";
import { withSerializableTransaction } from "@nirman/services";

/** GET /api/stock-locations/[id] — fetch a single stock location by ID */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const { id } = await params;
  const location = await prisma.stockLocation.findFirst({
    where: { id, deletedAt: null },
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
  const { id } = await params;
  const body = await req.json();
  const parsed = stockLocationSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  if (parsed.data.type === "COMPANY_WAREHOUSE") parsed.data.projectId = null;
  if (parsed.data.type === "PROJECT_SITE" && !parsed.data.projectId) {
    return json({ error: "A project site must be linked to a project" }, { status: 400 });
  }
  // Validate project exists and isn't deleted
  if (parsed.data.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: parsed.data.projectId, deletedAt: null },
    });
    if (!project) {
      return json({ error: "Project not found or deleted" }, { status: 400 });
    }
  }
  try {
    const updated = await withSerializableTransaction(async (tx) => {
      const loc = await tx.stockLocation.update({
        where: { id },
        data: { ...parsed.data, projectId: parsed.data.projectId ?? null },
      });
      await logAction(tx, {
        userId: user.id,
        action: "STOCK_LOCATION_UPDATE",
        entityType: "StockLocation",
        entityId: id,
        after: parsed.data,
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
  const { id } = await params;
  await softDelete("StockLocation", id);
  revalidatePath("/stock-locations");
  revalidatePath("/m/stock-locations");
  return json({ ok: true });
});
