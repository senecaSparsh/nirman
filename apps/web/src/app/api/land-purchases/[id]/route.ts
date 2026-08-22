import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { softDelete, logAction, reallocateProjectCosts, postLandPurchase, reverseJournalEntry } from "@nirman/services";
import { apiHandler, json, requirePermission, toNum, landPurchaseEditSchema } from "@/lib/server";
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
    documentUrl: lp.documentUrl,
    // Cost breakup
    baseCost: lp.baseCost ? toNum(lp.baseCost) : null,
    leaseRentPercent: lp.leaseRentPercent ? toNum(lp.leaseRentPercent) : null,
    leaseRentAmount: lp.leaseRentAmount ? toNum(lp.leaseRentAmount) : null,
    gstPercent: lp.gstPercent ? toNum(lp.gstPercent) : null,
    gstAmount: lp.gstAmount ? toNum(lp.gstAmount) : null,
    registrationPercent: lp.registrationPercent ? toNum(lp.registrationPercent) : null,
    registrationAmount: lp.registrationAmount ? toNum(lp.registrationAmount) : null,
    stampDutyPercent: lp.stampDutyPercent ? toNum(lp.stampDutyPercent) : null,
    stampDutyAmount: lp.stampDutyAmount ? toNum(lp.stampDutyAmount) : null,
    brokerageAmount: lp.brokerageAmount ? toNum(lp.brokerageAmount) : null,
    legalFees: lp.legalFees ? toNum(lp.legalFees) : null,
    otherCharges: lp.otherCharges ? toNum(lp.otherCharges) : null,
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
  const parsed = landPurchaseEditSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (parsed.data.projectId !== undefined) data.projectId = parsed.data.projectId;
  if (parsed.data.sellerId !== undefined) data.sellerId = parsed.data.sellerId;
  if (parsed.data.sellerName !== undefined) data.sellerName = parsed.data.sellerName;
  if (parsed.data.sellerContact !== undefined) data.sellerContact = parsed.data.sellerContact;
  if (parsed.data.purchaseDate !== undefined) data.purchaseDate = parsed.data.purchaseDate ? new Date(parsed.data.purchaseDate) : null;
  if (parsed.data.totalArea !== undefined) data.totalArea = parsed.data.totalArea;
  if (parsed.data.areaUnit !== undefined) data.areaUnit = parsed.data.areaUnit;
  if (parsed.data.totalCost !== undefined) data.totalCost = parsed.data.totalCost;
  if (parsed.data.registryNo !== undefined) data.registryNo = parsed.data.registryNo;
  if (parsed.data.location !== undefined) data.location = parsed.data.location;
  if (parsed.data.documentUrl !== undefined) data.documentUrl = parsed.data.documentUrl;
  // Cost breakup + lease details
  if (parsed.data.landType !== undefined) data.landType = parsed.data.landType;
  if (parsed.data.leaseType !== undefined) data.leaseType = parsed.data.leaseType;
  if (parsed.data.leasePeriodYears !== undefined) data.leasePeriodYears = parsed.data.leasePeriodYears;
  if (parsed.data.leaseStartDate !== undefined) data.leaseStartDate = parsed.data.leaseStartDate ? new Date(parsed.data.leaseStartDate) : null;
  if (parsed.data.leaseEndDate !== undefined) data.leaseEndDate = parsed.data.leaseEndDate ? new Date(parsed.data.leaseEndDate) : null;
  if (parsed.data.baseCost !== undefined) data.baseCost = parsed.data.baseCost;
  if (parsed.data.leaseRentPercent !== undefined) data.leaseRentPercent = parsed.data.leaseRentPercent;
  if (parsed.data.leaseRentAmount !== undefined) data.leaseRentAmount = parsed.data.leaseRentAmount;
  if (parsed.data.gstPercent !== undefined) data.gstPercent = parsed.data.gstPercent;
  if (parsed.data.gstAmount !== undefined) data.gstAmount = parsed.data.gstAmount;
  if (parsed.data.registrationPercent !== undefined) data.registrationPercent = parsed.data.registrationPercent;
  if (parsed.data.registrationAmount !== undefined) data.registrationAmount = parsed.data.registrationAmount;
  if (parsed.data.stampDutyPercent !== undefined) data.stampDutyPercent = parsed.data.stampDutyPercent;
  if (parsed.data.stampDutyAmount !== undefined) data.stampDutyAmount = parsed.data.stampDutyAmount;
  if (parsed.data.brokerageAmount !== undefined) data.brokerageAmount = parsed.data.brokerageAmount;
  if (parsed.data.legalFees !== undefined) data.legalFees = parsed.data.legalFees;
  if (parsed.data.otherCharges !== undefined) data.otherCharges = parsed.data.otherCharges;

  // Detect totalCost change — if so, we need to update parcel acquisitionCost,
  // reverse/re-post GL, and reallocate project costs.
  const totalCostChanged = parsed.data.totalCost !== undefined;
  // Detect projectId change — if the land is re-linked to a different project,
  // we need to reallocate costs for both the old and new project.
  const projectIdChanged = parsed.data.projectId !== undefined;

  const updated = await prisma.$transaction(async (tx) => {
    // Fetch the existing land purchase (need old totalCost + companyId for GL reversal)
    const existing = await tx.landPurchase.findFirst({
      where: { id, deletedAt: null },
      include: { parcels: { where: { deletedAt: null, parentParcelId: null } } },
    });
    if (!existing) throw new Error("Land purchase not found");

    const lp = await tx.landPurchase.update({ where: { id }, data });

    // If totalCost changed, update parcel acquisitionCost + reverse/re-post GL
    if (totalCostChanged) {
      const newTotalCostStr = lp.totalCost.toString();
      const oldTotalCostStr = existing.totalCost.toString();

      if (newTotalCostStr !== oldTotalCostStr) {
        // 1. Update the root parcel's acquisitionCost (pro-rata if subdivided)
        //    For WHOLE mode (single root parcel): set acquisitionCost = newTotalCost
        //    For SUBDIVIDED mode: the root parcel is PARTITIONED, so we update
        //    child parcels pro-rata based on their area share.
        const rootParcel = existing.parcels.find((p) => p.parentParcelId === null);
        if (rootParcel && rootParcel.status !== "PARTITIONED") {
          // WHOLE mode — single parcel, update directly
          await tx.landParcel.update({
            where: { id: rootParcel.id },
            data: { acquisitionCost: lp.totalCost },
          });
        } else {
          // SUBDIVIDED mode — update child parcels pro-rata by area
          const childParcels = await tx.landParcel.findMany({
            where: { landPurchaseId: id, deletedAt: null, parentParcelId: { not: null } },
          });
          const totalChildArea = childParcels.reduce((sum, p) => sum + toNum(p.area), 0);
          if (totalChildArea > 0) {
            for (const child of childParcels) {
              const share = toNum(child.area) / totalChildArea;
              const newAcqCost = toNum(lp.totalCost) * share;
              await tx.landParcel.update({
                where: { id: child.id },
                data: { acquisitionCost: newAcqCost },
              });
            }
          }
        }

        // 2. Reverse the original GL entry and post a new one
        const originalEntry = await tx.journalEntry.findFirst({
          where: { sourceType: "LAND_PURCHASE", sourceId: id },
        });
        if (originalEntry) {
          await reverseJournalEntry(tx, originalEntry.id, {
            postedById: user.id,
            memo: "Reversal: land purchase totalCost edited",
          });
        }
        await postLandPurchase(tx, {
          companyId: lp.companyId,
          landPurchaseId: id,
          totalCost: lp.totalCost,
          postedById: user.id,
        });

        // 3. Reallocate project costs if linked to a project
        if (lp.projectId) {
          await reallocateProjectCosts(tx, lp.projectId);
        }
      }
    }

    // If projectId changed, reallocate costs for both old and new projects
    if (projectIdChanged && existing.projectId !== lp.projectId) {
      // Reallocate the old project (land cost removed from it)
      if (existing.projectId) {
        await reallocateProjectCosts(tx, existing.projectId);
      }
      // Reallocate the new project (land cost added to it)
      if (lp.projectId) {
        await reallocateProjectCosts(tx, lp.projectId);
      }
    }

    await logAction(tx, {
      userId: user.id,
      action: "LAND_PURCHASE_UPDATE",
      entityType: "LandPurchase",
      entityId: id,
      after: { sellerName: lp.sellerName, totalCost: lp.totalCost.toString(), totalArea: lp.totalArea.toString() },
    });
    return lp;
  }, { isolationLevel: "Serializable" });
  revalidatePath("/m/land");
  return json({ ok: true, id: updated.id });
});

export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await ctx.params;
  try {
    await softDelete("LandPurchase", id);
    revalidatePath("/m/land");
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete") }, { status: 400 });
  }
});
