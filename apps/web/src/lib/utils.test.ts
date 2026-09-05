import { describe, it, expect, beforeEach } from "vitest";
import {
  cn,
  formatCurrency,
  formatCurrencyCompact,
  formatCurrencyDetailed,
  formatNumber,
  formatDate,
  formatRelativeTime,
  humanizeAuditAction,
  setGlobalCurrencyMode,
  getGlobalCurrencyMode,
} from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("deduplicates conflicting tailwind classes (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles conditional classes via clsx", () => {
    expect(cn("base", false && "no", true && "yes")).toBe("base yes");
  });

  it("preserves custom font-size classes alongside text colors", () => {
    // text-body is a custom @utility font-size; text-white is a color.
    // twMergeCustom should NOT strip text-white when text-body is present.
    expect(cn("text-white text-body")).toBe("text-white text-body");
  });
});

describe("formatCurrencyCompact", () => {
  it("returns — for null/undefined", () => {
    expect(formatCurrencyCompact(null)).toBe("—");
    expect(formatCurrencyCompact(undefined)).toBe("—");
  });

  it("returns — for NaN", () => {
    expect(formatCurrencyCompact("not-a-number")).toBe("—");
  });

  it("formats crores (≥ 1Cr)", () => {
    expect(formatCurrencyCompact(1_00_00_000)).toBe("₹1Cr");
    expect(formatCurrencyCompact(3_50_00_000)).toBe("₹3.50Cr");
  });

  it("formats lakhs (≥ 1L, < 1Cr)", () => {
    expect(formatCurrencyCompact(1_00_000)).toBe("₹1L");
    expect(formatCurrencyCompact(1_20_000)).toBe("₹1.20L");
  });

  it("formats thousands (≥ 1K, < 1L)", () => {
    expect(formatCurrencyCompact(1_000)).toBe("₹1K");
    expect(formatCurrencyCompact(1_200)).toBe("₹1.2K");
  });

  it("formats < 1000 as whole rupees", () => {
    expect(formatCurrencyCompact(500)).toBe("₹500");
    expect(formatCurrencyCompact(0)).toBe("₹0");
  });

  it("handles negative values", () => {
    expect(formatCurrencyCompact(-1_20_000)).toBe("-₹1.20L");
  });

  it("accepts string numbers", () => {
    expect(formatCurrencyCompact("120000")).toBe("₹1.20L");
  });
});

describe("formatCurrency (mode-aware)", () => {
  beforeEach(() => {
    setGlobalCurrencyMode("compact");
  });

  it("uses compact mode by default (global)", () => {
    expect(formatCurrency(1_20_000)).toBe("₹1.20L");
  });

  it("respects explicit mode=detailed", () => {
    expect(formatCurrency(1_20_000, "INR", "detailed")).toMatch(/₹1,20,000.00/);
  });

  it("respects setGlobalCurrencyMode('detailed')", () => {
    setGlobalCurrencyMode("detailed");
    expect(formatCurrency(1_20_000)).toMatch(/₹1,20,000.00/);
  });

  it("returns — for null", () => {
    expect(formatCurrency(null)).toBe("—");
  });
});

describe("formatCurrencyDetailed", () => {
  it("formats with 2 decimal places", () => {
    expect(formatCurrencyDetailed(1234.5)).toMatch(/₹1,234.50/);
  });

  it("returns — for null/undefined/NaN", () => {
    expect(formatCurrencyDetailed(null)).toBe("—");
    expect(formatCurrencyDetailed(undefined)).toBe("—");
    expect(formatCurrencyDetailed("abc")).toBe("—");
  });
});

describe("formatNumber", () => {
  it("formats with Indian grouping", () => {
    expect(formatNumber(1234567.891)).toBe("12,34,567.89");
  });

  it("respects digits param", () => {
    expect(formatNumber(1234.5678, 0)).toBe("1,235");
  });

  it("returns — for null/undefined/NaN", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
    expect(formatNumber("abc")).toBe("—");
  });
});

describe("formatDate", () => {
  it("formats a date as DD Mon YYYY", () => {
    expect(formatDate("2026-09-04T00:00:00Z")).toMatch(/\d{2} \w{3,5} 2026/);
  });

  it("returns — for null/undefined/empty", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
  });
});

describe("formatRelativeTime", () => {
  it("returns 'just now' for < 60s ago", () => {
    const d = new Date(Date.now() - 10_000);
    expect(formatRelativeTime(d)).toBe("just now");
  });

  it("returns 'X min ago' for < 60min", () => {
    const d = new Date(Date.now() - 5 * 60_000);
    expect(formatRelativeTime(d)).toBe("5 min ago");
  });

  it("returns 'X hr ago' for < 24hr", () => {
    const d = new Date(Date.now() - 3 * 60 * 60_000);
    expect(formatRelativeTime(d)).toBe("3 hr ago");
  });

  it("returns 'X day(s) ago' for < 7 days", () => {
    const d = new Date(Date.now() - 3 * 24 * 60 * 60_000);
    expect(formatRelativeTime(d)).toBe("3 days ago");
  });
});

describe("humanizeAuditAction", () => {
  it("handles special cases", () => {
    expect(humanizeAuditAction("DPR_REJECT")).toBe("DPR rejected");
    expect(humanizeAuditAction("PAYROLL_PAID")).toBe("Payroll paid");
  });

  it("converts generic CREATE → created", () => {
    expect(humanizeAuditAction("MATERIAL_CREATE")).toBe("Material Created");
  });

  it("converts UPDATE → updated", () => {
    expect(humanizeAuditAction("PROJECT_UPDATE")).toBe("Project Updated");
  });

  it("title-cases the result", () => {
    expect(humanizeAuditAction("PURCHASE_ORDER_APPROVE")).toBe("Purchase Order Approved");
  });

  it("handles unknown verbs by keeping them as-is", () => {
    expect(humanizeAuditAction("SOMETHING_FROBNICATE")).toBe("Something Frobnicate");
  });
});

describe("getGlobalCurrencyMode / setGlobalCurrencyMode", () => {
  it("round-trips the mode", () => {
    setGlobalCurrencyMode("detailed");
    expect(getGlobalCurrencyMode()).toBe("detailed");
    setGlobalCurrencyMode("compact");
    expect(getGlobalCurrencyMode()).toBe("compact");
  });
});
