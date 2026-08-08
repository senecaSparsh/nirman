import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { softDelete, logAction } from "@nirman/services";
import { apiHandler, json, requirePermission, toNum, landPurchaseSchema } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_VIEW);
  const { id } = await ctx.params;
  const lp = await prisma.landPurchase.findFirst({
    where: { id, companyId: user.companyId ?? undefined, deletedAt: null },
    include: {
      project: { select: { name: true } },
      parcels: {
        where: { deletedAt: null },
        orderBy: { number: "asc" },
        include: { _count: { select: { children: true } }, project: { select: { name: true } }, parentParcel: { select: { number: true } } },
      },
    },
  });
  if (!lp) return json({ error: "Land purchase not found" }, { status: 404 });
  return json({
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
    parcels: lp.parcels.map((p) => ({
      id: p.id,
      landPurchaseId: p.landPurchaseId,
      parentParcelId: p.parentParcelId,
      parentParcelNumber: p.parentParcel?.number ?? null,
      number: p.number,
      area: toNum(p.area),
      areaUnit: p.areaUnit,
      status: p.status,
      acquisitionCost: toNum(p.acquisitionCost),
      askingPrice: p.askingPrice ? toNum(p.askingPrice) : null,
      currentValuation: toNum(p.currentValuation),
      projectId: p.projectId,
      projectName: p.project?.name ?? null,
      childCount: p._count.children,
    })),
  });
});

export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = landPurchaseSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (parsed.data.projectId !== undefined) data.projectId = parsed.data.projectId;
  if (parsed.data.sellerName !== undefined) data.sellerName = parsed.data.sellerName;
  if (parsed.data.sellerContact !== undefined) data.sellerContact = parsed.data.sellerContact;
  if (parsed.data.purchaseDate !== undefined) data.purchaseDate = parsed.data.purchaseDate ? new Date(parsed.data.purchaseDate) : null;
  if (parsed.data.totalArea !== undefined) data.totalArea = parsed.data.totalArea;
  if (parsed.data.areaUnit !== undefined) data.areaUnit = parsed.data.areaUnit;
  if (parsed.data.totalCost !== undefined) data.totalCost = parsed.data.totalCost;
  if (parsed.data.registryNo !== undefined) data.registryNo = parsed.data.registryNo;
  if (parsed.data.location !== undefined) data.location = parsed.data.location;
  if (parsed.data.documentUrl !== undefined) data.documentUrl = parsed.data.documentUrl;
  const updated = await prisma.$transaction(async (tx) => {
    const lp = await tx.landPurchase.update({ where: { id }, data });
    await logAction(tx, {
      userId: user.id,
      action: "LAND_PURCHASE_UPDATE",
      entityType: "LandPurchase",
      entityId: id,
      after: { sellerName: lp.sellerName, totalCost: lp.totalCost.toString(), totalArea: lp.totalArea.toString() },
    });
    return lp;
  });
  return json({ ok: true, id: updated.id });
});

export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await ctx.params;
  try {
    await softDelete("LandPurchase", id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete") }, { status: 400 });
  }
});
