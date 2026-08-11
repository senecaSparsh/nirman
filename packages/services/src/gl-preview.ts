/**
 * GL Preview — pure functions that compute the journal lines for a
 * given mutation WITHOUT persisting anything. Used by the "Preview
 * GL Impact" UI to show the user exactly which accounts will be
 * debited/credited before they confirm the action.
 *
 * These mirror the posting logic in gl-posting.ts but return the
 * lines as data instead of writing them to the DB.
 */

import Decimal from "decimal.js";
import { ACCT } from "./gl-posting";

export interface GlPreviewLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo?: string;
}

const ACCOUNT_NAMES: Record<string, string> = {
  "1000": "Cash / Bank",
  "1200": "Accounts Receivable",
  "1300": "Inventory - Materials",
  "1400": "Input GST / ITC",
  "1500": "WIP - Project Costs",
  "1600": "Advances to Subcontractors",
  "1700": "Unsold Assets - Land",
  "1800": "Unsold Assets - Built Units",
  "1900": "Equipment & Fixtures",
  "2000": "Accounts Payable",
  "2100": "Output GST",
  "2200": "Salaries Payable",
  "2250": "PF Payable",
  "2300": "Security Deposits Payable",
  "2350": "ESI Payable",
  "2400": "TDS Payable",
  "2450": "Profession Tax Payable",
  "2500": "Customer Deposits",
  "2600": "Retention Payable",
  "3000": "Retained Earnings",
  "4000": "Sales Revenue",
  "4100": "Cost Recovery",
  "5000": "Cost of Goods Sold",
  "5500": "Inventory Shrinkage",
  "6000": "Operating Expenses",
  "6100": "Salaries Expense",
};

function accountName(code: string): string {
  return ACCOUNT_NAMES[code] ?? `Account ${code}`;
}

function toNum(d: Decimal | number | string): number {
  if (d instanceof Decimal) return d.toNumber();
  return Number(d);
}

/**
 * Preview the GL impact of an expense entry.
 *
 *   Dr Operating Expenses    (amount)
 *   Cr Cash / Bank           (amount)
 */
export function previewExpenseGl(amount: number): GlPreviewLine[] {
  return [
    {
      accountCode: ACCT.OPERATING_EXPENSE,
      accountName: accountName(ACCT.OPERATING_EXPENSE),
      debit: amount,
      credit: 0,
      memo: "Operating expense",
    },
    {
      accountCode: ACCT.CASH,
      accountName: accountName(ACCT.CASH),
      debit: 0,
      credit: amount,
    },
  ];
}

/**
 * Preview the GL impact of a project cost entry.
 *
 *   Dr WIP - Project Costs   (amount)
 *   Cr Cash / Bank           (amount)
 */
export function previewProjectCostGl(amount: number): GlPreviewLine[] {
  return [
    {
      accountCode: ACCT.WIP,
      accountName: accountName(ACCT.WIP),
      debit: amount,
      credit: 0,
      memo: "Project cost capitalization",
    },
    {
      accountCode: ACCT.CASH,
      accountName: accountName(ACCT.CASH),
      debit: 0,
      credit: amount,
    },
  ];
}

/**
 * Preview the GL impact of a purchase receipt.
 *
 *   Dr Inventory - Materials  (subtotal)
 *   Dr Input GST / ITC        (gst)
 *   Cr Accounts Payable       (total = subtotal + gst)
 */
export function previewPurchaseReceiptGl(
  subtotal: number,
  gstRate: number,
): GlPreviewLine[] {
  const gst = new Decimal(subtotal).times(new Decimal(gstRate)).div(100).toNumber();
  const total = subtotal + gst;
  return [
    {
      accountCode: ACCT.INVENTORY,
      accountName: accountName(ACCT.INVENTORY),
      debit: subtotal,
      credit: 0,
      memo: "Material received",
    },
    {
      accountCode: ACCT.INPUT_GST,
      accountName: accountName(ACCT.INPUT_GST),
      debit: gst,
      credit: 0,
      memo: "Input GST (ITC)",
    },
    {
      accountCode: ACCT.AP,
      accountName: accountName(ACCT.AP),
      debit: 0,
      credit: total,
      memo: "Owed to supplier",
    },
  ];
}

/**
 * Preview the GL impact of a material issue to project.
 *
 *   Dr WIP - Project Costs    (qty × unitCost)
 *   Cr Inventory - Materials  (qty × unitCost)
 */
export function previewMaterialIssueGl(
  lines: { qty: number; unitCost: number }[],
): GlPreviewLine[] {
  const total = lines.reduce(
    (sum, l) => sum + new Decimal(l.qty).times(new Decimal(l.unitCost)).toNumber(),
    0,
  );
  return [
    {
      accountCode: ACCT.WIP,
      accountName: accountName(ACCT.WIP),
      debit: total,
      credit: 0,
      memo: "Materials issued to project",
    },
    {
      accountCode: ACCT.INVENTORY,
      accountName: accountName(ACCT.INVENTORY),
      debit: 0,
      credit: total,
      memo: "Stock consumed",
    },
  ];
}

/**
 * Preview the GL impact of an asset sale.
 *
 *   Dr Accounts Receivable / Cash  (total)
 *   Cr Sales Revenue                (subtotal)
 *   Cr Output GST                   (gst)
 */
export function previewAssetSaleGl(
  subtotal: number,
  gstRate: number,
): GlPreviewLine[] {
  const gst = new Decimal(subtotal).times(new Decimal(gstRate)).div(100).toNumber();
  const total = subtotal + gst;
  return [
    {
      accountCode: ACCT.AR,
      accountName: accountName(ACCT.AR),
      debit: total,
      credit: 0,
      memo: "Sale receivable",
    },
    {
      accountCode: ACCT.SALES_REVENUE,
      accountName: accountName(ACCT.SALES_REVENUE),
      debit: 0,
      credit: subtotal,
      memo: "Sale revenue",
    },
    {
      accountCode: ACCT.OUTPUT_GST,
      accountName: accountName(ACCT.OUTPUT_GST),
      debit: 0,
      credit: gst,
      memo: "Output GST collected",
    },
  ];
}

/**
 * Preview the GL impact of a stock count reconciliation.
 *
 * For gains (counted > system):
 *   Dr Inventory - Materials   (gain value)
 *   Cr Operating Expenses      (gain value)
 *
 * For losses (counted < system):
 *   Dr Inventory Shrinkage     (loss value)
 *   Cr Inventory - Materials   (loss value)
 */
export function previewStockAdjustmentGl(
  lines: { variance: number; unitCost: number }[],
): GlPreviewLine[] {
  let gains = 0;
  let losses = 0;
  for (const l of lines) {
    if (l.variance === 0) continue;
    const value = Math.abs(l.variance) * l.unitCost;
    if (l.variance > 0) gains += value;
    else losses += value;
  }
  if (gains === 0 && losses === 0) return [];

  const result: GlPreviewLine[] = [];
  if (gains > 0) {
    result.push({
      accountCode: ACCT.INVENTORY,
      accountName: accountName(ACCT.INVENTORY),
      debit: gains,
      credit: 0,
      memo: "Stock count gain",
    });
    result.push({
      accountCode: ACCT.OPERATING_EXPENSE,
      accountName: accountName(ACCT.OPERATING_EXPENSE),
      debit: 0,
      credit: gains,
      memo: "Inventory gain on count",
    });
  }
  if (losses > 0) {
    result.push({
      accountCode: ACCT.INVENTORY_SHRINKAGE,
      accountName: accountName(ACCT.INVENTORY_SHRINKAGE),
      debit: losses,
      credit: 0,
      memo: "Inventory shrinkage (stock count loss)",
    });
    result.push({
      accountCode: ACCT.INVENTORY,
      accountName: accountName(ACCT.INVENTORY),
      debit: 0,
      credit: losses,
      memo: "Stock count loss",
    });
  }
  return result;
}

/**
 * Preview the GL impact of payroll processing.
 *
 *   Dr Salaries Expense           (gross + employer PF)
 *   Cr Salaries Payable           (net pay)
 *   Cr PF Payable                 (employee + employer PF)   [if > 0]
 *   Cr ESI Payable                (ESI)                      [if > 0]
 *   Cr Profession Tax Payable     (profession tax)           [if > 0]
 *   Cr TDS Payable                (TDS)                      [if > 0]
 *   Cr Salaries Payable           (other deductions)         [if > 0]
 */
export function previewPayrollGl(opts: {
  totalGross: number;
  totalNet: number;
  totalPF?: number;
  totalEmployerPf?: number;
  totalESI?: number;
  totalProfessionTax?: number;
  totalTDS?: number;
  totalDeductions?: number;
}): GlPreviewLine[] {
  const totalGross = opts.totalGross;
  const totalNet = opts.totalNet;
  const totalPF = opts.totalPF ?? 0;
  const totalEmployerPf = opts.totalEmployerPf ?? 0;
  const totalESI = opts.totalESI ?? 0;
  const totalProfessionTax = opts.totalProfessionTax ?? 0;
  const totalTDS = opts.totalTDS ?? 0;
  const totalDeductions = opts.totalDeductions ?? 0;
  const otherDeductions = totalDeductions - totalPF - totalESI - totalProfessionTax - totalTDS;

  const totalExpense = totalGross + totalEmployerPf;
  const totalPfPayable = totalPF + totalEmployerPf;

  const result: GlPreviewLine[] = [
    {
      accountCode: ACCT.SALARIES_EXPENSE,
      accountName: accountName(ACCT.SALARIES_EXPENSE),
      debit: totalExpense,
      credit: 0,
      memo: "Gross salary expense + employer PF",
    },
    {
      accountCode: ACCT.SALARIES_PAYABLE,
      accountName: accountName(ACCT.SALARIES_PAYABLE),
      debit: 0,
      credit: totalNet,
      memo: "Net pay payable to employees",
    },
  ];
  if (totalPfPayable > 0) {
    result.push({
      accountCode: ACCT.PF_PAYABLE,
      accountName: accountName(ACCT.PF_PAYABLE),
      debit: 0,
      credit: totalPfPayable,
      memo: "PF payable to EPFO (employee + employer)",
    });
  }
  if (totalESI > 0) {
    result.push({
      accountCode: ACCT.ESI_PAYABLE,
      accountName: accountName(ACCT.ESI_PAYABLE),
      debit: 0,
      credit: totalESI,
      memo: "ESI payable to ESIC",
    });
  }
  if (totalProfessionTax > 0) {
    result.push({
      accountCode: ACCT.PROFESSION_TAX_PAYABLE,
      accountName: accountName(ACCT.PROFESSION_TAX_PAYABLE),
      debit: 0,
      credit: totalProfessionTax,
      memo: "Profession tax payable to state",
    });
  }
  if (totalTDS > 0) {
    result.push({
      accountCode: ACCT.TDS_PAYABLE,
      accountName: accountName(ACCT.TDS_PAYABLE),
      debit: 0,
      credit: totalTDS,
      memo: "TDS payable to Income Tax",
    });
  }
  if (otherDeductions > 0) {
    result.push({
      accountCode: ACCT.SALARIES_PAYABLE,
      accountName: accountName(ACCT.SALARIES_PAYABLE),
      debit: 0,
      credit: otherDeductions,
      memo: "Other deductions (loans/advances)",
    });
  }
  return result;
}
