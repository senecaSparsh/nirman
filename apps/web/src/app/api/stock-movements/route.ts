import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE_RECEIPT: "Receipt",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
  ISSUE_TO_PROJECT: "Issue to Project",
  ADJUSTMENT_IN: "Adjustment (+)",
  ADJUSTMENT_OUT: "Adjustment (−)",
  RETURN: "Return",
  SALE: "Sale",
};

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const materialId = searchParams.get("materialId");
  const locationId = searchParams.get("locationId");
  const type = searchParams.get("type");
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);

  // Get all location IDs for this company — used to filter movements at the DB level
  const companyLocationIds = (
    await prisma.stockLocation.findMany({
      where: { companyId: company.id },
      select: { id: true },
    })
  ).map((l) => l.id);

  // Build where: filter by company via location membership.
  // A movement belongs to the company if either its from/to location is in the company.
  const where: Record<string, unknown> = {
    OR: [
      { fromLocationId: { in: companyLocationIds } },
      { toLocationId: { in: companyLocationIds } },
    ],
  };
  if (materialId) where.materialId = materialId;
  if (type) where.movementType = type;
  if (locationId) {
    // Override the OR with a specific location filter
    delete where.OR;
    where.OR = [
      { fromLocationId: locationId, toLocationId: { in: companyLocationIds } },
      { toLocationId: locationId, fromLocationId: { in: companyLocationIds } },
    ];
  }

  const movements = await prisma.stockMovement.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: limit,
    include: {
      material: { select: { id: true, code: true, name: true, unit: true } },
      fromLocation: { select: { id: true, name: true } },
      toLocation: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
  });

  const rows = movements.map((m) => ({
    id: m.id,
    materialId: m.materialId,
    materialCode: m.material.code,
    materialName: m.material.name,
    unit: m.material.unit,
    movementType: m.movementType,
    movementLabel: MOVEMENT_LABELS[m.movementType] ?? m.movementType,
    fromLocationId: m.fromLocationId,
    fromLocationName: m.fromLocation?.name ?? null,
    toLocationId: m.toLocationId,
    toLocationName: m.toLocation?.name ?? null,
    qty: toNum(m.qty),
    unitCost: toNum(m.unitCost),
    balanceAfter: toNum(m.balanceAfter),
    balanceValueAfter: toNum(m.balanceValueAfter),
    reason: m.reason,
    refType: m.refType,
    refId: m.refId,
    userName: m.user?.name ?? null,
    timestamp: m.timestamp.toISOString(),
  }));

  return json(rows);
});
