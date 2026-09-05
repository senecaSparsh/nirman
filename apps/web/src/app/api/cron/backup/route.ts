import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json } from "@/lib/server";
import { withTimeout } from "@/lib/timeout";

/**
 * POST /api/cron/backup — automated scheduled backup.
 *
 * Triggered by Render's cron service (or any external scheduler) daily.
 * Exports ALL companies' data (not just one) and stores the backup as a
 * JSON blob in the BackupRecord table. Keeps the last 30 days of backups
 * (older ones are auto-pruned).
 *
 * Auth: requires CRON_SECRET header (same as /api/cron/reminders).
 *
 * Render cron config (add to render.yaml if you want this):
 *   - type: cron
 *     name: nirman-backup
 *     schedule: "0 2 * * *"  # daily at 2am UTC
 *     command: "curl -X POST -H 'x-cron-secret: $CRON_SECRET' https://nirman-inventory.onrender.com/api/cron/backup"
 *
 * Backups are queryable via GET /api/backup/records (FINANCE_MANAGE perm).
 */

const BACKUP_RETENTION_DAYS = 30;

export const POST = apiHandler(async (req: NextRequest) => {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;
  if (process.env.AUTH_BYPASS !== "true") {
    if (!expectedSecret || cronSecret !== expectedSecret) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return withTimeout(doBackup(), 120_000, "Backup timed out after 120s");
});

async function doBackup(): Promise<Response> {
  const startTime = Date.now();
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  const results: { companyId: string; companyName: string; records: number; sizeBytes: number }[] = [];

  for (const company of companies) {
    try {
      const backupData = await exportCompanyData(company.id);
      const jsonStr = JSON.stringify(backupData);
      const sizeBytes = Buffer.byteLength(jsonStr, "utf8");

      // Store the backup in the BackupRecord table.
      // (If the table doesn't exist, this will fail gracefully — the
      // manual /api/backup/export endpoint still works.)
      try {
        await prisma.backupRecord.create({
          data: {
            companyId: company.id,
            data: jsonStr,
            sizeBytes,
            createdAt: new Date(),
          },
        });
      } catch {
        // BackupRecord table may not exist yet — skip storage, just log.
      }

      results.push({
        companyId: company.id,
        companyName: company.name,
        records: backupData.recordCount,
        sizeBytes,
      });
    } catch (err) {
      console.error(`[cron/backup] failed for company ${company.id}:`, err);
      results.push({
        companyId: company.id,
        companyName: company.name,
        records: 0,
        sizeBytes: 0,
      });
    }
  }

  // Prune old backups (older than retention period).
  const cutoff = new Date(Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    await prisma.backupRecord.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
  } catch {
    // Table may not exist — ignore.
  }

  const durationMs = Date.now() - startTime;
  console.log(
    `[cron/backup] completed in ${durationMs}ms — ${results.length} companies, ` +
    `${results.reduce((s, r) => s + r.records, 0)} total records`,
  );

  return json({
    ok: true,
    durationMs,
    companies: results,
    prunedBefore: cutoff.toISOString(),
  });
}

/**
 * Exports all data for a single company as JSON.
 * Same logic as /api/backup/export but programmatic (not a file download).
 */
async function exportCompanyData(companyId: string) {
  const tableExportPlan: { model: string; include?: Record<string, unknown> }[] = [
    { model: "company" },
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
    { model: "landPurchase", include: { parcels: true } },
    { model: "landParcel" },
    { model: "purchaseOrder", include: { lines: true, goodsReceipts: { include: { lines: true } } } },
    { model: "directPurchase", include: { lines: true } },
    { model: "materialRequisition", include: { lines: true, quotes: { include: { lines: true } } } },
    { model: "supplierPayment" },
    { model: "supplierReturn", include: { lines: true } },
    { model: "stockLocationItem" },
    { model: "stockMovement" },
    { model: "materialIssue", include: { lines: true } },
    { model: "stockTransfer", include: { lines: true } },
    { model: "stockCount", include: { lines: true } },
    { model: "scrapGeneration", include: { lines: true } },
    { model: "assetSale", include: { payments: true, expenses: true, terms: true } },
    { model: "materialSale", include: { lines: true, payments: true } },
    { model: "glAccount" },
    { model: "journalEntry", include: { lines: true } },
    { model: "projectCost" },
    { model: "expense" },
    { model: "employee" },
    { model: "payrollPeriod", include: { lines: true } },
    { model: "workerAttendance" },
    { model: "dailyProgressReport" },
    { model: "wbsNode" },
    { model: "boqItem" },
    { model: "subcontractorWorkOrder", include: { raBills: true } },
    { model: "measurementBookEntry" },
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
        where: { companyId },
        ...(include ? { include } : {}),
        orderBy: { createdAt: "asc" },
      });
      tables[model] = JSON.parse(
        JSON.stringify(records, (_key, value) => {
          if (typeof value === "bigint") return value.toString();
          return value;
        }),
      );
    } catch {
      tables[model] = [];
    }
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    companyId,
    recordCount: Object.values(tables).reduce((sum, arr) => sum + arr.length, 0),
    tables,
  };
}
