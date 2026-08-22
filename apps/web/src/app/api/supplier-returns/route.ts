import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import type { SupplierReturnStatus } from "@nirman/db";
import { createSupplierReturn, recordVehicleTrip } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission, supplierReturnSchema, toNum } from "@/lib/server";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const returns = await prisma.supplierReturn.findMany({
    where: {
      companyId: company.id,
      ...(status ? { status: status as SupplierReturnStatus } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { name: true } },
      location: { select: { name: true } },
      lines: {
        include: { material: { select: { code: true, name: true, unit: true } } },
      },
    },
  });

  return json(
    returns.map((r) => ({
      id: r.id,
      returnNumber: r.returnNumber,
      supplierId: r.supplierId,
      supplierName: r.supplier.name,
      purchaseOrderId: r.purchaseOrderId,
      locationId: r.locationId,
      locationName: r.location.name,
      status: r.status,
      returnDate: r.returnDate.toISOString(),
      creditNoteNo: r.creditNoteNo,
      notes: r.notes,
      lines: r.lines.map((l) => ({
        id: l.id,
        materialId: l.materialId,
        materialCode: l.material.code,
        materialName: l.material.name,
        materialUnit: l.material.unit,
        qty: toNum(l.qty),
        reason: l.reason,
      })),
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = supplierReturnSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const ret = await createSupplierReturn({
      supplierId: parsed.data.supplierId,
      companyId: company.id,
      purchaseOrderId: parsed.data.purchaseOrderId ?? undefined,
      locationId: parsed.data.locationId,
      notes: parsed.data.notes ?? undefined,
      userId: user.id,
      vehicleNumber: parsed.data.vehicleNumber ?? undefined,
      vehicleType: parsed.data.vehicleType ?? undefined,
      vehiclePhotoUrl: parsed.data.vehiclePhotoUrl ?? undefined,
      driverName: parsed.data.driverName ?? undefined,
      driverPhone: parsed.data.driverPhone ?? undefined,
      lines: parsed.data.lines.map((l) => ({
        materialId: l.materialId,
        qty: l.qty,
        unitCost: l.unitCost,
        reason: l.reason ?? undefined,
      })),
    });

    // Log the vehicle trip
    if (parsed.data.vehicleNumber) {
      await recordVehicleTrip({
        vehicleNumber: parsed.data.vehicleNumber,
        vehicleType: parsed.data.vehicleType ?? "OTHER",
        photoUrl: parsed.data.vehiclePhotoUrl,
        driverName: parsed.data.driverName,
        driverPhone: parsed.data.driverPhone,
        movementType: "SUPPLIER_RETURN",
        refType: "SupplierReturn",
        refId: ret.id,
        fromLocationId: parsed.data.locationId,
        companyId: company.id,
      }).catch(() => { /* best-effort */ });
    }

    return json({ ok: true, id: ret.id, returnNumber: ret.returnNumber }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create supplier return") }, { status: 400 });
  }
});
