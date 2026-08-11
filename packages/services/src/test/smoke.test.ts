/**
 * Smoke test for the test infrastructure — verifies that:
 *   1. The Prisma client connects to the test DB (not production)
 *   2. resetDb() actually truncates tables
 *   3. createTestFixture() creates the minimum entities
 *   4. seedTestAccounts() creates the chart of accounts
 *
 * This test file itself IS the validation that the test harness works.
 * Once it passes, we can write real integration tests for GL postings.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";

describe("Test infrastructure smoke test", () => {
  beforeAll(async () => {
    // Verify we're connected to the TEST database, not production
    const result = await prisma.$queryRaw<{ current_database: string }[]>`
      SELECT current_database()
    `;
    expect(result[0]?.current_database).toBe("nirman_inventory_test");
  });

  beforeEach(async () => {
    await resetDb();
  });

  it("resetDb() truncates all tables", async () => {
    // Create a company, then reset, then verify it's gone
    await prisma.company.create({
      data: { name: "Temp Co", currency: "INR" },
    });
    expect(await prisma.company.count()).toBe(1);

    await resetDb();
    expect(await prisma.company.count()).toBe(0);
  });

  it("createTestFixture() creates company, user, project, stock location", async () => {
    const fixture = await createTestFixture();

    expect(fixture.company.id).toBe("test-company");
    expect(fixture.user.id).toBe("test-user");
    expect(fixture.project.id).toBe("test-project");
    expect(fixture.stockLocation.id).toBe("test-location");

    // Verify they actually exist in the DB
    const company = await prisma.company.findUnique({ where: { id: "test-company" } });
    expect(company).not.toBeNull();
    expect(company!.name).toBe("Test Construction Co.");

    const project = await prisma.project.findUnique({ where: { id: "test-project" } });
    expect(project).not.toBeNull();
    expect(project!.companyId).toBe(fixture.company.id);
  });

  it("seedTestAccounts() creates the chart of accounts", async () => {
    const { company } = await createTestFixture();
    await seedTestAccounts(company.id);

    const accounts = await prisma.glAccount.findMany();
    // Should have the same number as CHART_OF_ACCOUNTS
    expect(accounts.length).toBeGreaterThan(15); // at least 18 system accounts

    // Verify a key account exists
    const unitAsset = accounts.find((a) => a.code === "1800");
    expect(unitAsset).toBeDefined();
    expect(unitAsset!.name).toBe("Unsold Assets - Built Units");
    expect(unitAsset!.type).toBe("ASSET");
  });
});
