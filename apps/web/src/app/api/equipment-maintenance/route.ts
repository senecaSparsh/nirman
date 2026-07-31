import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { recordMaintenance } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum, equipmentMaintenanceSchema } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const equipmentId = searchParams.get("equipmentId");

  const records = await prisma.equipmentMaintenance.findMany({
    where: { equipment: { companyId: company.id }, ...(equipmentId ? { equipmentId } : {}) },
    orderBy: { startDate: "desc" },
    take: 50,
    include: { equipment: { select: { name: true, assetTag: true } } },
  });

  return json(
    records.map((m) => ({
      id: m.id,
      equipmentId: m.equipmentId,
      equipmentName: m.equipment.name,
      assetTag: m.equipment.assetTag,
      type: m.type,
      startDate: m.startDate.toISOString(),
      endDate: m.endDate?.toISOString() ?? null,
      cost: toNum(m.cost),
      vendor: m.vendor,
      notes: m.notes,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_MANAGE);
  const body = await req.json();
  const parsed = equipmentMaintenanceSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const m = await recordMaintenance({
      equipmentId: parsed.data.equipmentId,
      type: parsed.data.type,
      cost: parsed.data.cost,
      vendor: parsed.data.vendor ?? undefined,
      notes: parsed.data.notes ?? undefined,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
    });
    return json({ ok: true, id: m.id }, { status: 201 });
  } catch (err: any) {
    return json({ error: err?.message ?? "Failed to record maintenance" }, { status: 400 });
  }
});
