import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { softDelete, logAction, reallocateProjectCosts, postLandPurchase, reverseJournalEntry, refreshLandTotalCost, recomputeLandTotalCost, scheduledTotal, ServiceError } from "@nirman/services";
import Decimal from "decimal.js";
import { apiHandler, getCompany, json, requirePermission, toNum, landPurchaseEditSchema, scopeWhere, assertScopeAllows } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { withSerializableTransaction } from "@nirman/services";

export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { id } = await ctx.params;
  const lp = await prisma.landPurchase.findFirst({
    where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("LandPurchase", {}) },
    include: {
      project: { select: { name: true } },
      parcels: {
        where: { deletedAt: null },
        orderBy: { number: "asc" },
        include: { _count: { select: { children: true } }, project: { select: { name: true } }, parentParcel: { select: { number: true } } },
      },
      payments: { orderBy: { paymentDate: "asc" } },
      costComponents: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!lp) return json({ error: "Land purchase not found" }, { status: 404 });

  // Lazy recompute — advance recurring accruals as time passes so the
  // breakdown + totalCost stay current whenever the detail is viewed.
  // Idempotent: writes nothing if no occurrence has fallen due.
  try {
    await refreshLandTotalCost(id);
  } catch {
    // non-fatal — return the persisted state if recompute fails
  }
  // Re-fetch after recompute so the response reflects any accrual.
  const lpFresh = await prisma.landPurchase.findFirst({
    where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("LandPurchase", {}) },
    include: { costComponents: { orderBy: { createdAt: "asc" } } },
  });
  const totalCost = lpFresh ? toNum(lpFresh.totalCost) : toNum(lp.totalCost);
  const components = (lpFresh?.costComponents ?? lp.costComponents).map((c) => ({
    id: c.id,
    landPurchaseId: c.landPurchaseId,
    label: c.label,
    amount: toNum(c.amount),
    frequency: c.frequency,
    interval: c.interval,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate ? c.endDate.toISOString() : null,
    occurrences: c.occurrences,
    postedAmount: toNum(c.postedAmount),
    scheduledTotal: toNum(scheduledTotal(c)),
    notes: c.notes,
  }));

  const totalPaid = lp.payments.reduce((s, p) => s + toNum(p.amount), 0);
  return json({
    id: lp.id,
    projectId: lp.projectId,
    projectName: lp.project?.name ?? null,
    sellerName: lp.sellerName,
    sellerContact: lp.sellerContact,
    purchaseDate: lp.purchaseDate.toISOString(),
    totalArea: toNum(lp.totalArea),
    areaUnit: lp.areaUnit,
    totalCost,
    registryNo: lp.registryNo,
    location: lp.location,
    documentUrl: lp.documentUrl,
    // Staged purchase
    purchaseStage: lp.purchaseStage,
    tokenAmount: lp.tokenAmount ? toNum(lp.tokenAmount) : null,
    tokenPaymentDate: lp.tokenPaymentDate ? lp.tokenPaymentDate.toISOString() : null,
    tokenPaymentMode: lp.tokenPaymentMode,
    // Documents
    atsDocumentUrl: lp.atsDocumentUrl,
    atsDocumentName: lp.atsDocumentName,
    bbaDocumentUrl: lp.bbaDocumentUrl,
    bbaDocumentName: lp.bbaDocumentName,
    bbaDate: lp.bbaDate ? lp.bbaDate.toISOString() : null,
    registryDocumentUrl: lp.registryDocumentUrl,
    registryDocumentName: lp.registryDocumentName,
    // Payments
    totalPaid,
    balanceDue: totalCost - totalPaid,
    payments: lp.payments.map((p) => ({
      id: p.id,
      amount: toNum(p.amount),
      paymentDate: p.paymentDate.toISOString(),
      paymentMode: p.paymentMode,
      referenceNo: p.referenceNo,
      notes: p.notes,
      chequeNo: p.chequeNo,
      chequeDate: p.chequeDate ? p.chequeDate.toISOString() : null,
      chequeBank: p.chequeBank,
      chequePhotoUrl: p.chequePhotoUrl,
      chequeStatus: p.chequeStatus,
      chequeClearDate: p.chequeClearDate ? p.chequeClearDate.toISOString() : null,
      chequeBounceReason: p.chequeBounceReason,
    })),
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
    transferDutyPercent: lp.transferDutyPercent ? toNum(lp.transferDutyPercent) : null,
    transferDutyAmount: lp.transferDutyAmount ? toNum(lp.transferDutyAmount) : null,
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
    // Cost components (arbitrary / recurring / future costs)
    costComponents: components,
  });
});

export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = landPurchaseEditSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    await assertScopeAllows({
      projectId: parsed.data.projectId ?? null,
      departmentId: null,
    });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Scope violation" },
      { status: 403 },
    );
  }
  const data: Record<string, unknown> = {};
  if (parsed.data.projectId !== undefined) data.projectId = parsed.data.projectId;
  if (parsed.data.sellerId !== undefined) data.sellerId = parsed.data.sellerId;
  if (parsed.data.sellerName !== undefined) data.sellerName = parsed.data.sellerName;
  if (parsed.data.sellerContact !== undefined) data.sellerContact = parsed.data.sellerContact;
  if (parsed.data.purchaseDate !== undefined) {
    if (parsed.data.purchaseDate) {
      const purchaseDate = new Date(parsed.data.purchaseDate);
      if (isNaN(purchaseDate.getTime())) return json({ error: "Invalid date format" }, { status: 400 });
      data.purchaseDate = purchaseDate;
    } else {
      data.purchaseDate = null;
    }
  }
  if (parsed.data.totalArea !== undefined) data.totalArea = parsed.data.totalArea;
  if (parsed.data.areaUnit !== undefined) data.areaUnit = parsed.data.areaUnit;
  // NOTE: totalCost is NOT set directly — it's computed by recomputeLandTotalCost
  // from the fixed cost-breakup columns + Σ component postedAmount.
  // If the caller sends only `totalCost` (no breakup fields), we adjust `baseCost`
  // by the delta so the recompute produces the desired total.
  const sentTotalCost = parsed.data.totalCost;
  const hasBreakupFields =
    parsed.data.baseCost !== undefined ||
    parsed.data.stampDutyAmount !== undefined ||
    parsed.data.registrationAmount !== undefined ||
    parsed.data.transferDutyAmount !== undefined ||
    parsed.data.brokerageAmount !== undefined ||
    parsed.data.legalFees !== undefined ||
    parsed.data.otherCharges !== undefined ||
    parsed.data.leaseRentAmount !== undefined ||
    parsed.data.gstAmount !== undefined;
  if (parsed.data.registryNo !== undefined) data.registryNo = parsed.data.registryNo;
  if (parsed.data.location !== undefined) data.location = parsed.data.location;
  if (parsed.data.documentUrl !== undefined) data.documentUrl = parsed.data.documentUrl;
  // Cost breakup + lease details
  if (parsed.data.landType !== undefined) data.landType = parsed.data.landType;
  if (parsed.data.leaseType !== undefined) data.leaseType = parsed.data.leaseType;
  if (parsed.data.leasePeriodYears !== undefined) data.leasePeriodYears = parsed.data.leasePeriodYears;
  if (parsed.data.leaseStartDate !== undefined) {
    if (parsed.data.leaseStartDate) {
      const leaseStartDate = new Date(parsed.data.leaseStartDate);
      if (isNaN(leaseStartDate.getTime())) return json({ error: "Invalid date format" }, { status: 400 });
      data.leaseStartDate = leaseStartDate;
    } else {
      data.leaseStartDate = null;
    }
  }
  if (parsed.data.leaseEndDate !== undefined) {
    if (parsed.data.leaseEndDate) {
      const leaseEndDate = new Date(parsed.data.leaseEndDate);
      if (isNaN(leaseEndDate.getTime())) return json({ error: "Invalid date format" }, { status: 400 });
      data.leaseEndDate = leaseEndDate;
    } else {
      data.leaseEndDate = null;
    }
  }
  if (parsed.data.baseCost !== undefined) data.baseCost = parsed.data.baseCost;
  if (parsed.data.leaseRentPercent !== undefined) data.leaseRentPercent = parsed.data.leaseRentPercent;
  if (parsed.data.leaseRentAmount !== undefined) data.leaseRentAmount = parsed.data.leaseRentAmount;
  if (parsed.data.gstPercent !== undefined) data.gstPercent = parsed.data.gstPercent;
  if (parsed.data.gstAmount !== undefined) data.gstAmount = parsed.data.gstAmount;
  if (parsed.data.registrationPercent !== undefined) data.registrationPercent = parsed.data.registrationPercent;
  if (parsed.data.registrationAmount !== undefined) data.registrationAmount = parsed.data.registrationAmount;
  if (parsed.data.stampDutyPercent !== undefined) data.stampDutyPercent = parsed.data.stampDutyPercent;
  if (parsed.data.stampDutyAmount !== undefined) data.stampDutyAmount = parsed.data.stampDutyAmount;
  if (parsed.data.transferDutyPercent !== undefined) data.transferDutyPercent = parsed.data.transferDutyPercent;
  if (parsed.data.transferDutyAmount !== undefined) data.transferDutyAmount = parsed.data.transferDutyAmount;
  if (parsed.data.brokerageAmount !== undefined) data.brokerageAmount = parsed.data.brokerageAmount;
  if (parsed.data.legalFees !== undefined) data.legalFees = parsed.data.legalFees;
  if (parsed.data.otherCharges !== undefined) data.otherCharges = parsed.data.otherCharges;

  // Detect whether fixed cost columns or totalCost changed — either way we need
  // to reverse/re-post the LAND_PURCHASE GL entry (which covers fixed cols only)
  // and recompute totalCost = fixedCols + components.
  const fixedColsChanged = hasBreakupFields;
  const totalCostOverridden = sentTotalCost !== undefined && !hasBreakupFields;
  // Detect projectId change — if the land is re-linked to a different project,
  // we need to reallocate costs for both the old and new project.
  const projectIdChanged = parsed.data.projectId !== undefined;

  const updated = await withSerializableTransaction(async (tx) => {
    // Fetch the existing land purchase (need old totalCost + baseCost for delta calc)
    const existing = await tx.landPurchase.findFirst({
      where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("LandPurchase", {}) },
      include: { parcels: { where: { deletedAt: null, parentParcelId: null } } },
    });
    if (!existing) throw new ServiceError("Land purchase not found", 404);

    // If the caller sent only `totalCost` (no breakup fields), adjust `baseCost`
    // by the delta so recomputeLandTotalCost produces the desired total.
    // totalCost = baseCost + otherFixedCols + componentsTotal
    // → newBaseCost = oldBaseCost + (sentTotalCost - oldTotalCost)
    if (totalCostOverridden && sentTotalCost != null) {
      const oldTotal = new Decimal(existing.totalCost);
      const oldBase = new Decimal(existing.baseCost ?? 0);
      const delta = new Decimal(sentTotalCost).minus(oldTotal);
      data.baseCost = oldBase.plus(delta);
    }

    const lp = await tx.landPurchase.update({ where: { id }, data });

    // If fixed cost columns changed (or totalCost was overridden → baseCost changed),
    // reverse the old LAND_PURCHASE GL entry and re-post with the new fixed-cols total.
    // The LAND_PURCHASE entry covers fixed cols only; component accruals have their
    // own LAND_COST_COMPONENT entries managed by recomputeLandTotalCost.
    if (fixedColsChanged || totalCostOverridden) {
      const fixedColsTotal: Decimal = [
        lp.baseCost, lp.leaseRentAmount, lp.gstAmount,
        lp.registrationAmount, lp.stampDutyAmount, lp.transferDutyAmount,
        lp.brokerageAmount, lp.legalFees, lp.otherCharges,
      ].reduce<Decimal>((sum, v) => sum.plus(v ? new Decimal(v) : new Decimal(0)), new Decimal(0));

      const originalEntry = await tx.journalEntry.findFirst({
        where: { sourceType: "LAND_PURCHASE", sourceId: id },
      });
      if (originalEntry) {
        await reverseJournalEntry(tx, originalEntry.id, {
          postedById: user.id,
          memo: "Reversal: land purchase cost breakup edited",
        });
      }
      await postLandPurchase(tx, {
        companyId: lp.companyId,
        landPurchaseId: id,
        totalCost: fixedColsTotal,
        postedById: user.id,
      });
    }

    // Recompute totalCost = fixedCols + Σ component postedAmount.
    // This updates totalCost, parcel acquisitionCost (pro-rata), and project
    // reallocation. It also posts GL deltas for any component accruals.
    // Skip if neither fixed cols nor totalCost changed (nothing to recompute).
    if (fixedColsChanged || totalCostOverridden) {
      await recomputeLandTotalCost(tx, id, user.id);
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
  });
  revalidatePath("/land");
  revalidatePath(`/land/${id}`);
  revalidatePath("/m/land");
    revalidatePath("/m/real-estate?tab=land");
  revalidatePath(`/m/land/${id}`);
  return json({ ok: true, id: updated.id });
});

export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  const existing = await prisma.landPurchase.findFirst({ where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("LandPurchase", {}) }, select: { id: true } });
  if (!existing) return json({ error: "Land purchase not found" }, { status: 404 });
  try {
    await softDelete("LandPurchase", id);
    revalidatePath("/land");
    revalidatePath(`/land/${id}`);
    revalidatePath("/m/land");
    revalidatePath("/m/real-estate?tab=land");
    revalidatePath(`/m/land/${id}`);
    return json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof ServiceError) {
      return json({ error: err.message }, { status: err.status ?? 400 });
    }
    return json({ error: "Failed to delete land purchase" }, { status: 400 });
  }
});
