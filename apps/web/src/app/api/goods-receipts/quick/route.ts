import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nirman/db";
import { recordSitePurchase, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, getUserScope, json, requireAnyPermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/goods-receipts/quick
 * Site purchase — a storekeeper records goods that physically arrived at the
 * gate without a prior PO (urgent/cash buy). The goods are real, so the books
 * must count them; the control is post-hoc review (the PO is flagged) rather
 * than a hard block that leaves stock undercounted.
 */
const lineSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  qty: z.coerce.number().positive("Quantity must be positive"),
  unitCost: z.coerce.number().min(0),
  gstRate: z.coerce.number().min(0).max(100).optional(),
});
const quickSchema = z.object({
  supplierId: z.string().optional().nullable(),
  supplierName: z.string().max(120).optional().nullable(),
  supplierPhone: z.string().max(20).optional().nullable(),
  locationId: z.string().min(1, "Location is required"),
  projectId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  lines: z.array(lineSchema).min(1, "Record at least one material"),
});

export const POST = apiHandler(async (req: NextRequest) => {
  // Store keepers (INVENTORY_MANAGE) and procurement managers both can record a
  // site purchase — the person physically at the gate.
  const user = await requireAnyPermission(PERM.INVENTORY_MANAGE, PERM.PROCUREMENT_MANAGE);
  const company = await getCompany();
  const body = await req.json().catch(() => ({}));
  const parsed = quickSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const { locationId, projectId, lines } = parsed.data;
  // The receiving location must belong to the company + the user's scope.
  const location = await prisma.stockLocation.findFirst({
    where: { id: locationId, companyId: company.id, deletedAt: null },
    select: { id: true, projectId: true },
  });
  if (!location) return json({ error: "Location not found in this company" }, { status: 404 });
  const scope = await getUserScope();
  if (scope.scopeType === "PROJECT") {
    const effective = location.projectId;
    if (effective && !scope.projectIds.includes(effective)) {
      return json({ error: "This location isn't in your assigned projects" }, { status: 403 });
    }
  }
  // Materials must belong to the company.
  const matIds = lines.map((l) => l.materialId);
  const mats = await prisma.material.findMany({
    where: { id: { in: matIds }, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (mats.length !== matIds.length) return json({ error: "One or more materials aren't in this company" }, { status: 400 });

  try {
    const result = await recordSitePurchase({
      supplierId: parsed.data.supplierId ?? undefined,
      supplierName: parsed.data.supplierName ?? undefined,
      supplierPhone: parsed.data.supplierPhone ?? undefined,
      companyId: company.id,
      projectId: projectId ?? location.projectId ?? undefined,
      locationId,
      receivedById: user.id,
      notes: parsed.data.notes ?? undefined,
      lines: lines.map((l) => ({ materialId: l.materialId, qty: l.qty, unitCost: l.unitCost, gstRate: l.gstRate })),
    });
    revalidatePath("/stock");
    revalidatePath("/m/stock");
    revalidatePath("/m/site/stock");
    revalidatePath("/purchase-orders");
    return json({
      id: result.receipt.goodsReceipt.id,
      poId: result.po.id,
      poNumber: result.po.poNumber,
      flagged: true,
      message: "Site purchase recorded — office will review the flagged PO.",
    }, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throw err;
  }
});
