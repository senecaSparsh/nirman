/**
 * Seed HSN/SAC Master — populate the HsnGstRate table with real
 * government-provided CBIC HSN and SAC codes with their GST rates.
 *
 * Run once against production (or any environment):
 *   npx tsx apps/web/scripts/seed-hsn-gst.ts
 *
 * Or via pnpm:
 *   pnpm --filter web exec tsx scripts/seed-hsn-gst.ts
 *
 * Idempotent — upserts by hsnCode, so re-running updates descriptions/rates
 * without creating duplicates. Safe to run multiple times.
 */
import { prisma } from "@nirman/db";
import { seedHsnGstRates } from "@nirman/services";

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  HSN/SAC Master Seed — CBIC Government Codes");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log();

  // Check existing count
  const before = await prisma.hsnGstRate.count();
  console.log(`Existing HSN/SAC entries in database: ${before}`);
  console.log();

  console.log("Seeding government-provided HSN/SAC codes with GST rates...");
  const result = await seedHsnGstRates();

  const after = await prisma.hsnGstRate.count();
  console.log();
  console.log(`✓ Seed complete.`);
  console.log(`  Processed: ${result.created} entries`);
  console.log(`  Total in database: ${after} (was ${before})`);

  // Verify by category
  const goodsCount = await prisma.hsnGstRate.count({ where: { category: "Goods" } });
  const servicesCount = await prisma.hsnGstRate.count({ where: { category: "Services" } });
  console.log(`  Goods (HSN): ${goodsCount}`);
  console.log(`  Services (SAC): ${servicesCount}`);

  // Spot-check a few common codes
  const checks = ["2523", "7213", "7308", "9954", "9972"];
  console.log();
  console.log("Spot-check:");
  for (const code of checks) {
    const entry = await prisma.hsnGstRate.findUnique({ where: { hsnCode: code } });
    if (entry) {
      console.log(`  ${code} → ${entry.gstRate}% GST — ${entry.description.slice(0, 60)}...`);
    } else {
      console.log(`  ${code} → MISSING!`);
    }
  }

  console.log();
  console.log("Done. The system will now auto-pick GST rates when HSN codes are entered.");
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    prisma.$disconnect().then(() => process.exit(1));
  });
