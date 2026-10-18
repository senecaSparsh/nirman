import { describe, it, expect } from "vitest";
import { squareToSupplierCards } from "./supplier-payables";

type Row = { id: string; supplierId: string; payable: number };

describe("squareToSupplierCards", () => {
  it("trims PO payables newest-first so a supplier's rows total its card", () => {
    const rows: Row[] = [
      { id: "po1", supplierId: "s1", payable: 100 },
      { id: "po2", supplierId: "s1", payable: 60 },
    ];
    const { poRows, unexplained } = squareToSupplierCards(rows, [{ id: "s1", balanceOwed: 130 }]);
    expect(poRows).toEqual([
      { id: "po1", supplierId: "s1", payable: 100 },
      { id: "po2", supplierId: "s1", payable: 30 },
    ]);
    expect(unexplained.size).toBe(0);
  });

  it("carries card balance the POs do not explain as unexplained (opening / bills)", () => {
    const rows: Row[] = [{ id: "po1", supplierId: "s1", payable: 100 }];
    const { poRows, unexplained } = squareToSupplierCards(rows, [{ id: "s1", balanceOwed: 250 }]);
    expect(poRows).toEqual([{ id: "po1", supplierId: "s1", payable: 100 }]);
    expect(unexplained.get("s1")).toBe(150);
  });

  it("drops every PO payable when the card is settled", () => {
    const rows: Row[] = [{ id: "po1", supplierId: "s1", payable: 80 }];
    const { poRows, unexplained } = squareToSupplierCards(rows, [{ id: "s1", balanceOwed: 0 }]);
    expect(poRows).toEqual([]);
    expect(unexplained.size).toBe(0);
  });

  it("never lets one supplier's card absorb another supplier's POs", () => {
    const rows: Row[] = [
      { id: "a", supplierId: "s1", payable: 50 },
      { id: "b", supplierId: "s2", payable: 70 },
    ];
    const { poRows, unexplained } = squareToSupplierCards(rows, [
      { id: "s1", balanceOwed: 50 },
      { id: "s2", balanceOwed: 200 },
    ]);
    expect(poRows.map((r) => [r.id, r.payable])).toEqual([["a", 50], ["b", 70]]);
    expect(unexplained.get("s2")).toBe(130);
    expect(unexplained.has("s1")).toBe(false);
  });

  it("treats an overpaid (negative) card as zero owed", () => {
    const rows: Row[] = [{ id: "po1", supplierId: "s1", payable: 40 }];
    const { poRows } = squareToSupplierCards(rows, [{ id: "s1", balanceOwed: -10 }]);
    expect(poRows).toEqual([]);
  });
});
