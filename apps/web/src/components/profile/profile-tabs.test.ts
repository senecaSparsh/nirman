/**
 * Unit tests for profile-tabs pure helpers.
 *
 *   formatActionLabel — format "module.VERB" as "MODULE Verb"
 */
import { describe, it, expect } from "vitest";
import { formatActionLabel } from "@/components/profile/profile-tabs";

describe("formatActionLabel", () => {
  it("formats module.verb as MODULE Verb", () => {
    expect(formatActionLabel("po.create")).toBe("PO Create");
  });

  it("formats module.VERB_NAMED as MODULE Verb (only first letter capitalized)", () => {
    // The function only capitalizes the first char of the verb string,
    // not each word — so "status_change" → "Status change"
    expect(formatActionLabel("po.status_change")).toBe("PO Status change");
  });

  it("returns action as-is when no dot", () => {
    expect(formatActionLabel("login")).toBe("login");
  });

  it("handles empty string", () => {
    expect(formatActionLabel("")).toBe("");
  });

  it("handles module only with trailing dot", () => {
    expect(formatActionLabel("po.")).toBe("PO ");
  });

  it("handles multiple dots (uses first two parts)", () => {
    expect(formatActionLabel("po.create.draft")).toBe("PO Create");
  });

  it("uppercases module name", () => {
    expect(formatActionLabel("materials.update")).toBe("MATERIALS Update");
  });

  it("capitalizes first letter of verb", () => {
    expect(formatActionLabel("po.approve")).toBe("PO Approve");
  });

  it("replaces underscores with spaces in verb (only first letter capitalized)", () => {
    // Only the first char of the verb is capitalized: "change_status" → "Change status"
    expect(formatActionLabel("po.change_status")).toBe("PO Change status");
  });
});
