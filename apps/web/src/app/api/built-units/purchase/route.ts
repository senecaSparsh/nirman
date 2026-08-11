import { NextRequest } from "next/server";
import { z } from "zod";
import { purchaseBuiltUnit } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

const purchaseUnitSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  unitType: z.enum(["BHK_1", "BHK_2", "BHK_3", "BHK_4", "SHOP", "OFFICE", "WAREHOUSE_UNIT", "VILLA", "OTHER"]),
  unitNumber: z.string().min(1, "Unit number is required"),
  floor: z.coerce.number().int().optional().nullable(),
  wing: z.string().optional().nullable(),
  area: z.coerce.number().positive("Area must be > 0"),
  areaUnit: z.enum(["SQFT", "SQM", "SQYD", "ACRE", "BIGHA", "KATHA", "HECTARE"]).default("SQFT"),
  acquisitionCost: z.coerce.number().positive("Acquisition cost must be > 0"),
  purchaseDate: z.string().optional(), // ISO date string
  askingPrice: z.coerce.number().positive().optional().nullable(),
  landParcelId: z.string().optional().nullable(),
  // RERA fields
  carpetArea: z.coerce.number().nonnegative().optional().nullable(),
  superBuiltUpArea: z.coerce.number().nonnegative().optional().nullable(),
  balconyArea: z.coerce.number().nonnegative().optional().nullable(),
  clearHeight: z.coerce.number().nonnegative().optional().nullable(),
  hasLoadingDock: z.coerce.boolean().optional(),
  notes: z.string().optional(),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = purchaseUnitSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;

  try {
    const unit = await purchaseBuiltUnit({
      companyId: company.id,
      projectId: d.projectId,
      userId: user.id,
      unitType: d.unitType,
      unitNumber: d.unitNumber,
      floor: d.floor ?? undefined,
      wing: d.wing ?? undefined,
      area: d.area,
      areaUnit: d.areaUnit,
      acquisitionCost: d.acquisitionCost,
      purchaseDate: d.purchaseDate ? new Date(d.purchaseDate) : undefined,
      askingPrice: d.askingPrice ?? undefined,
      landParcelId: d.landParcelId ?? undefined,
      carpetArea: d.carpetArea ?? null,
      superBuiltUpArea: d.superBuiltUpArea ?? null,
      balconyArea: d.balconyArea ?? null,
      clearHeight: d.clearHeight ?? null,
      hasLoadingDock: d.hasLoadingDock ?? false,
      notes: d.notes,
    });

    return json({
      id: unit.id,
      projectId: unit.projectId,
      unitType: unit.unitType,
      unitNumber: unit.unitNumber,
      originType: unit.originType,
      status: unit.status,
      acquisitionCost: toNum(unit.acquisitionCost),
      purchaseDate: unit.purchaseDate,
      landParcelId: unit.landParcelId,
      area: toNum(unit.area),
      askingPrice: unit.askingPrice ? toNum(unit.askingPrice) : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to purchase unit";
    const status = message.includes("not found") ? 404 : 400;
    return json({ error: message }, { status });
  }
});
