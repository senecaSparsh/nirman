/**
 * Excel/XLSX export service — generates formatted Excel workbooks from
 * structured report data using ExcelJS. Each report type has a dedicated
 * builder that maps domain data into typed columns with proper number
 * formats (currency, dates, quantities) and optional summary rows.
 *
 * Used by the `/api/export` route handler to produce downloadable .xlsx files.
 */
import ExcelJS from "exceljs";

// ───────────────────────────────────────────────────────────
//  Core types
// ───────────────────────────────────────────────────────────

export interface ExcelColumn {
  /** Column header text */
  header: string;
  /** Property key on the row object */
  key: string;
  /** Column width in characters (optional) */
  width?: number;
  /** Excel number format string, e.g. '#,##0.00' or 'dd-mmm-yyyy' */
  format?: string;
  /** Optional formatter to transform raw values before writing */
  formatter?: (value: unknown, row: Record<string, unknown>) => string | number;
}

export interface ExcelSheet {
  /** Worksheet tab name (max 31 chars) */
  name: string;
  columns: ExcelColumn[];
  rows: Record<string, unknown>[];
  /** Optional summary rows rendered at the top (label + value pairs) */
  summary?: { label: string; value: string | number }[];
}

export interface ExcelExportOptions {
  sheets: ExcelSheet[];
  filename: string;
  /** Document title rendered as a merged bold row at the top of each sheet */
  title?: string;
  /** Company name rendered below the title */
  companyName?: string;
}

// ───────────────────────────────────────────────────────────
//  Workbook generator
// ───────────────────────────────────────────────────────────

/**
 * Generate an Excel workbook buffer from structured report data.
 *
 * For each sheet:
 *  - Adds a worksheet with the given name
 *  - Sets column widths
 *  - Adds title row (merged, bold, 14pt) if title provided
 *  - Adds company name row (merged, 11pt) if provided
 *  - Adds summary rows if provided (bold labels)
 *  - Adds header row (bold, fill #f3f4f6, border bottom)
 *  - Adds data rows with formatters applied
 *  - Freezes the header row
 *  - Adds auto-filter on the data range
 *
 * Returns a Node Buffer via `workbook.xlsx.writeBuffer()`.
 */
export async function generateExcelWorkbook(options: ExcelExportOptions): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nirman Inventory OS";
  workbook.created = new Date();

  for (const sheet of options.sheets) {
    const ws = workbook.addWorksheet(sheet.name, {
      views: [{ state: "frozen", ySplit: 0 }],
    });

    // Determine the starting row for the header (after title/company/summary)
    let currentRow = 1;

    // Title row
    if (options.title) {
      ws.mergeCells(currentRow, 1, currentRow, Math.max(sheet.columns.length, 1));
      const titleCell = ws.getCell(currentRow, 1);
      titleCell.value = options.title;
      titleCell.font = { bold: true, size: 14 };
      titleCell.alignment = { vertical: "middle" };
      ws.getRow(currentRow).height = 22;
      currentRow++;
    }

    // Company name row
    if (options.companyName) {
      ws.mergeCells(currentRow, 1, currentRow, Math.max(sheet.columns.length, 1));
      const companyCell = ws.getCell(currentRow, 1);
      companyCell.value = options.companyName;
      companyCell.font = { size: 11, italic: true };
      companyCell.alignment = { vertical: "middle" };
      currentRow++;
    }

    // Blank separator after title/company
    if (options.title || options.companyName) {
      currentRow++;
    }

    // Summary rows
    if (sheet.summary && sheet.summary.length > 0) {
      for (const item of sheet.summary) {
        ws.mergeCells(currentRow, 1, currentRow, Math.max(Math.floor(sheet.columns.length / 2), 1));
        const labelCell = ws.getCell(currentRow, 1);
        labelCell.value = item.label;
        labelCell.font = { bold: true, size: 10 };

        const valueCol = Math.floor(sheet.columns.length / 2) + 1;
        ws.mergeCells(currentRow, valueCol, currentRow, sheet.columns.length);
        const valueCell = ws.getCell(currentRow, valueCol);
        valueCell.value = item.value;
        valueCell.font = { size: 10 };
        valueCell.alignment = { horizontal: "right" };
        currentRow++;
      }
      // Blank separator after summary
      currentRow++;
    }

    const headerRowNum = currentRow;

    // Define columns with widths
    ws.columns = sheet.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width ?? 18,
    }));

    // Style the header row
    const headerRow = ws.getRow(headerRowNum);
    headerRow.height = 20;
    for (let i = 0; i < sheet.columns.length; i++) {
      const cell = headerRow.getCell(i + 1);
      cell.value = sheet.columns[i]!.header;
      cell.font = { bold: true, size: 10 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3F4F6" },
      };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      };
      cell.alignment = { vertical: "middle" };
    }

    currentRow++;

    // Data rows
    for (const row of sheet.rows) {
      for (let i = 0; i < sheet.columns.length; i++) {
        const col = sheet.columns[i]!;
        const cell = ws.getCell(currentRow, i + 1);
        let value: unknown = row[col.key];

        if (col.formatter) {
          value = col.formatter(value, row);
        }

        // Convert Decimal-like objects to number
        if (value && typeof value === "object" && typeof (value as { toNumber?: unknown }).toNumber === "function") {
          value = (value as { toNumber: () => number }).toNumber();
        }

        cell.value = value as string | number | null;

        if (col.format) {
          cell.numFmt = col.format;
        }

        cell.alignment = { vertical: "middle" };
      }
      currentRow++;
    }

    // Freeze the header row
    ws.views = [{ state: "frozen", ySplit: headerRowNum }];

    // Auto-filter on the data range (header row through last data row)
    if (sheet.rows.length > 0) {
      const lastColLetter = ws.getColumn(sheet.columns.length).letter;
      ws.autoFilter = {
        from: { row: headerRowNum, column: 1 },
        to: { row: currentRow - 1, column: sheet.columns.length },
      };
      void lastColLetter;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ───────────────────────────────────────────────────────────
//  Helper: convert Decimal/number/string to JS number
// ───────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && typeof (v as { toNumber?: unknown }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(String(v));
  return Number.isNaN(n) ? 0 : n;
}

// Common Excel number formats
const FMT_CURRENCY = '#,##0.00';
const FMT_NUMBER = '#,##0';
const FMT_QTY = '#,##0.000';
const FMT_PCT = '0.0"%"';
const FMT_DATE = 'dd-mmm-yyyy';

// ───────────────────────────────────────────────────────────
//  Report-specific builders
// ───────────────────────────────────────────────────────────

// 1. Inventory Value Report
export interface InventoryValueData {
  asOn?: string;
  items: Array<{
    locationName: string;
    materialCode: string;
    materialName: string;
    categoryName: string;
    unit: string;
    qty: number;
    value: number;
  }>;
  byLocation: Array<{ name: string; type: string; value: number; qty: number }>;
  byCategory: Array<{ name: string; value: number; qty: number }>;
  grandTotal: number;
  totalQty: number;
}

export function buildInventoryValueReport(data: InventoryValueData): ExcelSheet[] {
  return [
    {
      name: "Inventory Detail",
      columns: [
        { header: "Location", key: "locationName", width: 22 },
        { header: "Category", key: "categoryName", width: 18 },
        { header: "Code", key: "materialCode", width: 14 },
        { header: "Material", key: "materialName", width: 30 },
        { header: "Unit", key: "unit", width: 8 },
        { header: "Qty", key: "qty", width: 12, format: FMT_QTY },
        { header: "Value", key: "value", width: 16, format: FMT_CURRENCY },
      ],
      rows: data.items as unknown as Record<string, unknown>[],
      summary: [
        { label: "As On", value: data.asOn ?? "Live" },
        { label: "Grand Total Value", value: data.grandTotal },
        { label: "Total Qty", value: data.totalQty },
      ],
    },
    {
      name: "By Location",
      columns: [
        { header: "Location", key: "name", width: 22 },
        { header: "Type", key: "type", width: 18 },
        { header: "Qty", key: "qty", width: 12, format: FMT_QTY },
        { header: "Value", key: "value", width: 16, format: FMT_CURRENCY },
      ],
      rows: data.byLocation as unknown as Record<string, unknown>[],
    },
    {
      name: "By Category",
      columns: [
        { header: "Category", key: "name", width: 22 },
        { header: "Qty", key: "qty", width: 12, format: FMT_QTY },
        { header: "Value", key: "value", width: 16, format: FMT_CURRENCY },
      ],
      rows: data.byCategory as unknown as Record<string, unknown>[],
    },
  ];
}

// 2. Purchase Trends Report
export interface PurchaseTrendsData {
  monthly: Array<{ label: string; subtotal: number; gst: number; total: number; count: number }>;
  topSuppliers: Array<{ name: string; total: number; count: number }>;
  grandTotal: number;
  totalOrders: number;
}

export function buildPurchaseTrendsReport(data: PurchaseTrendsData): ExcelSheet[] {
  return [
    {
      name: "Monthly Trends",
      columns: [
        { header: "Month", key: "label", width: 14 },
        { header: "Orders", key: "count", width: 10, format: FMT_NUMBER },
        { header: "Subtotal", key: "subtotal", width: 16, format: FMT_CURRENCY },
        { header: "GST", key: "gst", width: 14, format: FMT_CURRENCY },
        { header: "Total", key: "total", width: 16, format: FMT_CURRENCY },
      ],
      rows: data.monthly as unknown as Record<string, unknown>[],
      summary: [
        { label: "12-mo Spend", value: data.grandTotal },
        { label: "Total Orders", value: data.totalOrders },
      ],
    },
    {
      name: "Top Suppliers",
      columns: [
        { header: "Supplier", key: "name", width: 28 },
        { header: "Orders", key: "count", width: 10, format: FMT_NUMBER },
        { header: "Total Spend", key: "total", width: 16, format: FMT_CURRENCY },
      ],
      rows: data.topSuppliers as unknown as Record<string, unknown>[],
    },
  ];
}

// 3. Sales Revenue Report
export interface SalesRevenueData {
  monthly: Array<{ label: string; sales: number; collected: number; count: number }>;
  topCustomers: Array<{ name: string; sales: number; collected: number; count: number }>;
  totalSales: number;
  totalCollected: number;
  totalOutstanding: number;
}

export function buildSalesRevenueReport(data: SalesRevenueData): ExcelSheet[] {
  return [
    {
      name: "Monthly Revenue",
      columns: [
        { header: "Month", key: "label", width: 14 },
        { header: "Deals", key: "count", width: 10, format: FMT_NUMBER },
        { header: "Sales Value", key: "sales", width: 16, format: FMT_CURRENCY },
        { header: "Collected", key: "collected", width: 16, format: FMT_CURRENCY },
      ],
      rows: data.monthly as unknown as Record<string, unknown>[],
      summary: [
        { label: "Total Sales", value: data.totalSales },
        { label: "Total Collected", value: data.totalCollected },
        { label: "Outstanding", value: data.totalOutstanding },
      ],
    },
    {
      name: "Top Customers",
      columns: [
        { header: "Customer", key: "name", width: 28 },
        { header: "Deals", key: "count", width: 10, format: FMT_NUMBER },
        { header: "Sales Value", key: "sales", width: 16, format: FMT_CURRENCY },
        { header: "Collected", key: "collected", width: 16, format: FMT_CURRENCY },
      ],
      rows: data.topCustomers as unknown as Record<string, unknown>[],
    },
  ];
}

// 4. Project Progress Report
export interface ProjectProgressData {
  rows: Array<{
    name: string;
    type: string;
    status: string;
    budget: number;
    totalCost: number;
    materials: number;
    labour: number;
    land: number;
    revenue: number;
    profit: number;
    margin: number;
    progressPct: number;
    unitCount: number;
    phaseCount: number;
  }>;
  totalCost: number;
  totalRevenue: number;
  totalProfit: number;
}

export function buildProjectProgressReport(data: ProjectProgressData): ExcelSheet[] {
  return [
    {
      name: "Project Progress",
      columns: [
        { header: "Project", key: "name", width: 28 },
        { header: "Type", key: "type", width: 14 },
        { header: "Status", key: "status", width: 12 },
        { header: "Budget", key: "budget", width: 16, format: FMT_CURRENCY },
        { header: "Total Cost", key: "totalCost", width: 16, format: FMT_CURRENCY },
        { header: "Materials", key: "materials", width: 14, format: FMT_CURRENCY },
        { header: "Labour", key: "labour", width: 14, format: FMT_CURRENCY },
        { header: "Land", key: "land", width: 14, format: FMT_CURRENCY },
        { header: "Revenue", key: "revenue", width: 16, format: FMT_CURRENCY },
        { header: "Profit", key: "profit", width: 16, format: FMT_CURRENCY },
        { header: "Margin %", key: "margin", width: 10, format: FMT_PCT },
        { header: "Progress %", key: "progressPct", width: 12, format: FMT_PCT },
        { header: "Units", key: "unitCount", width: 8, format: FMT_NUMBER },
        { header: "Phases", key: "phaseCount", width: 8, format: FMT_NUMBER },
      ],
      rows: data.rows as unknown as Record<string, unknown>[],
      summary: [
        { label: "Total Cost", value: data.totalCost },
        { label: "Total Revenue", value: data.totalRevenue },
        { label: "Total Profit", value: data.totalProfit },
      ],
    },
  ];
}

// 5. Payroll Expense Report
export interface PayrollExpenseData {
  monthly: Array<{
    label: string;
    gross: number;
    overtime: number;
    deductions: number;
    net: number;
    employees: number;
    status: string;
  }>;
  tradeRows: Array<{ trade: string; gross: number; net: number; employees: number }>;
  crewRows: Array<{ crew: string; gross: number; net: number; employees: number }>;
  totalGross: number;
  totalNet: number;
  totalOvertime: number;
}

export function buildPayrollExpenseReport(data: PayrollExpenseData): ExcelSheet[] {
  return [
    {
      name: "Monthly Payroll",
      columns: [
        { header: "Period", key: "label", width: 14 },
        { header: "Employees", key: "employees", width: 12, format: FMT_NUMBER },
        { header: "Gross", key: "gross", width: 16, format: FMT_CURRENCY },
        { header: "Overtime", key: "overtime", width: 14, format: FMT_CURRENCY },
        { header: "Deductions", key: "deductions", width: 14, format: FMT_CURRENCY },
        { header: "Net Pay", key: "net", width: 16, format: FMT_CURRENCY },
        { header: "Status", key: "status", width: 12 },
      ],
      rows: data.monthly as unknown as Record<string, unknown>[],
      summary: [
        { label: "Total Gross (12mo)", value: data.totalGross },
        { label: "Total Net (12mo)", value: data.totalNet },
        { label: "Total Overtime", value: data.totalOvertime },
      ],
    },
    {
      name: "By Trade",
      columns: [
        { header: "Trade", key: "trade", width: 24 },
        { header: "Employees", key: "employees", width: 12, format: FMT_NUMBER },
        { header: "Gross", key: "gross", width: 16, format: FMT_CURRENCY },
        { header: "Net", key: "net", width: 16, format: FMT_CURRENCY },
      ],
      rows: data.tradeRows as unknown as Record<string, unknown>[],
    },
    {
      name: "By Crew",
      columns: [
        { header: "Crew", key: "crew", width: 24 },
        { header: "Employees", key: "employees", width: 12, format: FMT_NUMBER },
        { header: "Gross", key: "gross", width: 16, format: FMT_CURRENCY },
        { header: "Net", key: "net", width: 16, format: FMT_CURRENCY },
      ],
      rows: data.crewRows as unknown as Record<string, unknown>[],
    },
  ];
}

// 6. Pending Payments Report
export interface PendingPaymentsData {
  overduePOs: Array<{
    poNumber: string;
    supplier: string;
    expectedDate: string | null;
    orderedValue: number;
    receivedValue: number;
    payable: number;
    status: string;
    daysOverdue: number;
    agingBucket?: string;
  }>;
  receivables: Array<{
    saleNumber: string;
    customer: string;
    project: string;
    saleDate: string;
    salePrice: number;
    collected: number;
    outstanding: number;
    paymentStatus: string;
    daysSinceSale: number;
    agingBucket?: string;
  }>;
  draftPOs: Array<{
    poNumber: string;
    supplier: string;
    value: number;
    createdAt: string;
  }>;
  totalPayable: number;
  totalReceivable: number;
  totalDraft: number;
}

export function buildPendingPaymentsReport(data: PendingPaymentsData): ExcelSheet[] {
  return [
    {
      name: "Overdue POs",
      columns: [
        { header: "PO Number", key: "poNumber", width: 16 },
        { header: "Supplier", key: "supplier", width: 24 },
        { header: "Expected Date", key: "expectedDate", width: 14, format: FMT_DATE,
          formatter: (v) => v ? new Date(v as string).toISOString().slice(0, 10) : "" },
        { header: "Ordered Value", key: "orderedValue", width: 16, format: FMT_CURRENCY },
        { header: "Received Value", key: "receivedValue", width: 16, format: FMT_CURRENCY },
        { header: "Payable", key: "payable", width: 16, format: FMT_CURRENCY },
        { header: "Status", key: "status", width: 12 },
        { header: "Days Overdue", key: "daysOverdue", width: 12, format: FMT_NUMBER },
        { header: "Aging Bucket", key: "agingBucket", width: 14 },
      ],
      rows: data.overduePOs as unknown as Record<string, unknown>[],
      summary: [{ label: "Total Payable", value: data.totalPayable }],
    },
    {
      name: "Receivables",
      columns: [
        { header: "Sale No.", key: "saleNumber", width: 16 },
        { header: "Customer", key: "customer", width: 24 },
        { header: "Project", key: "project", width: 20 },
        { header: "Sale Date", key: "saleDate", width: 14, format: FMT_DATE,
          formatter: (v) => v ? new Date(v as string).toISOString().slice(0, 10) : "" },
        { header: "Sale Price", key: "salePrice", width: 16, format: FMT_CURRENCY },
        { header: "Collected", key: "collected", width: 16, format: FMT_CURRENCY },
        { header: "Outstanding", key: "outstanding", width: 16, format: FMT_CURRENCY },
        { header: "Payment", key: "paymentStatus", width: 12 },
        { header: "Days Since Sale", key: "daysSinceSale", width: 14, format: FMT_NUMBER },
        { header: "Aging Bucket", key: "agingBucket", width: 14 },
      ],
      rows: data.receivables as unknown as Record<string, unknown>[],
      summary: [{ label: "Total Receivable", value: data.totalReceivable }],
    },
    {
      name: "Draft POs",
      columns: [
        { header: "PO Number", key: "poNumber", width: 16 },
        { header: "Supplier", key: "supplier", width: 24 },
        { header: "Value", key: "value", width: 16, format: FMT_CURRENCY },
        { header: "Created", key: "createdAt", width: 14, format: FMT_DATE,
          formatter: (v) => v ? new Date(v as string).toISOString().slice(0, 10) : "" },
      ],
      rows: data.draftPOs as unknown as Record<string, unknown>[],
      summary: [{ label: "Total Draft Value", value: data.totalDraft }],
    },
  ];
}

// 7. Trial Balance Report
export interface TrialBalanceData {
  accounts: Array<{
    code: string;
    name: string;
    type: string;
    debit: number;
    credit: number;
    balance: number;
  }>;
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

export function buildTrialBalanceReport(data: TrialBalanceData): ExcelSheet[] {
  return [
    {
      name: "Trial Balance",
      columns: [
        { header: "Code", key: "code", width: 10 },
        { header: "Account", key: "name", width: 30 },
        { header: "Type", key: "type", width: 14 },
        { header: "Debit", key: "debit", width: 16, format: FMT_CURRENCY },
        { header: "Credit", key: "credit", width: 16, format: FMT_CURRENCY },
        { header: "Balance", key: "balance", width: 16, format: FMT_CURRENCY },
      ],
      rows: data.accounts as unknown as Record<string, unknown>[],
      summary: [
        { label: "Total Debit", value: data.totalDebit },
        { label: "Total Credit", value: data.totalCredit },
        { label: "Balanced", value: data.isBalanced ? "Yes" : "No" },
      ],
    },
  ];
}

// 8. Stock Movement Report
export interface StockMovementData {
  movements: Array<{
    timestamp: string;
    movementLabel: string;
    materialName: string;
    materialCode: string;
    fromLocationName: string | null;
    toLocationName: string | null;
    qty: number;
    unit: string;
    unitCost: number;
    balanceAfter: number;
    reason: string | null;
  }>;
}

export function buildStockMovementReport(data: StockMovementData): ExcelSheet[] {
  return [
    {
      name: "Stock Movements",
      columns: [
        { header: "Date", key: "timestamp", width: 14, format: FMT_DATE,
          formatter: (v) => v ? new Date(v as string).toISOString().slice(0, 10) : "" },
        { header: "Type", key: "movementLabel", width: 18 },
        { header: "Material", key: "materialName", width: 28 },
        { header: "Code", key: "materialCode", width: 14 },
        { header: "From", key: "fromLocationName", width: 18 },
        { header: "To", key: "toLocationName", width: 18 },
        { header: "Qty", key: "qty", width: 12, format: FMT_QTY },
        { header: "Unit", key: "unit", width: 8 },
        { header: "Unit Cost", key: "unitCost", width: 14, format: FMT_CURRENCY },
        { header: "Balance After", key: "balanceAfter", width: 14, format: FMT_QTY },
        { header: "Reason", key: "reason", width: 24 },
      ],
      rows: data.movements as unknown as Record<string, unknown>[],
    },
  ];
}

// 9. Purchaser Performance Report
export interface PurchaserPerformanceData {
  rows: Array<{
    userName: string;
    userEmail: string;
    role: string;
    quotesUploaded: number;
    requisitionsHandled: number;
    cheapestSelected: number;
    totalSpend: number;
    potentialSavings: number;
    avgQuotesPerRequisition: number;
    cheapestSelectionRate: number;
  }>;
  totalQuotes: number;
  totalSpend: number;
  totalSavings: number;
  from?: string;
  to?: string;
}

export function buildPurchaserPerformanceReport(data: PurchaserPerformanceData): ExcelSheet[] {
  return [
    {
      name: "Purchaser Performance",
      columns: [
        { header: "Purchaser", key: "userName", width: 22 },
        { header: "Email", key: "userEmail", width: 26 },
        { header: "Role", key: "role", width: 14 },
        { header: "Quotes Uploaded", key: "quotesUploaded", width: 14, format: FMT_NUMBER },
        { header: "Requisitions", key: "requisitionsHandled", width: 12, format: FMT_NUMBER },
        { header: "Avg Quotes/Req", key: "avgQuotesPerRequisition", width: 14, format: '0.00' },
        { header: "Cheapest Selected", key: "cheapestSelected", width: 14, format: FMT_NUMBER },
        { header: "Selection Rate %", key: "cheapestSelectionRate", width: 14, format: FMT_PCT,
          formatter: (v) => toNum(v) * 100 },
        { header: "Total Spend", key: "totalSpend", width: 16, format: FMT_CURRENCY },
        { header: "Potential Savings", key: "potentialSavings", width: 16, format: FMT_CURRENCY },
      ],
      rows: data.rows as unknown as Record<string, unknown>[],
      summary: [
        { label: "Period", value: `${data.from ?? "—"} to ${data.to ?? "—"}` },
        { label: "Total Quotes", value: data.totalQuotes },
        { label: "Total Spend", value: data.totalSpend },
        { label: "Total Savings", value: data.totalSavings },
      ],
    },
  ];
}

// 10. Reconciliation Report
export interface ReconciliationData {
  projectName: string;
  items: Array<{
    serialNo: string;
    description: string;
    materialCode: string;
    materialName: string;
    unit: string;
    requiredQty: number;
    issuedQty: number;
    consumedQty: number;
    currentStock: number;
    issueVariance: number;
    consumptionVariance: number;
    stockVariance: number;
    wastagePct: number;
    alertLevel: string;
  }>;
  totalRequired: number;
  totalIssued: number;
  totalConsumed: number;
  totalWastage: number;
  overToleranceCount: number;
}

export function buildReconciliationReport(data: ReconciliationData): ExcelSheet[] {
  return [
    {
      name: "Reconciliation",
      columns: [
        { header: "S.No", key: "serialNo", width: 8 },
        { header: "Description", key: "description", width: 30 },
        { header: "Material Code", key: "materialCode", width: 14 },
        { header: "Material", key: "materialName", width: 24 },
        { header: "Unit", key: "unit", width: 8 },
        { header: "Required", key: "requiredQty", width: 12, format: FMT_QTY },
        { header: "Issued", key: "issuedQty", width: 12, format: FMT_QTY },
        { header: "Consumed", key: "consumedQty", width: 12, format: FMT_QTY },
        { header: "Stock", key: "currentStock", width: 12, format: FMT_QTY },
        { header: "Issue Var.", key: "issueVariance", width: 12, format: FMT_QTY },
        { header: "Consump. Var.", key: "consumptionVariance", width: 14, format: FMT_QTY },
        { header: "Stock Var.", key: "stockVariance", width: 12, format: FMT_QTY },
        { header: "Wastage %", key: "wastagePct", width: 12, format: FMT_PCT },
        { header: "Alert", key: "alertLevel", width: 10 },
      ],
      rows: data.items as unknown as Record<string, unknown>[],
      summary: [
        { label: "Project", value: data.projectName },
        { label: "Total Required", value: data.totalRequired },
        { label: "Total Issued", value: data.totalIssued },
        { label: "Total Consumed", value: data.totalConsumed },
        { label: "Total Wastage", value: data.totalWastage },
        { label: "Over Tolerance", value: data.overToleranceCount },
      ],
    },
  ];
}

// 11. Stock Issue Summary Report
// Digital version of the client's paper "Stock Issue Summary" — one row per
// department with the total issue amount for the period.
export interface StockIssueSummaryData {
  rows: Array<{ departmentName: string; totalAmount: number }>;
  grandTotal: number;
}

export function buildStockIssueSummaryReport(data: StockIssueSummaryData): ExcelSheet[] {
  return [
    {
      name: "Stock Issue Summary",
      columns: [
        { header: "NAME", key: "departmentName", width: 30 },
        { header: "Amt", key: "totalAmount", width: 16, format: FMT_NUMBER },
      ],
      rows: data.rows as unknown as Record<string, unknown>[],
      summary: [{ label: "GRAND TOTAL", value: data.grandTotal }],
    },
  ];
}

// 12. Stock Movement Summary Report
// Digital version of the client's paper "Saleable Stock Report" — per-firm
// opening, received, issued, and balance stock value for a period.
export interface StockMovementSummaryReportData {
  rows: Array<{
    companyName: string;
    openingAmount: number;
    receivedAmount: number;
    issuedAmount: number;
    balanceAmount: number;
  }>;
  firmTotal: {
    openingAmount: number;
    receivedAmount: number;
    issuedAmount: number;
    balanceAmount: number;
  };
}

export function buildStockMovementSummaryReport(data: StockMovementSummaryReportData): ExcelSheet[] {
  return [
    {
      name: "Stock Movement Summary",
      columns: [
        { header: "Company", key: "companyName", width: 24 },
        { header: "Opn Amt", key: "openingAmount", width: 14, format: FMT_CURRENCY },
        { header: "Rec Amt", key: "receivedAmount", width: 14, format: FMT_CURRENCY },
        { header: "Issue Amt", key: "issuedAmount", width: 14, format: FMT_CURRENCY },
        { header: "Bal Amt", key: "balanceAmount", width: 14, format: FMT_CURRENCY },
      ],
      rows: data.rows as unknown as Record<string, unknown>[],
      summary: [
        { label: "Firm Total — Opening", value: data.firmTotal.openingAmount },
        { label: "Firm Total — Received", value: data.firmTotal.receivedAmount },
        { label: "Firm Total — Issued", value: data.firmTotal.issuedAmount },
        { label: "Firm Total — Balance", value: data.firmTotal.balanceAmount },
      ],
    },
  ];
}

// 13. Issue Register Report
// Digital version of the client's paper "Stock Issue Register" — one row per
// stock issue slip in a period.
export interface IssueRegisterReportData {
  rows: Array<{
    issueNumber: string;
    issueDate: string;
    departmentName: string;
    totalAmount: number;
  }>;
  totalAmount: number;
}

export function buildIssueRegisterReport(data: IssueRegisterReportData): ExcelSheet[] {
  return [
    {
      name: "Issue Register",
      columns: [
        { header: "Slip No", key: "issueNumber", width: 18 },
        { header: "Date", key: "issueDate", width: 14, format: FMT_DATE },
        { header: "Department", key: "departmentName", width: 30 },
        { header: "Amount", key: "totalAmount", width: 16, format: FMT_NUMBER },
      ],
      rows: data.rows as unknown as Record<string, unknown>[],
      summary: [{ label: "TOTAL", value: data.totalAmount }],
    },
  ];
}

// 14. Purchase Register Report
// Digital version of the client's paper "Purchase Register" — one row per
// purchase bill and supplier return in a period.
export interface PurchaseRegisterReportData {
  rows: Array<{
    billNumber: string;
    date: string;
    supplierName: string;
    roundOff: number;
    billAmount: number;
  }>;
  netTotal: number;
}

export function buildPurchaseRegisterReport(data: PurchaseRegisterReportData): ExcelSheet[] {
  return [
    {
      name: "Purchase Register",
      columns: [
        { header: "Bill No", key: "billNumber", width: 18 },
        { header: "Date", key: "date", width: 14, format: FMT_DATE },
        { header: "Name", key: "supplierName", width: 28 },
        { header: "Round", key: "roundOff", width: 12, format: FMT_CURRENCY },
        { header: "Bill Amt", key: "billAmount", width: 16, format: FMT_CURRENCY },
      ],
      rows: data.rows as unknown as Record<string, unknown>[],
      summary: [{ label: "NET TOTAL", value: data.netTotal }],
    },
  ];
}
