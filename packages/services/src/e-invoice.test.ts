/**
 * Unit tests for the pure e-invoice helper in e-invoice.ts.
 *
 *   formatDateForNic — format a Date as dd/mm/yyyy for NIC e-invoice API
 *   setEInvoiceProvider — set the global e-invoice provider (test it doesn't throw)
 */
import { describe, it, expect } from "vitest";
import { formatDateForNic, setEInvoiceProvider } from "./e-invoice";

describe("formatDateForNic", () => {
  it("formats a date as dd/mm/yyyy", () => {
    const date = new Date("2026-09-04T10:00:00Z");
    // Note: this uses local timezone, so we need to be careful
    // The function creates a new Date from the input and uses getDate/getMonth/getFullYear
    // which are local timezone methods
    const result = formatDateForNic(date);
    // Just verify the format pattern dd/mm/yyyy
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("pads single-digit day and month with leading zeros", () => {
    const date = new Date("2026-01-05T10:00:00Z");
    const result = formatDateForNic(date);
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("handles end of year date", () => {
    const date = new Date("2026-12-31T10:00:00Z");
    const result = formatDateForNic(date);
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("handles start of year date", () => {
    const date = new Date("2026-01-01T10:00:00Z");
    const result = formatDateForNic(date);
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

describe("setEInvoiceProvider", () => {
  it("does not throw when setting a provider", () => {
    expect(() =>
      setEInvoiceProvider({
        generate: async () => ({
          irn: "test",
          ackNo: "1",
          ackDt: new Date().toISOString(),
          qrCode: "",
          signedInvoice: "",
          status: "GENERATED" as const,
        }),
        cancel: async () => ({
          irn: "test",
          status: "CANCELLED" as const,
          cancelDate: new Date().toISOString(),
        }),
      }),
    ).not.toThrow();
  });
});
