import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import type { SaleStatus } from "@nirman/db";
import { createMaterialSale, createMaterialSaleRequest, executeMaterialSale, recordVehicleTrip } from "@nirman/services";
import { apiHandler, getCompany, json, materialSaleSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const sales = await prisma.materialSale.findMany({
    where: {
      companyId: company.id,
      ...(status ? { status: status as SaleStatus } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      project: { select: { id: true, name: true } },
      lines: {
        include: {
          material: { select: { id: true, name: true, unit: true } },
          location: { select: { id: true, name: true } },
        },
      },
    },
  });

  return json(
    sales.map((s) => ({
      id: s.id,
      saleNumber: s.saleNumber,
      customerId: s.customerId,
      customerName: s.customer?.name ?? null,
      customerPhone: s.customer?.phone ?? null,
      projectId: s.projectId,
      projectName: s.project?.name ?? null,
      saleDate: s.saleDate.toISOString(),
      subtotal: toNum(s.subtotal),
      gstTotal: toNum(s.gstTotal),
      totalAmount: toNum(s.totalAmount),
      totalCost: toNum(s.totalCost),
      grossProfit: toNum(s.grossProfit),
      status: s.status,
      paymentStatus: s.paymentStatus,
      paymentMode: s.paymentMode,
      notes: s.notes,
      lineCount: s.lines.length,
      lines: s.lines.map((l) => ({
        id: l.id,
        materialId: l.materialId,
        materialName: l.material?.name ?? null,
        materialUnit: l.material?.unit ?? null,
        locationId: l.locationId,
        locationName: l.location?.name ?? null,
        qty: toNum(l.qty),
        unitPrice: toNum(l.unitPrice),
        unitCost: toNum(l.unitCost),
        gstRate: toNum(l.gstRate),
        gstAmount: toNum(l.gstAmount),
        lineTotal: toNum(l.lineTotal),
      })),
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = materialSaleSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const requireGatePass = body?.requireGatePass === true;

  try {
    const saleInput = {
      companyId: company.id,
      customerId: parsed.data.customerId,
      projectId: parsed.data.projectId ?? undefined,
      lines: parsed.data.lines.map((l) => ({
        materialId: l.materialId,
        locationId: l.locationId,
        qty: l.qty,
        unitPrice: l.unitPrice,
        gstRate: l.gstRate ?? 0,
      })),
      paymentMode: parsed.data.paymentMode ?? undefined,
      vehicleNumber: parsed.data.vehicleNumber ?? undefined,
      vehicleType: parsed.data.vehicleType ?? undefined,
      vehiclePhotoUrl: parsed.data.vehiclePhotoUrl ?? undefined,
      driverName: parsed.data.driverName ?? undefined,
      driverPhone: parsed.data.driverPhone ?? undefined,
      notes: parsed.data.notes ?? undefined,
      userId: user.id,
    };

    if (requireGatePass) {
      // Gate-pass-gated flow: create PENDING sale + gate pass, no stock movements
      const sale = await createMaterialSaleRequest(saleInput);
      revalidatePath("/gate-passes");
      revalidatePath("/material-sales");
      return json(
        { ok: true, id: sale.id, saleNumber: sale.saleNumber, pending: true, message: "Gate pass created — awaiting approval before items can leave." },
        { status: 201 },
      );
    }

    // Standard flow: execute immediately
    const sale = await createMaterialSale(saleInput);

    // Log the vehicle trip
    if (parsed.data.vehicleNumber) {
      await recordVehicleTrip({
        vehicleNumber: parsed.data.vehicleNumber,
        vehicleType: parsed.data.vehicleType ?? "OTHER",
        photoUrl: parsed.data.vehiclePhotoUrl,
        driverName: parsed.data.driverName,
        driverPhone: parsed.data.driverPhone,
        movementType: "MATERIAL_SALE",
        refType: "MaterialSale",
        refId: sale.id,
        companyId: company.id,
      }).catch(() => { /* best-effort */ });
    }

    return json({ ok: true, id: sale.id, saleNumber: sale.saleNumber }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create material sale") }, { status: 400 });
  }
});

/**
 * PATCH /api/material-sales — execute a PENDING material sale after gate pass approval.
 * Body: { action: "execute", saleId: "xxx" }
 */
export const PATCH = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const company = await getCompany();
  const body = await req.json();

  if (body?.action === "execute" && body?.saleId) {
    try {
      const sale = await prisma.materialSale.findFirst({
        where: { id: body.saleId, companyId: company.id },
        select: { id: true, status: true },
      });
      if (!sale) return json({ error: "Material sale not found" }, { status: 404 });
      if (sale.status !== "PENDING") return json({ error: `Cannot execute sale in status ${sale.status}` }, { status: 400 });

      await executeMaterialSale(body.saleId, user.id);

      revalidatePath("/material-sales");
      revalidatePath("/gate-passes");
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Failed to execute sale") }, { status: 400 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
});
