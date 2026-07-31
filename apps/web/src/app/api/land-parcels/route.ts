import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { partitionLandParcel, setParcelStatus, updateParcelValuation } from "@nirman/services";
import { apiHandler, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/land-parcels?landPurchaseId=...
 * Returns parcels for a land purchase (or all non-deleted parcels).
 * Includes children for tree rendering.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const { searchParams } = new URL(req.url);
  const landPurchaseId = searchParams.get("landPurchaseId");
  const status = searchParams.get("status");

  const parcels = await prisma.landParcel.findMany({
    where: {
      deletedAt: null,
      ...(landPurchaseId ? { landPurchaseId } : {}),
      ...(status ? { status: status as any } : {}),
    },
    include: {
      parentParcel: { select: { id: true, number: true } },
      children: { select: { id: true, number: true, area: true, status: true } },
      project: { select: { id: true, name: true } },
      landPurchase: { select: { id: true, sellerName: true } },
    },
    orderBy: [{ landPurchaseId: "asc" }, { number: "asc" }],
  });

  return json(
    parcels.map((p) => ({
      id: p.id,
      landPurchaseId: p.landPurchaseId,
      landPurchaseSeller: p.landPurchase.sellerName,
      parentParcelId: p.parentParcelId,
      parentParcelNumber: p.parentParcel?.number ?? null,
      number: p.number,
      area: toNum(p.area),
      areaUnit: p.areaUnit,
      status: p.status,
      acquisitionCost: toNum(p.acquisitionCost),
      askingPrice: p.askingPrice ? toNum(p.askingPrice) : null,
      currentValuation: toNum(p.currentValuation),
      nrvWriteDown: toNum(p.nrvWriteDown),
      projectId: p.projectId,
      projectName: p.project?.name ?? null,
      saleId: p.saleId,
      childCount: p.children.length,
      children: p.children.map((c) => ({
        id: c.id,
        number: c.number,
        area: toNum(c.area),
        status: c.status,
      })),
    })),
  );
});

/**
 * POST /api/land-parcels — partition a parcel OR update status/valuation.
 * Body: { action: "partition" | "status" | "valuation", ... }
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const action = body?.action as string;

  if (action === "partition") {
    await requirePermission(PERM.LAND_PARTITION);
    const { partitionSchema } = await import("@/lib/server");
    const parsed = partitionSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    try {
      const result = await partitionLandParcel({
        parentParcelId: parsed.data.parentParcelId,
        children: parsed.data.children.map((c) => ({
          number: c.number,
          area: c.area,
          askingPrice: c.askingPrice,
        })),
        notes: parsed.data.notes,
      });
      return json(
        { ok: true, parentId: result.parent.id, children: result.children.map((c) => c.id) },
        { status: 201 },
      );
    } catch (err: any) {
      return json({ error: err?.message ?? "Partition failed" }, { status: 400 });
    }
  }

  if (action === "status") {
    await requirePermission(PERM.ASSETS_MANAGE);
    const parcelId = body?.parcelId as string;
    const status = body?.status as "AVAILABLE" | "HOLD";
    if (!parcelId || !status) {
      return json({ error: "parcelId and status are required" }, { status: 400 });
    }
    try {
      await setParcelStatus(parcelId, status);
      return json({ ok: true });
    } catch (err: any) {
      return json({ error: err?.message ?? "Status change failed" }, { status: 400 });
    }
  }

  if (action === "valuation") {
    await requirePermission(PERM.ASSETS_MANAGE);
    const { parcelValuationSchema } = await import("@/lib/server");
    const parcelId = body?.parcelId as string;
    if (!parcelId) return json({ error: "parcelId is required" }, { status: 400 });
    const parsed = parcelValuationSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    try {
      await updateParcelValuation(parcelId, {
        currentValuation: parsed.data.currentValuation,
        askingPrice: parsed.data.askingPrice === null ? undefined : parsed.data.askingPrice,
      });
      return json({ ok: true });
    } catch (err: any) {
      return json({ error: err?.message ?? "Valuation update failed" }, { status: 400 });
    }
  }

  return json({ error: "Unknown action. Use partition, status, or valuation." }, { status: 400 });
});
