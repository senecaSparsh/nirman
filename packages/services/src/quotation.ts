import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";
import { createPurchaseOrderTx } from "./procurement";

/**
 * Standalone Quotation Request — an employee asks for prices on a bundle
 * of materials, then uploads/fills quotes from multiple suppliers against
 * it. The comparative analysis (per-piece landed cost across suppliers)
 * lives on the request itself.
 *
 * Approval is done by the submitter's DIRECT REPORTING MANAGER (one
 * hierarchy level up via UserCompany.reportsToUserCompanyId), not by
 * anyone with a permission flag. This enforces the delegation chain:
 * the person who reports the submitter must approve the spend.
 */

// ── Pure helpers ──

export interface LineLandedCostInput {
  unitPrice: Decimal | number | string;
  gstRate: Decimal | number | string;
  qty: Decimal | number | string;
  discountPerUnit?: Decimal | number | string;
  packingPerUnit?: Decimal | number | string;
  freightPerUnit?: Decimal | number | string;
  loadingPerUnit?: Decimal | number | string;
  insurancePerUnit?: Decimal | number | string;
  handlingPerUnit?: Decimal | number | string;
  buyerTransportPerUnit?: Decimal | number | string;
}

export interface LineLandedCostResult {
  unitPrice: Decimal;
  gstRate: Decimal;
  qty: Decimal;
  discountPerUnit: Decimal;
  packingPerUnit: Decimal;
  freightPerUnit: Decimal;
  loadingPerUnit: Decimal;
  insurancePerUnit: Decimal;
  handlingPerUnit: Decimal;
  buyerTransportPerUnit: Decimal;
  taxableValuePerUnit: Decimal; // unitPrice − discount + packing
  gstAmount: Decimal; // qty × taxableValuePerUnit × gstRate / 100
  unitLandedCost: Decimal; // taxableValuePerUnit + gst/unit + freight + buyerTransport + loading + insurance + handling
  taxableValue: Decimal; // taxableValuePerUnit × qty
  lineSubtotal: Decimal; // qty × unitPrice (ex-everything)
  lineTotal: Decimal; // qty × unitLandedCost (full landed)
}

/**
 * Compute the per-piece landed cost for a single quote line.
 *
 * Full real-world landed cost (per Indian Comparative Statement format):
 *   taxableValuePerUnit = unitPrice − discountPerUnit + packingPerUnit
 *   gstPerUnit          = taxableValuePerUnit × gstRate / 100
 *   unitLandedCost      = taxableValuePerUnit + gstPerUnit + freightPerUnit
 *                         + buyerTransportPerUnit + loadingPerUnit
 *                         + insurancePerUnit + handlingPerUnit
 *   lineTotal           = qty × unitLandedCost
 *
 * buyerTransportPerUnit is the buyer's own estimated transport cost when the
 * quote is ex-works or FOR-station (buyer arranges pickup). This normalizes
 * quotes on different delivery bases for fair comparison.
 *
 * GST is computed on the taxable value (post-discount, pre-freight), per
 * Indian GST rules. Freight, loading, insurance are added on top (they may
 * carry their own GST separately under reverse charge, but for simplicity
 * we treat them as inclusive).
 */
export function computeLineLandedCost(input: LineLandedCostInput): LineLandedCostResult {
  const unitPrice = new Decimal(input.unitPrice);
  const gstRate = new Decimal(input.gstRate);
  const qty = new Decimal(input.qty);
  const discountPerUnit = new Decimal(input.discountPerUnit ?? 0);
  const packingPerUnit = new Decimal(input.packingPerUnit ?? 0);
  const freightPerUnit = new Decimal(input.freightPerUnit ?? 0);
  const loadingPerUnit = new Decimal(input.loadingPerUnit ?? 0);
  const insurancePerUnit = new Decimal(input.insurancePerUnit ?? 0);
  const handlingPerUnit = new Decimal(input.handlingPerUnit ?? 0);
  const buyerTransportPerUnit = new Decimal(input.buyerTransportPerUnit ?? 0);

  const taxableValuePerUnit = unitPrice.minus(discountPerUnit).plus(packingPerUnit);
  const gstPerUnit = taxableValuePerUnit.times(gstRate).div(100);
  const unitLandedCost = taxableValuePerUnit
    .plus(gstPerUnit)
    .plus(freightPerUnit)
    .plus(buyerTransportPerUnit)
    .plus(loadingPerUnit)
    .plus(insurancePerUnit)
    .plus(handlingPerUnit);
  const gstAmount = gstPerUnit.times(qty);
  const taxableValue = taxableValuePerUnit.times(qty);
  const lineSubtotal = unitPrice.times(qty);
  const lineTotal = unitLandedCost.times(qty);

  return {
    unitPrice,
    gstRate,
    qty,
    discountPerUnit,
    packingPerUnit,
    freightPerUnit,
    loadingPerUnit,
    insurancePerUnit,
    handlingPerUnit,
    buyerTransportPerUnit,
    taxableValuePerUnit,
    gstAmount,
    unitLandedCost,
    taxableValue,
    lineSubtotal,
    lineTotal,
  };
}

export interface QuoteTotalsResult {
  subtotal: Decimal;
  gstTotal: Decimal;
  freightTotal: Decimal;
  handlingTotal: Decimal;
  discountTotal: Decimal;
  packingTotal: Decimal;
  loadingTotal: Decimal;
  insuranceTotal: Decimal;
  buyerTransportTotal: Decimal;
  landedTotal: Decimal;
}

/**
 * Compute the header totals from a list of computed line results.
 */
export function computeQuoteTotals(lines: LineLandedCostResult[]): QuoteTotalsResult {
  let subtotal = new Decimal(0);
  let gstTotal = new Decimal(0);
  let freightTotal = new Decimal(0);
  let handlingTotal = new Decimal(0);
  let discountTotal = new Decimal(0);
  let packingTotal = new Decimal(0);
  let loadingTotal = new Decimal(0);
  let insuranceTotal = new Decimal(0);
  let buyerTransportTotal = new Decimal(0);
  let landedTotal = new Decimal(0);

  for (const l of lines) {
    subtotal = subtotal.plus(l.lineSubtotal);
    gstTotal = gstTotal.plus(l.gstAmount);
    freightTotal = freightTotal.plus(l.freightPerUnit.times(l.qty));
    handlingTotal = handlingTotal.plus(l.handlingPerUnit.times(l.qty));
    discountTotal = discountTotal.plus(l.discountPerUnit.times(l.qty));
    packingTotal = packingTotal.plus(l.packingPerUnit.times(l.qty));
    loadingTotal = loadingTotal.plus(l.loadingPerUnit.times(l.qty));
    insuranceTotal = insuranceTotal.plus(l.insurancePerUnit.times(l.qty));
    buyerTransportTotal = buyerTransportTotal.plus(l.buyerTransportPerUnit.times(l.qty));
    landedTotal = landedTotal.plus(l.lineTotal);
  }

  return { subtotal, gstTotal, freightTotal, handlingTotal, discountTotal, packingTotal, loadingTotal, insuranceTotal, buyerTransportTotal, landedTotal };
}

// ── Request number generator ──

function generateRequestNumber(date = new Date()): string {
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `QR-${yy}${mm}${dd}-${rand}`;
}

// ── Service functions ──

export interface CreateQuotationRequestInput {
  companyId: string;
  projectId?: string | null;
  title: string;
  notes?: string;
  minQuotesRequired?: number;
  requiredByDate?: Date | null;
  workActivity?: string;
  destinationLocationId?: string | null;
  submittedById: string;
  submittedByUserCompanyId: string;
  lines: {
    materialId: string;
    qtyRequired: Decimal | number | string;
  }[];
}

/**
 * Create a standalone quotation request. Snapshots HSN + GST from each
 * material at creation time so the request keeps its original tax basis.
 */
export async function createQuotationRequest(input: CreateQuotationRequestInput) {
  if (!input.title.trim()) throw new ServiceError("Title is required");
  if (input.lines.length === 0) throw new ServiceError("At least one material line is required");
  if (!input.requiredByDate) throw new ServiceError("Required-by date is mandatory — procurement must be tied to the site schedule");
  if (!input.destinationLocationId) throw new ServiceError("Destination location is mandatory — pick where the material should be delivered");

  // ── Validate destination location is in the company GROUP ──
  // The location can be in the current company, its parent, or its children.
  // The PO will be created in the location's company, so stock lives there.
  const destLocation = await prisma.stockLocation.findFirst({
    where: { id: input.destinationLocationId, deletedAt: null },
    select: { id: true, companyId: true, type: true, projectId: true, name: true },
  });
  if (!destLocation) throw new ServiceError("Destination location not found or deleted", 404);

  // Build the company group: self + parent + siblings + children.
  const groupCompanyIds = new Set<string>([input.companyId]);
  const currentCompany = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, parentCompanyId: true },
  });
  if (currentCompany?.parentCompanyId) {
    groupCompanyIds.add(currentCompany.parentCompanyId);
    const siblings = await prisma.company.findMany({
      where: { parentCompanyId: currentCompany.parentCompanyId, deletedAt: null, id: { not: input.companyId } },
      select: { id: true },
    });
    siblings.forEach((s) => groupCompanyIds.add(s.id));
  }
  const children = await prisma.company.findMany({
    where: { parentCompanyId: input.companyId, deletedAt: null },
    select: { id: true },
  });
  children.forEach((c) => groupCompanyIds.add(c.id));

  if (!groupCompanyIds.has(destLocation.companyId)) {
    throw new ServiceError(
      "Destination location must be in the same company group (current company, parent, or subsidiaries)",
      403,
    );
  }

  // Validate materials exist and belong to the company (via category — materials
  // don't have a companyId, but they're shared across the company group).
  const materialIds = input.lines.map((l) => l.materialId);
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds }, deletedAt: null },
    select: { id: true, hsnCode: true, gstRate: true, name: true },
  });
  if (materials.length !== materialIds.length) {
    const found = new Set(materials.map((m) => m.id));
    const missing = materialIds.filter((id) => !found.has(id));
    throw new ServiceError(`Material(s) not found or deleted: ${missing.join(", ")}`, 404);
  }
  const materialMap = new Map(materials.map((m) => [m.id, m]));

  // Validate project belongs to the company if provided.
  if (input.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, companyId: input.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new ServiceError("Project not found or does not belong to this company", 404);
  }

  // Validate submitter's UserCompany membership.
  const membership = await prisma.userCompany.findFirst({
    where: { id: input.submittedByUserCompanyId, companyId: input.companyId },
    select: { id: true },
  });
  if (!membership) throw new ServiceError("Invalid company membership for submitter", 403);

  // Generate a unique request number (retry on collision).
  let requestNumber = generateRequestNumber();
  for (let i = 0; i < 5; i++) {
    const existing = await prisma.quotationRequest.findUnique({
      where: { requestNumber },
      select: { id: true },
    });
    if (!existing) break;
    requestNumber = generateRequestNumber();
  }

  return prisma.$transaction(async (tx) => {
    const request = await tx.quotationRequest.create({
      data: {
        requestNumber,
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        title: input.title.trim(),
        notes: input.notes?.trim() || null,
        minQuotesRequired: input.minQuotesRequired ?? 3,
        requiredByDate: input.requiredByDate ?? null,
        workActivity: input.workActivity?.trim() || null,
        destinationLocationId: input.destinationLocationId,
        submittedById: input.submittedById,
        submittedByUserCompanyId: input.submittedByUserCompanyId,
        status: "OPEN",
        lines: {
          create: input.lines.map((l) => {
            const mat = materialMap.get(l.materialId)!;
            return {
              materialId: l.materialId,
              qtyRequired: new Decimal(l.qtyRequired),
              hsnCode: mat.hsnCode,
              gstRate: mat.gstRate,
            };
          }),
        },
      },
      include: {
        lines: { include: { material: { select: { id: true, code: true, name: true, unit: true } } } },
      },
    });

    await logAction(tx, {
      userId: input.submittedById,
      companyId: input.companyId,
      action: "QUOTATION_REQUEST_CREATE",
      entityType: "QuotationRequest",
      entityId: request.id,
      after: {
        requestNumber: request.requestNumber,
        title: request.title,
        lineCount: input.lines.length,
        projectId: input.projectId ?? null,
      },
    });

    return request;
  });
}

export interface AddQuoteToRequestInput {
  quotationRequestId: string;
  supplierId: string;
  fileUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  quoteSource?: string; // DOCUMENT | EMAIL | VERBAL | WHATSAPP | LETTER | EXCEL
  sourceNote?: string;
  validUntil?: Date | null;
  notes?: string;
  submittedById?: string;
  // ── Commercial terms (per the real-world Comparative Statement format) ──
  paymentTerms?: string;
  deliveryTerms?: string; // legacy free-text
  deliveryTermsType?: "DELIVERED_SITE" | "EX_WORKS" | "FOR_STATION" | "CUSTOM";
  leadTimeDays?: number;
  warranty?: string;
  lines: {
    materialId: string;
    qty: Decimal | number | string;
    unitPrice: Decimal | number | string;
    discountPerUnit?: Decimal | number | string;
    packingPerUnit?: Decimal | number | string;
    freightPerUnit?: Decimal | number | string;
    loadingPerUnit?: Decimal | number | string;
    insurancePerUnit?: Decimal | number | string;
    handlingPerUnit?: Decimal | number | string;
    buyerTransportPerUnit?: Decimal | number | string;
  }[];
}

/**
 * Add a vendor quote to a standalone quotation request. Auto-fills HSN +
 * GST from the request line (which snapshotted from the material), then
 * computes per-piece landed cost and all totals.
 */
export async function addQuoteToRequest(input: AddQuoteToRequestInput) {
  if (input.lines.length === 0) throw new ServiceError("Quote must have at least one line");
  // ── Mandatory commercial terms (real-world CS requires these for like-for-like comparison) ──
  if (!input.validUntil) throw new ServiceError("Quote validity date is mandatory — expired quotes are invalid");
  if (!input.paymentTerms?.trim()) throw new ServiceError("Payment terms are mandatory (e.g. '30 days credit', 'advance')");
  if (!input.deliveryTerms?.trim()) throw new ServiceError("Delivery terms are mandatory (e.g. 'FOR site', 'ex-works', 'freight extra')");
  if (input.leadTimeDays === undefined || input.leadTimeDays === null) throw new ServiceError("Lead time in days is mandatory — drives delivery planning");

  // ── File is required for document-based sources, optional for verbal/email ──
  const source = (input.quoteSource ?? "DOCUMENT").toUpperCase();
  const needsFile = ["DOCUMENT", "LETTER", "EXCEL"].includes(source);
  if (needsFile && !input.fileUrl) {
    throw new ServiceError("Quote file is required for DOCUMENT/LETTER/EXCEL sources. Use VERBAL or EMAIL source for quotes without a file.");
  }
  // For non-document sources, a sourceNote is mandatory (explains where the quote came from).
  if (!needsFile && !input.sourceNote?.trim()) {
    throw new ServiceError(`A source note is required for ${source} quotes (e.g. "Verbal quote from Ramesh on 15-Aug over phone")`);
  }
  // ── Conditional: if ex-works or FOR-station, buyer transport must be entered (not 0) ──
  // This prevents hidden transport cost — without it, ex-works quotes look artificially
  // cheaper than delivered quotes because the buyer's own transport isn't factored in.
  // Check both the deliveryTermsType enum AND the deliveryTerms text for backward compat.
  const isExWorksOrFor =
    input.deliveryTermsType === "EX_WORKS" ||
    input.deliveryTermsType === "FOR_STATION" ||
    /ex[\s-]?works/i.test(input.deliveryTerms ?? "") ||
    /\bfor\b/i.test(input.deliveryTerms ?? "");
  if (isExWorksOrFor) {
    for (const line of input.lines) {
      const buyerTransport = new Decimal(line.buyerTransportPerUnit ?? 0);
      if (buyerTransport.lte(0)) {
        throw new ServiceError(
          `Buyer transport is mandatory for ex-works/FOR quotes — enter estimated transport per unit`,
          400,
        );
      }
    }
  }

  const request = await prisma.quotationRequest.findUnique({
    where: { id: input.quotationRequestId },
    include: {
      lines: true,
      company: { select: { id: true } },
    },
  });
  if (!request) throw new ServiceError("Quotation request not found", 404);
  if (request.status === "APPROVED") throw new ServiceError("Cannot add quotes to an approved request");
  if (request.status === "CLOSED" || request.status === "CANCELLED") {
    throw new ServiceError("Cannot add quotes to a closed/cancelled request");
  }

  // Validate supplier belongs to the same company.
  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, companyId: request.companyId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!supplier) throw new ServiceError("Supplier not found or deleted", 404);

  // Build a map of request lines for HSN/GST lookup.
  const reqLineMap = new Map(request.lines.map((l) => [l.materialId, l]));

  // Validate all quote line materials exist in the request.
  for (const line of input.lines) {
    if (!reqLineMap.has(line.materialId)) {
      throw new ServiceError(`Material ${line.materialId} is not in this quotation request`);
    }
    if (!new Decimal(line.qty).gt(0)) throw new ServiceError("Quote line qty must be > 0");
    if (new Decimal(line.unitPrice).lt(0)) throw new ServiceError("Quote line unit price must be ≥ 0");
  }

  return prisma.$transaction(async (tx) => {
    // Compute all line landed costs.
    const computedLines = input.lines.map((l) => {
      const reqLine = reqLineMap.get(l.materialId)!;
      const computed = computeLineLandedCost({
        unitPrice: l.unitPrice,
        gstRate: reqLine.gstRate,
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
        hsnCode: reqLine.hsnCode,
        ...computed,
      };
    });

    const totals = computeQuoteTotals(computedLines);

    const quote = await tx.vendorQuote.create({
      data: {
        requisitionId: null, // standalone — no requisition
        quotationRequestId: input.quotationRequestId,
        supplierId: input.supplierId,
        fileUrl: input.fileUrl ?? null,
        fileName: input.fileName ?? null,
        mimeType: input.mimeType ?? null,
        quoteSource: (input.quoteSource ?? "DOCUMENT") as "DOCUMENT" | "EMAIL" | "VERBAL" | "WHATSAPP" | "LETTER" | "EXCEL",
        sourceNote: input.sourceNote?.trim() || null,
        landedTotal: totals.landedTotal,
        subtotal: totals.subtotal,
        gstTotal: totals.gstTotal,
        freightTotal: totals.freightTotal,
        handlingTotal: totals.handlingTotal,
        discountTotal: totals.discountTotal,
        packingTotal: totals.packingTotal,
        loadingTotal: totals.loadingTotal,
        insuranceTotal: totals.insuranceTotal,
        buyerTransportTotal: totals.buyerTransportTotal,
        validUntil: input.validUntil ?? null,
        paymentTerms: input.paymentTerms?.trim() || null,
        deliveryTermsType: (input.deliveryTermsType ?? "DELIVERED_SITE") as "DELIVERED_SITE" | "EX_WORKS" | "FOR_STATION" | "CUSTOM",
        deliveryTerms: input.deliveryTerms?.trim() || null,
        leadTimeDays: input.leadTimeDays ?? null,
        warranty: input.warranty?.trim() || null,
        notes: input.notes?.trim() || null,
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
      include: {
        lines: true,
        supplier: { select: { id: true, name: true, phone: true, gstin: true } },
      },
    });

    // Recompute cheapest flags across all quotes for this request.
    await recomputeCheapestFlagsForRequest(tx, input.quotationRequestId);

    // Update request status to QUOTES_COLLECTED if min met.
    const nonRejectedCount = await tx.vendorQuote.count({
      where: { quotationRequestId: input.quotationRequestId, status: { not: "REJECTED" } },
    });
    if (nonRejectedCount >= request.minQuotesRequired && request.status === "OPEN") {
      await tx.quotationRequest.update({
        where: { id: input.quotationRequestId },
        data: { status: "QUOTES_COLLECTED" },
      });
    }

    await logAction(tx, {
      userId: input.submittedById,
      companyId: request.companyId,
      action: "QUOTATION_ADD_QUOTE",
      entityType: "VendorQuote",
      entityId: quote.id,
      after: {
        quotationRequestId: input.quotationRequestId,
        supplierId: input.supplierId,
        supplierName: supplier.name,
        landedTotal: totals.landedTotal.toString(),
        lineCount: computedLines.length,
      },
    });

    return quote;
  });
}

export interface ApproveQuotationInput {
  quotationRequestId: string;
  approverUserCompanyId: string;
  approverUserId: string;
  selectedQuoteId: string;
  reason?: string;
}

/**
 * Approve a quotation request and select the winning quote.
 *
 * ENFORCEMENT: only the submitter's DIRECT REPORTING MANAGER (one level
 * up via UserCompany.reportsToUserCompanyId) can approve. Not a permission
 * flag, not any OWNER/ADMIN — the specific person set as the submitter's
 * reportsTo in the company hierarchy.
 *
 * If the selected quote is NOT the cheapest, a reason is mandatory.
 */
export async function approveQuotation(input: ApproveQuotationInput) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.quotationRequest.findUnique({
      where: { id: input.quotationRequestId },
      include: {
        lines: true,
        quotes: {
          where: { status: { not: "REJECTED" } },
          select: { id: true, landedTotal: true, status: true, supplierId: true },
        },
      },
    });
    if (!request) throw new ServiceError("Quotation request not found", 404);
    if (request.status === "APPROVED") throw new ServiceError("This request is already approved");
    if (request.status === "CLOSED" || request.status === "CANCELLED") {
      throw new ServiceError("Cannot approve a closed/cancelled request");
    }

    // ── HIERARCHY CHECK: approver must be the submitter's direct manager ──
    const submitterMembership = await tx.userCompany.findUnique({
      where: { id: request.submittedByUserCompanyId },
      select: { reportsToUserCompanyId: true, userId: true },
    });
    if (!submitterMembership) {
      throw new ServiceError("Submitter's company membership not found", 403);
    }

    // If the submitter is the top of the chain (no reportsTo), they self-approve.
    // This covers the OWNER case — the owner's quotations don't need a manager.
    if (submitterMembership.reportsToUserCompanyId === null) {
      // Only the submitter themselves can self-approve.
      if (input.approverUserId !== submitterMembership.userId) {
        throw new ServiceError("Only the submitter can self-approve (top of reporting chain)", 403);
      }
    } else {
      // The approver must be exactly the submitter's reportsTo.
      if (input.approverUserCompanyId !== submitterMembership.reportsToUserCompanyId) {
        throw new ServiceError(
          "Only your direct reporting manager can approve this quotation request",
          403,
        );
      }
    }

    // ── Validate the selected quote belongs to this request ──
    const selectedQuote = request.quotes.find((q) => q.id === input.selectedQuoteId);
    if (!selectedQuote) {
      throw new ServiceError("Selected quote not found in this request", 404);
    }

    // ── Find the cheapest quote ──
    const cheapestId = cheapestQuoteForRequest(request.quotes);

    // ── If not cheapest, reason is mandatory ──
    if (cheapestId && input.selectedQuoteId !== cheapestId) {
      if (!input.reason?.trim()) {
        throw new ServiceError(
          "A reason is required when selecting a quote that is not the cheapest",
          400,
        );
      }
    }

    // ── Mark all other quotes as REJECTED, select the winner ──
    await tx.vendorQuote.updateMany({
      where: {
        quotationRequestId: input.quotationRequestId,
        status: { in: ["PENDING", "SELECTED"] },
        id: { not: input.selectedQuoteId },
      },
      data: { status: "REJECTED" },
    });
    await tx.vendorQuote.update({
      where: { id: input.selectedQuoteId },
      data: {
        status: "SELECTED",
        selectedById: input.approverUserId,
        selectedAt: new Date(),
        selectionReason: input.reason?.trim() || null,
      },
    });

    // ── Auto-create a DRAFT purchase order from the winning quote ──
    // Approval of the quotation IS the decision to buy. The PO appears on
    // the purchase-order list immediately — no separate "create PO" page.
    //
    // The PO is created in the COMPANY THAT OWNS THE DESTINATION LOCATION
    // (not necessarily the quotation request's company). This is because:
    //   - Stock lives at the location, which belongs to a specific company
    //   - The PO is a financial commitment in that company's books
    //   - The GRN adds stock to that company's location
    //
    // If the destination is in a different company (parent/child), the
    // winning supplier must exist there. If not, auto-create a copy.
    const winningQuote = await tx.vendorQuote.findUnique({
      where: { id: input.selectedQuoteId },
      include: { lines: true, supplier: true },
    });
    if (!winningQuote) throw new ServiceError("Winning quote not found", 404);

    // Resolve the destination location (user-chosen at creation time).
    const destLocation = await tx.stockLocation.findUnique({
      where: { id: request.destinationLocationId ?? "" },
      select: { id: true, companyId: true, type: true, projectId: true, name: true },
    });
    if (!destLocation) {
      throw new ServiceError(
        "Destination location not found — it may have been deleted. Update the quotation request.",
        404,
      );
    }

    const poCompanyId = destLocation.companyId;
    const poScope: "PROJECT" | "COMPANY" = destLocation.type === "PROJECT_SITE" ? "PROJECT" : "COMPANY";
    const poProjectId = poScope === "PROJECT" ? destLocation.projectId ?? undefined : undefined;

    // ── Auto-copy supplier to the PO's company if they don't exist there ──
    let poSupplierId = winningQuote.supplierId;
    if (poCompanyId !== request.companyId) {
      // Check if the supplier already exists in the PO's company (by GSTIN or name).
      const existing = await tx.supplier.findFirst({
        where: {
          companyId: poCompanyId,
          deletedAt: null,
          OR: [
            ...(winningQuote.supplier.gstin ? [{ gstin: winningQuote.supplier.gstin }] : []),
            { name: winningQuote.supplier.name },
          ],
        },
        select: { id: true },
      });
      if (existing) {
        poSupplierId = existing.id;
      } else {
        // Auto-create a copy of the supplier in the PO's company.
        const copied = await tx.supplier.create({
          data: {
            companyId: poCompanyId,
            name: winningQuote.supplier.name,
            gstin: winningQuote.supplier.gstin ?? null,
            phone: winningQuote.supplier.phone ?? null,
            email: winningQuote.supplier.email ?? null,
            address: winningQuote.supplier.address ?? null,
          },
        });
        poSupplierId = copied.id;
      }
    }

    const po = await createPurchaseOrderTx(tx, {
      supplierId: poSupplierId,
      procurementScope: poScope,
      companyId: poCompanyId,
      projectId: poProjectId,
      destinationLocationId: destLocation.id,
      notes: `Auto-created from quotation ${request.requestNumber}`,
      createdById: input.approverUserId,
      // The quotation approval IS the approval to buy — create the PO as
      // APPROVED (not DRAFT). This skips the separate PO approval step.
      initialStatus: "APPROVED",
      approvedById: input.approverUserId,
      // Carry over per-line landed-cost components from the winning quote
      lines: winningQuote.lines.map((l) => ({
        materialId: l.materialId,
        qtyOrdered: l.qty,
        unitCost: l.unitPrice,
        gstRate: l.gstRate,
        freightPerUnit: l.freightPerUnit,
        loadingPerUnit: l.loadingPerUnit,
        packingPerUnit: l.packingPerUnit,
        insurancePerUnit: l.insurancePerUnit,
        discountPerUnit: l.discountPerUnit,
      })),
      // Carry over header-level charges from the quote as itemized PO charges.
      // We map the quote's charge totals to named headings so they appear as
      // line items on the PO. Buyer transport (for ex-works/FOR quotes) is
      // carried over as a separate "Transport — own arrangement" charge.
      charges: [
        ...(winningQuote.freightTotal && winningQuote.freightTotal.gt(0)
          ? [{ heading: "Freight / Transportation", amount: winningQuote.freightTotal }]
          : []),
        ...(winningQuote.loadingTotal && winningQuote.loadingTotal.gt(0)
          ? [{ heading: "Loading / Unloading", amount: winningQuote.loadingTotal }]
          : []),
        ...(winningQuote.packingTotal && winningQuote.packingTotal.gt(0)
          ? [{ heading: "Packing & Forwarding", amount: winningQuote.packingTotal }]
          : []),
        ...(winningQuote.insuranceTotal && winningQuote.insuranceTotal.gt(0)
          ? [{ heading: "Transit Insurance", amount: winningQuote.insuranceTotal }]
          : []),
        ...(winningQuote.handlingTotal && winningQuote.handlingTotal.gt(0)
          ? [{ heading: "Handling Charges", amount: winningQuote.handlingTotal }]
          : []),
        ...(winningQuote.buyerTransportTotal && winningQuote.buyerTransportTotal.gt(0)
          ? [{ heading: "Transport — own arrangement (ex-works pickup)", amount: winningQuote.buyerTransportTotal }]
          : []),
      ],
    });

    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { selectedQuoteId: winningQuote.id },
    });

    // ── Update the request ──
    const updated = await tx.quotationRequest.update({
      where: { id: input.quotationRequestId },
      data: {
        status: "APPROVED",
        approvedById: input.approverUserId,
        approvedByUserCompanyId: input.approverUserCompanyId,
        approvedAt: new Date(),
        approvalReason: input.reason?.trim() || null,
        selectedQuoteId: input.selectedQuoteId,
        convertedPoId: po.id,
      },
    });

    await logAction(tx, {
      userId: input.approverUserId,
      companyId: request.companyId,
      action: "QUOTATION_REQUEST_APPROVE",
      entityType: "QuotationRequest",
      entityId: input.quotationRequestId,
      after: {
        requestNumber: request.requestNumber,
        selectedQuoteId: input.selectedQuoteId,
        isCheapestOverride: cheapestId !== input.selectedQuoteId,
        reason: input.reason?.trim() || null,
        purchaseOrderId: po.id,
        poNumber: po.poNumber,
      },
    });

    return { ...updated, purchaseOrder: { id: po.id, poNumber: po.poNumber, total: po.total } };
  });
}

/**
 * Get all quotation requests pending approval for a manager (i.e. requests
 * submitted by their direct reports).
 */
export async function getPendingApprovalsForManager(userCompanyId: string) {
  // Find all UserCompany memberships that report to this manager.
  const directReports = await prisma.userCompany.findMany({
    where: { reportsToUserCompanyId: userCompanyId },
    select: { id: true, userId: true, user: { select: { id: true, name: true, email: true } } },
  });
  if (directReports.length === 0) return [];

  const submitterMembershipIds = directReports.map((r) => r.id);

  const requests = await prisma.quotationRequest.findMany({
    where: {
      submittedByUserCompanyId: { in: submitterMembershipIds },
      status: { in: ["OPEN", "QUOTES_COLLECTED"] },
    },
    include: {
      project: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      lines: { select: { id: true, materialId: true, qtyRequired: true } },
      quotes: { select: { id: true, landedTotal: true, status: true, supplierId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return requests.map((r) => {
    const submitter = directReports.find((d) => d.id === r.submittedByUserCompanyId);
    return {
      ...r,
      submittedByName: submitter?.user.name ?? r.submittedBy?.name ?? "—",
    };
  });
}

/**
 * Get the full comparative matrix for a quotation request: per-material ×
 * per-supplier per-piece landed costs, cheapest flags, variances, GST
 * breakdown. This is the data that powers the comparative analysis page.
 */
export async function getComparativeMatrix(quotationRequestId: string) {
  const request = await prisma.quotationRequest.findUnique({
    where: { id: quotationRequestId },
    include: {
      project: { select: { id: true, name: true } },
      destinationLocation: { select: { id: true, name: true, type: true, companyId: true, company: { select: { id: true, name: true } } } },
      submittedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      lines: {
        include: {
          material: { select: { id: true, code: true, name: true, unit: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
      quotes: {
        where: { status: { not: "REJECTED" } },
        include: {
          supplier: { select: { id: true, name: true, phone: true, gstin: true } },
          lines: true,
        },
        orderBy: { landedTotal: "asc" },
      },
      selectedQuote: {
        select: {
          id: true,
          supplierId: true,
          supplier: { select: { id: true, name: true } },
          landedTotal: true,
        },
      },
      convertedPo: { select: { id: true, poNumber: true, status: true, total: true } },
    },
  });
  if (!request) throw new ServiceError("Quotation request not found", 404);

  // Find the cheapest quote.
  const cheapestId = cheapestQuoteForRequest(
    request.quotes.map((q) => ({ id: q.id, landedTotal: q.landedTotal, status: q.status })),
  );

  // Build per-material comparison matrix.
  const materials = request.lines.map((reqLine) => {
    const quotesForMaterial = request.quotes.map((q) => {
      const line = q.lines.find((l) => l.materialId === reqLine.materialId);
      if (!line) return null;
      return {
        quoteId: q.id,
        supplierId: q.supplierId,
        supplierName: q.supplier.name,
        supplierPhone: q.supplier.phone,
        deliveryTermsType: q.deliveryTermsType,
        unitPrice: line.unitPrice.toNumber(),
        gstRate: line.gstRate.toNumber(),
        gstAmount: line.gstAmount.toNumber(),
        discountPerUnit: line.discountPerUnit.toNumber(),
        packingPerUnit: line.packingPerUnit.toNumber(),
        freightPerUnit: line.freightPerUnit.toNumber(),
        loadingPerUnit: line.loadingPerUnit.toNumber(),
        insurancePerUnit: line.insurancePerUnit.toNumber(),
        handlingPerUnit: line.handlingPerUnit.toNumber(),
        buyerTransportPerUnit: line.buyerTransportPerUnit.toNumber(),
        taxableValuePerUnit: line.unitPrice.minus(line.discountPerUnit).plus(line.packingPerUnit).toNumber(),
        unitLandedCost: line.unitLandedCost.toNumber(),
        lineSubtotal: line.lineSubtotal.toNumber(),
        lineTotal: line.lineTotal.toNumber(),
        qty: line.qty.toNumber(),
        isCheapest: false, // will be set below
        isSelected: q.id === request.selectedQuoteId,
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    // Find cheapest per-piece landed cost for this material.
    let cheapestUnitLandedCost = Infinity;
    for (const qfm of quotesForMaterial) {
      if (qfm.unitLandedCost < cheapestUnitLandedCost) {
        cheapestUnitLandedCost = qfm.unitLandedCost;
      }
    }
    for (const qfm of quotesForMaterial) {
      qfm.isCheapest = qfm.unitLandedCost === cheapestUnitLandedCost;
    }

    return {
      materialId: reqLine.materialId,
      materialCode: reqLine.material.code,
      materialName: reqLine.material.name,
      unit: reqLine.material.unit,
      qtyRequired: reqLine.qtyRequired.toNumber(),
      hsnCode: reqLine.hsnCode,
      gstRate: reqLine.gstRate.toNumber(),
      quotes: quotesForMaterial,
      lastRate: null as null | { unitCost: number; poNumber: string; poDate: string; supplierName: string; projectName: string | null },
    };
  });

  // ── Last-rate benchmark: for each material, find the most recent PO line ──
  // This is the strongest fraud control — comparing current quotes against
  // your own last landed rate for the same material catches cartel pricing
  // and rate drift that a 3-quote comparison alone cannot.
  const materialIds = request.lines.map((l) => l.materialId);
  if (materialIds.length > 0) {
    const lastPoLines = await prisma.purchaseOrderLine.findMany({
      where: { materialId: { in: materialIds } },
      include: {
        purchaseOrder: {
          select: {
            poNumber: true,
            orderDate: true,
            status: true,
            supplier: { select: { name: true } },
            project: { select: { name: true } },
          },
        },
      },
      orderBy: { purchaseOrder: { orderDate: "desc" } },
      take: 100,
    });
    const lastRateMap = new Map<string, { unitCost: number; poNumber: string; poDate: string; supplierName: string; projectName: string | null }>();
    for (const pol of lastPoLines) {
      if (lastRateMap.has(pol.materialId)) continue;
      if (pol.purchaseOrder.status === "CANCELLED") continue;
      lastRateMap.set(pol.materialId, {
        unitCost: pol.unitCost.toNumber(),
        poNumber: pol.purchaseOrder.poNumber,
        poDate: pol.purchaseOrder.orderDate.toISOString(),
        supplierName: pol.purchaseOrder.supplier.name,
        projectName: pol.purchaseOrder.project?.name ?? null,
      });
    }
    for (const m of materials) {
      m.lastRate = lastRateMap.get(m.materialId) ?? null;
    }
  }

  // Quote-level summary.
  const quoteSummaries = request.quotes.map((q) => {
    const variance = cheapestId
      ? q.landedTotal.minus(request.quotes.find((x) => x.id === cheapestId)!.landedTotal).toNumber()
      : 0;
    return {
      id: q.id,
      supplierId: q.supplierId,
      supplierName: q.supplier.name,
      supplierPhone: q.supplier.phone,
      supplierGstin: q.supplier.gstin,
      fileUrl: q.fileUrl,
      fileName: q.fileName,
      quoteSource: q.quoteSource,
      sourceNote: q.sourceNote,
      subtotal: q.subtotal.toNumber(),
      gstTotal: q.gstTotal.toNumber(),
      freightTotal: q.freightTotal.toNumber(),
      handlingTotal: q.handlingTotal.toNumber(),
      discountTotal: q.discountTotal.toNumber(),
      packingTotal: q.packingTotal.toNumber(),
      loadingTotal: q.loadingTotal.toNumber(),
      insuranceTotal: q.insuranceTotal.toNumber(),
      landedTotal: q.landedTotal.toNumber(),
      buyerTransportTotal: q.buyerTransportTotal.toNumber(),
      isCheapest: q.id === cheapestId,
      isSelected: q.id === request.selectedQuoteId,
      varianceVsCheapest: variance,
      validUntil: q.validUntil?.toISOString() ?? null,
      paymentTerms: q.paymentTerms,
      deliveryTerms: q.deliveryTerms,
      deliveryTermsType: q.deliveryTermsType,
      leadTimeDays: q.leadTimeDays,
      warranty: q.warranty,
      notes: q.notes,
      createdAt: q.createdAt.toISOString(),
    };
  });

  // Total savings = most expensive - cheapest.
  const totals = quoteSummaries.map((q) => q.landedTotal);
  const maxTotal = totals.length > 0 ? Math.max(...totals) : 0;
  const minTotal = totals.length > 0 ? Math.min(...totals) : 0;
  const savings = maxTotal - minTotal;

  // ── Automatic checks: urgency, quote expiry, variance vs last-rate ──
  const now = new Date();
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const isUrgent = request.requiredByDate
    ? request.status === "OPEN" && request.requiredByDate.getTime() - now.getTime() <= THREE_DAYS_MS
    : false;
  const daysUntilRequired = request.requiredByDate
    ? Math.ceil((request.requiredByDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : null;

  // Per-quote expiry status
  for (const qs of quoteSummaries) {
    if (qs.validUntil) {
      const expiry = new Date(qs.validUntil).getTime();
      (qs as Record<string, unknown>).isExpired = expiry < now.getTime();
      (qs as Record<string, unknown>).daysUntilExpiry = Math.ceil((expiry - now.getTime()) / (24 * 60 * 60 * 1000));
    } else {
      (qs as Record<string, unknown>).isExpired = false;
      (qs as Record<string, unknown>).daysUntilExpiry = null;
    }
  }

  // Per-material variance vs last-rate: flag if ALL quotes > last rate by >15%
  for (const m of materials) {
    if (!m.lastRate || m.quotes.length === 0) {
      (m as Record<string, unknown>).allQuotesAboveLastRate = false;
      (m as Record<string, unknown>).minVariancePct = null;
      continue;
    }
    const lastRate = m.lastRate.unitCost;
    const allAbove = m.quotes.every((q) => q.unitLandedCost > lastRate * 1.15);
    const minLanded = Math.min(...m.quotes.map((q) => q.unitLandedCost));
    const variancePct = lastRate > 0 ? ((minLanded - lastRate) / lastRate) * 100 : 0;
    (m as Record<string, unknown>).allQuotesAboveLastRate = allAbove;
    (m as Record<string, unknown>).minVariancePct = Math.round(variancePct * 100) / 100;
  }

  return {
    id: request.id,
    requestNumber: request.requestNumber,
    title: request.title,
    notes: request.notes,
    status: request.status,
    minQuotesRequired: request.minQuotesRequired,
    requiredByDate: request.requiredByDate?.toISOString() ?? null,
    workActivity: request.workActivity,
    destinationLocationId: request.destinationLocationId,
    destinationLocationName: request.destinationLocation?.name ?? null,
    destinationLocationCompanyName: request.destinationLocation?.company?.name ?? null,
    projectName: request.project?.name ?? null,
    projectId: request.project?.id ?? null,
    submittedByName: request.submittedBy?.name ?? "—",
    approvedByName: request.approvedBy?.name ?? null,
    approvedAt: request.approvedAt?.toISOString() ?? null,
    approvalReason: request.approvalReason,
    createdAt: request.createdAt.toISOString(),
    quoteCount: request.quotes.length,
    cheapestQuoteId: cheapestId,
    selectedQuoteId: request.selectedQuoteId,
    savings,
    // ── Automatic flags ──
    isUrgent,
    daysUntilRequired,
    convertedPo: request.convertedPo
      ? {
          id: request.convertedPo.id,
          poNumber: request.convertedPo.poNumber,
          status: request.convertedPo.status,
          total: request.convertedPo.total.toNumber(),
        }
      : null,
    quotes: quoteSummaries,
    materials,
  };
}

// ── Internal helpers ──

/**
 * Pick a destination stock location for the auto-created PO.
 * Prefer the project's first PROJECT_SITE; otherwise a COMPANY_WAREHOUSE.
 */
async function resolveDestinationLocation(
  tx: Prisma.TransactionClient,
  companyId: string,
  projectId: string | null,
): Promise<{ locationId: string; scope: "PROJECT" | "COMPANY" }> {
  if (projectId) {
    const site = await tx.stockLocation.findFirst({
      where: { companyId, projectId, type: "PROJECT_SITE", deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (site) return { locationId: site.id, scope: "PROJECT" };
  }
  const warehouse = await tx.stockLocation.findFirst({
    where: { companyId, type: "COMPANY_WAREHOUSE", deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!warehouse) {
    throw new ServiceError(
      "Cannot create PO: no warehouse or project site found for this company. Add a stock location first.",
      400,
    );
  }
  return { locationId: warehouse.id, scope: "COMPANY" };
}

function cheapestQuoteForRequest(
  quotes: { id: string; landedTotal: Prisma.Decimal; status: string }[],
): string | null {
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

async function recomputeCheapestFlagsForRequest(
  tx: Prisma.TransactionClient,
  quotationRequestId: string,
) {
  const quotes = await tx.vendorQuote.findMany({
    where: { quotationRequestId, status: { not: "REJECTED" } },
    select: { id: true, landedTotal: true },
  });
  const cheapestId = cheapestQuoteForRequest(
    quotes.map((q) => ({ id: q.id, landedTotal: q.landedTotal, status: "PENDING" })),
  );

  await tx.vendorQuote.updateMany({
    where: { quotationRequestId },
    data: { isCheapest: false },
  });
  if (cheapestId) {
    await tx.vendorQuote.update({
      where: { id: cheapestId },
      data: { isCheapest: true },
    });
  }
}

/**
 * List quotation requests for a company. Optionally filter by status or
 * by submitter (to show "my requests"). Accepts a single companyId or
 * an array of companyIds (for company-group scoping).
 */
export async function listQuotationRequests(
  companyId: string | string[],
  filters?: {
    status?: string[];
    submittedByUserCompanyId?: string;
  },
) {
  return prisma.quotationRequest.findMany({
    where: {
      companyId: Array.isArray(companyId) ? { in: companyId } : companyId,
      ...(filters?.status ? { status: { in: filters.status as never } } : {}),
      ...(filters?.submittedByUserCompanyId ? { submittedByUserCompanyId: filters.submittedByUserCompanyId } : {}),
    },
    include: {
      project: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      lines: { select: { id: true, qtyRequired: true } },
      quotes: { select: { id: true, landedTotal: true, status: true, supplierId: true } },
      convertedPo: { select: { id: true, poNumber: true, status: true, total: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
