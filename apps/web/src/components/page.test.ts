/**
 * Unit tests for status helper functions from components/page.tsx.
 *
 *   statusColor        — raw CSS color for a status
 *   statusMeaning      — meaning group for a status
 *   statusBadgeVariant — badge variant for a status
 *   humanStatus        — human-readable label from SCREAMING_SNAKE status
 */
import { describe, it, expect } from "vitest";
import {
  statusColor,
  statusMeaning,
  statusBadgeVariant,
  humanStatus,
} from "@/components/page";

describe("statusMeaning", () => {
  it("returns neutral for DRAFT", () => {
    expect(statusMeaning("DRAFT")).toBe("neutral");
  });

  it("returns waiting for PENDING", () => {
    expect(statusMeaning("PENDING")).toBe("waiting");
  });

  it("returns active for APPROVED", () => {
    expect(statusMeaning("APPROVED")).toBe("active");
  });

  it("returns good for COMPLETED", () => {
    expect(statusMeaning("COMPLETED")).toBe("good");
  });

  it("returns bad for CANCELLED", () => {
    expect(statusMeaning("CANCELLED")).toBe("bad");
  });

  it("returns alert for OVERDUE", () => {
    expect(statusMeaning("OVERDUE")).toBe("alert");
  });

  it("returns neutral for unknown status", () => {
    expect(statusMeaning("UNKNOWN_STATUS")).toBe("neutral");
  });

  it("is case-insensitive (uppercases input)", () => {
    expect(statusMeaning("draft")).toBe("neutral");
    expect(statusMeaning("Draft")).toBe("neutral");
    expect(statusMeaning("completed")).toBe("good");
  });

  it("returns bad for OUT_OF_STOCK", () => {
    expect(statusMeaning("OUT_OF_STOCK")).toBe("bad");
  });

  it("returns good for IN_STOCK", () => {
    expect(statusMeaning("IN_STOCK")).toBe("good");
  });

  it("returns waiting for LOW_STOCK", () => {
    expect(statusMeaning("LOW_STOCK")).toBe("waiting");
  });
});

describe("statusColor", () => {
  it("returns CSS variable for neutral meaning", () => {
    expect(statusColor("DRAFT")).toBe("var(--color-muted-foreground)");
  });

  it("returns CSS variable for active meaning", () => {
    expect(statusColor("APPROVED")).toBe("var(--color-info)");
  });

  it("returns CSS variable for waiting meaning", () => {
    expect(statusColor("PENDING")).toBe("var(--color-warning)");
  });

  it("returns CSS variable for good meaning", () => {
    expect(statusColor("COMPLETED")).toBe("var(--color-success)");
  });

  it("returns CSS variable for bad meaning", () => {
    expect(statusColor("CANCELLED")).toBe("var(--color-danger)");
  });

  it("returns CSS variable for alert meaning", () => {
    expect(statusColor("OVERDUE")).toBe("var(--color-danger)");
  });

  it("returns neutral color for unknown status", () => {
    expect(statusColor("UNKNOWN")).toBe("var(--color-muted-foreground)");
  });
});

describe("statusBadgeVariant", () => {
  it("returns muted for neutral meaning", () => {
    expect(statusBadgeVariant("DRAFT")).toBe("muted");
  });

  it("returns info for active meaning", () => {
    expect(statusBadgeVariant("APPROVED")).toBe("info");
  });

  it("returns warning for waiting meaning", () => {
    expect(statusBadgeVariant("PENDING")).toBe("warning");
  });

  it("returns success for good meaning", () => {
    expect(statusBadgeVariant("COMPLETED")).toBe("success");
  });

  it("returns danger for bad meaning", () => {
    expect(statusBadgeVariant("CANCELLED")).toBe("danger");
  });

  it("returns danger for alert meaning", () => {
    expect(statusBadgeVariant("OVERDUE")).toBe("danger");
  });

  it("returns muted for unknown status", () => {
    expect(statusBadgeVariant("UNKNOWN")).toBe("muted");
  });
});

describe("humanStatus", () => {
  it("converts SCREAMING_SNAKE to Title Case", () => {
    expect(humanStatus("IN_PROGRESS")).toBe("In Progress");
  });

  it("handles single word", () => {
    expect(humanStatus("DRAFT")).toBe("Draft");
  });

  it("handles multiple words", () => {
    expect(humanStatus("OUT_OF_STOCK")).toBe("Out Of Stock");
  });

  it("handles empty string", () => {
    expect(humanStatus("")).toBe("");
  });

  it("handles already lowercase", () => {
    expect(humanStatus("draft")).toBe("Draft");
  });

  it("handles mixed case", () => {
    expect(humanStatus("In_Progress")).toBe("In Progress");
  });

  it("handles COMPLETED", () => {
    expect(humanStatus("COMPLETED")).toBe("Completed");
  });

  it("handles AWAITING_APPROVAL", () => {
    expect(humanStatus("AWAITING_APPROVAL")).toBe("Awaiting Approval");
  });
});
