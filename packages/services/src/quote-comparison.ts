import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";
import { computeLineLandedCost, computeQuoteTotals } from "./quotation";

/**
 * Comparative Quote Engine — the SRS's mandatory procurement cost-control.
 *
 * Workflow (SRS §6 "Workflow: Purchasing"):
 *   1. Purchaser identifies a need (requisition exists).
 *   2. Purchaser collects ≥3 vendor quotes and uploads them (PDF/image).
 *   3. System flags the cheapest quote (by landed, delivered-to-site total).
 *   4. An approver (po.approve) selects the winning quote — they may override
 *      the cheapest recommendation with a reason.
 *   5. The requisition→PO conversion auto-fills line costs from the winner.
 *
 * The min-quotes gate (default 3) blocks conversion until enough quotes are
 * uploaded, unless an approver waives it (for low-value / emergency buys).
 */

// ── Pure helpers (unit-tested) ──

interface QuoteTotal {
  id: string;
  landedTotal: Decimal;
  status: string; // PENDING | SELECTED | REJECTED
}

/**
 * Given a list of quote totals, return the ID of the cheapest one
 * (lowest landedTotal). Only PENDING and SELECTED quotes are considered —
 * REJECTED quotes are excluded from the comparison.
 * Returns null if there are no eligible quotes.
 */
export function cheapestQuoteId(quotes: QuoteTotal[]): string | null {
  const eligible = quotes.filter((q) => q.status !== "REJECTED");
  if (eligible.length === 0) return null;
  let best = eligible[0]!;
  for (const q of eligible) {
    if (new Decimal(q.landedTotal).lt(new Decimal(best.landedTotal))) {
      best = q;
    }
  }
  return best.id;
}

/**
 * Compute the variance of each quote vs. the cheapest.
 * Returns a map of quoteId → absolute variance (quote.landedTotal - cheapest.landedTotal).
 * The cheapest quote has variance = 0.
 */
export function quoteVariances(quotes: QuoteTotal[]): Map<string, Decimal> {
  const cheapestId = cheapestQuoteId(quotes);
  const result = new Map<string, Decimal>();
  if (!cheapestId) return result;
  const cheapest = quotes.find((q) => q.id === cheapestId);
  if (!cheapest) return result;
  const cheapestTotal = new Decimal(cheapest.landedTotal);
  for (const q of quotes) {
    if (q.status === "REJECTED") continue;
    result.set(q.id, new Decimal(q.landedTotal).minus(cheapestTotal));
  }
  return result;
}

/**
 * Check whether the quote gate is satisfied.
 * Returns true if the number of non-rejected quotes ≥ minQuotesRequired,
 * OR the gate has been waived.
 */
export function isQuoteGateSatisfied(
  quoteCount: number,
  minQuotesRequired: number,
  waived: boolean,
): boolean {
  if (waived) return true;
  return quoteCount >= minQuotesRequired;
}

/**
 * Compute the per-line unit prices from a winning quote, keyed by materialId.
 * Used to auto-fill lineCosts in convertRequisitionToPo.
 * If a requisition material has no matching quote line, it's omitted (the
 * caller decides the fallback — typically 0, which the convert dialog flags).
 */
export function winningLineCosts(
  quoteLines: { materialId: string; unitPrice: Decimal }[],
): Record<string, Decimal> {
  const map: Record<string, Decimal> = {};
  for (const line of quoteLines) {
    map[line.materialId] = new Decimal(line.unitPrice);
  }
  return map;
}

// ── Service functions (transactional + audit-logged) ──

export interface CreateVendorQuoteInput {
  requisitionId: string;
  supplierId: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  landedTotal?: Decimal | number | string; // optional — auto-computed from lines if not provided
  validUntil?: Date;
  notes?: string;
  submittedById?: string;
  deliveryTermsType?: "DELIVERED_SITE" | "EX_WORKS" | "FOR_STATION" | "CUSTOM";
  deliveryTerms?: string; // legacy free-text
  lines: {
    materialId: string;
    qty: Decimal | number | string;
    unitPrice: Decimal | number | string;
    gstRate?: Decimal | number | string;
    discountPerUnit?: Decimal | number | string;
    packingPerUnit?: Decimal | number | string;
    freightPerUnit?: Decimal | number | string;
    loadingPerUnit?: Decimal | number | string;
    insurancePerUnit?: Decimal | number | string;
    handlingPerUnit?: Decimal | number | string;
    buyerTransportPerUnit?: Decimal | number | string;
  }[];
}

export async function createVendorQuote(input: CreateVendorQuoteInput) {
  if (input.lines.length === 0) throw new ServiceError("Quote must have at least one line");

  // Validate requisition exists and is in a quote-collectable state
  const req = await prisma.materialRequisition.findUnique({
    where: { id: input.requisitionId },
    include: {
      lines: true,
      project: { select: { companyId: true } },
      department: { select: { companyId: true } },
    },
  });
  if (!req) throw new ServiceError("Requisition not found", 404);
  if (req.status === "CONVERTED") throw new ServiceError("Cannot add quotes to a converted requisition");
  if (req.status === "REJECTED") throw new ServiceError("Cannot add quotes to a rejected requisition");
  if (req.quotesLockedAt) throw new ServiceError("Quotes are locked — a winner has already been selected");

  // Validate supplier belongs to the same company as the requisition's project/department
  const reqCompanyId = req.project?.companyId ?? req.department?.companyId;
  if (!reqCompanyId) throw new ServiceError("Requisition has no project or department", 400);
  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, companyId: reqCompanyId, deletedAt: null },
  });
  if (!supplier) throw new ServiceError("Supplier not found or deleted", 404);

  // Validate materials
  const materialIds = input.lines.map((l) => l.materialId);
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds }, deletedAt: null },
  });
  if (materials.length !== materialIds.length) {
    throw new ServiceError("One or more materials not found or deleted", 404);
  }
  for (const line of input.lines) {
    if (!new Decimal(line.qty).gt(0)) throw new ServiceError("Quote line qty must be > 0");
    if (new Decimal(line.unitPrice).lt(0)) throw new ServiceError("Quote line unit price must be ≥ 0");
  }

  // Validate submittedBy user exists
  if (input.submittedById) {
    const user = await prisma.user.findUnique({ where: { id: input.submittedById }, select: { id: true } });
    if (!user) throw new ServiceError("Submitting user not found", 404);
  }

  return prisma.$transaction(async (tx) => {
    // Fetch requisition lines + their materials for HSN/GST lookup
    const reqLines = await tx.materialRequisitionLine.findMany({
      where: { requisitionId: input.requisitionId },
      select: {
        materialId: true,
        material: { select: { hsnCode: true, gstRate: true } },
      },
    });
    const reqLineMap = new Map(reqLines.map((l) => [l.materialId, l]));

    // Compute landed cost per line using all components
    const computedLines = input.lines.map((l) => {
      const reqLine = reqLineMap.get(l.materialId);
      const gstRate = l.gstRate ?? reqLine?.material.gstRate ?? 0;
      const computed = computeLineLandedCost({
        unitPrice: l.unitPrice,
        gstRate,
        qty: l.qty,
        discountPerUnit: l.discountPerUnit ?? 0,
        packingPerUnit: l.packingPerUnit ?? 0,
        freightPerUnit: l.freightPerUnit ?? 0,
        loadingPerUnit: l.loadingPerUnit ?? 0,
        insurancePerUnit: l.insurancePerUnit ?? 0,
        handlingPerUnit: l.handlingPerUnit ?? 0,
        buyerTransportPerUnit: l.buyerTransportPerUnit ?? 0,
      });
      return {
        materialId: l.materialId,
        hsnCode: reqLine?.material.hsnCode ?? null,
        ...computed,
      };
    });

    const totals = computeQuoteTotals(computedLines);
    // Use provided landedTotal or the computed one
    const landedTotal = input.landedTotal !== undefined ? new Decimal(input.landedTotal) : totals.landedTotal;

    const quote = await tx.vendorQuote.create({
      data: {
        requisitionId: input.requisitionId,
        supplierId: input.supplierId,
        fileUrl: input.fileUrl,
        fileName: input.fileName,
        mimeType: input.mimeType,
        landedTotal,
        subtotal: totals.subtotal,
        gstTotal: totals.gstTotal,
        freightTotal: totals.freightTotal,
        handlingTotal: totals.handlingTotal,
        discountTotal: totals.discountTotal,
        packingTotal: totals.packingTotal,
        loadingTotal: totals.loadingTotal,
        insuranceTotal: totals.insuranceTotal,
        buyerTransportTotal: totals.buyerTransportTotal,
        deliveryTermsType: (input.deliveryTermsType ?? "DELIVERED_SITE") as "DELIVERED_SITE" | "EX_WORKS" | "FOR_STATION" | "CUSTOM",
        deliveryTerms: input.deliveryTerms ?? null,
        validUntil: input.validUntil,
        notes: input.notes,
        submittedById: input.submittedById,
        status: "PENDING",
        lines: {
          create: computedLines.map((l) => ({
            materialId: l.materialId,
            qty: l.qty,
            unitPrice: l.unitPrice,
            hsnCode: l.hsnCode,
            gstRate: l.gstRate,
            gstAmount: l.gstAmount,
            discountPerUnit: l.discountPerUnit,
            packingPerUnit: l.packingPerUnit,
            freightPerUnit: l.freightPerUnit,
            loadingPerUnit: l.loadingPerUnit,
            insurancePerUnit: l.insurancePerUnit,
            handlingPerUnit: l.handlingPerUnit,
            buyerTransportPerUnit: l.buyerTransportPerUnit,
            unitLandedCost: l.unitLandedCost,
            taxableValue: l.taxableValue,
            lineSubtotal: l.lineSubtotal,
            lineTotal: l.lineTotal,
          })),
        },
      },
      include: { lines: true, supplier: { select: { id: true, name: true } } },
    });

    // Recompute cheapest flags across all quotes for this requisition
    await recomputeCheapestFlags(tx, input.requisitionId);

    await logAction(tx, {
      userId: input.submittedById,
      action: "VENDOR_QUOTE_CREATE",
      entityType: "VendorQuote",
      entityId: quote.id,
      after: {
        requisitionId: input.requisitionId,
        supplierId: input.supplierId,
        landedTotal: quote.landedTotal.toString(),
        lineCount: computedLines.length,
      },
    });
    return quote;
  });
}

export interface UpdateVendorQuoteInput {
  quoteId: string;
  landedTotal?: Decimal | number | string;
  validUntil?: Date | null;
  notes?: string | null;
  deliveryTermsType?: "DELIVERED_SITE" | "EX_WORKS" | "FOR_STATION" | "CUSTOM";
  deliveryTerms?: string | null;
  paymentTerms?: string | null;
  leadTimeDays?: number | null;
  warranty?: string | null;
  lines?: {
    materialId: string;
    qty: Decimal | number | string;
    unitPrice: Decimal | number | string;
    gstRate?: Decimal | number | string;
    discountPerUnit?: Decimal | number | string;
    packingPerUnit?: Decimal | number | string;
    freightPerUnit?: Decimal | number | string;
    loadingPerUnit?: Decimal | number | string;
    insurancePerUnit?: Decimal | number | string;
    handlingPerUnit?: Decimal | number | string;
    buyerTransportPerUnit?: Decimal | number | string;
  }[];
  userId?: string;
}

export async function updateVendorQuote(input: UpdateVendorQuoteInput) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.vendorQuote.findUnique({
      where: { id: input.quoteId },
      include: { lines: true },
    });
    if (!quote) throw new ServiceError("Quote not found", 404);
    if (quote.status === "SELECTED") throw new ServiceError("Cannot edit a selected (winning) quote");

    const data: Record<string, unknown> = {};
    if (input.validUntil !== undefined) data.validUntil = input.validUntil;
    if (input.notes !== undefined) data.notes = input.notes;

    if (input.lines) {
      // Fetch requisition/quotation lines + materials for HSN/GST lookup
      let reqLineMap = new Map<string, { material: { hsnCode: string | null; gstRate: Decimal } }>();
      if (quote.requisitionId) {
        const reqLines = await tx.materialRequisitionLine.findMany({
          where: { requisitionId: quote.requisitionId },
          select: { materialId: true, material: { select: { hsnCode: true, gstRate: true } } },
        });
        reqLineMap = new Map(reqLines.map((l) => [l.materialId, l]));
      } else if (quote.quotationRequestId) {
        const reqLines = await tx.quotationRequestLine.findMany({
          where: { quotationRequestId: quote.quotationRequestId },
          select: { materialId: true, material: { select: { hsnCode: true, gstRate: true } } },
        });
        reqLineMap = new Map(reqLines.map((l) => [l.materialId, l]));
      }

      // Compute landed cost per line
      const computedLines = input.lines.map((l) => {
        const reqLine = reqLineMap.get(l.materialId);
        const gstRate = l.gstRate ?? reqLine?.material.gstRate ?? 0;
        const computed = computeLineLandedCost({
          unitPrice: l.unitPrice,
          gstRate,
          qty: l.qty,
          discountPerUnit: l.discountPerUnit ?? 0,
          packingPerUnit: l.packingPerUnit ?? 0,
          freightPerUnit: l.freightPerUnit ?? 0,
          loadingPerUnit: l.loadingPerUnit ?? 0,
          insurancePerUnit: l.insurancePerUnit ?? 0,
          handlingPerUnit: l.handlingPerUnit ?? 0,
          buyerTransportPerUnit: l.buyerTransportPerUnit ?? 0,
        });
        return {
          materialId: l.materialId,
          hsnCode: reqLine?.material.hsnCode ?? null,
          ...computed,
        };
      });

      const totals = computeQuoteTotals(computedLines);

      // Replace all lines
      await tx.vendorQuoteLine.deleteMany({ where: { vendorQuoteId: input.quoteId } });
      for (const l of computedLines) {
        await tx.vendorQuoteLine.create({
          data: {
            vendorQuoteId: input.quoteId,
            materialId: l.materialId,
            qty: l.qty,
            unitPrice: l.unitPrice,
            hsnCode: l.hsnCode,
            gstRate: l.gstRate,
            gstAmount: l.gstAmount,
            discountPerUnit: l.discountPerUnit,
            packingPerUnit: l.packingPerUnit,
            freightPerUnit: l.freightPerUnit,
            loadingPerUnit: l.loadingPerUnit,
            insurancePerUnit: l.insurancePerUnit,
            handlingPerUnit: l.handlingPerUnit,
            buyerTransportPerUnit: l.buyerTransportPerUnit,
            unitLandedCost: l.unitLandedCost,
            taxableValue: l.taxableValue,
            lineSubtotal: l.lineSubtotal,
            lineTotal: l.lineTotal,
          },
        });
      }

      // Update header totals from computed lines
      data.subtotal = totals.subtotal;
      data.gstTotal = totals.gstTotal;
      data.freightTotal = totals.freightTotal;
      data.handlingTotal = totals.handlingTotal;
      data.discountTotal = totals.discountTotal;
      data.packingTotal = totals.packingTotal;
      data.loadingTotal = totals.loadingTotal;
      data.insuranceTotal = totals.insuranceTotal;
      data.buyerTransportTotal = totals.buyerTransportTotal;
      data.landedTotal = input.landedTotal !== undefined ? new Decimal(input.landedTotal) : totals.landedTotal;
    } else if (input.landedTotal !== undefined) {
      data.landedTotal = new Decimal(input.landedTotal);
    }
    if (input.deliveryTermsType !== undefined) data.deliveryTermsType = input.deliveryTermsType;
    if (input.deliveryTerms !== undefined) data.deliveryTerms = input.deliveryTerms;
    if (input.paymentTerms !== undefined) data.paymentTerms = input.paymentTerms;
    if (input.leadTimeDays !== undefined) data.leadTimeDays = input.leadTimeDays;
    if (input.warranty !== undefined) data.warranty = input.warranty;

    const updated = await tx.vendorQuote.update({
      where: { id: input.quoteId },
      data,
      include: { lines: true },
    });

    // Recompute cheapest flags (only for requisition-linked quotes)
    if (quote.requisitionId) await recomputeCheapestFlags(tx, quote.requisitionId);

    await logAction(tx, {
      userId: input.userId,
      action: "VENDOR_QUOTE_UPDATE",
      entityType: "VendorQuote",
      entityId: input.quoteId,
      before: { landedTotal: quote.landedTotal.toString() },
      after: { landedTotal: updated.landedTotal.toString() },
    });
    return updated;
  });
}

export async function deleteVendorQuote(quoteId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.vendorQuote.findUnique({ where: { id: quoteId } });
    if (!quote) throw new ServiceError("Quote not found", 404);
    if (quote.status === "SELECTED") throw new ServiceError("Cannot delete the selected (winning) quote");

    await tx.vendorQuoteLine.deleteMany({ where: { vendorQuoteId: quoteId } });
    await tx.vendorQuote.delete({ where: { id: quoteId } });

    // Recompute cheapest flags for the remaining quotes (only for requisition-linked quotes)
    if (quote.requisitionId) await recomputeCheapestFlags(tx, quote.requisitionId);

    await logAction(tx, {
      userId,
      action: "VENDOR_QUOTE_DELETE",
      entityType: "VendorQuote",
      entityId: quoteId,
      before: { requisitionId: quote.requisitionId, supplierId: quote.supplierId },
    });
    return { ok: true };
  });
}

export interface SelectWinnerInput {
  quoteId: string;
  selectedById?: string;
  selectionReason?: string;
}

/**
 * Select the winning quote. Sets its status to SELECTED, all others to REJECTED,
 * and locks quotes on the requisition (quotesLockedAt).
 * The approver may override the cheapest recommendation — the selectionReason
 * captures why (e.g. "closer delivery", "better payment terms").
 */
export async function selectWinningQuote(input: SelectWinnerInput) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.vendorQuote.findUnique({
      where: { id: input.quoteId },
      include: { requisition: true },
    });
    if (!quote) throw new ServiceError("Quote not found", 404);
    if (quote.status === "SELECTED") throw new ServiceError("This quote is already selected");
    if (!quote.requisitionId || !quote.requisition) {
      throw new ServiceError("This quote is not linked to a requisition");
    }
    if (quote.requisition.status === "CONVERTED") {
      throw new ServiceError("Cannot select a quote for an already-converted requisition");
    }

    // Mark all other quotes for this requisition as REJECTED (including any
    // previously SELECTED quote), then select this one.
    await tx.vendorQuote.updateMany({
      where: {
        requisitionId: quote.requisitionId,
        status: { in: ["PENDING", "SELECTED"] },
        id: { not: input.quoteId },
      },
      data: { status: "REJECTED" },
    });
    const updated = await tx.vendorQuote.update({
      where: { id: input.quoteId },
      data: {
        status: "SELECTED",
        selectedById: input.selectedById,
        selectedAt: new Date(),
        selectionReason: input.selectionReason,
      },
    });

    // Lock quotes on the requisition
    await tx.materialRequisition.update({
      where: { id: quote.requisitionId },
      data: { quotesLockedAt: new Date() },
    });

    await logAction(tx, {
      userId: input.selectedById,
      action: "VENDOR_QUOTE_SELECT",
      entityType: "VendorQuote",
      entityId: input.quoteId,
      after: {
        requisitionId: quote.requisitionId ?? undefined,
        supplierId: quote.supplierId,
        landedTotal: updated.landedTotal.toString(),
        selectionReason: input.selectionReason ?? null,
      },
    });
    return updated;
  });
}

export interface WaiveQuotesInput {
  requisitionId: string;
  waivedById?: string;
  reason: string;
}

/**
 * Waive the min-quotes requirement for a requisition. Requires a reason
 * (e.g. "emergency buy", "single-source item"). Only an approver (po.approve)
 * should call this — enforced at the API layer.
 */
export async function waiveQuoteRequirement(input: WaiveQuotesInput) {
  if (!input.reason?.trim()) throw new ServiceError("A waiver reason is required");

  return prisma.$transaction(async (tx) => {
    const req = await tx.materialRequisition.findUnique({ where: { id: input.requisitionId } });
    if (!req) throw new ServiceError("Requisition not found", 404);
    if (req.status === "CONVERTED") throw new ServiceError("Cannot waive quotes on a converted requisition");

    const updated = await tx.materialRequisition.update({
      where: { id: input.requisitionId },
      data: {
        quotesWaived: true,
        quotesWaivedById: input.waivedById,
        quotesWaivedReason: input.reason,
        quotesWaivedAt: new Date(),
      },
    });

    await logAction(tx, {
      userId: input.waivedById,
      action: "QUOTE_REQUIREMENT_WAIVED",
      entityType: "MaterialRequisition",
      entityId: input.requisitionId,
      after: { reason: input.reason },
    });
    return updated;
  });
}

/**
 * Get the full comparative statement for a requisition: all quotes with
 * their lines, cheapest flag, variance vs cheapest, and gate status.
 */
export async function getComparativeStatement(requisitionId: string) {
  const req = await prisma.materialRequisition.findUnique({
    where: { id: requisitionId },
    select: {
      id: true,
      reqNumber: true,
      status: true,
      minQuotesRequired: true,
      quotesWaived: true,
      quotesWaivedReason: true,
      quotesLockedAt: true,
    },
  });
  if (!req) throw new ServiceError("Requisition not found", 404);

  const quotes = await prisma.vendorQuote.findMany({
    where: { requisitionId },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true } } },
      },
      submittedBy: { select: { id: true, name: true } },
      selectedBy: { select: { id: true, name: true } },
    },
    orderBy: { landedTotal: "asc" },
  });

  const totals: QuoteTotal[] = quotes.map((q) => ({
    id: q.id,
    landedTotal: new Decimal(q.landedTotal),
    status: q.status,
  }));
  const cheapestId = cheapestQuoteId(totals);
  const variances = quoteVariances(totals);
  const nonRejectedCount = quotes.filter((q) => q.status !== "REJECTED").length;
  const gateSatisfied = isQuoteGateSatisfied(nonRejectedCount, req.minQuotesRequired, req.quotesWaived);
  const selectedQuote = quotes.find((q) => q.status === "SELECTED") ?? null;

  return {
    requisition: req,
    quotes: quotes.map((q) => ({
      ...q,
      isCheapest: q.id === cheapestId,
      varianceVsCheapest: variances.get(q.id)?.toNumber() ?? 0,
    })),
    cheapestQuoteId: cheapestId,
    selectedQuoteId: selectedQuote?.id ?? null,
    nonRejectedCount,
    gateSatisfied,
  };
}

/**
 * Get the winning quote's line costs for a requisition (used by
 * convertRequisitionToPo to auto-fill lineCosts).
 * Returns null if no winning quote is selected.
 */
export async function getWinningQuoteLineCosts(requisitionId: string): Promise<Record<string, Decimal> | null> {
  const winner = await prisma.vendorQuote.findFirst({
    where: { requisitionId, status: "SELECTED" },
    include: { lines: true },
  });
  if (!winner) return null;
  return winningLineCosts(winner.lines.map((l) => ({ materialId: l.materialId, unitPrice: new Decimal(l.unitPrice) })));
}

// ── Internal helper: recompute isCheapest flags ──

async function recomputeCheapestFlags(tx: Prisma.TransactionClient, requisitionId: string) {
  const quotes = await tx.vendorQuote.findMany({
    where: { requisitionId, status: { not: "REJECTED" } },
    select: { id: true, landedTotal: true },
  });
  const totals: QuoteTotal[] = quotes.map((q) => ({
    id: q.id,
    landedTotal: new Decimal(q.landedTotal),
    status: "PENDING",
  }));
  const cheapestId = cheapestQuoteId(totals);

  // Clear all flags, then set the cheapest
  await tx.vendorQuote.updateMany({
    where: { requisitionId },
    data: { isCheapest: false },
  });
  if (cheapestId) {
    await tx.vendorQuote.update({
      where: { id: cheapestId },
      data: { isCheapest: true },
    });
  }
}

// ── Purchaser Performance Report ──────────────────────────

export interface PurchaserPerformanceRow {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  quotesUploaded: number;
  requisitionsHandled: number;
  cheapestSelected: number;
  totalSpend: Decimal;
  potentialSavings: Decimal;
  avgQuotesPerRequisition: number;
  cheapestSelectionRate: number;
}

/**
 * Compute purchaser performance metrics for a company in a date range.
 *
 * Metrics per purchaser (the user who uploaded the quotes):
 * - quotesUploaded: total number of VendorQuote rows created by this user
 * - requisitionsHandled: distinct requisitions for which this user uploaded ≥1 quote
 * - cheapestSelected: how often the cheapest quote (among the ones they uploaded)
 *   was the one ultimately selected as the winner
 * - totalSpend: sum of landedTotal of the SELECTED quotes on requisitions they handled
 * - potentialSavings: sum of (max quote − selected quote) per requisition they handled
 *   — i.e. how much was saved by picking the best quote vs the worst
 * - avgQuotesPerRequisition: quotesUploaded / requisitionsHandled
 * - cheapestSelectionRate: cheapestSelected / totalSelected (where they had a winner)
 */
type QuoteWithRelations = Prisma.VendorQuoteGetPayload<{
  include: {
    submittedBy: { select: { id: true; name: true; email: true; role: true } };
    requisition: { select: { id: true; quotesWaived: true } };
  };
}>;

export async function getPurchaserPerformance(
  companyId: string,
  dateRange?: { from?: Date; to?: Date },
): Promise<PurchaserPerformanceRow[]> {
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (dateRange?.from) dateFilter.gte = dateRange.from;
  if (dateRange?.to) dateFilter.lte = dateRange.to;

  // Fetch all quotes in the company within the date range, with the requisition's project
  const quotes: QuoteWithRelations[] = await prisma.vendorQuote.findMany({
    where: {
      createdAt: dateFilter,
      requisition: { project: { companyId } },
    },
    include: {
      submittedBy: { select: { id: true, name: true, email: true, role: true } },
      requisition: {
        select: {
          id: true,
          quotesWaived: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Group by submittedById
  const byUser = new Map<string, {
    user: { id: string; name: string; email: string; role: string };
    quotesUploaded: number;
    requisitionIds: Set<string>;
    cheapestSelected: number;
    selectedCount: number;
    totalSpend: Decimal;
    potentialSavings: Decimal;
  }>();

  // Also group quotes by requisition to compute potential savings
  // (skip standalone quotation-request quotes that have no requisition)
  const quotesByRequisition = new Map<string, typeof quotes>();
  for (const q of quotes) {
    if (!q.requisitionId) continue;
    const arr = quotesByRequisition.get(q.requisitionId) ?? [];
    arr.push(q);
    quotesByRequisition.set(q.requisitionId, arr);
  }

  // Compute potential savings per requisition (max - selected, only if a winner exists)
  const requisitionSavings = new Map<string, Decimal>();
  const requisitionSpend = new Map<string, Decimal>();
  for (const [reqId, reqQuotes] of quotesByRequisition) {
    const eligible = reqQuotes.filter((q) => q.status !== "REJECTED");
    if (eligible.length < 2) continue;
    const totals = eligible.map((q) => new Decimal(q.landedTotal));
    const maxTotal = Decimal.max(...totals);
    const minTotal = Decimal.min(...totals);
    const selected = reqQuotes.find((q) => q.status === "SELECTED");
    if (selected) {
      const selectedTotal = new Decimal(selected.landedTotal);
      requisitionSavings.set(reqId, maxTotal.minus(selectedTotal));
      requisitionSpend.set(reqId, selectedTotal);
    } else {
      // No winner yet — potential savings if cheapest is picked
      requisitionSavings.set(reqId, maxTotal.minus(minTotal));
    }
  }

  for (const q of quotes) {
    if (!q.submittedBy) continue; // skip quotes with no submitter (legacy)
    const userId = q.submittedBy.id;
    let entry = byUser.get(userId);
    if (!entry) {
      entry = {
        user: {
          id: q.submittedBy.id,
          name: q.submittedBy.name,
          email: q.submittedBy.email,
          role: q.submittedBy.role,
        },
        quotesUploaded: 0,
        requisitionIds: new Set(),
        cheapestSelected: 0,
        selectedCount: 0,
        totalSpend: new Decimal(0),
        potentialSavings: new Decimal(0),
      };
      byUser.set(userId, entry);
    }
    entry.quotesUploaded++;
    if (q.requisitionId) entry.requisitionIds.add(q.requisitionId);

    // Check if this quote was the cheapest AND was selected
    if (q.status === "SELECTED") {
      entry.selectedCount++;
      if (q.isCheapest) entry.cheapestSelected++;
    }
  }

  // Allocate spend and savings to each user who handled a requisition
  for (const [reqId, reqQuotes] of quotesByRequisition) {
    const spend = requisitionSpend.get(reqId);
    const savings = requisitionSavings.get(reqId);
    if (!spend && !savings) continue;
    // Allocate to each user who uploaded a quote for this requisition
    const usersForReq = new Set(reqQuotes.filter((q) => q.submittedBy).map((q) => q.submittedBy!.id));
    for (const userId of usersForReq) {
      const entry = byUser.get(userId);
      if (!entry) continue;
      if (spend) entry.totalSpend = entry.totalSpend.plus(spend);
      if (savings) entry.potentialSavings = entry.potentialSavings.plus(savings);
    }
  }

  const rows: PurchaserPerformanceRow[] = [];
  for (const [userId, entry] of byUser) {
    const requisitionsHandled = entry.requisitionIds.size;
    rows.push({
      userId,
      userName: entry.user.name,
      userEmail: entry.user.email,
      role: entry.user.role,
      quotesUploaded: entry.quotesUploaded,
      requisitionsHandled,
      cheapestSelected: entry.cheapestSelected,
      totalSpend: entry.totalSpend,
      potentialSavings: entry.potentialSavings,
      avgQuotesPerRequisition: requisitionsHandled > 0 ? entry.quotesUploaded / requisitionsHandled : 0,
      cheapestSelectionRate: entry.selectedCount > 0 ? entry.cheapestSelected / entry.selectedCount : 0,
    });
  }

  // Sort by quotesUploaded desc
  rows.sort((a, b) => b.quotesUploaded - a.quotesUploaded);
  return rows;
}
