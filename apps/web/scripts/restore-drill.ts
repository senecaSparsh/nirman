/**
 * restore-drill.ts — prove the backup archive actually restores.
 *
 * Reads an /api/backup/export archive and re-creates the rows into the
 * DATABASE_URL you're pointed at — intended for a scratch DB with the
 * schema pushed but no data. Same dependency order as the import route,
 * then spot-checks business invariants on the restored data.
 *
 * Usage (from apps/web):
 *   DATABASE_URL=postgresql://…/scratch npx tsx scripts/restore-drill.ts /tmp/backup.json
 */
import { readFileSync } from "node:fs";
import { prisma } from "@nirman/db";

const FILE = process.argv[2] ?? "/tmp/nirman-backup-drill.json";

// Same dependency order the import route uses (parents first).
const ORDER = [
  "company", "project", "department", "stockLocation", "materialCategory",
  "material", "supplier", "subcontractor", "customer", "broker", "landSeller",
  "equipment", "vehicle", "landPurchase", "purchaseOrder", "directPurchase",
  "materialRequisition", "supplierPayment", "supplierReturn",
  "stockLocationItem", "stockMovement", "materialIssue", "stockTransfer",
  "stockCount", "scrapGeneration", "assetSale", "materialSale",
  "glAccount", "journalEntry", "journalLine", "projectCost", "expense",
  "employee", "payrollPeriod", "attendance", "dailyProgressReport",
  "wbsElement", "boq", "workOrder", "measurementBook",
  "lead", "task", "safetyIncident", "safetyHazard", "safetyInspection",
  "gatePass", "auditLog",
];

async function main() {
const backup = JSON.parse(readFileSync(FILE, "utf8")) as {
  recordCount: number; tableCount: number; tables: Record<string, Record<string, unknown>[]>;
};
const tables = backup.tables ?? {};
console.log(`restore-drill: ${backup.recordCount} records / ${backup.tableCount} tables`);

let failed = 0;
const counts: Record<string, number> = {};

// journalLine isn't in the export's allowlist shape — check its key name.
const extraKeys = Object.keys(tables).filter((k) => !ORDER.includes(k));
if (extraKeys.length) console.log(`  extra tables in archive: ${extraKeys.join(", ")}`);

for (const model of [...ORDER, ...extraKeys]) {
  const rows = tables[model];
  if (!Array.isArray(rows) || !rows.length) continue;
  // @ts-expect-error — dynamic model access
  const m = prisma[model];
  if (!m?.createMany) { console.log(`  skip ${model} — no model`); continue; }
  try {
    const res = await m.createMany({
      data: rows.map((r) => {
        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
          if (v === null) continue;
          if (typeof v === "object") continue; // relations/json handled by own table or column shape
          clean[k] = v;
        }
        return clean;
      }),
      skipDuplicates: true,
    });
    counts[model] = res.count;
  } catch (e) {
    failed++;
    console.log(`  FAIL ${model}: ${String(e).slice(0, 160)}`);
  }
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`\nrows written: ${total} / ${backup.recordCount} expected (${failed} table failures)`);

console.log("\n── integrity on restored DB ──");
const imbalanced = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`
  SELECT COUNT(*)::int AS n FROM (
    SELECT e.id FROM "JournalEntry" e JOIN "JournalLine" l ON l."journalEntryId" = e.id
    GROUP BY e.id HAVING ABS(SUM(l.debit) - SUM(l.credit)) > 0.01
  ) x`);
console.log(`  unbalanced journals: ${imbalanced[0]?.n}`);
const neg = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
  `SELECT COUNT(*)::int AS n FROM "StockLocationItem" WHERE qty < 0`);
console.log(`  negative stock rows: ${neg[0]?.n}`);

const [po, emp, mvt, cust] = await Promise.all([
  prisma.purchaseOrder.count(), prisma.employee.count(),
  prisma.stockMovement.count(), prisma.customer.count(),
]);
console.log(`  po=${po} emp=${emp} movements=${mvt} customers=${cust}`);

await prisma.$disconnect();
process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
