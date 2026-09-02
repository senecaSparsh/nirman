import { prisma } from "@nirman/db";
import Decimal from "decimal.js";

/**
 * GST Reconciliation Reports — GSTR-1 (outward supplies) and GSTR-3B (summary return).
 *
 * These reports aggregate from JournalEntry + JournalLine rows where the
 * GST accounts (Input GST 1400 / Output GST 2100) are debited/credited.
 * They provide the data needed to file GST returns.
 */

/**
 * Extract the state code (first 2 digits) from a GSTIN.
 * GSTIN format: 2-digit state code + 10-char PAN + 1-char entity + 1-char Z + 1-char checksum.
 * Returns null if the GSTIN is too short or malformed.
 */
export function getStateCodeFromGstin(gstin: string | null | undefined): string | null {
  if (!gstin || gstin.length < 2) return null;
  const stateCode = gstin.slice(0, 2);
  // State codes are 01-38 (India has 36 states/UTs + special codes)
  if (!/^\d{2}$/.test(stateCode)) return null;
  return stateCode;
}

/**
 * Determine if a transaction is intra-state (same state) or inter-state.
 * If either party's GSTIN is unknown, defaults to inter-state (IGST).
 * This is the conservative approach — IGST is always valid, CGST/SGST is only
 * for confirmed same-state transactions.
 */
export function isIntraState(
  companyGstin: string | null | undefined,
  partyGstin: string | null | undefined,
): boolean {
  const companyState = getStateCodeFromGstin(companyGstin);
  const partyState = getStateCodeFromGstin(partyGstin);
  if (!companyState || !partyState) return false;
  return companyState === partyState;
}

/**
 * Split a GST amount into CGST, SGST, and IGST components.
 * - Intra-state: CGST = 50%, SGST = 50%, IGST = 0
 * - Inter-state: CGST = 0, SGST = 0, IGST = 100%
 */
export function splitGst(
  gstAmount: Decimal,
  companyGstin: string | null | undefined,
  partyGstin: string | null | undefined,
): { cgst: Decimal; sgst: Decimal; igst: Decimal } {
  if (isIntraState(companyGstin, partyGstin)) {
    const half = gstAmount.div(2);
    return { cgst: half, sgst: half, igst: new Decimal(0) };
  }
  return { cgst: new Decimal(0), sgst: new Decimal(0), igst: gstAmount };
}

export interface Gstr1Report {
  fromDate: Date;
  toDate: Date;
  companyId: string;
  // Summary totals
  totalTaxableValue: Decimal;
  totalOutputGst: Decimal;
  totalCgst: Decimal;
  totalSgst: Decimal;
  totalIgst: Decimal;
  totalInvoiceCount: number;
  // Line items (per journal entry)
  entries: {
    journalEntryId: string;
    date: Date;
    sourceType: string;
    memo: string;
    taxableValue: Decimal;
    gstAmount: Decimal;
    gstRate: Decimal;
    cgst: Decimal;
    sgst: Decimal;
    igst: Decimal;
  }[];
}

export interface Gstr3bReport {
  fromDate: Date;
  toDate: Date;
  companyId: string;
  // 3.1 — Outward supplies
  outwardTaxableValue: Decimal;
  outwardOutputGst: Decimal;
  outwardCgst: Decimal;
  outwardSgst: Decimal;
  outwardIgst: Decimal;
  // 3.2 — Inward supplies
  inwardTaxableValue: Decimal;
  inwardInputGst: Decimal;
  inwardCgst: Decimal;
  inwardSgst: Decimal;
  inwardIgst: Decimal;
  // 4 — ITC details
  itcAvailable: Decimal;
  itcReversed: Decimal;
  // Net GST liability
  netGstPayable: Decimal;  // output GST - input GST (ITC)
  itcCarriedForward: Decimal;
}

/**
 * Generate GSTR-1 report (outward supplies / sales).
 * Aggregates all journal entries that credit Output GST (2100) within the date range.
 */
export async function generateGstr1(
  companyId: string,
  fromDate: Date,
  toDate: Date,
): Promise<Gstr1Report> {
  // Get the company's GSTIN for place-of-supply determination
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { gstin: true },
  });
  const companyGstin = company?.gstin ?? null;

  // Find all journal lines crediting Output GST (2100) in the date range
  const gstLines = await prisma.journalLine.findMany({
    where: {
      accountCode: "2100",
      credit: { gt: 0 },
      journalEntry: {
        companyId,
        entryDate: { gte: fromDate, lte: toDate },
      },
    },
    include: {
      journalEntry: { select: { id: true, entryDate: true, sourceType: true, sourceId: true, memo: true } },
    },
    orderBy: { journalEntry: { entryDate: "asc" } },
  });

  const entries: Gstr1Report["entries"] = [];
  let totalTaxableValue = new Decimal(0);
  let totalOutputGst = new Decimal(0);
  let totalCgst = new Decimal(0);
  let totalSgst = new Decimal(0);
  let totalIgst = new Decimal(0);

  // Batch-fetch revenue lines and counterparty sales to avoid N+1 queries.
  const journalEntryIds = gstLines.map((gl) => gl.journalEntryId);
  const revenueLines = journalEntryIds.length > 0
    ? await prisma.journalLine.findMany({
        where: {
          journalEntryId: { in: journalEntryIds },
          accountCode: { in: ["4000", "4100", "4200"] },
          credit: { gt: 0 },
        },
        select: { journalEntryId: true, credit: true },
      })
    : [];
  const revenueByJeId = new Map(revenueLines.map((rl) => [rl.journalEntryId, rl]));

  const assetSaleIds = gstLines
    .map((gl) => gl.journalEntry)
    .filter((je) => je.sourceId && je.sourceType === "ASSET_SALE")
    .map((je) => je.sourceId!) as string[];
  const materialSaleIds = gstLines
    .map((gl) => gl.journalEntry)
    .filter((je) => je.sourceId && je.sourceType === "MATERIAL_SALE")
    .map((je) => je.sourceId!) as string[];

  const assetSales = assetSaleIds.length > 0
    ? await prisma.assetSale.findMany({
        where: { id: { in: assetSaleIds } },
        select: { id: true, customer: { select: { gstin: true } } },
      })
    : [];
  const assetSaleGstinById = new Map(assetSales.map((s) => [s.id, s.customer?.gstin ?? null]));

  const materialSales = materialSaleIds.length > 0
    ? await prisma.materialSale.findMany({
        where: { id: { in: materialSaleIds } },
        select: { id: true, customer: { select: { gstin: true } } },
      })
    : [];
  const materialSaleGstinById = new Map(materialSales.map((s) => [s.id, s.customer?.gstin ?? null]));

  for (const gl of gstLines) {
    const gstAmount = new Decimal(gl.credit);
    // The taxable value is the sales revenue line (4000) in the same journal entry
    const revenueLine = revenueByJeId.get(gl.journalEntryId);
    const taxableValue = revenueLine ? new Decimal(revenueLine.credit) : new Decimal(0);
    // Derive GST rate from the amounts (gst / taxable * 100)
    const gstRate = taxableValue.gt(0)
      ? gstAmount.div(taxableValue).times(100)
      : new Decimal(0);

    // Determine the counterparty's GSTIN for CGST/SGST/IGST split
    let partyGstin: string | null = null;
    const je = gl.journalEntry;
    if (je.sourceId) {
      // Trace back to the sale → customer → GSTIN
      if (je.sourceType === "ASSET_SALE") {
        partyGstin = assetSaleGstinById.get(je.sourceId) ?? null;
      } else if (je.sourceType === "MATERIAL_SALE") {
        partyGstin = materialSaleGstinById.get(je.sourceId) ?? null;
      }
    }

    const split = splitGst(gstAmount, companyGstin, partyGstin);
    totalCgst = totalCgst.plus(split.cgst);
    totalSgst = totalSgst.plus(split.sgst);
    totalIgst = totalIgst.plus(split.igst);

    totalTaxableValue = totalTaxableValue.plus(taxableValue);
    totalOutputGst = totalOutputGst.plus(gstAmount);

    entries.push({
      journalEntryId: gl.journalEntryId,
      date: gl.journalEntry.entryDate,
      sourceType: gl.journalEntry.sourceType,
      memo: gl.journalEntry.memo ?? "",
      taxableValue,
      gstAmount,
      gstRate,
      cgst: split.cgst,
      sgst: split.sgst,
      igst: split.igst,
    });
  }

  return {
    fromDate,
    toDate,
    companyId,
    totalTaxableValue,
    totalOutputGst,
    totalCgst,
    totalSgst,
    totalIgst,
    totalInvoiceCount: entries.length,
    entries,
  };
}

/**
 * Generate GSTR-3B report (summary return).
 * Shows outward supplies, inward supplies, ITC, and net GST payable.
 */
export async function generateGstr3b(
  companyId: string,
  fromDate: Date,
  toDate: Date,
): Promise<Gstr3bReport> {
  // Get the company's GSTIN for place-of-supply determination
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { gstin: true },
  });
  const companyGstin = company?.gstin ?? null;

  // ── Outward supplies: compute per-entry to get CGST/SGST/IGST split ──
  const outputGstLines = await prisma.journalLine.findMany({
    where: {
      accountCode: "2100",
      credit: { gt: 0 },
      journalEntry: {
        companyId,
        entryDate: { gte: fromDate, lte: toDate },
      },
    },
    include: {
      journalEntry: { select: { id: true, sourceType: true, sourceId: true } },
    },
  });

  let outwardOutputGst = new Decimal(0);
  let outwardCgst = new Decimal(0);
  let outwardSgst = new Decimal(0);
  let outwardIgst = new Decimal(0);

  // Batch-fetch counterparty sales to avoid N+1 queries.
  const outAssetSaleIds = outputGstLines
    .map((gl) => gl.journalEntry)
    .filter((je) => je.sourceId && je.sourceType === "ASSET_SALE")
    .map((je) => je.sourceId!) as string[];
  const outMaterialSaleIds = outputGstLines
    .map((gl) => gl.journalEntry)
    .filter((je) => je.sourceId && je.sourceType === "MATERIAL_SALE")
    .map((je) => je.sourceId!) as string[];

  const outAssetSales = outAssetSaleIds.length > 0
    ? await prisma.assetSale.findMany({
        where: { id: { in: outAssetSaleIds } },
        select: { id: true, customer: { select: { gstin: true } } },
      })
    : [];
  const outAssetSaleGstinById = new Map(outAssetSales.map((s) => [s.id, s.customer?.gstin ?? null]));

  const outMaterialSales = outMaterialSaleIds.length > 0
    ? await prisma.materialSale.findMany({
        where: { id: { in: outMaterialSaleIds } },
        select: { id: true, customer: { select: { gstin: true } } },
      })
    : [];
  const outMaterialSaleGstinById = new Map(outMaterialSales.map((s) => [s.id, s.customer?.gstin ?? null]));

  for (const gl of outputGstLines) {
    const gstAmount = new Decimal(gl.credit);
    outwardOutputGst = outwardOutputGst.plus(gstAmount);

    let partyGstin: string | null = null;
    if (gl.journalEntry.sourceId) {
      if (gl.journalEntry.sourceType === "ASSET_SALE") {
        partyGstin = outAssetSaleGstinById.get(gl.journalEntry.sourceId) ?? null;
      } else if (gl.journalEntry.sourceType === "MATERIAL_SALE") {
        partyGstin = outMaterialSaleGstinById.get(gl.journalEntry.sourceId) ?? null;
      }
    }

    const split = splitGst(gstAmount, companyGstin, partyGstin);
    outwardCgst = outwardCgst.plus(split.cgst);
    outwardSgst = outwardSgst.plus(split.sgst);
    outwardIgst = outwardIgst.plus(split.igst);
  }

  // Sales revenue (taxable value)
  const revenueLines = await prisma.journalLine.aggregate({
    where: {
      accountCode: { in: ["4000", "4100", "4200"] },
      credit: { gt: 0 },
      journalEntry: {
        companyId,
        entryDate: { gte: fromDate, lte: toDate },
      },
    },
    _sum: { credit: true },
  });
  const outwardTaxableValue = new Decimal(revenueLines._sum?.credit ?? 0);

  // ── Inward supplies: compute per-entry to get CGST/SGST/IGST split ──
  const inputGstLineRecords = await prisma.journalLine.findMany({
    where: {
      accountCode: "1400",
      debit: { gt: 0 },
      journalEntry: {
        companyId,
        entryDate: { gte: fromDate, lte: toDate },
      },
    },
    include: {
      journalEntry: { select: { id: true, sourceType: true, sourceId: true } },
    },
  });

  let itcAvailable = new Decimal(0);
  let inwardCgst = new Decimal(0);
  let inwardSgst = new Decimal(0);
  let inwardIgst = new Decimal(0);

  // Batch-fetch counterparty purchase sources to avoid N+1 queries.
  const grIds = inputGstLineRecords
    .map((gl) => gl.journalEntry)
    .filter((je) => je.sourceId && je.sourceType === "PO_RECEIPT")
    .map((je) => je.sourceId!) as string[];
  const dpIds = inputGstLineRecords
    .map((gl) => gl.journalEntry)
    .filter((je) => je.sourceId && je.sourceType === "DIRECT_PURCHASE")
    .map((je) => je.sourceId!) as string[];

  const goodsReceipts = grIds.length > 0
    ? await prisma.goodsReceipt.findMany({
        where: { id: { in: grIds } },
        select: { id: true, purchaseOrder: { select: { supplier: { select: { gstin: true } } } } },
      })
    : [];
  const grGstinById = new Map(goodsReceipts.map((gr) => [gr.id, gr.purchaseOrder?.supplier?.gstin ?? null]));

  const directPurchases = dpIds.length > 0
    ? await prisma.directPurchase.findMany({
        where: { id: { in: dpIds } },
        select: { id: true, supplier: { select: { gstin: true } } },
      })
    : [];
  const dpGstinById = new Map(directPurchases.map((dp) => [dp.id, dp.supplier?.gstin ?? null]));

  for (const gl of inputGstLineRecords) {
    const gstAmount = new Decimal(gl.debit);
    itcAvailable = itcAvailable.plus(gstAmount);

    let partyGstin: string | null = null;
    if (gl.journalEntry.sourceId) {
      if (gl.journalEntry.sourceType === "PO_RECEIPT") {
        // Trace: GoodsReceipt → PurchaseOrder → Supplier
        partyGstin = grGstinById.get(gl.journalEntry.sourceId) ?? null;
      } else if (gl.journalEntry.sourceType === "DIRECT_PURCHASE") {
        partyGstin = dpGstinById.get(gl.journalEntry.sourceId) ?? null;
      }
    }

    const split = splitGst(gstAmount, companyGstin, partyGstin);
    inwardCgst = inwardCgst.plus(split.cgst);
    inwardSgst = inwardSgst.plus(split.sgst);
    inwardIgst = inwardIgst.plus(split.igst);
  }

  // Purchase value (taxable)
  const purchaseInventoryLines = await prisma.journalLine.aggregate({
    where: {
      accountCode: "1300",
      debit: { gt: 0 },
      journalEntry: {
        companyId,
        entryDate: { gte: fromDate, lte: toDate },
        sourceType: { in: ["PO_RECEIPT", "LAND_PURCHASE", "DIRECT_PURCHASE"] },
      },
    },
    _sum: { debit: true },
  });
  const inwardTaxableValue = new Decimal(purchaseInventoryLines._sum?.debit ?? 0);

  // ITC reversed (credited back) — from supplier returns, cancellations
  const itcReversedLines = await prisma.journalLine.aggregate({
    where: {
      accountCode: "1400",
      credit: { gt: 0 },
      journalEntry: {
        companyId,
        entryDate: { gte: fromDate, lte: toDate },
      },
    },
    _sum: { credit: true },
  });
  const itcReversed = new Decimal(itcReversedLines._sum?.credit ?? 0);

  const netItc = itcAvailable.minus(itcReversed);
  const netGstPayable = outwardOutputGst.minus(netItc);
  const itcCarriedForward = netGstPayable.lt(0) ? netGstPayable.abs() : new Decimal(0);

  return {
    fromDate,
    toDate,
    companyId,
    outwardTaxableValue,
    outwardOutputGst,
    outwardCgst,
    outwardSgst,
    outwardIgst,
    inwardTaxableValue,
    inwardInputGst: itcAvailable,
    inwardCgst,
    inwardSgst,
    inwardIgst,
    itcAvailable: netItc,
    itcReversed,
    netGstPayable: netGstPayable.gt(0) ? netGstPayable : new Decimal(0),
    itcCarriedForward,
  };
}
