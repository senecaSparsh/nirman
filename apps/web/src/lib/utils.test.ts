import { describe, it, expect, beforeEach } from "vitest";
import Decimal from "decimal.js";
import {
  cn,
  formatCurrency,
  formatCurrencyCompact,
  formatCurrencyDetailed,
  formatNumber,
  formatDate,
  formatRelativeTime,
  humanizeAuditAction,
  formatEnumLabel,
  humanizeCron,
  setGlobalCurrencyMode,
  getGlobalCurrencyMode,
  toNum,
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
    const result = formatDate("2026-09-04T00:00:00Z");
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/Sep/);
    expect(result).toMatch(/04/);
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

describe("formatEnumLabel", () => {
  it("title-cases enum values", () => {
    expect(formatEnumLabel("BANK_TRANSFER")).toBe("Bank Transfer");
    expect(formatEnumLabel("SUB_ADMIN_APPROVED")).toBe("Sub Admin Approved");
  });
  it("keeps acronyms uppercase", () => {
    expect(formatEnumLabel("UPI")).toBe("UPI");
    expect(formatEnumLabel("BHK_2")).toBe("BHK 2");
    expect(formatEnumLabel("GST_APPLICABLE")).toBe("GST Applicable");
  });
  it("handles null/empty", () => {
    expect(formatEnumLabel(null)).toBe("—");
    expect(formatEnumLabel("")).toBe("—");
  });
});

describe("humanizeCron", () => {
  it("renders daily schedules", () => {
    expect(humanizeCron("0 9 * * *")).toBe("Daily at 9:00 AM");
    expect(humanizeCron("30 18 * * *")).toBe("Daily at 6:30 PM");
  });
  it("renders weekly schedules", () => {
    expect(humanizeCron("0 9 * * 1")).toBe("Every Mon at 9:00 AM");
  });
  it("renders monthly schedules", () => {
    expect(humanizeCron("0 9 1 * *")).toBe("Monthly on day 1 at 9:00 AM");
  });
  it("falls back for exotic schedules", () => {
    expect(humanizeCron("*/5 * * * *")).toBe("Scheduled: */5 * * * *");
  });
});

describe("toNum", () => {
  it("passes numbers through unchanged", () => {
    expect(toNum(42)).toBe(42);
    expect(toNum(0)).toBe(0);
    expect(toNum(-3.5)).toBe(-3.5);
  });

  it("converts numeric strings", () => {
    expect(toNum("123.45")).toBe(123.45);
    expect(toNum("0.001")).toBe(0.001);
  });

  it("converts a Prisma Decimal to a number — the reduce-sum regression", () => {
    // Decimal.valueOf() returns a string, so `0 + Decimal` concatenates:
    // this is the bug the codemod fixed across ~130 reduce-sum sites.
    const rows = [{ amount: new Decimal("100.50") }, { amount: new Decimal("200.25") }];
    // The bug: unwrapped produces a string (cast — the + concatenates at runtime)
    const buggy = rows.reduce((s, r) => (s as number) + (r.amount as unknown as number), 0);
    expect(buggy).not.toBe(300.75);
    // The fix: toNum() sums correctly
    expect(rows.reduce((s, r) => s + toNum(r.amount), 0)).toBe(300.75);
    expect(typeof rows.reduce((s, r) => s + toNum(r.amount), 0)).toBe("number");
  });

  it("sums a mixed null/Decimal field without NaN poisoning", () => {
    const rows = [{ v: new Decimal("10") }, { v: null }, { v: new Decimal("5.5") }];
    expect(rows.reduce((s, r) => s + toNum(r.v), 0)).toBe(15.5);
  });

  it("returns 0 for null/undefined/non-numeric instead of NaN", () => {
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum("abc")).toBe(0);
    expect(toNum({})).toBe(0);
  });
});
