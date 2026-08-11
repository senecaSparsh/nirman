/**
 * Integration tests for WIP Capitalization (Phase 1A).
 *
 * These tests verify the core fix: when a built unit transitions to AVAILABLE,
 * its accumulated production cost is moved from WIP (1500) to Unsold Assets -
 * Units (1800) via a balanced journal entry.
 *
 * Tests:
 *   1. Transition to AVAILABLE produces Dr 1800 / Cr 1500 journal entry
 *   2. Status reversal (AVAILABLE → UNDER_CONSTRUCTION → AVAILABLE) does NOT double-capitalize
 *   3. Costs added after unit creation are picked up by reallocateProjectCosts() inside updateUnitStatus()
 *   4. postWipCapitalization with zero amount returns null (no entry posted)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";
import { updateUnitStatus, createBuiltUnits } from "../built-unit";
import { postWipCapitalization, ACCT } from "../gl-posting";

describe("WIP Capitalization — integration tests", () => {
  beforeEach(async () => {
    await resetDb();
  });

  /**
   * Helper: create a full test scenario with a project, a built unit, and
   * optional project costs. Returns the created entities.
   */
  async function setupScenario(opts: { projectCostAmount?: Decimal } = {}) {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);

    // Create a built unit (starts as PLANNED)
    const created = await createBuiltUnits({
      projectId: fixture.project.id,
      userId: fixture.user.id,
      units: [
        {
          unitType: "BHK_2",
          unitNumber: "A-101",
          area: new Decimal(1000),
        },
      ],
    });
    const unit = created[0]!; // exactly one unit was created

    // Optionally add a project cost (LABOUR) that will be area-allocated
    if (opts.projectCostAmount) {
      await prisma.projectCost.create({
        data: {
          projectId: fixture.project.id,
          costType: "LABOUR",
          amount: opts.projectCostAmount,
          notes: "Test labour cost",
        },
      });
    }

    return { ...fixture, unit };
  }

  /**
   * Helper: find the WIP_CAPITALIZATION journal entry for a unit.
   * Returns the entry with its lines, or null if none exists.
   */
  async function findCapitalizationEntry(builtUnitId: string) {
    return prisma.journalEntry.findFirst({
      where: {
        sourceType: "WIP_CAPITALIZATION",
        sourceId: builtUnitId,
      },
      include: { lines: true },
    });
  }

  // ── Test 1: Transition to AVAILABLE produces Dr 1800 / Cr 1500 ──

  it("transition to AVAILABLE produces Dr 1800 / Cr 1500 journal entry", async () => {
    const { unit, user } = await setupScenario({
      projectCostAmount: new Decimal(1000000),
    });

    // PLANNED → UNDER_CONSTRUCTION (no capitalization yet)
    await updateUnitStatus(unit.id, "UNDER_CONSTRUCTION", user.id);

    // UNDER_CONSTRUCTION → AVAILABLE (should capitalize)
    await updateUnitStatus(unit.id, "AVAILABLE", user.id);

    // Verify the journal entry exists
    const entry = await findCapitalizationEntry(unit.id);
    expect(entry).not.toBeNull();
    expect(entry!.sourceType).toBe("WIP_CAPITALIZATION");
    expect(entry!.lines).toHaveLength(2);

    // Find the debit and credit lines
    const debitLine = entry!.lines.find((l) => l.accountCode === ACCT.UNIT_ASSET);
    const creditLine = entry!.lines.find((l) => l.accountCode === ACCT.WIP);
    expect(debitLine).toBeDefined();
    expect(creditLine).toBeDefined();

    // The amount should be 1,000,000 (the project cost, area-allocated to the single unit)
    expect(debitLine!.debit.toNumber()).toBe(1000000);
    expect(debitLine!.credit.toNumber()).toBe(0);
    expect(creditLine!.debit.toNumber()).toBe(0);
    expect(creditLine!.credit.toNumber()).toBe(1000000);

    // Verify the entry is balanced
    expect(entry!.totalDebit.toNumber()).toBe(1000000);
    expect(entry!.totalCredit.toNumber()).toBe(1000000);

    // Verify capitalizedAmount was updated on the unit
    const updatedUnit = await prisma.builtUnit.findUnique({ where: { id: unit.id } });
    expect(updatedUnit!.capitalizedAmount.toNumber()).toBe(1000000);
  });

  // ── Test 2: Status reversal does NOT double-capitalize ──

  it("status reversal AVAILABLE → UNDER_CONSTRUCTION → AVAILABLE does NOT double-capitalize", async () => {
    const { unit, user } = await setupScenario({
      projectCostAmount: new Decimal(1000000),
    });

    // PLANNED → UNDER_CONSTRUCTION → AVAILABLE (first capitalization)
    await updateUnitStatus(unit.id, "UNDER_CONSTRUCTION", user.id);
    await updateUnitStatus(unit.id, "AVAILABLE", user.id);

    // Verify first capitalization
    const entry1 = await findCapitalizationEntry(unit.id);
    expect(entry1).not.toBeNull();
    expect(entry1!.totalDebit.toNumber()).toBe(1000000);

    // AVAILABLE → UNDER_CONSTRUCTION (reversal — no new capitalization)
    await updateUnitStatus(unit.id, "UNDER_CONSTRUCTION", user.id);

    // UNDER_CONSTRUCTION → AVAILABLE (should NOT double-capitalize)
    await updateUnitStatus(unit.id, "AVAILABLE", user.id);

    // Verify there's still only ONE capitalization entry
    const entries = await prisma.journalEntry.findMany({
      where: {
        sourceType: "WIP_CAPITALIZATION",
        sourceId: unit.id,
      },
      include: { lines: true },
    });
    expect(entries).toHaveLength(1);

    // Verify capitalizedAmount is still 1,000,000 (not 2,000,000)
    const updatedUnit = await prisma.builtUnit.findUnique({ where: { id: unit.id } });
    expect(updatedUnit!.capitalizedAmount.toNumber()).toBe(1000000);
  });

  // ── Test 3: Costs added after unit creation are picked up ──

  it("costs added after unit creation are picked up by reallocateProjectCosts() inside updateUnitStatus()", async () => {
    const { unit, user, project } = await setupScenario({
      // No project cost initially — productionCost will be 0
    });

    // Verify the unit starts with zero production cost
    const initialUnit = await prisma.builtUnit.findUnique({ where: { id: unit.id } });
    expect(initialUnit!.productionCost.toNumber()).toBe(0);

    // PLANNED → UNDER_CONSTRUCTION (no capitalization, productionCost still 0)
    await updateUnitStatus(unit.id, "UNDER_CONSTRUCTION", user.id);

    // Add a project cost AFTER the unit is under construction
    await prisma.projectCost.create({
      data: {
        projectId: project.id,
        costType: "LABOUR",
        amount: new Decimal(500000),
        notes: "Labour cost added after construction started",
      },
    });

    // UNDER_CONSTRUCTION → AVAILABLE
    // updateUnitStatus() should call reallocateProjectCosts() internally,
    // which picks up the new cost and sets productionCost = 500,000
    await updateUnitStatus(unit.id, "AVAILABLE", user.id);

    // Verify the unit's productionCost was updated
    const updatedUnit = await prisma.builtUnit.findUnique({ where: { id: unit.id } });
    expect(updatedUnit!.productionCost.toNumber()).toBe(500000);

    // Verify the capitalization entry was posted for 500,000
    const entry = await findCapitalizationEntry(unit.id);
    expect(entry).not.toBeNull();
    expect(entry!.totalDebit.toNumber()).toBe(500000);
    expect(entry!.totalCredit.toNumber()).toBe(500000);

    // Verify capitalizedAmount
    expect(updatedUnit!.capitalizedAmount.toNumber()).toBe(500000);
  });

  // ── Test 4: postWipCapitalization with zero amount returns null ──

  it("postWipCapitalization with zero amount returns null (no entry posted)", async () => {
    const { company, project } = await setupScenario();

    const result = await prisma.$transaction(async (tx) => {
      return postWipCapitalization(tx, {
        companyId: company.id,
        builtUnitId: "fake-unit-id",
        projectId: project.id,
        costBasis: new Decimal(0),
      });
    });

    expect(result).toBeNull();

    // Verify no journal entry was created
    const entries = await prisma.journalEntry.findMany({
      where: { sourceType: "WIP_CAPITALIZATION" },
    });
    expect(entries).toHaveLength(0);
  });

  // ── Test 5 (bonus): HOLD → AVAILABLE does not re-capitalize ──

  it("HOLD → AVAILABLE does not re-capitalize (already capitalized when first AVAILABLE)", async () => {
    const { unit, user } = await setupScenario({
      projectCostAmount: new Decimal(800000),
    });

    // PLANNED → UNDER_CONSTRUCTION → AVAILABLE (capitalize 800,000)
    await updateUnitStatus(unit.id, "UNDER_CONSTRUCTION", user.id);
    await updateUnitStatus(unit.id, "AVAILABLE", user.id);

    // AVAILABLE → HOLD (no capitalization)
    await updateUnitStatus(unit.id, "HOLD", user.id);

    // HOLD → AVAILABLE (should NOT re-capitalize — delta is 0)
    await updateUnitStatus(unit.id, "AVAILABLE", user.id);

    // Verify only ONE capitalization entry
    const entries = await prisma.journalEntry.findMany({
      where: {
        sourceType: "WIP_CAPITALIZATION",
        sourceId: unit.id,
      },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.totalDebit.toNumber()).toBe(800000);
  });
});
