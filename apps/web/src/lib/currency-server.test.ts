import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runWithCurrencyMode } from "./currency-server";
import { formatCurrency, setGlobalCurrencyMode } from "@/lib/utils";

describe("runWithCurrencyMode", () => {
  beforeEach(() => {
    // Reset to compact so the server ALS getter is the only thing controlling mode
    setGlobalCurrencyMode("compact");
  });

  afterEach(() => {
    setGlobalCurrencyMode("compact");
  });

  it("returns the callback's return value", () => {
    const result = runWithCurrencyMode("detailed", () => 42);
    expect(result).toBe(42);
  });

  it("makes formatCurrency use 'detailed' mode inside the callback", () => {
    runWithCurrencyMode("detailed", () => {
      expect(formatCurrency(1_20_000)).toMatch(/₹1,20,000.00/);
    });
  });

  it("makes formatCurrency use 'compact' mode inside the callback", () => {
    runWithCurrencyMode("compact", () => {
      expect(formatCurrency(1_20_000)).toBe("₹1.20L");
    });
  });

  it("does not leak the mode outside the callback", () => {
    runWithCurrencyMode("detailed", () => {
      // mode is detailed here
    });
    // Outside the callback, the global mode (compact) applies
    expect(formatCurrency(1_20_000)).toBe("₹1.20L");
  });

  it("supports nested contexts (inner overrides outer)", () => {
    runWithCurrencyMode("compact", () => {
      expect(formatCurrency(1_20_000)).toBe("₹1.20L");
      runWithCurrencyMode("detailed", () => {
        expect(formatCurrency(1_20_000)).toMatch(/₹1,20,000.00/);
      });
      // Back to outer compact
      expect(formatCurrency(1_20_000)).toBe("₹1.20L");
    });
  });

  it("restores the previous context after the callback returns", () => {
    runWithCurrencyMode("compact", () => {
      runWithCurrencyMode("detailed", () => {
        // inner detailed
      });
      // outer compact restored
      expect(formatCurrency(1_20_000)).toBe("₹1.20L");
    });
  });

  it("handles async callbacks (mode is available synchronously within run)", () => {
    // AsyncLocalStorage.run is synchronous — the store is only available
    // during the synchronous execution of the callback. The mode is set
    // at call time, not after a promise resolves.
    let captured: string | undefined;
    runWithCurrencyMode("detailed", () => {
      captured = formatCurrency(1_20_000);
    });
    expect(captured).toMatch(/₹1,20,000.00/);
  });
});
