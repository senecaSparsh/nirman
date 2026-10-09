import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nirman/db";
import { createDirectPurchase, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, getUserScope, json, requireAnyPermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/goods-receipts/quick
 * Site purchase — a storekeeper records goods that physically arrived at the
 * gate without a prior PO (urgent/cash buy from a local vendor). Books a
 * DirectPurchase — the existing no-PO purchase primitive — so stock posts
 * correctly + the office sees the spend in the cash-purchases ledger. The
 * goods physically arrived, so refusing to log them would undercount stock;
 * the office reviews the bill rather than approving a pending order.
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
  locationId: z.string().min(1, "Location is required"),
  projectId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  lines: z.array(lineSchema).min(1, "Record at least one material"),
});

export const POST = apiHandler(async (req: NextRequest) => {
  // The person physically at the gate — storekeepers (INVENTORY_MANAGE) and
  // procurement managers (PROCUREMENT_MANAGE) both can record a site purchase.
  const user = await requireAnyPermission(PERM.INVENTORY_MANAGE, PERM.PROCUREMENT_MANAGE);
  const company = await getCompany();
  const body = await req.json().catch(() => ({}));
  const parsed = quickSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const { locationId, lines } = parsed.data;
  // The receiving location must belong to the company + the user's scope.
  const location = await prisma.stockLocation.findFirst({
    where: { id: locationId, companyId: company.id, deletedAt: null },
    select: { id: true, projectId: true },
  });
  if (!location) return json({ error: "Location not found in this company" }, { status: 404 });
  const scope = await getUserScope();
  if (scope.scopeType === "PROJECT" && location.projectId && !scope.projectIds.includes(location.projectId)) {
    return json({ error: "This location isn't in your assigned projects" }, { status: 403 });
  }
  const matIds = lines.map((l) => l.materialId);
  const mats = await prisma.material.findMany({
    where: { id: { in: matIds }, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (mats.length !== matIds.length) return json({ error: "One or more materials aren't in this company" }, { status: 400 });

  // A supplier pick or a free-text vendor name is required — the office needs
  // to know who was paid. DirectPurchase accepts supplierName for unregistered
  // local vendors.
  const supplierName = parsed.data.supplierName?.trim()
    ?? (parsed.data.supplierId
      ? (await prisma.supplier.findUnique({ where: { id: parsed.data.supplierId }, select: { name: true } }))?.name
      : undefined);
  if (!supplierName) return json({ error: "Pick a supplier or enter the vendor's name" }, { status: 400 });

  try {
    const result = await createDirectPurchase({
      supplierId: parsed.data.supplierId ?? undefined,
      supplierName,
      companyId: company.id,
      locationId,
      notes: parsed.data.notes ?? undefined,
      createdById: user.id,
      lines: lines.map((l) => ({ materialId: l.materialId, qty: l.qty, unitCost: l.unitCost, gstRate: l.gstRate })),
    });
    revalidatePath("/stock");
    revalidatePath("/m/stock");
    revalidatePath("/m/site/stock");
    revalidatePath("/procurement");
    return json({ id: result.purchase.id, billNumber: result.billNumber, message: "Site purchase recorded — the office sees it under Cash purchases." }, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throw err;
  }
});
