import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logEquipmentUsage, listEquipmentUsage } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

const usageSchema = z.object({
  equipmentId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  logDate: z.string().optional(),
  meterKind: z.enum(["HOURS", "KM"]).optional(),
  openingMeter: z.union([z.number(), z.string()]).optional().nullable(),
  closingMeter: z.union([z.number(), z.string()]).optional().nullable(),
  fuelLitres: z.union([z.number(), z.string()]).optional().nullable(),
  fuelCost: z.union([z.number(), z.string()]).optional().nullable(),
  operatorName: z.string().optional(),
  notes: z.string().optional(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const equipmentId = searchParams.get("equipmentId") ?? undefined;
  const logs = await listEquipmentUsage(company.id, equipmentId);
  return json(logs.map((l) => ({
    id: l.id,
    equipmentId: l.equipmentId,
    equipmentName: l.equipment.name,
    assetTag: l.equipment.assetTag,
    projectId: l.projectId,
    projectName: l.project?.name ?? null,
    logDate: l.logDate.toISOString(),
    meterKind: l.meterKind,
    openingMeter: l.openingMeter?.toString() ?? null,
    closingMeter: l.closingMeter?.toString() ?? null,
    fuelLitres: l.fuelLitres?.toString() ?? null,
    fuelCost: l.fuelCost?.toString() ?? null,
    operatorName: l.operatorName,
    notes: l.notes,
    loggedBy: l.loggedBy?.name ?? null,
    createdAt: l.createdAt.toISOString(),
  })));
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = usageSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const log = await logEquipmentUsage({ ...parsed.data, companyId: company.id, userId: user.id });
  revalidatePath("/equipment");
  revalidatePath("/m/equipment");
  revalidatePath(`/m/equipment/${log.equipmentId}`);
  return json(log, { status: 201 });
});
