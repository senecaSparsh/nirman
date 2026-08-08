import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { getLotHistory, logAction } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

// ───────────────────────────────────────────────────────────
//  GET /api/materials/[id]/lots — list all lots for a material
// ───────────────────────────────────────────────────────────
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { id } = await params;

  // Verify the material exists and is not deleted
  const material = await prisma.material.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, isLotTracked: true },
  });
  if (!material) {
    return json({ error: "Material not found" }, { status: 404 });
  }

  const lots = await getLotHistory(id, company.id);
  return json({ materialId: id, isLotTracked: material.isLotTracked, lots });
});

// ───────────────────────────────────────────────────────────
//  POST /api/materials/[id]/lots — create a new lot manually
// ───────────────────────────────────────────────────────────
const createLotSchema = z.object({
  lotNumber: z.string().min(1, "Lot number is required").max(80),
  batchCode: z.string().max(80).optional().nullable(),
  receivedDate: z.string().datetime().or(z.string().date()),
  expiryDate: z.string().datetime().or(z.string().date()).optional().nullable(),
  initialQty: z.coerce.number().min(0, "Initial quantity must be ≥ 0"),
  unitCost: z.coerce.number().min(0).default(0),
  supplierId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  // Verify the material exists
  const material = await prisma.material.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, isLotTracked: true, name: true, code: true },
  });
  if (!material) {
    return json({ error: "Material not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createLotSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Check for duplicate lot number
  const existing = await prisma.materialLot.findUnique({
    where: {
      materialId_lotNumber_companyId: {
        materialId: id,
        lotNumber: parsed.data.lotNumber,
        companyId: company.id,
      },
    },
  });
  if (existing && !existing.deletedAt) {
    return json({ error: "A lot with this number already exists for this material" }, { status: 409 });
  }

  const receivedDate = new Date(parsed.data.receivedDate);
  const expiryDate = parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null;

  const lot = await prisma.$transaction(async (tx) => {
    // Restore if soft-deleted, otherwise create
    if (existing?.deletedAt) {
      const restored = await tx.materialLot.update({
        where: { id: existing.id },
        data: {
          batchCode: parsed.data.batchCode ?? null,
          receivedDate,
          expiryDate,
          initialQty: parsed.data.initialQty,
          currentQty: parsed.data.initialQty,
          unitCost: parsed.data.unitCost,
          supplierId: parsed.data.supplierId ?? null,
          notes: parsed.data.notes ?? null,
          deletedAt: null,
        },
      });
      await logAction(tx, {
        userId: user.id,
        action: "MATERIAL_LOT_CREATE",
        entityType: "MaterialLot",
        entityId: restored.id,
        after: { materialId: id, lotNumber: restored.lotNumber, initialQty: String(restored.initialQty) },
      });
      return restored;
    }

    const created = await tx.materialLot.create({
      data: {
        materialId: id,
        companyId: company.id,
        lotNumber: parsed.data.lotNumber,
        batchCode: parsed.data.batchCode ?? null,
        receivedDate,
        expiryDate,
        initialQty: parsed.data.initialQty,
        currentQty: parsed.data.initialQty,
        unitCost: parsed.data.unitCost,
        supplierId: parsed.data.supplierId ?? null,
        notes: parsed.data.notes ?? null,
      },
    });
    await logAction(tx, {
      userId: user.id,
      action: "MATERIAL_LOT_CREATE",
      entityType: "MaterialLot",
      entityId: created.id,
      after: { materialId: id, lotNumber: created.lotNumber, initialQty: String(created.initialQty) },
    });
    return created;
  });

  return json(lot, { status: 201 });
});
