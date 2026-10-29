/**
 * Financial-year close — the closing-entry + lock ritual.
 *
 *   closeFinancialYear: P&L balances as-of fyEnd → one closing JE
 *   (Dr revenue / Cr expense / Cr-or-Dr retained earnings) →
 *   glLockedUntil = fyEnd.
 *
 * Covers: profit close zeroes P&L and credits RE, the lock advances and
 * bites on backdated postings, repeat closes are refused, a loss year
 * debits RE, and an already-clean P&L no-ops.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";

describe("closeFinancialYear — FY closing entry + lock", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function postEntry(companyId: string, entryDate: string, lines: { accountCode: string; debit: number; credit: number }[]) {
    const { withSerializableTransaction } = await import("../transaction");
    const { postJournalEntry } = await import("../gl-posting");
    return withSerializableTransaction((tx) =>
      postJournalEntry(tx, {
        companyId,
        sourceType: "MANUAL",
        sourceId: `t-${entryDate}-${Math.random()}`,
        entryDate: new Date(entryDate),
        lines,
      }),
    );
  }

  it("closes a profit year: P&L zeroed, RE credited, lock bites", async () => {
    const { company, user } = await createTestFixture();
    await seedTestAccounts(company.id);
    // FY 2025-26 (Apr 2025–Mar 2026): ₹8,000 revenue, ₹5,000 expense → ₹3,000 profit.
    await postEntry(company.id, "2026-01-10", [
      { accountCode: "1000", debit: 8000, credit: 0 },
      { accountCode: "4000", debit: 0, credit: 8000 },
    ]);
    await postEntry(company.id, "2026-02-10", [
      { accountCode: "6100", debit: 5000, credit: 0 },
      { accountCode: "1000", debit: 0, credit: 5000 },
    ]);

    const { closeFinancialYear } = await import("../fy-close");
    const result = await closeFinancialYear({ companyId: company.id, fyEnd: new Date("2026-03-31"), userId: user.id });

    expect(result.closed).toBe(true);
    expect(result.netIncome?.toNumber()).toBe(3000);
    expect(result.revenueClosed?.toNumber()).toBe(8000);
    expect(result.expenseClosed?.toNumber()).toBe(5000);
    expect(result.accountsClosed).toBe(2);

    const updated = await prisma.company.findUnique({ where: { id: company.id } });
    expect(updated!.glLockedUntil!.toISOString().slice(0, 10)).toBe("2026-03-31");

    // Closing entry zeroed both P&L accounts and credited RE.
    const { trialBalance } = await import("../gl-posting");
    const tb = await trialBalance(company.id);
    const rev = tb.accounts.find((a) => a.code === "4000")!;
    const exp = tb.accounts.find((a) => a.code === "6100")!;
    const re = tb.accounts.find((a) => a.code === "3000")!;
    expect(rev.balance.toNumber()).toBe(0);
    expect(exp.balance.toNumber()).toBe(0);
    expect(re.balance.toNumber()).toBe(3000);

    // Lock bites on a backdated post into the closed FY.
    await expect(
      postEntry(company.id, "2026-03-15", [
        { accountCode: "6100", debit: 1, credit: 0 },
        { accountCode: "1000", debit: 0, credit: 1 },
      ]),
    ).rejects.toThrow(/Books locked/);

    // A current-dated post still works.
    await expect(
      postEntry(company.id, "2026-04-02", [
        { accountCode: "6100", debit: 1, credit: 0 },
        { accountCode: "1000", debit: 0, credit: 1 },
      ]),
    ).resolves.toBeTruthy();
  });

  it("closes a loss year: RE debited", async () => {
    const { company, user } = await createTestFixture();
    await seedTestAccounts(company.id);
    await postEntry(company.id, "2026-01-10", [
      { accountCode: "6100", debit: 9000, credit: 0 },
      { accountCode: "1000", debit: 0, credit: 9000 },
    ]);
    await postEntry(company.id, "2026-02-10", [
      { accountCode: "1000", debit: 4000, credit: 0 },
      { accountCode: "4000", debit: 0, credit: 4000 },
    ]);

    const { closeFinancialYear } = await import("../fy-close");
    const result = await closeFinancialYear({ companyId: company.id, fyEnd: new Date("2026-03-31"), userId: user.id });

    expect(result.closed).toBe(true);
    expect(result.netIncome?.toNumber()).toBe(-5000);
    const { trialBalance } = await import("../gl-posting");
    const tb = await trialBalance(company.id);
    expect(tb.accounts.find((a) => a.code === "3000")!.balance.toNumber()).toBe(-5000);
  });

  it("refuses to re-close an already-locked period and no-ops on clean books", async () => {
    const { company, user } = await createTestFixture();
    await seedTestAccounts(company.id);
    await postEntry(company.id, "2026-01-10", [
      { accountCode: "1000", debit: 1000, credit: 0 },
      { accountCode: "4000", debit: 0, credit: 1000 },
    ]);
    const { closeFinancialYear } = await import("../fy-close");
    await closeFinancialYear({ companyId: company.id, fyEnd: new Date("2026-03-31"), userId: user.id });

    // Same fyEnd → locked, refused.
    await expect(
      closeFinancialYear({ companyId: company.id, fyEnd: new Date("2026-03-31"), userId: user.id }),
    ).rejects.toThrow(/already locked/);

    // A later fyEnd with no new P&L activity in the window → no-op, not an error.
    const second = await closeFinancialYear({ companyId: company.id, fyEnd: new Date("2026-04-30"), userId: user.id });
    expect(second.closed).toBe(false);
  });

  it("rejects a future fyEnd — can't close a period that hasn't ended", async () => {
    const { company, user } = await createTestFixture();
    await seedTestAccounts(company.id);
    const { closeFinancialYear } = await import("../fy-close");
    const future = new Date();
    future.setUTCFullYear(future.getUTCFullYear() + 1);
    await expect(closeFinancialYear({ companyId: company.id, fyEnd: future, userId: user.id })).rejects.toThrow(
      /hasn't ended/,
    );
  });
});
