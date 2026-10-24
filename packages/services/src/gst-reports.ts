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
  // Credit notes (material-sale returns) — reported separately in GSTR-1 and
  // reduce output tax. A company filing without these over-declares its GST.
  creditNotes: {
    journalEntryId: string;
    date: Date;
    returnNumber: string;
    materialSaleId: string;
    customerGstin: string | null;
    taxableValue: Decimal;
    gstAmount: Decimal;
    cgst: Decimal;
    sgst: Decimal;
    igst: Decimal;
  }[];
  /** taxableValue of invoices − taxableValue of credit notes */
  netTaxableValue: Decimal;
  /** totalOutputGst − credit-note GST */
  netOutputGst: Decimal;
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

  // Resolve account codes → IDs (GlAccount PK is now id, not code)
  // 4450 (late-payment interest income) is taxable consideration under
  // construction-linked supplies — its credit leg carries the taxable value
  // when the JE splits output GST off the interest collected.
  const accountCodes = ["2100", "4000", "4100", "4200", "4450"];
  const glAccounts = await prisma.glAccount.findMany({
    where: { companyId, code: { in: accountCodes } },
    select: { id: true, code: true },
  });
  const codeToId = new Map(glAccounts.map((a) => [a.code, a.id]));
  const outputGstAccountId = codeToId.get("2100");
  const revenueAccountIds = ["4000", "4100", "4200", "4450"].map((c) => codeToId.get(c)).filter((id): id is string => !!id);

  // Outward supply = every JE in the window carrying a revenue credit — not
  // just JEs with a 2100 leg. A zero-GST/exempt sale has no 2100 leg, yet its
  // turnover still belongs in GSTR-1 (exempt/nil-rated tables) — and a sale
  // that should have carried GST but posted without one is exactly what the
  // report exists to surface. Union with 2100-credit JEs for completeness.
  const [gstLines, revLines] = await Promise.all([
    outputGstAccountId
      ? prisma.journalLine.findMany({
          where: {
            accountId: outputGstAccountId,
            credit: { gt: 0 },
            journalEntry: {
              companyId,
              entryDate: { gte: fromDate, lte: toDate },
            },
          },
          include: {
            journalEntry: { select: { id: true, entryDate: true, sourceType: true, sourceId: true, memo: true } },
          },
        })
      : Promise.resolve([]),
    revenueAccountIds.length > 0
      ? prisma.journalLine.findMany({
          where: {
            accountId: { in: revenueAccountIds },
            credit: { gt: 0 },
            journalEntry: {
              companyId,
              sourceType: { in: ["MATERIAL_SALE", "ASSET_SALE"] },
              entryDate: { gte: fromDate, lte: toDate },
            },
          },
          include: {
            journalEntry: { select: { id: true, entryDate: true, sourceType: true, sourceId: true, memo: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  // Deduped JE set keyed by id — GST leg says how much tax, revenue legs say
  // the taxable value. The journalEntry shapes are identical.
  const outwardJes = new Map<string, (typeof gstLines)[number]["journalEntry"]>();
  for (const gl of gstLines) outwardJes.set(gl.journalEntryId, gl.journalEntry);
  for (const rl of revLines) {
    if (!outwardJes.has(rl.journalEntryId)) outwardJes.set(rl.journalEntryId, rl.journalEntry);
  }

  const entries: Gstr1Report["entries"] = [];
  let totalTaxableValue = new Decimal(0);
  let totalOutputGst = new Decimal(0);
  let totalCgst = new Decimal(0);
  let totalSgst = new Decimal(0);
  let totalIgst = new Decimal(0);

  // Batch-fetch revenue lines and counterparty sales to avoid N+1 queries.
  const journalEntryIds = [...outwardJes.keys()];
  const revenueLines = journalEntryIds.length > 0 && revenueAccountIds.length > 0
    ? await prisma.journalLine.findMany({
        where: {
          journalEntryId: { in: journalEntryIds },
          accountId: { in: revenueAccountIds },
          credit: { gt: 0 },
        },
        select: { journalEntryId: true, credit: true },
      })
    : [];
  // Sum revenue credits per entry — a sale can post multiple revenue legs
  // (e.g. 4000 Sales Revenue + 4100 Cost Recovery on a mixed scrap sale).
  // A plain Map keyed on journalEntryId would keep only the last leg and
  // understate taxable value (and skew the derived GST rate).
  const revenueByJeId = new Map<string, Decimal>();
  for (const rl of revenueLines) {
    revenueByJeId.set(
      rl.journalEntryId,
      (revenueByJeId.get(rl.journalEntryId) ?? new Decimal(0)).plus(rl.credit),
    );
  }

  const assetSaleIds = [...outwardJes.values()]
    .filter((je) => je.sourceId && je.sourceType === "ASSET_SALE")
    .map((je) => je.sourceId!) as string[];
  const materialSaleIds = [...outwardJes.values()]
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

  const gstByJeId = new Map<string, Decimal>();
  for (const gl of gstLines) {
    gstByJeId.set(
      gl.journalEntryId,
      (gstByJeId.get(gl.journalEntryId) ?? new Decimal(0)).plus(gl.credit),
    );
  }

  const sortedJes = [...outwardJes.entries()].sort((a, b) => a[1].entryDate.getTime() - b[1].entryDate.getTime());
  for (const [jeId, je] of sortedJes) {
    const gstAmount = gstByJeId.get(jeId) ?? new Decimal(0);
    // The taxable value is the sum of revenue credits (4000/4100/4200) in
    // the same journal entry — covers mixed sales that post several legs.
    const taxableValue = revenueByJeId.get(jeId) ?? new Decimal(0);
    // Derive GST rate from the amounts (gst / taxable * 100)
    const gstRate = taxableValue.gt(0)
      ? gstAmount.div(taxableValue).times(100)
      : new Decimal(0);

    // Determine the counterparty's GSTIN for CGST/SGST/IGST split
    let partyGstin: string | null = null;
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
      journalEntryId: jeId,
      date: je.entryDate,
      sourceType: je.sourceType,
      memo: je.memo ?? "",
      taxableValue,
      gstAmount,
      gstRate,
      cgst: split.cgst,
      sgst: split.sgst,
      igst: split.igst,
    });
  }

  // ── Credit notes: every MATERIAL_SALE_RETURN JE in the window ──
  // They reverse outward tax and must be reported (GSTR-1 CDN/CDNUR), else
  // the filed return over-declares output tax by the returned value. The CN
  // set keys off the JE itself — a zero-GST return has no 2100 debit leg and
  // would otherwise vanish from creditNotes while still overstating outward
  // supply (a gstRate-0 return is still a credit note).
  const cnRevenueLines = revenueAccountIds.length > 0
    ? await prisma.journalLine.findMany({
        where: {
          accountId: { in: revenueAccountIds },
          debit: { gt: 0 },
          journalEntry: {
            companyId,
            sourceType: "MATERIAL_SALE_RETURN",
            entryDate: { gte: fromDate, lte: toDate },
          },
        },
        include: {
          journalEntry: { select: { id: true, entryDate: true, sourceType: true, sourceId: true } },
        },
        orderBy: { journalEntry: { entryDate: "asc" } },
      })
    : [];

  const cnTaxableByJeId = new Map<string, Decimal>();
  const cnJeSet = new Map<string, (typeof cnRevenueLines)[number]["journalEntry"]>();
  for (const rl of cnRevenueLines) {
    cnTaxableByJeId.set(
      rl.journalEntryId,
      (cnTaxableByJeId.get(rl.journalEntryId) ?? new Decimal(0)).plus(rl.debit),
    );
    cnJeSet.set(rl.journalEntryId, rl.journalEntry);
  }
  const cnJeIds = [...cnJeSet.keys()];

  const cnGstByJeId = new Map<string, Decimal>();
  if (outputGstAccountId && cnJeIds.length > 0) {
    const gstLegs = await prisma.journalLine.findMany({
      where: {
        accountId: outputGstAccountId,
        debit: { gt: 0 },
        journalEntryId: { in: cnJeIds },
      },
      select: { journalEntryId: true, debit: true },
    });
    for (const gl of gstLegs) {
      cnGstByJeId.set(
        gl.journalEntryId,
        (cnGstByJeId.get(gl.journalEntryId) ?? new Decimal(0)).plus(gl.debit),
      );
    }
  }

  const cnReturnIds = cnJeIds.map((id) => cnJeSet.get(id)!.sourceId).filter((id): id is string => !!id);
  const cnReturns = cnReturnIds.length > 0
    ? await prisma.materialSaleReturn.findMany({
        where: { id: { in: cnReturnIds } },
        select: { id: true, returnNumber: true, materialSaleId: true, customer: { select: { gstin: true } } },
      })
    : [];
  const cnReturnById = new Map(cnReturns.map((r) => [r.id, r]));

  const creditNotes: Gstr1Report["creditNotes"] = [];
  let cnTaxableTotal = new Decimal(0);
  let cnGstTotal = new Decimal(0);

  for (const [jeId, je] of cnJeSet) {
    const ret = je.sourceId ? cnReturnById.get(je.sourceId) : undefined;
    const gstAmount = cnGstByJeId.get(jeId) ?? new Decimal(0);
    const taxableValue = cnTaxableByJeId.get(jeId) ?? new Decimal(0);
    const split = splitGst(gstAmount, companyGstin, ret?.customer?.gstin ?? null);
    cnTaxableTotal = cnTaxableTotal.plus(taxableValue);
    cnGstTotal = cnGstTotal.plus(gstAmount);
    creditNotes.push({
      journalEntryId: jeId,
      date: je.entryDate,
      returnNumber: ret?.returnNumber ?? "",
      materialSaleId: ret?.materialSaleId ?? "",
      customerGstin: ret?.customer?.gstin ?? null,
      taxableValue,
      gstAmount,
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
    creditNotes,
    netTaxableValue: totalTaxableValue.minus(cnTaxableTotal),
    netOutputGst: totalOutputGst.minus(cnGstTotal),
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

  // Resolve account codes → IDs (GlAccount PK is now id, not code)
  const accountCodes3b = ["2100", "4000", "4100", "4200", "4450", "1400", "1300"];
  const glAccounts3b = await prisma.glAccount.findMany({
    where: { companyId, code: { in: accountCodes3b } },
    select: { id: true, code: true },
  });
  const codeToId3b = new Map(glAccounts3b.map((a) => [a.code, a.id]));
  // 4450 (late interest) is outward taxable supply under 3.1(a).
  const revenueAccountIds3b = ["4000", "4100", "4200", "4450"].map((c) => codeToId3b.get(c)).filter((id): id is string => !!id);
  const outputGstId3b = codeToId3b.get("2100");
  const inputGstId3b = codeToId3b.get("1400");
  const inventoryId3b = codeToId3b.get("1300");

  // ── Outward supplies: compute per-entry to get CGST/SGST/IGST split ──
  // Net basis: credit-note debits (MATERIAL_SALE_RETURN) reduce output tax —
  // real GSTR-3B 3.1(a) is net outward supplies. Counting only credits would
  // overstate the liability by every returned rupee of GST.
  const outputGstLines = outputGstId3b
    ? await prisma.journalLine.findMany({
        where: {
          accountId: outputGstId3b,
          OR: [{ credit: { gt: 0 } }, { debit: { gt: 0 } }],
          journalEntry: {
            companyId,
            entryDate: { gte: fromDate, lte: toDate },
          },
        },
        include: {
          journalEntry: { select: { id: true, sourceType: true, sourceId: true } },
        },
      })
    : [];

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
  const outReturnIds = outputGstLines
    .map((gl) => gl.journalEntry)
    .filter((je) => je.sourceId && je.sourceType === "MATERIAL_SALE_RETURN")
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

  const outReturns = outReturnIds.length > 0
    ? await prisma.materialSaleReturn.findMany({
        where: { id: { in: outReturnIds } },
        select: { id: true, customer: { select: { gstin: true } } },
      })
    : [];
  const outReturnGstinById = new Map(outReturns.map((r) => [r.id, r.customer?.gstin ?? null]));

  for (const gl of outputGstLines) {
    // CNs net against output tax — but a STATUTORY_PAYMENT debit is the
    // challan remittance draining the payable, not a reduced supply. It
    // must not net against the period's output liability.
    if (gl.journalEntry.sourceType === "STATUTORY_PAYMENT") continue;
    const gstAmount = new Decimal(gl.credit).minus(gl.debit);
    if (gstAmount.isZero()) continue;
    outwardOutputGst = outwardOutputGst.plus(gstAmount);

    let partyGstin: string | null = null;
    if (gl.journalEntry.sourceId) {
      if (gl.journalEntry.sourceType === "ASSET_SALE") {
        partyGstin = outAssetSaleGstinById.get(gl.journalEntry.sourceId) ?? null;
      } else if (gl.journalEntry.sourceType === "MATERIAL_SALE") {
        partyGstin = outMaterialSaleGstinById.get(gl.journalEntry.sourceId) ?? null;
      } else if (gl.journalEntry.sourceType === "MATERIAL_SALE_RETURN") {
        partyGstin = outReturnGstinById.get(gl.journalEntry.sourceId) ?? null;
      }
    }

    const split = splitGst(gstAmount, companyGstin, partyGstin);
    outwardCgst = outwardCgst.plus(split.cgst);
    outwardSgst = outwardSgst.plus(split.sgst);
    outwardIgst = outwardIgst.plus(split.igst);
  }

  // Sales revenue (taxable value) — net of credit-note revenue reversals.
  const revenueLines = await prisma.journalLine.aggregate({
    where: {
      accountId: { in: revenueAccountIds3b },
      journalEntry: {
        companyId,
        entryDate: { gte: fromDate, lte: toDate },
      },
    },
    _sum: { credit: true, debit: true },
  });
  const outwardTaxableValue = new Decimal(revenueLines._sum?.credit ?? 0)
    .minus(new Decimal(revenueLines._sum?.debit ?? 0));

  // ── Inward supplies: compute per-entry to get CGST/SGST/IGST split ──
  const inputGstLineRecords = inputGstId3b
    ? await prisma.journalLine.findMany({
        where: {
          accountId: inputGstId3b,
          debit: { gt: 0 },
          journalEntry: {
            companyId,
            entryDate: { gte: fromDate, lte: toDate },
          },
        },
        include: {
          journalEntry: { select: { id: true, sourceType: true, sourceId: true } },
        },
      })
    : [];

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
      accountId: inventoryId3b!,
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

  // ITC reversed (credited back) — from supplier returns, cancellations.
  // A STATUTORY_PAYMENT credit is the ITC-utilisation leg of the monthly
  // challan (Dr 2100 / Cr 1400 / Cr Bank) — that's ITC *used*, not
  // reversed, and must not deflate net ITC.
  const itcReversedLines = await prisma.journalLine.aggregate({
    where: {
      accountId: inputGstId3b!,
      credit: { gt: 0 },
      journalEntry: {
        companyId,
        entryDate: { gte: fromDate, lte: toDate },
        sourceType: { not: "STATUTORY_PAYMENT" },
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
