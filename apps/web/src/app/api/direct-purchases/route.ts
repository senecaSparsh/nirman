import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDirectPurchase, listDirectPurchases, recordVehicleTrip, ServiceError } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, assertScopeAllows, getCompany, json, requirePermission, scopeWhere, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

const directPurchaseLineSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  qty: z.coerce.number().positive("Qty must be > 0"),
  unitCost: z.coerce.number().nonnegative("Unit cost must be >= 0"),
  gstRate: z.coerce.number().nonnegative().optional().nullable(),
});

const directPurchaseSchema = z.object({
  supplierId: z.string().optional().nullable(),
  supplierName: z.string().min(1, "Supplier name is required"),
  locationId: z.string().min(1, "Receive location is required"),
  billDate: z.coerce.date().optional().nullable(),
  // Vehicle — how the goods were brought from the local market
  vehicleNumber: z.string().max(50).optional(),
  vehicleType: z.string().max(50).optional(),
  vehiclePhotoUrl: z.string().optional(),
  driverName: z.string().max(100).optional(),
  driverPhone: z.string().max(20).optional(),
  notes: z.string().max(2000).optional().nullable(),
  requisitionId: z.string().optional().nullable(),
  lines: z.array(directPurchaseLineSchema).optional().nullable(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const supplierId = searchParams.get("supplierId") ?? undefined;

  const purchases = await listDirectPurchases({
    companyId: company.id,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    supplierId,
  });

  // DirectPurchase scopes through its location — hide out-of-scope rows.
  const scopeFilter = await scopeWhere("DirectPurchase");
  const allowedIds = new Set(
    Object.keys(scopeFilter).length === 0
      ? purchases.map((p) => p.id)
      : (
          await prisma.directPurchase.findMany({
            where: { id: { in: purchases.map((p) => p.id) }, ...scopeFilter },
            select: { id: true },
          })
        ).map((p) => p.id),
  );

  return json(
    purchases.filter((p) => allowedIds.has(p.id)).map((p) => ({
      id: p.id,
      billNumber: p.billNumber,
      supplierId: p.supplierId,
      supplierName: p.supplierName,
      supplierPhone: p.supplier?.phone ?? null,
      locationId: p.locationId,
      locationName: p.location.name,
      billDate: p.billDate.toISOString(),
      subtotal: toNum(p.subtotal),
      gstTotal: toNum(p.gstTotal),
      roundOff: toNum(p.roundOff),
      billAmount: toNum(p.billAmount),
      notes: p.notes,
      lineCount: p.lines.length,
      lines: p.lines.map((l) => ({
        id: l.id,
        materialId: l.materialId,
        materialCode: l.material.code,
        materialName: l.material.name,
        unit: l.material.unit,
        qty: toNum(l.qty),
        unitCost: toNum(l.unitCost),
        gstRate: toNum(l.gstRate),
        lineTotal: toNum(l.lineTotal),
      })),
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const body = await req.json();
  const parsed = directPurchaseSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const company = await getCompany();
  // A scoped user may only book purchases INTO locations inside their scope —
  // the service checks company ownership, not project/department scope.
  const loc = await prisma.stockLocation.findFirst({
    where: { id: parsed.data.locationId, deletedAt: null },
    select: { projectId: true, departmentId: true },
  });
  if (loc) {
    await assertScopeAllows({ projectId: loc.projectId ?? null, departmentId: loc.departmentId ?? null });
  }
  try {
    const result = await createDirectPurchase({
      supplierId: parsed.data.supplierId ?? undefined,
      supplierName: parsed.data.supplierName,
      companyId: company.id,
      locationId: parsed.data.locationId,
      billDate: parsed.data.billDate ?? undefined,
      notes: parsed.data.notes ?? undefined,
      createdById: user.id,
      requisitionId: parsed.data.requisitionId ?? undefined,
      vehicleNumber: parsed.data.vehicleNumber ?? undefined,
      vehicleType: parsed.data.vehicleType ?? undefined,
      vehiclePhotoUrl: parsed.data.vehiclePhotoUrl ?? undefined,
      driverName: parsed.data.driverName ?? undefined,
      driverPhone: parsed.data.driverPhone ?? undefined,
      lines: parsed.data.lines
        ? parsed.data.lines.map((l) => ({
            materialId: l.materialId,
            qty: l.qty,
            unitCost: l.unitCost,
            gstRate: l.gstRate ?? undefined,
          }))
        : undefined,
    });

    // Log the vehicle trip
    if (parsed.data.vehicleNumber) {
      await recordVehicleTrip({
        vehicleNumber: parsed.data.vehicleNumber,
        vehicleType: parsed.data.vehicleType ?? "OTHER",
        photoUrl: parsed.data.vehiclePhotoUrl,
        driverName: parsed.data.driverName,
        driverPhone: parsed.data.driverPhone,
        movementType: "DIRECT_PURCHASE",
        refType: "DirectPurchase",
        refId: result.purchase.id,
        toLocationId: parsed.data.locationId,
        companyId: company.id,
      }).catch(() => { /* best-effort */ });
    }

    revalidatePath("/procurement");
    revalidatePath("/m/procurement");
    return json(
      { ok: true, id: result.purchase.id, billNumber: result.billNumber, billAmount: toNum(result.billAmount) },
      { status: 201 },
    );
  } catch (err: unknown) {
    if (err instanceof ServiceError) {
      return json({ error: err.message }, { status: err.status ?? 400 });
    }
    return json({ error: "Failed to create direct purchase" }, { status: 400 });
  }
});
