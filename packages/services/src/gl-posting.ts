import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * General Ledger Posting Service — the accounting layer behind the costing.
 *
 * The stock ledger tracks quantities + MAC; the GL tracks the money. Every
 * financial mutation posts a BALANCED double-entry JournalEntry (Σ debits =
 * Σ credits). This lets an accountant close the books and produce a trial
 * balance, and it's where GST (input tax credit / output tax) is recorded.
 *
 * Posting happens INSIDE the same Prisma transaction as the source mutation
 * (e.g. receiveGoods posts the receipt journal entry in the same tx that
 * records the stock movement). If the mutation rolls back, the posting rolls
 * back too — the books never diverge from reality.
 *
 * Default chart of accounts (construction-industry):
 *   1000 Cash/Bank              (ASSET)
 *   1200 Accounts Receivable    (ASSET)
 *   1300 Inventory - Materials  (ASSET)
 *   1400 Input GST / ITC        (ASSET)   — recoverable tax paid on purchases
 *   1500 WIP - Project Costs    (ASSET)   — materials + labour capitalised into a project
 *   1700 Unsold Assets - Land   (ASSET)
 *   1800 Unsold Assets - Units  (ASSET)
 *   2000 Accounts Payable       (LIABILITY)
 *   2100 Output GST             (LIABILITY) — tax collected on sales, owed to the tax authority
 *   2400 TDS Payable            (LIABILITY) — tax deducted at source on subcontractor/supplier payments
 *   2500 Customer Deposits      (LIABILITY) — unearned revenue from property bookings
 *   2600 Retention Payable      (LIABILITY) — retention held from subcontractor RA bills
 *   4000 Sales Revenue          (REVENUE)
 *   5000 Cost of Goods Sold     (EXPENSE)
 *   6000 Operating Expenses     (EXPENSE)
 */

export const CHART_OF_ACCOUNTS = [
  { code: "1000", name: "Cash / Bank", type: "ASSET" as const },
  { code: "1200", name: "Accounts Receivable", type: "ASSET" as const },
  { code: "1300", name: "Inventory - Materials", type: "ASSET" as const },
  { code: "1400", name: "Input GST / ITC", type: "ASSET" as const },
  { code: "1500", name: "WIP - Project Costs", type: "ASSET" as const },
  { code: "1600", name: "Advances to Subcontractors", type: "ASSET" as const },
  { code: "1700", name: "Unsold Assets - Land", type: "ASSET" as const },
  { code: "1800", name: "Unsold Assets - Built Units", type: "ASSET" as const },
  { code: "1900", name: "Equipment & Fixtures", type: "ASSET" as const },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" as const },
  { code: "2100", name: "Output GST", type: "LIABILITY" as const },
  { code: "2200", name: "Salaries Payable", type: "LIABILITY" as const },
  { code: "2250", name: "PF Payable", type: "LIABILITY" as const },
  { code: "2300", name: "Security Deposits Payable", type: "LIABILITY" as const },
  { code: "2350", name: "ESI Payable", type: "LIABILITY" as const },
  { code: "2400", name: "TDS Payable", type: "LIABILITY" as const },
  { code: "2450", name: "Profession Tax Payable", type: "LIABILITY" as const },
  { code: "2500", name: "Customer Deposits - Unearned Revenue", type: "LIABILITY" as const },
  { code: "2600", name: "Retention Payable - Subcontractor", type: "LIABILITY" as const },
  { code: "3000", name: "Retained Earnings", type: "EQUITY" as const },
  { code: "4000", name: "Sales Revenue", type: "REVENUE" as const },
  { code: "4100", name: "Cost Recovery - Scrap Sales", type: "CONTRA_EXPENSE" as const },
  { code: "5000", name: "Cost of Goods Sold", type: "EXPENSE" as const },
  { code: "5500", name: "Inventory Shrinkage Expense", type: "EXPENSE" as const },
  { code: "6000", name: "Operating Expenses", type: "EXPENSE" as const },
  { code: "6100", name: "Salaries & Wages Expense", type: "EXPENSE" as const },
];

/** Account code constants — used by posting functions so codes are typo-proof. */
export const ACCT = {
  CASH: "1000",
  AR: "1200",
  INVENTORY: "1300",
  INPUT_GST: "1400",
  WIP: "1500",
  ADVANCE_TO_SUB: "1600",
  LAND_ASSET: "1700",
  UNIT_ASSET: "1800",
  EQUIPMENT_ASSET: "1900",
  AP: "2000",
  OUTPUT_GST: "2100",
  SALARIES_PAYABLE: "2200",
  PF_PAYABLE: "2250",
  SECURITY_DEPOSITS_PAYABLE: "2300",
  ESI_PAYABLE: "2350",
  TDS_PAYABLE: "2400",
  PROFESSION_TAX_PAYABLE: "2450",
  CUSTOMER_DEPOSIT: "2500",
  RETENTION_PAYABLE: "2600",
  RETAINED_EARNINGS: "3000",
  SALES_REVENUE: "4000",
  COST_RECOVERY: "4100",
  COGS: "5000",
  INVENTORY_SHRINKAGE: "5500",
  OPERATING_EXPENSE: "6000",
  SALARIES_EXPENSE: "6100",
} as const;

/**
 * Seed the default chart of accounts. Idempotent — skips accounts that
 * already exist. Call on first boot (or from a migration). Safe to re-run.
 */
export async function seedChartOfAccounts() {
  for (const a of CHART_OF_ACCOUNTS) {
    await prisma.glAccount.upsert({
      where: { code: a.code },
      create: { code: a.code, name: a.name, type: a.type, isSystem: true },
      update: { name: a.name, type: a.type },
    });
  }
}

export interface JournalLineInput {
  accountCode: string;
  debit: Decimal | number | string;
  credit: Decimal | number | string;
  entityType?: string;
  entityId?: string;
  memo?: string;
}

export interface PostJournalInput {
  companyId: string;
  sourceType: string;
  sourceId?: string;
  memo?: string;
  postedById?: string;
  lines: JournalLineInput[];
  entryDate?: Date; // optional — defaults to now; used by backfill scripts to post historical entries
}

/**
 * Post a balanced journal entry inside a transaction. Validates Σ debits =
 * Σ credits (throws on imbalance — never silently post an unbalanced entry).
 * Returns the created JournalEntry.
 */
export async function postJournalEntry(
  tx: Prisma.TransactionClient,
  input: PostJournalInput,
) {
  const lines = input.lines.map((l) => ({
    accountCode: l.accountCode,
    debit: new Decimal(l.debit),
    credit: new Decimal(l.credit),
    entityType: l.entityType,
    entityId: l.entityId,
    memo: l.memo,
  }));

  const totalDebit = lines.reduce((s, l) => s.plus(l.debit), new Decimal(0));
  const totalCredit = lines.reduce((s, l) => s.plus(l.credit), new Decimal(0));
  if (!totalDebit.equals(totalCredit)) {
    throw new ServiceError(
      `Unbalanced journal entry: debits ${totalDebit} ≠ credits ${totalCredit} (${input.sourceType})`,
    );
  }
  // An entry with no movement is meaningless — reject it.
  if (totalDebit.isZero()) {
    return null;
  }

  const d = input.entryDate ?? new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `JE-${ymd}-`;
  const count = await tx.journalEntry.count({ where: { entryNumber: { startsWith: prefix } } });
  const entryNumber = `${prefix}${String(count + 1).padStart(5, "0")}`;

  const entry = await tx.journalEntry.create({
    data: {
      entryNumber,
      entryDate: d,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      memo: input.memo,
      companyId: input.companyId,
      postedById: input.postedById,
      status: "POSTED",
      totalDebit,
      totalCredit,
      lines: {
        create: lines.map((l) => ({
          accountCode: l.accountCode,
          debit: l.debit,
          credit: l.credit,
          entityType: l.entityType,
          entityId: l.entityId,
          memo: l.memo,
        })),
      },
    },
    include: { lines: true },
  });

  await logAction(tx, {
    userId: input.postedById,
    action: "JOURNAL_ENTRY_POST",
    entityType: "JournalEntry",
    entityId: entry.id,
    after: { entryNumber, sourceType: input.sourceType, sourceId: input.sourceId, totalDebit: totalDebit.toString() },
  });

  return entry;
}

/**
 * Reverse a previously posted journal entry by creating a mirror entry
 * with debits and credits swapped. Used when a source transaction is
 * deleted (e.g. project cost removed) — the original entry stays as a
 * historical record, and the reversal brings the books back in line.
 *
 * The `sourceId` of the reversal is set to the original entry's `sourceId`
 * so they can be paired in reports.
 */
export async function reverseJournalEntry(
  tx: Prisma.TransactionClient,
  originalEntryId: string,
  opts: { postedById?: string; memo?: string },
) {
  const original = await tx.journalEntry.findUnique({
    where: { id: originalEntryId },
    include: { lines: true },
  });
  if (!original) throw new ServiceError("Journal entry not found — cannot reverse", 404);
  if (original.lines.length === 0) return null;

  // Swap debits and credits
  const reversedLines: JournalLineInput[] = original.lines.map((l) => ({
    accountCode: l.accountCode,
    debit: l.credit,
    credit: l.debit,
    entityType: l.entityType ?? undefined,
    entityId: l.entityId ?? undefined,
  }));

  return postJournalEntry(tx, {
    companyId: original.companyId,
    sourceType: `${original.sourceType}_REVERSAL`,
    sourceId: original.sourceId ?? undefined,
    memo: opts.memo ?? `Reversal of ${original.entryNumber}`,
    postedById: opts.postedById,
    lines: reversedLines,
  });
}

// ───────────────────────────────────────────────────────────
//  Domain-specific posting helpers. Each mirrors a business event
//  and encodes the correct double-entry. Call these from inside the
//  matching service transaction so the books post atomically.
// ───────────────────────────────────────────────────────────

/**
 * PO Receipt: capitalise materials into inventory, recognise recoverable
 * input GST, and credit the supplier (Accounts Payable) for the full amount.
 *
 *   Dr Inventory - Materials   (subtotal = Σ qty × unitCost)
 *   Dr Input GST / ITC          (gst      = Σ qty × unitCost × gstRate/100)
 *   Cr Accounts Payable         (total    = subtotal + gst)
 */
export async function postPurchaseReceipt(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    purchaseOrderId: string;
    goodsReceiptId: string;
    postedById?: string;
    lines: { materialId: string; qty: Decimal; unitCost: Decimal; gstRate: Decimal }[];
  },
) {
  let subtotal = new Decimal(0);
  let gst = new Decimal(0);
  for (const l of opts.lines) {
    const lineSubtotal = new Decimal(l.qty).times(new Decimal(l.unitCost));
    const lineGst = lineSubtotal.times(new Decimal(l.gstRate)).div(100);
    subtotal = subtotal.plus(lineSubtotal);
    gst = gst.plus(lineGst);
  }
  const total = subtotal.plus(gst);

  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "PO_RECEIPT",
    sourceId: opts.goodsReceiptId,
    memo: `Goods receipt against PO`,
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.INVENTORY, debit: subtotal, credit: 0, entityType: "PurchaseOrder", entityId: opts.purchaseOrderId, memo: "Materials received" },
      { accountCode: ACCT.INPUT_GST, debit: gst, credit: 0, memo: "Input GST (ITC)" },
      { accountCode: ACCT.AP, debit: 0, credit: total, entityType: "PurchaseOrder", entityId: opts.purchaseOrderId, memo: "Payable to supplier" },
    ],
  });
}

/**
 * Material Issue to project: move cost from inventory into WIP.
 *
 *   Dr WIP - Project Costs   (totalCost = Σ qty × MAC)
 *   Cr Inventory - Materials  (totalCost)
 */
export async function postMaterialIssue(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    materialIssueId: string;
    projectId: string;
    postedById?: string;
    totalCost: Decimal;
  },
) {
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "MATERIAL_ISSUE",
    sourceId: opts.materialIssueId,
    memo: "Materials issued to project",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.WIP, debit: opts.totalCost, credit: 0, entityType: "Project", entityId: opts.projectId },
      { accountCode: ACCT.INVENTORY, debit: 0, credit: opts.totalCost, entityType: "MaterialIssue", entityId: opts.materialIssueId },
    ],
  });
}

/**
 * WIP Capitalization: move completed production costs from WIP into the
 * finished asset account. This is the MISSING DEBIT side of the unit sale —
 * postAssetSale credits UNIT_ASSET (1800) on sale, but nothing ever debited
 * it. This function is called when a unit transitions to AVAILABLE, moving
 * its accumulated production cost from WIP (1500) to Unsold Assets - Units
 * (1800).
 *
 *   Dr Unsold Assets - Units  (1800)   [costBasis]
 *   Cr WIP - Project Costs    (1500)   [costBasis]
 *
 * Idempotent by design — the caller checks `BuiltUnit.capitalizedAmount`
 * and only posts the delta (productionCost - capitalizedAmount). If the
 * delta is zero, postJournalEntry returns null (no entry posted).
 */
export async function postWipCapitalization(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    builtUnitId: string;
    projectId: string;
    costBasis: Decimal;
    postedById?: string;
    entryDate?: Date; // optional — used by backfill to post historical entries
  },
) {
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "WIP_CAPITALIZATION",
    sourceId: opts.builtUnitId,
    memo: "WIP capitalized — unit completed",
    postedById: opts.postedById,
    entryDate: opts.entryDate,
    lines: [
      { accountCode: ACCT.UNIT_ASSET, debit: opts.costBasis, credit: 0, entityType: "BuiltUnit", entityId: opts.builtUnitId },
      { accountCode: ACCT.WIP, debit: 0, credit: opts.costBasis, entityType: "Project", entityId: opts.projectId },
    ],
  });
}

/**
 * Scrap Generation: record the value of internally generated scrap material
 * added to stock. The scrap is valued at a user-specified (or auto-calculated)
 * unit cost, typically lower than the source material's MAC.
 *
 * For project-linked scrap: credit WIP (1500) — the scrap value is recovered
 * from the project's work-in-progress, reducing the project's capitalized cost.
 *
 * For standalone scrap (no project): credit OPERATING_EXPENSE (6000) — the
 * scrap value is treated as a contra-expense (reduction of operating costs),
 * NOT as revenue. Revenue is recognized at SALE time via postMaterialSale()
 * which credits COST_RECOVERY (4100). Crediting revenue at generation time
 * would violate the revenue recognition principle.
 *
 *   Dr Inventory - Materials  (1300)   [totalValue]
 *   Cr WIP - Project Costs    (1500)   [totalValue]   — if project-linked
 *   Cr Operating Expenses     (6000)   [totalValue]   — if standalone
 */
export async function postScrapGeneration(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    scrapGenerationId: string;
    projectId?: string;
    totalValue: Decimal;
    postedById?: string;
  },
) {
  const value = new Decimal(opts.totalValue);
  if (value.isZero()) return null;

  const creditAccount = opts.projectId ? ACCT.WIP : ACCT.OPERATING_EXPENSE;

  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "SCRAP_GENERATION",
    sourceId: opts.scrapGenerationId,
    memo: opts.projectId
      ? "Scrap generated — cost recovered from WIP"
      : "Scrap material generated — cost recovery",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.INVENTORY, debit: value, credit: 0, entityType: "ScrapGeneration", entityId: opts.scrapGenerationId },
      { accountCode: creditAccount, debit: 0, credit: value, entityType: opts.projectId ? "Project" : "ScrapGeneration", entityId: opts.projectId ?? opts.scrapGenerationId },
    ],
  });
}

/**
 * Material Issue to department (cost center): move cost from inventory into
 * Operating Expenses. Department issues are NOT capitalised — a department is
 * an ongoing operational cost center (Boiler, Dryer, Workshop, …), not a
 * build, so its consumption is expensed in the period it occurs.
 *
 *   Dr Operating Expenses     (totalCost = Σ qty × MAC)
 *   Cr Inventory - Materials  (totalCost)
 */
export async function postMaterialIssueToDepartment(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    materialIssueId: string;
    departmentId: string;
    postedById?: string;
    totalCost: Decimal;
  },
) {
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "MATERIAL_ISSUE_DEPARTMENT",
    sourceId: opts.materialIssueId,
    memo: "Materials issued to department",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.OPERATING_EXPENSE, debit: opts.totalCost, credit: 0, entityType: "Department", entityId: opts.departmentId },
      { accountCode: ACCT.INVENTORY, debit: 0, credit: opts.totalCost, entityType: "MaterialIssue", entityId: opts.materialIssueId },
    ],
  });
}

/**
 * Asset Sale: recognise revenue + receivable, and relieve the asset at cost (COGS).
 *
 *   Dr Accounts Receivable        (salePrice + gstAmount)
 *   Cr Sales Revenue              (salePrice)
 *   Cr Output GST                 (gstAmount)         — only if gstAmount > 0
 *   Dr Cost of Goods Sold         (costBasis)
 *   Cr Unsold Assets (Land/Unit)  (costBasis)
 */
export async function postAssetSale(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    assetSaleId: string;
    assetType: "LAND" | "BUILT_UNIT";
    salePrice: Decimal;
    costBasis: Decimal;
    gstAmount?: Decimal;
    postedById?: string;
  },
) {
  const assetAcct = opts.assetType === "LAND" ? ACCT.LAND_ASSET : ACCT.UNIT_ASSET;
  const gst = opts.gstAmount ? new Decimal(opts.gstAmount) : new Decimal(0);
  const receivable = new Decimal(opts.salePrice).plus(gst);
  // Revenue leg (with Output GST if applicable)
  const revenueLines: JournalLineInput[] = [
    { accountCode: ACCT.AR, debit: receivable, credit: 0, entityType: "AssetSale", entityId: opts.assetSaleId, memo: "Receivable from customer" },
    { accountCode: ACCT.SALES_REVENUE, debit: 0, credit: opts.salePrice, memo: "Sales revenue" },
  ];
  if (gst.gt(0)) {
    revenueLines.push({ accountCode: ACCT.OUTPUT_GST, debit: 0, credit: gst, entityType: "AssetSale", entityId: opts.assetSaleId, memo: "Output GST on sale" });
  }
  await postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "ASSET_SALE",
    sourceId: opts.assetSaleId,
    memo: `Sale of ${opts.assetType === "LAND" ? "land" : "built unit"}`,
    postedById: opts.postedById,
    lines: revenueLines,
  });
  // COGS leg (relieve the asset at its cost basis)
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "ASSET_SALE_COGS",
    sourceId: opts.assetSaleId,
    memo: `COGS on ${opts.assetType === "LAND" ? "land" : "unit"} sale`,
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.COGS, debit: opts.costBasis, credit: 0, entityType: "AssetSale", entityId: opts.assetSaleId },
      { accountCode: assetAcct, debit: 0, credit: opts.costBasis, entityType: "AssetSale", entityId: opts.assetSaleId },
    ],
  });
}

/**
 * Payment received against an asset sale: settle the receivable into cash.
 *
 *   Dr Cash / Bank        (amount)
 *   Cr Accounts Receivable (amount)
 */
export async function postPaymentReceived(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    assetSaleId: string;
    paymentId: string;
    amount: Decimal;
    postedById?: string;
  },
) {
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "PAYMENT_RECEIVED",
    sourceId: opts.paymentId,
    memo: "Payment received against sale",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.CASH, debit: opts.amount, credit: 0, entityType: "AssetSalePayment", entityId: opts.paymentId },
      { accountCode: ACCT.AR, debit: 0, credit: opts.amount, entityType: "AssetSale", entityId: opts.assetSaleId },
    ],
  });
}

/**
 * Customer deposit received against an asset sale: record the cash inflow as a
 * LIABILITY (unearned revenue). Revenue + COGS are NOT recognised yet — that
 * happens in `postAssetSale` when the sale completes.
 *
 *   Dr Cash / Bank            (depositAmount)
 *   Cr Customer Deposits       (depositAmount)
 */
export async function postDepositReceived(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    assetSaleId: string;
    amount: Decimal;
    postedById?: string;
  },
) {
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "ASSET_SALE_DEPOSIT",
    sourceId: opts.assetSaleId,
    memo: "Customer deposit received (sale pending)",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.CASH, debit: opts.amount, credit: 0, entityType: "AssetSale", entityId: opts.assetSaleId, memo: "Deposit cash received" },
      { accountCode: ACCT.CUSTOMER_DEPOSIT, debit: 0, credit: opts.amount, entityType: "AssetSale", entityId: opts.assetSaleId, memo: "Customer deposit liability" },
    ],
  });
}

/**
 * Refund a customer deposit when a sale is cancelled before completion.
 * Reverses the original deposit entry.
 *
 *   Dr Customer Deposits       (depositAmount)
 *   Cr Cash / Bank             (depositAmount)
 */
export async function postDepositRefund(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    assetSaleId: string;
    amount: Decimal;
    postedById?: string;
  },
) {
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "ASSET_SALE_DEPOSIT_REFUND",
    sourceId: opts.assetSaleId,
    memo: "Customer deposit refunded (sale cancelled)",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.CUSTOMER_DEPOSIT, debit: opts.amount, credit: 0, entityType: "AssetSale", entityId: opts.assetSaleId, memo: "Reverse deposit liability" },
      { accountCode: ACCT.CASH, debit: 0, credit: opts.amount, entityType: "AssetSale", entityId: opts.assetSaleId, memo: "Deposit refund to customer" },
    ],
  });
}

/**
 * Payment received against a material sale: settle the receivable into cash.
 *
 *   Dr Cash / Bank        (amount)
 *   Cr Accounts Receivable (amount)
 */
export async function postMaterialSalePayment(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    materialSaleId: string;
    paymentId: string;
    amount: Decimal;
    postedById?: string;
  },
) {
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "MATERIAL_SALE_PAYMENT",
    sourceId: opts.paymentId,
    memo: "Payment received against material sale",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.CASH, debit: opts.amount, credit: 0, entityType: "MaterialSalePayment", entityId: opts.paymentId },
      { accountCode: ACCT.AR, debit: 0, credit: opts.amount, entityType: "MaterialSale", entityId: opts.materialSaleId },
    ],
  });
}

/**
 * Material Sale: sell inventory items to a customer.
 * Relieve inventory at MAC (COGS), recognise revenue + receivable + output GST.
 *
 *   Dr Accounts Receivable        (totalAmount = subtotal + gstTotal)
 *   Cr Sales Revenue              (subtotal)
 *   Cr Output GST                 (gstTotal)           — only if gstTotal > 0
 *   Dr Cost of Goods Sold         (totalCost = Σ qty × MAC)
 *   Cr Inventory - Materials      (totalCost)
 */
export async function postMaterialSale(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    materialSaleId: string;
    subtotal: Decimal;
    gstTotal: Decimal;
    roundOff?: Decimal;
    totalCost: Decimal;
    /** Portion of subtotal from scrap-material lines — credited to Cost Recovery instead of Sales Revenue */
    scrapSubtotal?: Decimal;
    postedById?: string;
  },
) {
  const gst = new Decimal(opts.gstTotal);
  const roundOff = new Decimal(opts.roundOff ?? 0);
  const receivable = new Decimal(opts.subtotal).plus(gst).plus(roundOff);
  const scrapSubtotal = new Decimal(opts.scrapSubtotal ?? 0);
  const regularSubtotal = new Decimal(opts.subtotal).minus(scrapSubtotal);
  // Revenue leg — split scrap revenue (Cost Recovery) from regular sales revenue
  const revenueLines: JournalLineInput[] = [
    { accountCode: ACCT.AR, debit: receivable, credit: 0, entityType: "MaterialSale", entityId: opts.materialSaleId, memo: "Receivable from material sale" },
  ];
  if (regularSubtotal.gt(0)) {
    revenueLines.push({ accountCode: ACCT.SALES_REVENUE, debit: 0, credit: regularSubtotal, memo: "Material sales revenue" });
  }
  if (scrapSubtotal.gt(0)) {
    revenueLines.push({ accountCode: ACCT.COST_RECOVERY, debit: 0, credit: scrapSubtotal, memo: "Scrap sale — cost recovery" });
  }
  if (gst.gt(0)) {
    revenueLines.push({ accountCode: ACCT.OUTPUT_GST, debit: 0, credit: gst, entityType: "MaterialSale", entityId: opts.materialSaleId, memo: "Output GST on material sale" });
  }
  await postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "MATERIAL_SALE",
    sourceId: opts.materialSaleId,
    memo: "Material inventory sale",
    postedById: opts.postedById,
    lines: revenueLines,
  });
  // COGS leg (relieve inventory at MAC)
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "MATERIAL_SALE_COGS",
    sourceId: opts.materialSaleId,
    memo: "COGS on material sale",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.COGS, debit: opts.totalCost, credit: 0, entityType: "MaterialSale", entityId: opts.materialSaleId },
      { accountCode: ACCT.INVENTORY, debit: 0, credit: opts.totalCost, entityType: "MaterialSale", entityId: opts.materialSaleId },
    ],
  });
}

/**
 * Project Cost (labour/overhead/etc.): capitalise into WIP, credit cash.
 *
 *   Dr WIP - Project Costs   (amount)
 *   Cr Cash / Bank            (amount)
 */
export async function postProjectCost(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    projectCostId: string;
    projectId: string;
    amount: Decimal | number | string;
    postedById?: string;
  },
) {
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "PROJECT_COST",
    sourceId: opts.projectCostId,
    memo: "Project cost capitalised into WIP",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.WIP, debit: opts.amount, credit: 0, entityType: "Project", entityId: opts.projectId },
      { accountCode: ACCT.CASH, debit: 0, credit: opts.amount, entityType: "ProjectCost", entityId: opts.projectCostId },
    ],
  });
}

/**
 * RA Bill Approval (subcontractor billing): capitalise the gross contractor
 * work into WIP, and credit the payable side — net payable to AP, TDS to TDS
 * Payable, retention to Retention Payable, advance recovery + other deductions
 * to AP (reducing the subcontractor's payable).
 *
 *   Dr WIP - Project Costs          (grossAmount)
 *   Cr Accounts Payable             (netPayable + advanceRecovery + otherDeductions)
 *   Cr TDS Payable                  (tdsAmount)
 *   Cr Retention Payable            (retentionAmount)
 */
export async function postRaBillApproval(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    raBillId: string;
    projectId: string;
    grossAmount: Decimal | number | string;
    netPayable: Decimal | number | string;
    tdsAmount: Decimal | number | string;
    retentionAmount: Decimal | number | string;
    advanceRecovery: Decimal | number | string;
    otherDeductions: Decimal | number | string;
    postedById?: string;
  },
) {
  const gross = new Decimal(opts.grossAmount);
  const net = new Decimal(opts.netPayable);
  const tds = new Decimal(opts.tdsAmount);
  const retention = new Decimal(opts.retentionAmount);
  const advance = new Decimal(opts.advanceRecovery);
  const other = new Decimal(opts.otherDeductions);
  // AP credit = net payable + other deductions (advance recovery goes to the advance asset account)
  const apCredit = net.plus(other);

  const lines: JournalLineInput[] = [
    { accountCode: ACCT.WIP, debit: gross, credit: 0, entityType: "RaBill", entityId: opts.raBillId, memo: "Contractor expense capitalised" },
  ];
  if (apCredit.gt(0)) {
    lines.push({ accountCode: ACCT.AP, debit: 0, credit: apCredit, entityType: "RaBill", entityId: opts.raBillId, memo: "Net payable + other deductions" });
  }
  if (advance.gt(0)) {
    lines.push({ accountCode: ACCT.ADVANCE_TO_SUB, debit: 0, credit: advance, entityType: "RaBill", entityId: opts.raBillId, memo: "Advance recovery — reduces advance asset" });
  }
  if (tds.gt(0)) {
    lines.push({ accountCode: ACCT.TDS_PAYABLE, debit: 0, credit: tds, entityType: "RaBill", entityId: opts.raBillId, memo: "TDS deducted at source" });
  }
  if (retention.gt(0)) {
    lines.push({ accountCode: ACCT.RETENTION_PAYABLE, debit: 0, credit: retention, entityType: "RaBill", entityId: opts.raBillId, memo: "Retention held" });
  }

  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "RA_BILL_APPROVAL",
    sourceId: opts.raBillId,
    memo: `RA Bill approval — contractor expense`,
    postedById: opts.postedById,
    lines,
  });
}

/**
 * Renovation Cost: capitalise into WIP (for RENOVATION/ADDITION/VALUE_ADD)
 * or expense it (for REPAIR). Credit cash.
 *
 *   Capitalised:  Dr WIP - Project Costs   (amount)
 *                 Cr Cash / Bank            (amount)
 *   Expensed:     Dr Operating Expenses     (amount)
 *                 Cr Cash / Bank            (amount)
 */
export async function postRenovationCost(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    renovationCostId: string;
    renovationProjectId: string;
    projectId: string;
    amount: Decimal | number | string;
    capitalise: boolean; // true = capitalise into WIP, false = expense
    postedById?: string;
  },
) {
  const debitAccount = opts.capitalise ? ACCT.WIP : ACCT.OPERATING_EXPENSE;
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "RENOVATION_COST",
    sourceId: opts.renovationCostId,
    memo: opts.capitalise ? "Renovation cost capitalised into WIP" : "Repair cost expensed",
    postedById: opts.postedById,
    lines: [
      { accountCode: debitAccount, debit: opts.amount, credit: 0, entityType: "RenovationProject", entityId: opts.renovationProjectId },
      { accountCode: ACCT.CASH, debit: 0, credit: opts.amount, entityType: "RenovationCost", entityId: opts.renovationCostId },
    ],
  });
}

/**
 * Operating Expense: expense it (not capitalised), credit cash.
 *
 *   Dr Operating Expenses  (amount)
 *   Cr Cash / Bank          (amount)
 */
export async function postExpense(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    expenseId: string;
    amount: Decimal | number | string;
    postedById?: string;
  },
) {
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "EXPENSE",
    sourceId: opts.expenseId,
    memo: "Operating expense",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.OPERATING_EXPENSE, debit: opts.amount, credit: 0, entityType: "Expense", entityId: opts.expenseId },
      { accountCode: ACCT.CASH, debit: 0, credit: opts.amount, entityType: "Expense", entityId: opts.expenseId },
    ],
  });
}

/**
 * Supplier Return (completed): relieve the payable, return stock to inventory
 * (at the cost it was received at), and reverse the input GST.
 *
 *   Dr Accounts Payable        (total = subtotal + gst)
 *   Cr Inventory - Materials   (subtotal)
 *   Cr Input GST / ITC          (gst)
 */
export async function postSupplierReturn(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    supplierReturnId: string;
    postedById?: string;
    lines: { qty: Decimal; unitCost: Decimal; gstRate: Decimal }[];
  },
) {
  let subtotal = new Decimal(0);
  let gst = new Decimal(0);
  for (const l of opts.lines) {
    const lineSubtotal = new Decimal(l.qty).times(new Decimal(l.unitCost));
    const lineGst = lineSubtotal.times(new Decimal(l.gstRate)).div(100);
    subtotal = subtotal.plus(lineSubtotal);
    gst = gst.plus(lineGst);
  }
  const total = subtotal.plus(gst);

  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "SUPPLIER_RETURN",
    sourceId: opts.supplierReturnId,
    memo: "Return to supplier — credit note",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.AP, debit: total, credit: 0, entityType: "SupplierReturn", entityId: opts.supplierReturnId },
      { accountCode: ACCT.INVENTORY, debit: 0, credit: subtotal, entityType: "SupplierReturn", entityId: opts.supplierReturnId },
      { accountCode: ACCT.INPUT_GST, debit: 0, credit: gst, memo: "Reverse input GST" },
    ],
  });
}

/**
 * Supplier Payment: pay down accounts payable.
 *
 *   Dr Accounts Payable   (amount)      — reduces what we owe the supplier
 *   Cr Cash / Bank         (netPaid)    — money leaves the bank
 *   Cr TDS Payable         (tdsAmount)  — tax deducted at source, owed to tax authority
 *
 * When tdsAmount is 0, this simplifies to the standard Dr AP / Cr Cash.
 */
export async function postSupplierPayment(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    supplierPaymentId: string;
    supplierId: string;
    amount: Decimal;
    tdsAmount?: Decimal;
    netPaidAmount?: Decimal;
    postedById?: string;
  },
) {
  const tds = opts.tdsAmount ?? new Decimal(0);
  const netPaid = opts.netPaidAmount ?? opts.amount;
  const lines: JournalLineInput[] = [
    { accountCode: ACCT.AP, debit: opts.amount, credit: 0, entityType: "SupplierPayment", entityId: opts.supplierPaymentId, memo: "Payable paid down" },
    { accountCode: ACCT.CASH, debit: 0, credit: netPaid, entityType: "SupplierPayment", entityId: opts.supplierPaymentId, memo: "Cash paid to supplier" },
  ];
  if (tds.gt(0)) {
    lines.push({ accountCode: ACCT.TDS_PAYABLE, debit: 0, credit: tds, entityType: "SupplierPayment", entityId: opts.supplierPaymentId, memo: "TDS deducted" });
  }
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "SUPPLIER_PAYMENT",
    sourceId: opts.supplierPaymentId,
    memo: "Payment to supplier",
    postedById: opts.postedById,
    lines,
  });
}

/**
 * Land Purchase: capitalise the land as an unsold asset, credit cash/AP.
 *
 *   Dr Unsold Assets - Land   (totalCost)
 *   Cr Cash / Bank             (totalCost)
 */
export async function postLandPurchase(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    landPurchaseId: string;
    totalCost: Decimal;
    postedById?: string;
  },
) {
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "LAND_PURCHASE",
    sourceId: opts.landPurchaseId,
    memo: "Land acquisition capitalised",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.LAND_ASSET, debit: opts.totalCost, credit: 0, entityType: "LandPurchase", entityId: opts.landPurchaseId },
      { accountCode: ACCT.CASH, debit: 0, credit: opts.totalCost, entityType: "LandPurchase", entityId: opts.landPurchaseId },
    ],
  });
}

/**
 * Payroll (processed): recognise the GROSS salary expense + employer PF
 * (an additional expense on top of gross), and book separate liabilities
 * for net pay, PF, ESI, profession tax, and TDS. This is the correct
 * gross-expense accounting treatment — the employer's wage cost is the
 * gross amount, and deductions (PF, ESI, profession tax, TDS) are
 * liabilities payable to the government, not reductions of the expense.
 * Employer PF is an additional employer cost (not deducted from the
 * employee's gross), so it's debited as extra salary expense and credited
 * to PF Payable alongside the employee portion.
 *
 *   Dr Salaries & Wages Expense   (totalGross + employerPf)
 *   Cr Salaries Payable            (totalNet)
 *   Cr PF Payable                  (totalPF + employerPf)  — employee + employer PF
 *   Cr ESI Payable                 (totalESI)              — if totalESI > 0
 *   Cr Profession Tax Payable      (totalProfessionTax)    — if > 0
 *   Cr TDS Payable                 (totalTDS)             — if totalTDS > 0
 *   Cr Salaries Payable            (otherDeductions)      — residual, if > 0
 *
 * Where otherDeductions = totalDeductions − PF − ESI − professionTax − TDS
 * (loans, advances, penalties etc. — these are held in Salaries Payable
 * until settled, not as separate statutory liabilities).
 */
export async function postPayroll(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    payrollPeriodId: string;
    totalGross: Decimal | number | string;
    totalNet: Decimal | number | string;
    totalPF?: Decimal | number | string;
    totalEmployerPf?: Decimal | number | string;
    totalESI?: Decimal | number | string;
    totalProfessionTax?: Decimal | number | string;
    totalTDS?: Decimal | number | string;
    totalDeductions?: Decimal | number | string;
    postedById?: string;
  },
) {
  const totalGross = new Decimal(opts.totalGross);
  const totalNet = new Decimal(opts.totalNet);
  if (totalGross.isZero() && new Decimal(opts.totalEmployerPf ?? 0).isZero()) return null;

  const totalPF = new Decimal(opts.totalPF ?? 0);
  const totalEmployerPf = new Decimal(opts.totalEmployerPf ?? 0);
  const totalESI = new Decimal(opts.totalESI ?? 0);
  const totalProfessionTax = new Decimal(opts.totalProfessionTax ?? 0);
  const totalTDS = new Decimal(opts.totalTDS ?? 0);
  const totalDeductions = new Decimal(opts.totalDeductions ?? 0);
  // Other deductions = totalDeductions − PF − ESI − professionTax − TDS
  const otherDeductions = totalDeductions
    .minus(totalPF)
    .minus(totalESI)
    .minus(totalProfessionTax)
    .minus(totalTDS);

  // Employer PF is an additional expense on top of gross salary
  const totalExpense = totalGross.plus(totalEmployerPf);
  // Total PF payable = employee portion + employer portion
  const totalPfPayable = totalPF.plus(totalEmployerPf);

  const lines: JournalLineInput[] = [
    { accountCode: ACCT.SALARIES_EXPENSE, debit: totalExpense, credit: 0, entityType: "PayrollPeriod", entityId: opts.payrollPeriodId, memo: "Gross salary expense + employer PF" },
    { accountCode: ACCT.SALARIES_PAYABLE, debit: 0, credit: totalNet, entityType: "PayrollPeriod", entityId: opts.payrollPeriodId, memo: "Net pay payable to employees" },
  ];
  if (totalPfPayable.gt(0)) {
    lines.push({ accountCode: ACCT.PF_PAYABLE, debit: 0, credit: totalPfPayable, entityType: "PayrollPeriod", entityId: opts.payrollPeriodId, memo: "PF payable to EPFO (employee + employer)" });
  }
  if (totalESI.gt(0)) {
    lines.push({ accountCode: ACCT.ESI_PAYABLE, debit: 0, credit: totalESI, entityType: "PayrollPeriod", entityId: opts.payrollPeriodId, memo: "ESI payable to ESIC" });
  }
  if (totalProfessionTax.gt(0)) {
    lines.push({ accountCode: ACCT.PROFESSION_TAX_PAYABLE, debit: 0, credit: totalProfessionTax, entityType: "PayrollPeriod", entityId: opts.payrollPeriodId, memo: "Profession tax payable to state" });
  }
  if (totalTDS.gt(0)) {
    lines.push({ accountCode: ACCT.TDS_PAYABLE, debit: 0, credit: totalTDS, entityType: "PayrollPeriod", entityId: opts.payrollPeriodId, memo: "TDS payable to Income Tax" });
  }
  if (otherDeductions.gt(0)) {
    lines.push({ accountCode: ACCT.SALARIES_PAYABLE, debit: 0, credit: otherDeductions, entityType: "PayrollPeriod", entityId: opts.payrollPeriodId, memo: "Other deductions (loans/advances)" });
  }

  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "PAYROLL",
    sourceId: opts.payrollPeriodId,
    memo: "Payroll processed — gross salary expense",
    postedById: opts.postedById,
    lines,
  });
}

/**
 * Payroll settlement (paid): clear the Salaries Payable liability and
 * credit cash. Called when a PROCESSED payroll is marked PAID.
 *
 *   Dr Salaries Payable   (totalNet)
 *   Cr Cash / Bank         (totalNet)
 */
export async function postPayrollPayment(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    payrollPeriodId: string;
    totalNet: Decimal | number | string;
    postedById?: string;
  },
) {
  const totalNet = new Decimal(opts.totalNet);
  if (totalNet.isZero()) return null;
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "PAYROLL_PAYMENT",
    sourceId: opts.payrollPeriodId,
    memo: "Payroll settled — salaries paid",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.SALARIES_PAYABLE, debit: totalNet, credit: 0, entityType: "PayrollPeriod", entityId: opts.payrollPeriodId },
      { accountCode: ACCT.CASH, debit: 0, credit: totalNet, entityType: "PayrollPeriod", entityId: opts.payrollPeriodId },
    ],
  });
}

/**
 * Direct Purchase: capitalise materials into inventory, recognise input GST,
 * and credit Accounts Payable — same double-entry as a PO receipt but without
 * a formal PurchaseOrder. Used by the express/local purchase flow.
 *
 *   Dr Inventory - Materials   (subtotal = Σ qty × unitCost)
 *   Dr Input GST / ITC          (gst      = Σ qty × unitCost × gstRate/100)
 *   Cr Accounts Payable         (total    = subtotal + gst)
 */
export async function postDirectPurchase(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    directPurchaseId: string;
    postedById?: string;
    lines: { qty: Decimal; unitCost: Decimal; gstRate: Decimal }[];
  },
) {
  let subtotal = new Decimal(0);
  let gst = new Decimal(0);
  for (const l of opts.lines) {
    const lineSubtotal = new Decimal(l.qty).times(new Decimal(l.unitCost));
    const lineGst = lineSubtotal.times(new Decimal(l.gstRate)).div(100);
    subtotal = subtotal.plus(lineSubtotal);
    gst = gst.plus(lineGst);
  }
  const total = subtotal.plus(gst);
  if (total.isZero()) return null;

  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "DIRECT_PURCHASE",
    sourceId: opts.directPurchaseId,
    memo: "Direct purchase — materials received",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.INVENTORY, debit: subtotal, credit: 0, entityType: "DirectPurchase", entityId: opts.directPurchaseId, memo: "Materials received (direct purchase)" },
      { accountCode: ACCT.INPUT_GST, debit: gst, credit: 0, memo: "Input GST (ITC)" },
      { accountCode: ACCT.AP, debit: 0, credit: total, entityType: "DirectPurchase", entityId: opts.directPurchaseId, memo: "Payable to supplier" },
    ],
  });
}

/**
 * Stock Count Adjustment: post the inventory variance to the GL.
 * Positive variance (stock appeared) → Dr Inventory, Cr Operating Expense (gain).
 * Negative variance (stock missing)  → Dr Inventory Shrinkage (5500), Cr Inventory.
 *
 * Losses are booked to a dedicated Inventory Shrinkage account (5500) so they
 * can be tracked separately from general operating expenses — useful for
 * insurance claims, audit trails, and shrinkage KPIs.
 *
 * The MAC of the adjusted stock is used as the unit cost so the GL reflects
 * the actual carrying value of the variance.
 */
export async function postStockAdjustment(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    stockCountId: string;
    postedById?: string;
    lines: { materialId: string; variance: Decimal; unitCost: Decimal }[];
  },
) {
  let gains = new Decimal(0);
  let losses = new Decimal(0);
  for (const l of opts.lines) {
    const v = new Decimal(l.variance);
    if (v.isZero()) continue;
    const value = v.abs().times(new Decimal(l.unitCost));
    if (v.gt(0)) gains = gains.plus(value);
    else losses = losses.plus(value);
  }
  if (gains.isZero() && losses.isZero()) return null;

  const lines: JournalLineInput[] = [];
  if (gains.gt(0)) {
    lines.push({ accountCode: ACCT.INVENTORY, debit: gains, credit: 0, entityType: "StockCount", entityId: opts.stockCountId, memo: "Stock count gain" });
    lines.push({ accountCode: ACCT.OPERATING_EXPENSE, debit: 0, credit: gains, entityType: "StockCount", entityId: opts.stockCountId, memo: "Inventory gain on count" });
  }
  if (losses.gt(0)) {
    lines.push({ accountCode: ACCT.INVENTORY_SHRINKAGE, debit: losses, credit: 0, entityType: "StockCount", entityId: opts.stockCountId, memo: "Inventory shrinkage (stock count loss)" });
    lines.push({ accountCode: ACCT.INVENTORY, debit: 0, credit: losses, entityType: "StockCount", entityId: opts.stockCountId, memo: "Stock count loss" });
  }
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "STOCK_ADJUSTMENT",
    sourceId: opts.stockCountId,
    memo: "Stock count reconciliation adjustment",
    postedById: opts.postedById,
    lines,
  });
}

/**
 * Equipment Acquisition: capitalise the equipment as a fixed asset and
 * credit cash (or AP if purchased on credit).
 *
 *   Dr Equipment & Fixtures   (acquisitionCost)
 *   Cr Cash / Bank             (acquisitionCost)
 */
export async function postEquipmentAcquisition(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    equipmentId: string;
    acquisitionCost: Decimal | number | string;
    postedById?: string;
  },
) {
  const cost = new Decimal(opts.acquisitionCost);
  if (cost.isZero()) return null;
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "EQUIPMENT_ACQUISITION",
    sourceId: opts.equipmentId,
    memo: "Equipment acquired — capitalised as fixed asset",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.EQUIPMENT_ASSET, debit: cost, credit: 0, entityType: "Equipment", entityId: opts.equipmentId, memo: "Equipment capitalised" },
      { accountCode: ACCT.CASH, debit: 0, credit: cost, entityType: "Equipment", entityId: opts.equipmentId, memo: "Cash paid for equipment" },
    ],
  });
}

/**
 * Equipment Maintenance: expense the maintenance cost, credit cash.
 *
 *   Dr Operating Expenses   (cost)
 *   Cr Cash / Bank           (cost)
 */
export async function postEquipmentMaintenance(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    equipmentId: string;
    maintenanceId: string;
    cost: Decimal | number | string;
    postedById?: string;
  },
) {
  const cost = new Decimal(opts.cost);
  if (cost.isZero()) return null;
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "EQUIPMENT_MAINTENANCE",
    sourceId: opts.maintenanceId,
    memo: "Equipment maintenance expensed",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.OPERATING_EXPENSE, debit: cost, credit: 0, entityType: "EquipmentMaintenance", entityId: opts.maintenanceId, memo: "Maintenance cost" },
      { accountCode: ACCT.CASH, debit: 0, credit: cost, entityType: "EquipmentMaintenance", entityId: opts.maintenanceId, memo: "Cash paid for maintenance" },
    ],
  });
}

/**
 * Equipment Retirement: relieve the fixed asset account at the equipment's
 * current (depreciated) value and recognise any disposal gain/loss against
 * cash received (defaults to 0 if no scrap value).
 *
 *   Dr Cash / Bank                  (scrapValue)
 *   Dr Operating Expenses (loss)    (max(0, currentValue − scrapValue))
 *   Cr Equipment & Fixtures          (currentValue)
 *   Cr Operating Expenses (gain)     (max(0, scrapValue − currentValue))
 */
export async function postEquipmentRetirement(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    equipmentId: string;
    currentValue: Decimal | number | string;
    scrapValue?: Decimal | number | string;
    postedById?: string;
  },
) {
  const currentValue = new Decimal(opts.currentValue);
  if (currentValue.isZero()) return null;
  const scrap = new Decimal(opts.scrapValue ?? 0);
  const loss = currentValue.gt(scrap) ? currentValue.minus(scrap) : new Decimal(0);
  const gain = scrap.gt(currentValue) ? scrap.minus(currentValue) : new Decimal(0);

  const lines: JournalLineInput[] = [
    { accountCode: ACCT.EQUIPMENT_ASSET, debit: 0, credit: currentValue, entityType: "Equipment", entityId: opts.equipmentId, memo: "Equipment retired" },
  ];
  if (scrap.gt(0)) {
    lines.push({ accountCode: ACCT.CASH, debit: scrap, credit: 0, entityType: "Equipment", entityId: opts.equipmentId, memo: "Scrap value received" });
  }
  if (loss.gt(0)) {
    lines.push({ accountCode: ACCT.OPERATING_EXPENSE, debit: loss, credit: 0, entityType: "Equipment", entityId: opts.equipmentId, memo: "Loss on disposal" });
  }
  if (gain.gt(0)) {
    lines.push({ accountCode: ACCT.OPERATING_EXPENSE, debit: 0, credit: gain, entityType: "Equipment", entityId: opts.equipmentId, memo: "Gain on disposal" });
  }
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "EQUIPMENT_RETIREMENT",
    sourceId: opts.equipmentId,
    memo: "Equipment retired from service",
    postedById: opts.postedById,
    lines,
  });
}

/**
 * Security Deposit Received (tenancy activation): debit cash, credit the
 * security deposit liability (refundable to tenant on termination).
 *
 *   Dr Cash / Bank                    (deposit)
 *   Cr Security Deposits Payable       (deposit)
 */
export async function postSecurityDepositReceived(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    tenancyId: string;
    amount: Decimal | number | string;
    postedById?: string;
  },
) {
  const amount = new Decimal(opts.amount);
  if (amount.isZero()) return null;
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "SECURITY_DEPOSIT_RECEIVED",
    sourceId: opts.tenancyId,
    memo: "Security deposit received from tenant",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.CASH, debit: amount, credit: 0, entityType: "Tenancy", entityId: opts.tenancyId, memo: "Deposit received" },
      { accountCode: ACCT.SECURITY_DEPOSITS_PAYABLE, debit: 0, credit: amount, entityType: "Tenancy", entityId: opts.tenancyId, memo: "Refundable deposit liability" },
    ],
  });
}

/**
 * Security Deposit Refunded (tenancy termination): reverse the deposit
 * liability, credit cash.
 *
 *   Dr Security Deposits Payable   (deposit)
 *   Cr Cash / Bank                  (deposit)
 */
export async function postSecurityDepositRefunded(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    tenancyId: string;
    amount: Decimal | number | string;
    postedById?: string;
  },
) {
  const amount = new Decimal(opts.amount);
  if (amount.isZero()) return null;
  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "SECURITY_DEPOSIT_REFUNDED",
    sourceId: opts.tenancyId,
    memo: "Security deposit refunded to tenant",
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.SECURITY_DEPOSITS_PAYABLE, debit: amount, credit: 0, entityType: "Tenancy", entityId: opts.tenancyId, memo: "Deposit liability cleared" },
      { accountCode: ACCT.CASH, debit: 0, credit: amount, entityType: "Tenancy", entityId: opts.tenancyId, memo: "Deposit refunded" },
    ],
  });
}

// ───────────────────────────────────────────────────────────
//  Reporting — trial balance + account ledger
// ───────────────────────────────────────────────────────────

/**
 * Trial balance: per account, sum of all posted journal lines.
 * Returns { code, name, type, debit, credit } with the running balance
 * (debit-positive for assets/expenses, credit-positive for liabilities/equity/revenue).
 */
export async function trialBalance(companyId: string) {
  const rows = await prisma.journalLine.findMany({
    where: { journalEntry: { companyId, status: "POSTED" } },
    include: { account: { select: { code: true, name: true, type: true } } },
  });

  const byAccount = new Map<string, { code: string; name: string; type: string; debit: Decimal; credit: Decimal }>();
  for (const l of rows) {
    const key = l.accountCode;
    const cur = byAccount.get(key) ?? {
      code: l.account.code,
      name: l.account.name,
      type: l.account.type,
      debit: new Decimal(0),
      credit: new Decimal(0),
    };
    cur.debit = cur.debit.plus(new Decimal(l.debit));
    cur.credit = cur.credit.plus(new Decimal(l.credit));
    byAccount.set(key, cur);
  }

  const accounts = [...byAccount.values()].sort((a, b) => a.code.localeCompare(b.code));
  // Balance: for assets/expenses, balance = debit - credit; for liabilities/equity/revenue, credit - debit.
  const result = accounts.map((a) => {
    // Contra-expense accounts have a credit-normal balance (they reduce expenses).
    const isDebitNormal = a.type === "ASSET" || a.type === "EXPENSE";
    const balance = isDebitNormal ? a.debit.minus(a.credit) : a.credit.minus(a.debit);
    return { ...a, balance };
  });

  const totalDebit = result.reduce((s, a) => s.plus(a.debit), new Decimal(0));
  const totalCredit = result.reduce((s, a) => s.plus(a.credit), new Decimal(0));
  return { accounts: result, totalDebit, totalCredit, isBalanced: totalDebit.equals(totalCredit) };
}

/**
 * Account ledger: all posted journal lines for a single account, newest first.
 */
export async function accountLedger(companyId: string, accountCode: string) {
  const lines = await prisma.journalLine.findMany({
    where: { accountCode, journalEntry: { companyId, status: "POSTED" } },
    include: { journalEntry: { select: { entryNumber: true, entryDate: true, sourceType: true, memo: true } } },
    orderBy: { journalEntry: { entryDate: "desc" } },
  });
  return lines.map((l) => ({
    id: l.id,
    entryNumber: l.journalEntry.entryNumber,
    entryDate: l.journalEntry.entryDate,
    sourceType: l.journalEntry.sourceType,
    memo: l.memo ?? l.journalEntry.memo,
    debit: new Decimal(l.debit),
    credit: new Decimal(l.credit),
    entityType: l.entityType,
    entityId: l.entityId,
  }));
}

/**
 * NRV Write-Down: recognise an impairment loss when an asset's net
 * realizable value falls below its cost basis (IAS 2: lower of cost or NRV).
 *
 * For BuiltUnits: Dr OPERATING_EXPENSE (6000), Cr UNIT_ASSET (1800)
 * For LandParcels: Dr OPERATING_EXPENSE (6000), Cr LAND_ASSET (1700)
 *
 * Only posts the DELTA — if a previous write-down exists, only the
 * incremental amount is posted. If NRV has recovered, no reversal
 * entry is posted here (reversal is a manual accounting decision).
 *
 * Called by flagNrvWriteDowns() alongside the DB field update.
 */
export async function postNrvWriteDown(
  tx: Prisma.TransactionClient,
  opts: {
    companyId: string;
    entityType: "BUILT_UNIT" | "LAND";
    entityId: string;
    writeDownAmount: Decimal | number | string;
    postedById?: string;
  },
) {
  const amount = new Decimal(opts.writeDownAmount);
  if (amount.isZero() || amount.isNegative()) return null;

  const creditAccount = opts.entityType === "BUILT_UNIT" ? ACCT.UNIT_ASSET : ACCT.LAND_ASSET;

  return postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "NRV_WRITE_DOWN",
    sourceId: opts.entityId,
    memo: `NRV write-down — ${opts.entityType === "BUILT_UNIT" ? "built unit" : "land parcel"} impaired to NRV`,
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.OPERATING_EXPENSE, debit: amount, credit: 0, entityType: opts.entityType, entityId: opts.entityId, memo: "Impairment loss (NRV < cost)" },
      { accountCode: creditAccount, debit: 0, credit: amount, entityType: opts.entityType, entityId: opts.entityId, memo: "Asset written down to NRV" },
    ],
  });
}
