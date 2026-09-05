/**
 * Unit tests for assistant conversation pure helpers.
 *
 *   detectMultiStep       — detect multi-action requests split by conjunctions
 *   isYes / isNo / isYesOrNo — detect yes/no confirmation responses (Hinglish)
 *   contextualSuggestions — suggest relevant chips based on conversation state
 */
import { describe, it, expect } from "vitest";
import {
  detectMultiStep,
  isYes,
  isNo,
  isYesOrNo,
  contextualSuggestions,
} from "./conversation";

describe("detectMultiStep", () => {
  it("returns null for single action (no conjunction)", () => {
    expect(detectMultiStep("Stock kya hai?")).toBeNull();
  });

  it("splits on 'aur' (Hinglish)", () => {
    const result = detectMultiStep("Stock dikhao aur PO approve karo");
    expect(result).toEqual(["Stock dikhao", "PO approve karo"]);
  });

  it("splits on 'and'", () => {
    const result = detectMultiStep("Show stock and approve PO-0011");
    expect(result).toEqual(["Show stock", "approve PO-0011"]);
  });

  it("splits on 'phir'", () => {
    const result = detectMultiStep("Stock dikhao phir PO approve karo");
    expect(result).toEqual(["Stock dikhao", "PO approve karo"]);
  });

  it("splits on 'then'", () => {
    const result = detectMultiStep("Show stock then approve the PO");
    expect(result).toEqual(["Show stock", "approve the PO"]);
  });

  it("splits on 'uske baad'", () => {
    const result = detectMultiStep("Stock check karo uske baad PO approve karo");
    expect(result).toEqual(["Stock check karo", "PO approve karo"]);
  });

  it("returns null when before part is too short (< 4 chars)", () => {
    // "ab" is 2 chars — but "then" also matches, giving before="ab and" (6 chars).
    // Use a string where NO conjunction produces a before > 3 chars.
    expect(detectMultiStep("ab and xy")).toBeNull();
  });

  it("returns null when after part is too short (< 4 chars)", () => {
    expect(detectMultiStep("do something useful and ab")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(detectMultiStep("")).toBeNull();
  });

  it("returns null for text with only a conjunction", () => {
    expect(detectMultiStep("and")).toBeNull();
  });
});

describe("isYes", () => {
  it("returns true for 'haan'", () => {
    expect(isYes("haan")).toBe(true);
  });

  it("returns true for 'ha'", () => {
    expect(isYes("ha")).toBe(true);
  });

  it("returns true for 'yes'", () => {
    expect(isYes("yes")).toBe(true);
  });

  it("returns true for 'ok'", () => {
    expect(isYes("ok")).toBe(true);
  });

  it("returns true for 'okay'", () => {
    expect(isYes("okay")).toBe(true);
  });

  it("returns true for 'theek'", () => {
    expect(isYes("theek")).toBe(true);
  });

  it("returns true for 'confirm'", () => {
    expect(isYes("confirm")).toBe(true);
  });

  it("returns true for 'approve'", () => {
    expect(isYes("approve")).toBe(true);
  });

  it("returns true for 'chal'", () => {
    expect(isYes("chal")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isYes("HAAN")).toBe(true);
    expect(isYes("Yes")).toBe(true);
    expect(isYes("OK")).toBe(true);
  });

  it("returns true for phrases starting with yes words", () => {
    expect(isYes("haan kar do")).toBe(true);
    expect(isYes("yes do it")).toBe(true);
  });

  it("returns false for 'nahi'", () => {
    expect(isYes("nahi")).toBe(false);
  });

  it("returns false for non-yes text", () => {
    expect(isYes("show stock")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isYes("")).toBe(false);
  });
});

describe("isNo", () => {
  it("returns true for 'nahi'", () => {
    expect(isNo("nahi")).toBe(true);
  });

  it("returns true for 'na'", () => {
    expect(isNo("na")).toBe(true);
  });

  it("returns true for 'no'", () => {
    expect(isNo("no")).toBe(true);
  });

  it("returns true for 'cancel'", () => {
    expect(isNo("cancel")).toBe(true);
  });

  it("returns true for 'stop'", () => {
    expect(isNo("stop")).toBe(true);
  });

  it("returns true for 'ruk'", () => {
    expect(isNo("ruk")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isNo("NAHI")).toBe(true);
    expect(isNo("No")).toBe(true);
    expect(isNo("CANCEL")).toBe(true);
  });

  it("returns true for phrases starting with no words", () => {
    expect(isNo("nahi kar")).toBe(true);
    expect(isNo("cancel kar")).toBe(true);
  });

  it("returns false for 'haan'", () => {
    expect(isNo("haan")).toBe(false);
  });

  it("returns false for non-no text", () => {
    expect(isNo("show stock")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isNo("")).toBe(false);
  });
});

describe("isYesOrNo", () => {
  it("returns true for yes words", () => {
    expect(isYesOrNo("haan")).toBe(true);
    expect(isYesOrNo("yes")).toBe(true);
  });

  it("returns true for no words", () => {
    expect(isYesOrNo("nahi")).toBe(true);
    expect(isYesOrNo("no")).toBe(true);
  });

  it("returns false for non-yes/no text", () => {
    expect(isYesOrNo("show stock")).toBe(false);
  });
});

describe("contextualSuggestions", () => {
  it("returns default suggestions when no current task", () => {
    const suggestions = contextualSuggestions({ currentTask: null } as any);
    expect(suggestions).toContain("Stock kya hai?");
    expect(suggestions).toContain("Approvals pending?");
    expect(suggestions).toContain("Dashboard dikhao");
    expect(suggestions.length).toBe(4);
  });

  it("returns poNumber suggestions when missingSlots has poNumber", () => {
    const suggestions = contextualSuggestions({
      currentTask: {
        missingSlots: ["poNumber"],
        intent: "APPROVE_PO",
        entities: {},
      } as any,
    } as any);
    expect(suggestions).toContain("PO-0011");
    expect(suggestions).toContain("Pehla wala");
    expect(suggestions).toContain("Pending list dikhao");
  });

  it("returns reqNumber suggestions when missingSlots has reqNumber", () => {
    const suggestions = contextualSuggestions({
      currentTask: {
        missingSlots: ["reqNumber"],
        intent: "APPROVE_REQUISITION",
        entities: {},
      } as any,
    } as any);
    expect(suggestions).toContain("REQ-0007");
  });

  it("returns material suggestions when missingSlots has materialName", () => {
    const suggestions = contextualSuggestions({
      currentTask: {
        missingSlots: ["materialName"],
        intent: "CHECK_STOCK",
        entities: {},
      } as any,
    } as any);
    expect(suggestions).toContain("Cement");
    expect(suggestions).toContain("Steel");
    expect(suggestions).toContain("Sand");
  });

  it("returns supplier suggestions when missingSlots has supplierName", () => {
    const suggestions = contextualSuggestions({
      currentTask: {
        missingSlots: ["supplierName"],
        intent: "CREATE_PO",
        entities: {},
      } as any,
    } as any);
    expect(suggestions).toContain("Supplier list dikhao");
    expect(suggestions).toContain("Skip");
  });

  it("returns customer suggestions when missingSlots has customerName", () => {
    const suggestions = contextualSuggestions({
      currentTask: {
        missingSlots: ["customerName"],
        intent: "CREATE_SALE",
        entities: {},
      } as any,
    } as any);
    expect(suggestions).toContain("Walk-in");
    expect(suggestions).toContain("Skip");
  });

  it("returns quantity suggestions when missingSlots has quantity", () => {
    const suggestions = contextualSuggestions({
      currentTask: {
        missingSlots: ["quantity"],
        intent: "CREATE_PO",
        entities: {},
      } as any,
    } as any);
    expect(suggestions).toContain("50 bag");
    expect(suggestions).toContain("100 kg");
  });

  it("returns Skip for unknown slot", () => {
    const suggestions = contextualSuggestions({
      currentTask: {
        missingSlots: ["unknownSlot"],
        intent: "UNKNOWN",
        entities: {},
      } as any,
    } as any);
    expect(suggestions).toEqual(["Skip"]);
  });

  it("returns confirmation suggestions when no missing slots", () => {
    const suggestions = contextualSuggestions({
      currentTask: {
        missingSlots: [],
        intent: "APPROVE_PO",
        entities: { poNumber: "PO-0011" },
      } as any,
    } as any);
    expect(suggestions).toEqual(["Haan", "Nahi", "Cancel"]);
  });
});
