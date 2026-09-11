/**
 * Production seed — runs after `prisma migrate deploy` on every container start.
 *
 * What it does:
 *   1. Seeds the chart of accounts so journal-entry posting works.
 *
 * That's it. No mock users, no demo companies, no fake data.
 * The production database starts clean. The SRG REALCON provisioning script
 * (create-srg-users.mjs) adds the first real company and user accounts.
 *
 * Idempotent: safe to run on every deploy. The chart of accounts step upserts
 * master data — it won't duplicate or overwrite existing accounts.
 *
 * Usage:
 *   pnpm --filter @nirman/web seed:prod
 *
 * Environment:
 *   DATABASE_URL must point to the production Postgres.
 */
import { prisma } from "@nirman/db";
import { seedChartOfAccounts } from "@nirman/services";

async function main() {
  console.log("=== Production seed ===");
  console.log(`Database: ${process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ?? "(unknown)"}`);
  console.log("");

  // Step 1: Ensure the chart of accounts is present for every company so GL posting works
  const companies = await prisma.company.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  console.log(`Seeding chart of accounts for ${companies.length} company(ies)…`);
  for (const c of companies) {
    await seedChartOfAccounts(c.id);
  }
  if (companies.length === 0) {
    console.log("  → No companies yet. Chart of accounts will be seeded when the first company is created (auto-seeds on first GL access).");
  }

  // Step 2: Report database state (informational only)
  const userCount = await prisma.user.count();
  const companyCount = companies.length;
  console.log(`Database state: ${companyCount} companies, ${userCount} users`);

  if (userCount === 0) {
    console.log("  → Clean database. SRG REALCON provisioning will create the first accounts.");
  }

  console.log("");
  console.log("Production seed complete.");
}

main()
  .catch((e) => {
    console.error("Production seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
