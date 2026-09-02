import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/backup/export — full JSON backup of the current company's data.
 *
 * Exports all company-scoped tables as a single JSON file. This is the
 * "emergency backup" — a user can download this at any time to have a
 * complete copy of their data on their local machine.
 *
 * The backup includes:
 *   - Company settings
 *   - All master data (projects, materials, suppliers, customers, etc.)
 *   - All transactional data (POs, GRNs, sales, payments, stock movements, etc.)
 *   - All financial data (journal entries, GL accounts)
 *   - All operational data (DPRs, attendance, equipment, etc.)
 *
 * Format: { version: 1, exportedAt, company: {...}, tables: { tableName: [...] } }
 *
 * The response is a downloadable JSON file (Content-Disposition: attachment).
 *
 * Permission: FINANCE_MANAGE (accountants/owners only — backup contains
 * sensitive financial data).
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();

  // Define all company-scoped models to export, in dependency order
  // (parents before children, so restore can insert in order)
  const tableExportPlan: { model: string; include?: Record<string, unknown> }[] = [
    // Company & settings
    { model: "company" },
    // Master data
    { model: "project", include: { phases: true } },
    { model: "department" },
    { model: "stockLocation" },
    { model: "materialCategory" },
    { model: "material", include: { lots: true } },
    { model: "supplier" },
    { model: "subcontractor" },
    { model: "customer" },
    { model: "broker" },
    { model: "landSeller" },
    { model: "equipment" },
    { model: "vehicle" },
    // Land
    { model: "landPurchase", include: { parcels: true, paymentSchedule: { include: { items: true } } } },
    { model: "landParcel" },
    // Procurement
    { model: "purchaseOrder", include: { lines: true, goodsReceipts: { include: { lines: true } } } },
    { model: "directPurchase", include: { lines: true } },
    { model: "materialRequisition", include: { lines: true, quotes: { include: { lines: true } } } },
    { model: "supplierPayment" },
    { model: "supplierReturn", include: { lines: true } },
    // Stock
    { model: "stockLocationItem" },
    { model: "stockMovement" },
    { model: "materialIssue", include: { lines: true } },
    { model: "stockTransfer", include: { lines: true } },
    { model: "stockCount", include: { lines: true } },
    { model: "scrapGeneration", include: { lines: true } },
    // Sales
    { model: "assetSale", include: { payments: true, expenses: true, terms: true, paymentSchedule: { include: { items: true } } } },
    { model: "materialSale", include: { lines: true, payments: true } },
    // Finance
    { model: "glAccount" },
    { model: "journalEntry", include: { lines: true } },
    { model: "projectCost" },
    { model: "expense" },
    // HR
    { model: "employee" },
    { model: "payrollPeriod", include: { lines: true } },
    { model: "workerAttendance" },
    { model: "dailyProgressReport" },
    // Construction
    { model: "wbsNode" },
    { model: "boqItem" },
    { model: "subcontractorWorkOrder", include: { raBills: true } },
    { model: "measurementBookEntry" },
    // Other
    { model: "lead", include: { activities: true } },
    { model: "task" },
    { model: "safetyIncident" },
    { model: "safetyHazard" },
    { model: "safetyInspection" },
    { model: "gatePass" },
    { model: "auditLog" },
  ];

  const tables: Record<string, unknown[]> = {};

  for (const { model, include } of tableExportPlan) {
    try {
      // @ts-expect-error — dynamic model access
      const records = await prisma[model].findMany({
        where: { companyId: company.id },
        ...(include ? { include } : {}),
        orderBy: { createdAt: "asc" },
      });
      // Serialize Dates and Decimals
      tables[model] = JSON.parse(
        JSON.stringify(records, (_key, value) => {
          if (typeof value === "bigint") return value.toString();
          return value;
        }),
      );
    } catch {
      // Model might not have companyId — skip
      tables[model] = [];
    }
  }

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    companyId: company.id,
    companyName: company.name,
    tableCount: Object.keys(tables).length,
    recordCount: Object.values(tables).reduce((sum, arr) => sum + arr.length, 0),
    tables,
  };

  const filename = `nirman-backup-${company.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
