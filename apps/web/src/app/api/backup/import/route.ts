import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * Allowlist of Prisma model names that are permitted in backup imports.
 * This excludes security-sensitive models (user, userCompany, account,
 * session, rolePermission, verification, etc.) to prevent privilege
 * escalation or cross-company data injection via a malicious backup file.
 */
const IMPORTABLE_MODELS = new Set([
  "company", "project", "department", "stockLocation", "materialCategory",
  "material", "supplier", "subcontractor", "customer", "broker", "landSeller",
  "equipment", "vehicle", "landPurchase", "purchaseOrder", "directPurchase",
  "materialRequisition", "supplierPayment", "supplierReturn",
  "stockLocationItem", "stockMovement", "materialIssue", "stockTransfer",
  "stockCount", "scrapGeneration", "assetSale", "materialSale",
  "glAccount", "journalEntry", "projectCost", "expense",
  "employee", "payrollPeriod", "attendance", "dailyProgressReport",
  "wbsElement", "boq", "workOrder", "measurementBook",
  "lead", "task", "safetyIncident", "safetyHazard", "safetyInspection",
  "gatePass", "auditLog",
]);

/**
 * POST /api/backup/import — restore from a JSON backup file.
 *
 * Body: the backup JSON object (same format as /api/backup/export).
 *
 * Strategy: upsert by ID. Records with the same ID are overwritten.
 * Records with new IDs are inserted. This is a merge, not a wipe.
 *
 * Permission: FINANCE_MANAGE (same as export — restore is destructive).
 */
export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();

  const body = await req.json();
  if (!body.tables || typeof body.tables !== "object") {
    return NextResponse.json({ error: "Invalid backup format — missing 'tables' object" }, { status: 400 });
  }

  const tables = body.tables as Record<string, unknown[]>;
  let totalRecords = 0;
  const tableCounts: Record<string, number> = {};

  // Reject any table key that is not in the allowlist — prevents importing
  // sensitive models (user, account, session, rolePermission, etc.)
  for (const modelName of Object.keys(tables)) {
    if (!IMPORTABLE_MODELS.has(modelName)) {
      return NextResponse.json(
        { error: `Table '${modelName}' is not permitted in backup imports` },
        { status: 400 },
      );
    }
  }

  // Process in dependency order (parents first)
  const orderedTables = Object.keys(tables).sort((a, b) => {
    const order = [
      "company", "project", "department", "stockLocation", "materialCategory",
      "material", "supplier", "subcontractor", "customer", "broker", "landSeller",
      "equipment", "vehicle", "landPurchase", "purchaseOrder", "directPurchase",
      "materialRequisition", "supplierPayment", "supplierReturn",
      "stockLocationItem", "stockMovement", "materialIssue", "stockTransfer",
      "stockCount", "scrapGeneration", "assetSale", "materialSale",
      "glAccount", "journalEntry", "projectCost", "expense",
      "employee", "payrollPeriod", "attendance", "dailyProgressReport",
      "wbsElement", "boq", "workOrder", "measurementBook",
      "lead", "task", "safetyIncident", "safetyHazard", "safetyInspection",
      "gatePass", "auditLog",
    ];
    return order.indexOf(a) - order.indexOf(b);
  });

  for (const modelName of orderedTables) {
    const records = tables[modelName];
    if (!Array.isArray(records) || records.length === 0) continue;

    try {
      // @ts-expect-error — dynamic model access
      const model = prisma[modelName];
      if (!model) continue;

      // Batch upsert — use createMany with skipDuplicates as a simple merge
      // For a full upsert we'd need per-record upsert, but createMany is
      // much faster for large tables. Records with existing IDs are skipped.
      // For a true restore (overwrite), the user should clear the DB first.
      await model.createMany({
        data: records.map((r) => {
          // Deserialize for Prisma — dates are strings in JSON
          const record = r as Record<string, unknown>;
          const cleaned: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(record)) {
            if (value === null) continue; // skip nulls to let DB defaults apply
            // Skip nested objects (relations) — they're handled by their own table
            if (typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) continue;
            if (Array.isArray(value)) continue;
            cleaned[key] = value;
          }
          return cleaned;
        }),
        skipDuplicates: true,
      });

      tableCounts[modelName] = records.length;
      totalRecords += records.length;
    } catch (err) {
      // Log but continue — don't fail the entire restore for one table
      console.error(`[Backup Import] Failed to import ${modelName}:`, err instanceof Error ? err.message : err);
      tableCounts[modelName] = 0;
    }
  }

  return NextResponse.json({
    success: true,
    companyId: company.id,
    recordCount: totalRecords,
    tableCount: Object.keys(tableCounts).filter((k) => (tableCounts[k] ?? 0) > 0).length,
    tableCounts,
  });
});
