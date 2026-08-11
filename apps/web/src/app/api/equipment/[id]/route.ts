import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { completeMaintenance, retireEquipment, unretireEquipment, softDelete, logAction } from "@nirman/services";
import { z } from "zod";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

const equipmentUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  model: z.string().max(200).nullable().optional(),
  serialNumber: z.string().max(200).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const eq = await prisma.equipment.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      assignments: {
        orderBy: { assignedAt: "desc" },
        take: 10,
        include: {
          location: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      },
      maintenance: {
        orderBy: { startDate: "desc" },
        take: 10,
      },
    },
  });
  if (!eq) return json({ error: "Equipment not found" }, { status: 404 });

  return json({
    id: eq.id,
    assetTag: eq.assetTag,
    name: eq.name,
    model: eq.model,
    serialNumber: eq.serialNumber,
    category: eq.category,
    status: eq.status,
    acquisitionCost: toNum(eq.acquisitionCost),
    currentValue: toNum(eq.currentValue),
    purchaseDate: eq.purchaseDate?.toISOString() ?? null,
    notes: eq.notes,
    assignments: eq.assignments.map((a) => ({
      id: a.id,
      locationId: a.locationId,
      locationName: a.location.name,
      projectId: a.projectId,
      projectName: a.project?.name ?? null,
      assignedAt: a.assignedAt.toISOString(),
      returnedAt: a.returnedAt?.toISOString() ?? null,
      status: a.status,
      notes: a.notes,
    })),
    maintenance: eq.maintenance.map((m) => ({
      id: m.id,
      type: m.type,
      startDate: m.startDate.toISOString(),
      endDate: m.endDate?.toISOString() ?? null,
      cost: toNum(m.cost),
      vendor: m.vendor,
      notes: m.notes,
    })),
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string;

  if (action === "retire") {
    try {
      await retireEquipment(id, user.id);
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Retire failed") }, { status: 400 });
    }
  }

  if (action === "unretire") {
    try {
      await unretireEquipment(id, user.id);
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Un-retire failed") }, { status: 400 });
    }
  }

  if (action === "complete-maintenance") {
    try {
      await completeMaintenance(id, user.id);
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Complete maintenance failed") }, { status: 400 });
    }
  }

  if (action === "update") {
    const parsed = equipmentUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    // Verify company ownership before updating
    const company = await getCompany();
    const existing = await prisma.equipment.findFirst({
      where: { id, companyId: company.id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return json({ error: "Equipment not found" }, { status: 404 });
    const updated = await prisma.$transaction(async (tx) => {
      const eq = await tx.equipment.update({
        where: { id },
        data: {
          ...(parsed.data.name ? { name: parsed.data.name } : {}),
          ...(parsed.data.model !== undefined ? { model: parsed.data.model ?? null } : {}),
          ...(parsed.data.serialNumber !== undefined ? { serialNumber: parsed.data.serialNumber ?? null } : {}),
          ...(parsed.data.category !== undefined ? { category: parsed.data.category ?? null } : {}),
          ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes ?? null } : {}),
        },
      });
      await logAction(tx, {
        userId: user.id,
        action: "EQUIPMENT_UPDATE",
        entityType: "Equipment",
        entityId: id,
        after: { name: eq.name, model: eq.model, category: eq.category },
      });
      return eq;
    });
    return json({ ok: true, id: updated.id });
  }

  return json({ error: "Invalid action. Use retire, unretire, complete-maintenance, or update." }, { status: 400 });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  // Verify company ownership before soft-deleting
  const existing = await prisma.equipment.findFirst({
    where: { id, companyId: company.id },
    select: { id: true },
  });
  if (!existing) return json({ error: "Equipment not found" }, { status: 404 });
  try {
    await softDelete("Equipment", id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete equipment") }, { status: 400 });
  }
});
