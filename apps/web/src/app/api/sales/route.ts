import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import type { SaleStatus } from "@nirman/db";
import { sellAsset } from "@nirman/services";
import { apiHandler, getCompany, json, toNum, sellAssetSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const sales = await prisma.assetSale.findMany({
    where: {
      companyId: company.id,
      ...(status ? { status: status as SaleStatus } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      project: { select: { id: true, name: true } },
      payments: { orderBy: { paymentDate: "asc" } },
    },
  });

  // Fetch land parcels and built units separately (no direct relation on AssetSale)
  const landParcelIds = sales.filter((s) => s.landParcelId).map((s) => s.landParcelId!);
  const builtUnitIds = sales.filter((s) => s.builtUnitId).map((s) => s.builtUnitId!);

  const [landParcels, builtUnits] = await Promise.all([
    landParcelIds.length > 0
      ? prisma.landParcel.findMany({ where: { id: { in: landParcelIds }, deletedAt: null }, select: { id: true, number: true, area: true, areaUnit: true } })
      : [],
    builtUnitIds.length > 0
      ? prisma.builtUnit.findMany({ where: { id: { in: builtUnitIds }, deletedAt: null }, select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true } })
      : [],
  ]);

  const parcelMap = new Map(landParcels.map((p) => [p.id, p]));
  const unitMap = new Map(builtUnits.map((u) => [u.id, u]));

  return json(
    sales.map((s) => {
      const totalPaid = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
      const parcel = s.landParcelId ? parcelMap.get(s.landParcelId) : null;
      const unit = s.builtUnitId ? unitMap.get(s.builtUnitId) : null;
      return {
        id: s.id,
        saleNumber: s.saleNumber,
        assetType: s.assetType,
        landParcelId: s.landParcelId,
        landParcelNumber: parcel?.number ?? null,
        builtUnitId: s.builtUnitId,
        builtUnitNumber: unit?.unitNumber ?? null,
        builtUnitType: unit?.unitType ?? null,
        assetArea: parcel ? toNum(parcel.area) : unit ? toNum(unit.area) : null,
        assetAreaUnit: parcel?.areaUnit ?? unit?.areaUnit ?? null,
        customerId: s.customerId,
        customerName: s.customer.name,
        customerPhone: s.customer.phone,
        projectId: s.projectId,
        projectName: s.project.name,
        salePrice: toNum(s.salePrice),
        gstRate: toNum(s.gstRate),
        gstAmount: toNum(s.gstAmount),
        costBasis: toNum(s.costBasis),
        profit: toNum(s.profit),
        saleDate: s.saleDate.toISOString(),
        status: s.status,
        saleStage: s.saleStage,
        depositAmount: s.depositAmount ? toNum(s.depositAmount) : null,
        depositDate: s.depositDate ? s.depositDate.toISOString() : null,
        finalSaleDate: s.finalSaleDate ? s.finalSaleDate.toISOString() : null,
        paymentStatus: s.paymentStatus,
        paymentMode: s.paymentMode,
        notes: s.notes,
        totalPaid,
        balanceDue: toNum(s.salePrice) - totalPaid,
        paymentCount: s.payments.length,
      };
    }),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.SALE_CREATE);
  const body = await req.json();
  const parsed = sellAssetSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const sale = await sellAsset({
      assetType: parsed.data.assetType,
      landParcelId: parsed.data.landParcelId ?? undefined,
      builtUnitId: parsed.data.builtUnitId ?? undefined,
      customerId: parsed.data.customerId,
      salePrice: parsed.data.salePrice,
      gstRate: parsed.data.gstRate ?? 0,
      paymentMode: parsed.data.paymentMode ?? undefined,
      notes: parsed.data.notes ?? undefined,
      initialPayment: parsed.data.initialPayment,
      initialPaymentMode: parsed.data.initialPaymentMode,
    });

    return json({ ok: true, saleId: sale.id, saleNumber: sale.saleNumber }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create sale") }, { status: 400 });
  }
});
