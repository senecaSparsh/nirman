import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { recordLandPurchase, recordLandPurchaseWithPlan } from "@nirman/services";
import { apiHandler, getCompany, json, landPurchaseSchema, landPurchasePlanSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async () => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const purchases = await prisma.landPurchase.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { name: true } },
      parcels: { where: { deletedAt: null }, select: { id: true, area: true, status: true, purpose: true } },
    },
  });
  return json(
    purchases.map((lp) => ({
      id: lp.id,
      projectId: lp.projectId,
      projectName: lp.project?.name ?? null,
      sellerName: lp.sellerName,
      sellerContact: lp.sellerContact,
      purchaseDate: lp.purchaseDate.toISOString(),
      totalArea: toNum(lp.totalArea),
      areaUnit: lp.areaUnit,
      totalCost: toNum(lp.totalCost),
      registryNo: lp.registryNo,
      location: lp.location,
      documentUrl: lp.documentUrl,
      mode: lp.mode,
      parcelCount: lp.parcels.length,
      availableArea: lp.parcels.filter((p) => p.status === "AVAILABLE").reduce((s, p) => s + toNum(p.area), 0),
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const body = await req.json();

  // If the body has a "mode" field, use the guided wizard (plan) flow.
  // Otherwise, fall back to the simple land purchase flow (backward compatible).
  if (body?.mode && (body.mode === "WHOLE" || body.mode === "SUBDIVIDED")) {
    const parsed = landPurchasePlanSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const { purchaseDate, sections, leaseStartDate, leaseEndDate, ...rest } = parsed.data;
    try {
      const result = await recordLandPurchaseWithPlan({
        ...rest,
        sellerId: rest.sellerId ?? undefined,
        sellerContact: rest.sellerContact ?? undefined,
        registryNo: rest.registryNo ?? undefined,
        location: rest.location ?? undefined,
        documentUrl: rest.documentUrl ?? undefined,
        parentParcelNumber: rest.parentParcelNumber ?? undefined,
        companyId: company.id,
        sections: sections.map((s) => ({
          number: s.number,
          area: s.area,
          purpose: s.purpose,
          askingPrice: s.askingPrice ?? undefined,
          projectId: s.projectId ?? undefined,
          projectCreate: s.projectCreate
            ? {
                name: s.projectCreate.name,
                type: s.projectCreate.type,
                status: s.projectCreate.status,
                address: s.projectCreate.address ?? undefined,
                startDate: s.projectCreate.startDate ?? undefined,
                endDate: s.projectCreate.endDate ?? undefined,
                totalBudget: s.projectCreate.totalBudget,
                totalSellableArea: s.projectCreate.totalSellableArea,
                description: s.projectCreate.description ?? undefined,
              }
            : undefined,
        })),
        purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
        leaseStartDate: leaseStartDate ? new Date(leaseStartDate) : null,
        leaseEndDate: leaseEndDate ? new Date(leaseEndDate) : null,
        createdById: user.id,
      });
      return json({
        id: result.landPurchase.id,
        mode: result.landPurchase.mode,
        rootParcelId: result.parentParcel.id,
        rootParcelNumber: result.parentParcel.number,
        rootParcelArea: toNum(result.parentParcel.area),
        rootParcelAreaUnit: result.parentParcel.areaUnit,
        rootParcelAcquisitionCost: toNum(result.parentParcel.acquisitionCost),
        parcelIds: result.parcels.map((p) => p.id),
        parcelCount: result.parcels.length,
      }, { status: 201 });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Failed to record land purchase") }, { status: 400 });
    }
  }

  // Simple flow (backward compatible)
  const parsed = landPurchaseSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { purchaseDate, projectId, ...rest } = parsed.data;
  try {
    const result = await recordLandPurchase({
      ...rest,
      sellerId: rest.sellerId ?? undefined,
      sellerContact: rest.sellerContact ?? undefined,
      registryNo: rest.registryNo ?? undefined,
      location: rest.location ?? undefined,
      documentUrl: rest.documentUrl ?? undefined,
      initialParcelNumber: rest.initialParcelNumber ?? undefined,
      companyId: company.id,
      projectId: projectId ?? undefined,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
      createdById: user.id,
    });
    return json({ id: result.landPurchase.id, rootParcelId: result.parcel.id, rootParcelNumber: result.parcel.number, rootParcelArea: toNum(result.parcel.area), rootParcelAreaUnit: result.parcel.areaUnit, rootParcelAcquisitionCost: toNum(result.parcel.acquisitionCost) }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to record land purchase") }, { status: 400 });
  }
});
