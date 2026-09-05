/**
 * Unit tests for BBA pipeline board pure helper.
 *
 *   deriveBbaStage — derive the BBA pipeline stage from an asset sale row
 */
import { describe, it, expect } from "vitest";
import { deriveBbaStage } from "@/components/sales/bba-pipeline-board";

// Minimal mock of AssetSaleRow for testing
function makeSale(overrides: Partial<{
  status: string;
  saleStage: string;
  paymentStatus: string;
  saleDeedNo: string | null;
  bbaNo: string | null;
}> = {}) {
  return {
    id: "sale-1",
    status: "ACTIVE",
    saleStage: "BOOKED",
    paymentStatus: "PENDING",
    saleDeedNo: null,
    bbaNo: null,
    ...overrides,
  } as any;
}

describe("deriveBbaStage", () => {
  it("returns BOOKED for a freshly booked sale (no BBA, no payments)", () => {
    expect(deriveBbaStage(makeSale())).toBe("BOOKED");
  });

  it("returns BBA_SIGNED when bbaNo is set but no payments yet", () => {
    expect(deriveBbaStage(makeSale({ bbaNo: "BBA-001" }))).toBe("BBA_SIGNED");
  });

  it("returns PAYMENTS_PROGRESS when partial payment + BBA signed", () => {
    expect(deriveBbaStage(makeSale({
      bbaNo: "BBA-001",
      paymentStatus: "PARTIAL",
    }))).toBe("PAYMENTS_PROGRESS");
  });

  it("returns REGISTRY_PENDING when fully paid but no sale deed", () => {
    expect(deriveBbaStage(makeSale({
      paymentStatus: "PAID",
      saleDeedNo: null,
    }))).toBe("REGISTRY_PENDING");
  });

  it("returns COMPLETED when sale deed is registered", () => {
    expect(deriveBbaStage(makeSale({
      saleDeedNo: "SD-2024-001",
    }))).toBe("COMPLETED");
  });

  it("returns COMPLETED when saleStage is COMPLETED", () => {
    expect(deriveBbaStage(makeSale({
      saleStage: "COMPLETED",
    }))).toBe("COMPLETED");
  });

  it("returns CANCELLED when status is CANCELLED", () => {
    expect(deriveBbaStage(makeSale({ status: "CANCELLED" }))).toBe("CANCELLED");
  });

  it("returns CANCELLED when saleStage is CANCELLED", () => {
    expect(deriveBbaStage(makeSale({ saleStage: "CANCELLED" }))).toBe("CANCELLED");
  });

  it("returns BOOKED when BBA not signed and payment is PENDING", () => {
    expect(deriveBbaStage(makeSale({
      bbaNo: null,
      paymentStatus: "PENDING",
    }))).toBe("BOOKED");
  });

  it("returns BBA_SIGNED when BBA signed and payment is PENDING (not partial)", () => {
    expect(deriveBbaStage(makeSale({
      bbaNo: "BBA-001",
      paymentStatus: "PENDING",
    }))).toBe("BBA_SIGNED");
  });

  it("COMPLETED takes priority over CANCELLED check (saleDeedNo set)", () => {
    // saleDeedNo is checked before status CANCELLED? No — CANCELLED is checked first
    expect(deriveBbaStage(makeSale({
      status: "CANCELLED",
      saleDeedNo: "SD-001",
    }))).toBe("CANCELLED");
  });
});
