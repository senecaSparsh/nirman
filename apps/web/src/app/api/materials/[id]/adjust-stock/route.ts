import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nirman/db";
import { recordStockAdjustment, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/materials/[id]/adjust-stock
 *
 * Manually add (IN) or remove (OUT) stock for a material at a location.
 * Used for opening stock, corrections, and write-offs — without going through
 * a PO / direct purchase / transfer / stock count.
 *
 * Permission: INVENTORY_MANAGE (managing stock levels).
 */
const adjustStockSchema = z.object({
  locationId: z.string().min(1, "Stock location is required"),
  direction: z.enum(["IN", "OUT"]),
  qty: z.coerce.number().positive("Quantity must be greater than 0"),
  unitCost: z.union([z.string(), z.number()]).optional().nullable().transform((v) => v == null ? undefined : String(v)),
  reason: z.string().min(1, "A reason is required").max(500, "Reason is too long"),
});

export const POST = apiHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requirePermission(PERM.INVENTORY_MANAGE);
    const company = await getCompany();
    const { id } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = adjustStockSchema.safeParse(body);
    if (!parsed.success) {
      return json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    // Ensure the material belongs to the visible catalogue and the location
    // belongs to the active company (prevent cross-company adjustments).
    // The service re-validates, but we scope here for a clear 404.
    const [material, location] = await Promise.all([
      prisma.material.findFirst({
        where: { id, companyId: company.id, deletedAt: null },
        select: { id: true, code: true, unit: true },
      }),
      prisma.stockLocation.findFirst({
        where: { id: parsed.data.locationId, companyId: company.id, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);
    if (!material) return json({ error: "Material not found" }, { status: 404 });
    if (!location) {
      return json({ error: "Stock location not found in this company" }, { status: 404 });
    }

    try {
      const result = await recordStockAdjustment({
        materialId: id,
        locationId: parsed.data.locationId,
        direction: parsed.data.direction,
        qty: parsed.data.qty,
        unitCost: parsed.data.unitCost ?? null,
        reason: parsed.data.reason,
        userId: user.id,
      });

      revalidatePath("/materials");
      revalidatePath(`/materials/${id}`);
      revalidatePath("/stock");
      revalidatePath(`/m/materials/${id}`);
      revalidatePath("/m/stock");

      return json(
        {
          ok: true,
          movementId: result.movementId,
          movementType: result.movementType,
          qty: result.qty.toString(),
          unitCost: result.unitCost.toString(),
          newQty: result.newQty.toString(),
          newMac: result.newMac.toString(),
        },
        { status: 201 },
      );
    } catch (err: unknown) {
      if (err instanceof ServiceError) {
        return json({ error: err.message }, { status: err.status ?? 400 });
      }
      return json({ error: "Failed to adjust stock" }, { status: 400 });
    }
  },
);
