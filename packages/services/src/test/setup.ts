/**
 * Test setup — runs before any test file.
 *
 * Sets DATABASE_URL to the test database (nirman_inventory_test) so that
 * the Prisma singleton in @nirman/db connects to the right database.
 *
 * Provides:
 *   - resetDb(): truncates all tables between tests for isolation
 *   - createTestFixture(): creates the minimum entities (company, project,
 *     stock location, user) needed for integration tests
 */

import { prisma } from "@nirman/db";
import Decimal from "decimal.js";

// ── DB reset ──────────────────────────────────────────────

/**
 * Truncate all tables in the public schema, resetting the test DB to a
 * clean state. Called before each integration test.
 *
 * Uses TRUNCATE ... CASCADE to handle foreign keys. Resets sequences
 * so auto-generated IDs start fresh.
 */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const tableNames = tables
    .map((t) => t.tablename)
    .filter((n) => n !== "_prisma_migrations");
  if (tableNames.length === 0) return;
  // TRUNCATE all tables and restart identity sequences
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "${tableNames.join('", "')}" RESTART IDENTITY CASCADE`,
  );
}

// ── Fixture builders ──────────────────────────────────────

/**
 * Create the minimum set of entities needed for most integration tests:
 * a Company, a User, a Project, and a StockLocation.
 *
 * Returns the created entities so tests can reference them.
 */
export async function createTestFixture() {
  const company = await prisma.company.create({
    data: {
      id: "test-company",
      name: "Test Construction Co.",
      currency: "INR",
    },
  });

  const user = await prisma.user.create({
    data: {
      id: "test-user",
      email: "test@nirman.in",
      name: "Test User",
      role: "OWNER",
      companyId: company.id,
    },
  });

  // Link user to company via UserCompany membership
  await prisma.userCompany.create({
    data: {
      userId: user.id,
      companyId: company.id,
      role: "OWNER",
    },
  });

  const project = await prisma.project.create({
    data: {
      id: "test-project",
      companyId: company.id,
      name: "Test Project",
      status: "ACTIVE",
      totalSellableArea: new Decimal(10000),
      costPerSqft: new Decimal(0),
    },
  });

  const stockLocation = await prisma.stockLocation.create({
    data: {
      id: "test-location",
      companyId: company.id,
      name: "Main Warehouse",
      type: "COMPANY_WAREHOUSE",
    },
  });

  return { company, user, project, stockLocation };
}

/**
 * Seed the chart of accounts for the test company.
 * Required before any GL posting functions can be used.
 */
export async function seedTestAccounts(_companyId: string) {
  const { CHART_OF_ACCOUNTS } = await import("../gl-posting");
  for (const acct of CHART_OF_ACCOUNTS) {
    await prisma.glAccount.create({
      data: {
        code: acct.code,
        name: acct.name,
        type: acct.type,
      },
    });
  }
}

// ── Global setup/teardown ────────────────────────────────

// Reset DB before each test file (vitest setupFiles run once per file,
// but we use beforeAll/beforeEach in individual tests for per-test reset)
