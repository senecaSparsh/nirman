import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { recordLandPurchase } from "@nirman/services";
import { apiHandler, getCompany, json, landPurchaseSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async () => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const purchases = await prisma.landPurchase.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { name: true } },
      parcels: { where: { deletedAt: null }, select: { id: true, area: true, status: true } },
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
      parcelCount: lp.parcels.length,
      availableArea: lp.parcels.filter((p) => p.status === "AVAILABLE").reduce((s, p) => s + toNum(p.area), 0),
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = landPurchaseSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { purchaseDate, projectId, ...rest } = parsed.data;
  try {
    const result = await recordLandPurchase({
      ...rest,
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
    return json({ id: result.landPurchase.id }, { status: 201 });
  } catch (err: any) {
    return json({ error: err?.message ?? "Failed to record land purchase" }, { status: 400 });
  }
});
