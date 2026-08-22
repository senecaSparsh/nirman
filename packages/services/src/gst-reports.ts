import { prisma } from "@nirman/db";
import Decimal from "decimal.js";

/**
 * GST Reconciliation Reports — GSTR-1 (outward supplies) and GSTR-3B (summary return).
 *
 * These reports aggregate from JournalEntry + JournalLine rows where the
 * GST accounts (Input GST 1400 / Output GST 2100) are debited/credited.
 * They provide the data needed to file GST returns.
 */

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
  }[];
}

export interface Gstr3bReport {
  fromDate: Date;
  toDate: Date;
  companyId: string;
  // 3.1 — Outward supplies
  outwardTaxableValue: Decimal;
  outwardOutputGst: Decimal;
  // 3.2 — Inward supplies
  inwardTaxableValue: Decimal;
  inwardInputGst: Decimal;
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
      journalEntry: { select: { id: true, entryDate: true, sourceType: true, memo: true } },
    },
    orderBy: { journalEntry: { entryDate: "asc" } },
  });

  const entries: Gstr1Report["entries"] = [];
  let totalTaxableValue = new Decimal(0);
  let totalOutputGst = new Decimal(0);

  for (const gl of gstLines) {
    const gstAmount = new Decimal(gl.credit);
    // The taxable value is the sales revenue line (4000) in the same journal entry
    const revenueLine = await prisma.journalLine.findFirst({
      where: {
        journalEntryId: gl.journalEntryId,
        accountCode: { in: ["4000", "4100", "4200"] },
        credit: { gt: 0 },
      },
    });
    const taxableValue = revenueLine ? new Decimal(revenueLine.credit) : new Decimal(0);
    // Derive GST rate from the amounts (gst / taxable * 100)
    const gstRate = taxableValue.gt(0)
      ? gstAmount.div(taxableValue).times(100)
      : new Decimal(0);

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
    });
  }

  // For simplicity, assume all GST is IGST (inter-state). In a real system,
  // CGST/SGST split would be determined by place of supply.
  return {
    fromDate,
    toDate,
    companyId,
    totalTaxableValue,
    totalOutputGst,
    totalCgst: new Decimal(0),  // would need place-of-supply logic
    totalSgst: new Decimal(0),
    totalIgst: totalOutputGst,
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
  // Output GST (credited) — from sales
  const outputGstLines = await prisma.journalLine.aggregate({
    where: {
      accountCode: "2100",
      credit: { gt: 0 },
      journalEntry: {
        companyId,
        entryDate: { gte: fromDate, lte: toDate },
      },
    },
    _sum: { credit: true },
  });
  const outwardOutputGst = new Decimal(outputGstLines._sum?.credit ?? 0);

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

  // Input GST (ITC) — debited from purchases
  const inputGstLines = await prisma.journalLine.aggregate({
    where: {
      accountCode: "1400",
      debit: { gt: 0 },
      journalEntry: {
        companyId,
        entryDate: { gte: fromDate, lte: toDate },
      },
    },
    _sum: { debit: true },
  });
  const itcAvailable = new Decimal(inputGstLines._sum?.debit ?? 0);

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
    inwardTaxableValue,
    inwardInputGst: itcAvailable,
    itcAvailable: netItc,
    itcReversed,
    netGstPayable: netGstPayable.gt(0) ? netGstPayable : new Decimal(0),
    itcCarriedForward,
  };
}
