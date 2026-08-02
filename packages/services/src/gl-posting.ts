import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";

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
  { code: "1700", name: "Unsold Assets - Land", type: "ASSET" as const },
  { code: "1800", name: "Unsold Assets - Built Units", type: "ASSET" as const },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" as const },
  { code: "2100", name: "Output GST", type: "LIABILITY" as const },
  { code: "3000", name: "Retained Earnings", type: "EQUITY" as const },
  { code: "4000", name: "Sales Revenue", type: "REVENUE" as const },
  { code: "5000", name: "Cost of Goods Sold", type: "EXPENSE" as const },
  { code: "6000", name: "Operating Expenses", type: "EXPENSE" as const },
];

/** Account code constants — used by posting functions so codes are typo-proof. */
export const ACCT = {
  CASH: "1000",
  AR: "1200",
  INVENTORY: "1300",
  INPUT_GST: "1400",
  WIP: "1500",
  LAND_ASSET: "1700",
  UNIT_ASSET: "1800",
  AP: "2000",
  OUTPUT_GST: "2100",
  RETAINED_EARNINGS: "3000",
  SALES_REVENUE: "4000",
  COGS: "5000",
  OPERATING_EXPENSE: "6000",
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
    throw new Error(
      `Unbalanced journal entry: debits ${totalDebit} ≠ credits ${totalCredit} (${input.sourceType})`,
    );
  }
  // An entry with no movement is meaningless — reject it.
  if (totalDebit.isZero()) {
    return null;
  }

  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
  const entryNumber = `JE-${ymd}-${rand}`;

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
 *   Dr Accounts Receivable   (salePrice)
 *   Cr Sales Revenue          (salePrice)
 *   Dr Cost of Goods Sold     (costBasis)
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
    postedById?: string;
  },
) {
  const assetAcct = opts.assetType === "LAND" ? ACCT.LAND_ASSET : ACCT.UNIT_ASSET;
  // Revenue leg
  await postJournalEntry(tx, {
    companyId: opts.companyId,
    sourceType: "ASSET_SALE",
    sourceId: opts.assetSaleId,
    memo: `Sale of ${opts.assetType === "LAND" ? "land" : "built unit"}`,
    postedById: opts.postedById,
    lines: [
      { accountCode: ACCT.AR, debit: opts.salePrice, credit: 0, entityType: "AssetSale", entityId: opts.assetSaleId, memo: "Receivable from customer" },
      { accountCode: ACCT.SALES_REVENUE, debit: 0, credit: opts.salePrice, memo: "Sales revenue" },
    ],
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
