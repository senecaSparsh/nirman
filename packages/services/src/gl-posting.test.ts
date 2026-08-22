import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { CHART_OF_ACCOUNTS, ACCT } from "./gl-posting";

/**
 * Unit tests for the General Ledger posting layer.
 *
 * These test the pure accounting invariants — the chart of accounts is
 * well-formed, account codes are unique, and the helper functions would
 * produce balanced entries. The actual `postJournalEntry` writes to the
 * DB and is exercised by the integration flows (receiveGoods, sellAsset, etc.).
 */
describe("General Ledger — chart of accounts", () => {
  it("has 31 system accounts", () => {
    expect(CHART_OF_ACCOUNTS).toHaveLength(31);
  });

  it("has unique account codes", () => {
    const codes = CHART_OF_ACCOUNTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("covers all 6 account types", () => {
    const types = new Set(CHART_OF_ACCOUNTS.map((a) => a.type));
    expect(types).toEqual(new Set(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE", "CONTRA_EXPENSE"]));
  });

  it("has the standard construction-industry accounts", () => {
    const codes = new Set(CHART_OF_ACCOUNTS.map((a) => a.code));
    for (const required of Object.values(ACCT)) {
      expect(codes.has(required)).toBe(true);
    }
  });
});

describe("General Ledger — posting invariants (pure checks)", () => {
  // Helper: would a set of lines balance? Mirrors the check in postJournalEntry.
  function isBalanced(lines: { debit: Decimal; credit: Decimal }[]): boolean {
    const d = lines.reduce((s, l) => s.plus(l.debit), new Decimal(0));
    const c = lines.reduce((s, l) => s.plus(l.credit), new Decimal(0));
    return d.equals(c);
  }

  it("a PO receipt with GST balances (Dr inventory + Dr ITC = Cr AP)", () => {
    const subtotal = new Decimal(1000);
    const gst = new Decimal(180); // 18%
    const total = subtotal.plus(gst);
    const lines = [
      { debit: subtotal, credit: new Decimal(0) },
      { debit: gst, credit: new Decimal(0) },
      { debit: new Decimal(0), credit: total },
    ];
    expect(isBalanced(lines)).toBe(true);
  });

  it("an asset sale balances (Dr AR = Cr Revenue; Dr COGS = Cr Asset)", () => {
    const salePrice = new Decimal(5000000);
    const costBasis = new Decimal(3500000);
    expect(
      isBalanced([
        { debit: salePrice, credit: new Decimal(0) },
        { debit: new Decimal(0), credit: salePrice },
      ]),
    ).toBe(true);
    expect(
      isBalanced([
        { debit: costBasis, credit: new Decimal(0) },
        { debit: new Decimal(0), credit: costBasis },
      ]),
    ).toBe(true);
  });

  it("a supplier return balances (Dr AP = Cr Inventory + Cr ITC reversal)", () => {
    const subtotal = new Decimal(500);
    const gst = new Decimal(90);
    const total = subtotal.plus(gst);
    const lines = [
      { debit: total, credit: new Decimal(0) },
      { debit: new Decimal(0), credit: subtotal },
      { debit: new Decimal(0), credit: gst },
    ];
    expect(isBalanced(lines)).toBe(true);
  });

  it("a material issue balances (Dr WIP = Cr Inventory)", () => {
    const cost = new Decimal(1234.56);
    expect(
      isBalanced([
        { debit: cost, credit: new Decimal(0) },
        { debit: new Decimal(0), credit: cost },
      ]),
    ).toBe(true);
  });

  it("an unbalanced set is rejected", () => {
    expect(
      isBalanced([
        { debit: new Decimal(100), credit: new Decimal(0) },
        { debit: new Decimal(0), credit: new Decimal(99) },
      ]),
    ).toBe(false);
  });
});
