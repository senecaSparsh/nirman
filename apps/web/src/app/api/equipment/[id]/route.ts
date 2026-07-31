import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { completeMaintenance, retireEquipment, softDelete } from "@nirman/services";
import { apiHandler, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const { id } = await params;
  const eq = await prisma.equipment.findFirst({
    where: { id, deletedAt: null },
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
  await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string;

  if (action === "retire") {
    try {
      await retireEquipment(id);
      return json({ ok: true });
    } catch (err: any) {
      return json({ error: err?.message ?? "Retire failed" }, { status: 400 });
    }
  }

  if (action === "complete-maintenance") {
    try {
      await completeMaintenance(id);
      return json({ ok: true });
    } catch (err: any) {
      return json({ error: err?.message ?? "Complete maintenance failed" }, { status: 400 });
    }
  }

  if (action === "update") {
    const updated = await prisma.equipment.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.model !== undefined ? { model: body.model ?? null } : {}),
        ...(body.serialNumber !== undefined ? { serialNumber: body.serialNumber ?? null } : {}),
        ...(body.category !== undefined ? { category: body.category ?? null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
      },
    });
    return json({ ok: true, id: updated.id });
  }

  return json({ error: "Invalid action. Use retire, complete-maintenance, or update." }, { status: 400 });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  try {
    await softDelete("Equipment", id);
    return json({ ok: true });
  } catch (err: any) {
    return json({ error: err?.message ?? "Failed to delete equipment" }, { status: 400 });
  }
});
