import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { setParcelStatus, updateParcelValuation } from "@nirman/services";
import { apiHandler, getCompany, json, parcelValuationSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await ctx.params;
  const body = await req.json();
  const action = body?.action as string;

  try {
    if (action === "hold") {
      const p = await setParcelStatus(id, "HOLD", user.id);
      return json({ ok: true, status: p.status });
    }
    if (action === "release") {
      const p = await setParcelStatus(id, "AVAILABLE", user.id);
      return json({ ok: true, status: p.status });
    }
    if (action === "valuate") {
      const parsed = parcelValuationSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
      }
      await updateParcelValuation(
        id,
        {
          currentValuation: parsed.data.currentValuation,
          askingPrice: parsed.data.askingPrice === null ? undefined : parsed.data.askingPrice,
        },
        user.id,
      );
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Action failed") }, { status: 400 });
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;

  // Find the parcel, ensuring it belongs to the user's company via the land purchase
  const parcel = await prisma.landParcel.findFirst({
    where: { id, landPurchase: { companyId: company.id } },
    include: {
      _count: { select: { children: true } },
    },
  });
  if (!parcel) return json({ error: "Land parcel not found" }, { status: 404 });

  // Guard: can't delete if parcel has been partitioned (has children)
  if (parcel._count.children > 0) {
    return json({ error: "Cannot delete a parcel that has been partitioned. Delete the child parcels first." }, { status: 400 });
  }
  // Guard: can't delete if parcel has a sale
  if (parcel.saleId) {
    return json({ error: "Cannot delete a parcel that has been sold." }, { status: 400 });
  }
  // Guard: can't delete if parcel is not AVAILABLE or HOLD
  if (!["AVAILABLE", "HOLD"].includes(parcel.status)) {
    return json({ error: `Cannot delete a parcel in ${parcel.status} status. Only AVAILABLE or HOLD parcels can be deleted.` }, { status: 400 });
  }

  await prisma.landParcel.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return json({ ok: true });
});
