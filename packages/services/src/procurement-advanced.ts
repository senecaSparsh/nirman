import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Advanced Procurement Service.
 *
 * 1. Vendor Rating — auto-computed from delivery, quality, and price data
 * 2. Rate Contract / Framework Agreement — pre-negotiated supplier rates
 * 3. Value-Based Approval Routing — who must approve a PO based on its value
 * 4. Commitment Tracking — open requisitions + POs = committed cost
 */

// ── 1. Vendor Rating ───────────────────────────────────────

export interface VendorRating {
  supplierId: string;
  supplierName: string;
  onTimeRate: Decimal;          // 0-1
  qualityRate: Decimal;         // 0-1
  priceCompetitiveness: Decimal; // 0-1 (1 = always cheapest)
  overallScore: Decimal;        // 0-1 weighted average
  totalPos: number;
  totalReceipts: number;
  totalQuotes: number;
}

/**
 * Compute a vendor rating for a single supplier.
 *
 * - On-time delivery: % of POs where the first GoodsReceipt date ≤ PO.expectedDate
 * - Quality acceptance: % of GoodsReceipts with status ACCEPTED
 * - Price competitiveness: for each VendorQuote by this supplier, check if they
 *   were the lowest quote in that requisition. Score = #lowest / #total quotes.
 *
 * Overall = 40% delivery + 30% quality + 30% price.
 */
export async function computeVendorRating(supplierId: string): Promise<VendorRating> {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true },
  });
  if (!supplier) throw new ServiceError("Supplier not found", 404);

  // On-time delivery
  const pos = await prisma.purchaseOrder.findMany({
    where: { supplierId, status: { in: ["RECEIVED", "PARTIAL"] } },
    select: { id: true, expectedDate: true },
  });

  // Batch-fetch first receipt dates for all POs in one query
  const poIds = pos.map((p) => p.id);
  const allReceipts = poIds.length > 0
    ? await prisma.goodsReceipt.findMany({
        where: { purchaseOrderId: { in: poIds } },
        select: { purchaseOrderId: true, receiptDate: true },
        orderBy: { receiptDate: "asc" },
      })
    : [];
  // Keep only the earliest receipt per PO
  const firstReceiptByPo = new Map<string, Date>();
  for (const r of allReceipts) {
    if (!firstReceiptByPo.has(r.purchaseOrderId)) {
      firstReceiptByPo.set(r.purchaseOrderId, r.receiptDate);
    }
  }
  let onTimeCount = 0;
  for (const po of pos) {
    if (!po.expectedDate) continue;
    const firstReceipt = firstReceiptByPo.get(po.id);
    if (firstReceipt && firstReceipt <= po.expectedDate) {
      onTimeCount++;
    }
  }
  const onTimeRate = pos.length > 0
    ? new Decimal(onTimeCount).div(pos.length)
    : new Decimal(1); // no POs → neutral

  // Quality acceptance
  const receipts = await prisma.goodsReceipt.findMany({
    where: { purchaseOrder: { supplierId } },
    select: { id: true, inspectionStatus: true },
  });
  const acceptedCount = receipts.filter(
    (r) => r.inspectionStatus === "PASSED",
  ).length;
  const qualityRate = receipts.length > 0
    ? new Decimal(acceptedCount).div(receipts.length)
    : new Decimal(1); // no receipts → neutral

  // Price competitiveness
  const quotes = await prisma.vendorQuote.findMany({
    where: { supplierId, status: "SELECTED" },
    select: { id: true, requisitionId: true },
  });
  const totalQuotes = await prisma.vendorQuote.count({
    where: { supplierId, status: { in: ["PENDING", "SELECTED", "REJECTED"] } },
  });
  // Score = selected quotes / total submitted quotes (how often they win)
  const priceCompetitiveness = totalQuotes > 0
    ? new Decimal(quotes.length).div(totalQuotes)
    : new Decimal(0.5); // no quotes → neutral

  const overallScore = onTimeRate
    .times(0.4)
    .plus(qualityRate.times(0.3))
    .plus(priceCompetitiveness.times(0.3));

  return {
    supplierId,
    supplierName: supplier.name,
    onTimeRate: onTimeRate.toDecimalPlaces(4),
    qualityRate: qualityRate.toDecimalPlaces(4),
    priceCompetitiveness: priceCompetitiveness.toDecimalPlaces(4),
    overallScore: overallScore.toDecimalPlaces(4),
    totalPos: pos.length,
    totalReceipts: receipts.length,
    totalQuotes,
  };
}

/**
 * Get vendor rankings for a company — all suppliers sorted by overall score.
 */
export async function getVendorRankings(companyId: string): Promise<VendorRating[]> {
  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  const ratings: VendorRating[] = [];
  for (const supplier of suppliers) {
    try {
      const rating = await computeVendorRating(supplier.id);
      ratings.push(rating);
    } catch {
      // skip if error
    }
  }

  return ratings.sort((a, b) => b.overallScore.minus(a.overallScore).toNumber());
}

// ── 2. Rate Contract / Framework Agreement ─────────────────

async function generateContractNumber(tx: Prisma.TransactionClient): Promise<string> {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `RC-${ymd}-`;
  const existing = await tx.rateContract.findMany({
    where: { contractNumber: { startsWith: prefix } },
    select: { contractNumber: true },
  });
  const maxSeq = existing.reduce((max, e) => {
    const n = parseInt(e.contractNumber.slice(prefix.length) ?? "0", 10);
    return n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

export interface CreateRateContractInput {
  supplierId: string;
  companyId: string;
  materialId: string;
  agreedRate: Decimal | number | string;
  validFrom: Date;
  validTo: Date;
  minQty?: Decimal | number | string;
  maxQty?: Decimal | number | string;
  notes?: string;
  userId?: string;
}

export async function createRateContract(input: CreateRateContractInput) {
  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, deletedAt: null },
    });
    if (!supplier) throw new ServiceError("Supplier not found or deleted", 404);

    const material = await tx.material.findFirst({
      where: { id: input.materialId, deletedAt: null },
    });
    if (!material) throw new ServiceError("Material not found or deleted", 404);

    if (input.validTo <= input.validFrom) {
      throw new ServiceError("validTo must be after validFrom", 400);
    }

    const rate = new Decimal(input.agreedRate);
    if (!rate.gt(0)) throw new ServiceError("Agreed rate must be > 0", 400);

    const contractNumber = await generateContractNumber(tx);

    const contract = await tx.rateContract.create({
      data: {
        contractNumber,
        supplierId: input.supplierId,
        companyId: input.companyId,
        materialId: input.materialId,
        agreedRate: rate.toString(),
        validFrom: input.validFrom,
        validTo: input.validTo,
        minQty: input.minQty != null ? new Decimal(input.minQty).toString() : null,
        maxQty: input.maxQty != null ? new Decimal(input.maxQty).toString() : null,
        notes: input.notes ?? null,
        createdById: input.userId ?? null,
      },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "RATE_CONTRACT_CREATE",
        entityType: "RateContract",
        entityId: contract.id,
        after: { contractNumber, supplierId: input.supplierId, materialId: input.materialId, agreedRate: rate.toString() },
      });
    }

    return contract;
  });
}

/**
 * Get the active rate contract for a material+supplier, if one exists.
 * Used by the PO creation UI to auto-fill the rate.
 */
export async function getActiveRateContract(materialId: string, supplierId: string) {
  const now = new Date();
  return prisma.rateContract.findFirst({
    where: {
      materialId,
      supplierId,
      status: "ACTIVE",
      validFrom: { lte: now },
      validTo: { gte: now },
    },
    orderBy: { validTo: "desc" },
  });
}

/**
 * List all rate contracts for a company.
 */
export async function getRateContracts(companyId: string) {
  const now = new Date();
  const contracts = await prisma.rateContract.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      material: { select: { id: true, code: true, name: true, unit: true } },
    },
  });

  // Auto-expire contracts past their validTo date
  const expired = contracts.filter(
    (c) => c.status === "ACTIVE" && c.validTo < now,
  );
  if (expired.length > 0) {
    await prisma.rateContract.updateMany({
      where: { id: { in: expired.map((c) => c.id) } },
      data: { status: "EXPIRED" },
    });
  }

  return contracts.map((c) => ({
    ...c,
    isExpired: c.status === "EXPIRED" || c.validTo < now,
  }));
}

export async function cancelRateContract(id: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.rateContract.findUnique({ where: { id } });
    if (!contract) throw new ServiceError("Rate contract not found", 404);
    if (contract.status === "CANCELLED") {
      throw new ServiceError("Contract is already cancelled", 400);
    }

    const updated = await tx.rateContract.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "RATE_CONTRACT_CANCEL",
        entityType: "RateContract",
        entityId: id,
        before: { contractNumber: contract.contractNumber, status: contract.status },
        after: { status: "CANCELLED" },
      });
    }

    return updated;
  });
}

// ── 3. Value-Based Approval Routing ────────────────────────

export interface ApprovalRouting {
  requiredRole: "MANAGER" | "ADMIN" | "OWNER";
  threshold: Decimal;
  reason: string;
}

/**
 * Determine who must approve a PO based on its total value.
 * Uses company-configurable thresholds with sensible defaults.
 *
 * - < managerThreshold (default ₹50,000) → MANAGER can approve
 * - < adminThreshold (default ₹500,000) → ADMIN required
 * - >= adminThreshold → OWNER required
 */
export async function getApprovalRouting(
  totalAmount: Decimal | number | string,
  companyId: string,
): Promise<ApprovalRouting> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { poApprovalThresholdManager: true, poApprovalThresholdAdmin: true },
  });

  const managerThreshold = company?.poApprovalThresholdManager
    ? new Decimal(company.poApprovalThresholdManager)
    : new Decimal(50000);
  const adminThreshold = company?.poApprovalThresholdAdmin
    ? new Decimal(company.poApprovalThresholdAdmin)
    : new Decimal(500000);

  const amount = new Decimal(totalAmount);

  if (amount.lt(managerThreshold)) {
    return {
      requiredRole: "MANAGER",
      threshold: managerThreshold,
      reason: `PO value ₹${amount.toFixed(0)} is below the manager threshold (₹${managerThreshold.toFixed(0)})`,
    };
  }
  if (amount.lt(adminThreshold)) {
    return {
      requiredRole: "ADMIN",
      threshold: adminThreshold,
      reason: `PO value ₹${amount.toFixed(0)} requires admin approval (threshold ₹${adminThreshold.toFixed(0)})`,
    };
  }
  return {
    requiredRole: "OWNER",
    threshold: adminThreshold,
    reason: `PO value ₹${amount.toFixed(0)} requires owner approval (threshold ₹${adminThreshold.toFixed(0)})`,
  };
}

// ── 4. Commitment Tracking ─────────────────────────────────

export interface ProjectCommitments {
  openRequisitions: {
    count: number;
    totalEstimated: Decimal;
  };
  openPurchaseOrders: {
    count: number;
    totalCommitted: Decimal;
  };
  totalCommitted: Decimal;
}

/**
 * Compute total committed cost for a project:
 * - Open requisitions (SUBMITTED/APPROVED) — estimated line values
 * - Open POs (APPROVED/ORDERED/PARTIAL) — committed PO totals
 *
 * This feeds into the cost overrun forecast: actual + committed = projected.
 */
export async function getProjectCommitments(projectId: string): Promise<ProjectCommitments> {
  // Open requisitions — estimate from line-level lastRate snapshots
  const openReqLines = await prisma.materialRequisitionLine.findMany({
    where: {
      requisition: { projectId, status: { in: ["SUBMITTED", "APPROVED"] } },
    },
    select: { qtyRequested: true, lastRate: true },
  });

  let reqTotal = new Decimal(0);
  for (const line of openReqLines) {
    const price = line.lastRate ? new Decimal(line.lastRate) : new Decimal(0);
    reqTotal = reqTotal.plus(new Decimal(line.qtyRequested).times(price));
  }

  // Open POs
  const openPos = await prisma.purchaseOrder.findMany({
    where: { projectId, status: { in: ["APPROVED", "ORDERED", "PARTIAL"] } },
    select: { id: true, total: true },
  });
  const poTotal = openPos.reduce(
    (sum, po) => sum.plus(new Decimal(po.total)),
    new Decimal(0),
  );

  return {
    openRequisitions: {
      count: openReqLines.length,
      totalEstimated: reqTotal.toDecimalPlaces(2),
    },
    openPurchaseOrders: {
      count: openPos.length,
      totalCommitted: poTotal.toDecimalPlaces(2),
    },
    totalCommitted: reqTotal.plus(poTotal).toDecimalPlaces(2),
  };
}
