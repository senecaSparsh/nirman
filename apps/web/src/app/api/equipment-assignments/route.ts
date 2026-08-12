import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import type { EquipmentAssignmentStatus } from "@nirman/db";
import { assignEquipment } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, equipmentAssignSchema } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "ACTIVE";

  const assignments = await prisma.equipmentAssignment.findMany({
    where: { equipment: { companyId: company.id }, ...(status ? { status: status as EquipmentAssignmentStatus } : {}) },
    orderBy: { assignedAt: "desc" },
    include: {
      equipment: { select: { id: true, name: true, assetTag: true } },
      location: { select: { name: true } },
      project: { select: { name: true } },
    },
  });

  return json(
    assignments.map((a) => ({
      id: a.id,
      equipmentId: a.equipmentId,
      equipmentName: a.equipment.name,
      assetTag: a.equipment.assetTag,
      locationId: a.locationId,
      locationName: a.location.name,
      projectId: a.projectId,
      projectName: a.project?.name ?? null,
      assignedAt: a.assignedAt.toISOString(),
      returnedAt: a.returnedAt?.toISOString() ?? null,
      status: a.status,
      notes: a.notes,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = equipmentAssignSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Validate equipment belongs to the user's company
  const equipment = await prisma.equipment.findFirst({
    where: { id: parsed.data.equipmentId, companyId: company.id, deletedAt: null },
  });
  if (!equipment) return json({ error: "Equipment not found in your company" }, { status: 404 });
  try {
    const assignment = await assignEquipment({
      equipmentId: parsed.data.equipmentId,
      locationId: parsed.data.locationId,
      projectId: parsed.data.projectId ?? undefined,
      notes: parsed.data.notes ?? undefined,
      userId: user.id,
    });
    return json({ ok: true, id: assignment.id }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to assign equipment") }, { status: 400 });
  }
});
