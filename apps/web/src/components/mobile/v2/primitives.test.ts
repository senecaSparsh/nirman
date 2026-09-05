/**
 * Unit tests for mobile status color helper.
 *
 *   mobileStatusColor — get CSS color for a status + variant (base/wash/dark)
 */
import { describe, it, expect } from "vitest";
import { mobileStatusColor } from "@/components/mobile/v2/primitives";

describe("mobileStatusColor", () => {
  it("returns neutral color for DRAFT (base variant)", () => {
    expect(mobileStatusColor("DRAFT")).toBe("var(--color-ink-400)");
  });

  it("returns active color for APPROVED (base variant)", () => {
    expect(mobileStatusColor("APPROVED")).toBe("var(--color-signal)");
  });

  it("returns waiting color for PENDING (base variant)", () => {
    expect(mobileStatusColor("PENDING")).toBe("var(--color-steel)");
  });

  it("returns good color for COMPLETED (base variant)", () => {
    expect(mobileStatusColor("COMPLETED")).toBe("var(--color-go)");
  });

  it("returns bad color for CANCELLED (base variant)", () => {
    expect(mobileStatusColor("CANCELLED")).toBe("var(--color-stop)");
  });

  it("returns alert color for OVERDUE (base variant)", () => {
    expect(mobileStatusColor("OVERDUE")).toBe("var(--color-stop)");
  });

  it("returns wash variant colors", () => {
    expect(mobileStatusColor("DRAFT", "wash")).toBe("var(--color-concrete)");
    expect(mobileStatusColor("APPROVED", "wash")).toBe("var(--color-signal-wash)");
    expect(mobileStatusColor("COMPLETED", "wash")).toBe("var(--color-go-wash)");
  });

  it("returns dark variant colors", () => {
    expect(mobileStatusColor("DRAFT", "dark")).toBe("var(--color-ink-700)");
    expect(mobileStatusColor("APPROVED", "dark")).toBe("var(--color-signal-dark)");
    expect(mobileStatusColor("COMPLETED", "dark")).toBe("var(--color-go)");
  });

  it("returns neutral color for unknown status", () => {
    expect(mobileStatusColor("UNKNOWN")).toBe("var(--color-ink-400)");
  });

  it("defaults to base variant", () => {
    expect(mobileStatusColor("DRAFT")).toBe(mobileStatusColor("DRAFT", "base"));
  });
});
