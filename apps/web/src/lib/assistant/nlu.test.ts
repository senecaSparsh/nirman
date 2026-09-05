/**
 * Unit tests for NLU intent parsing.
 *
 *   parseIntent — parse raw Hinglish text into structured intent + entities
 */
import { describe, it, expect } from "vitest";
import { parseIntent, SUGGESTION_CHIPS } from "./nlu";

describe("parseIntent", () => {
  it("returns UNKNOWN intent for empty string", () => {
    const result = parseIntent("");
    expect(result.intent).toBe("UNKNOWN");
    expect(result.confidence).toBe(0);
  });

  it("returns UNKNOWN intent for gibberish", () => {
    const result = parseIntent("xyzzy flurbo");
    expect(result.intent).toBe("UNKNOWN");
  });

  it("parses stock query", () => {
    const result = parseIntent("stock kya hai?");
    expect(result.intent).toBe("STOCK_QUERY");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("parses stock query for a material", () => {
    const result = parseIntent("cement ka stock kya hai?");
    expect(result.intent).toBe("STOCK_QUERY");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("parses PO approval with PO number", () => {
    const result = parseIntent("PO-0011 approve karo");
    expect(result.intent).toBe("APPROVE_PO");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("parses requisition approval with REQ number", () => {
    const result = parseIntent("REQ-0007 approve karo");
    expect(result.intent).toBe("APPROVE_REQUISITION");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("parses PO rejection with PO number", () => {
    const result = parseIntent("PO-0011 reject karo");
    expect(result.intent).toBe("REJECT_PO");
  });

  it("parses requisition rejection with REQ number", () => {
    const result = parseIntent("REQ-0007 reject karo");
    expect(result.intent).toBe("REJECT_REQUISITION");
  });

  it("parses dashboard request", () => {
    const result = parseIntent("dashboard dikhao");
    expect(result.intent).toBe("DASHBOARD");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("returns rawText in result", () => {
    const result = parseIntent("stock kya hai?");
    expect(result.rawText).toBe("stock kya hai?");
  });

  it("returns entities object", () => {
    const result = parseIntent("PO-0011 approve karo");
    expect(result.entities).toBeDefined();
    expect(result.entities.poNumber).toBe("PO-0011");
  });

  it("confidence is between 0 and 1", () => {
    const result = parseIntent("stock kya hai?");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("handles approve with ordinal (pehla wala)", () => {
    const result = parseIntent("pehla wala approve karo");
    // Should detect approve action + ordinal
    expect(result.entities.action).toBe("approve");
    expect(result.entities.ordinal).toBeTruthy();
  });

  it("fallback to STOCK_QUERY when material name found but no intent", () => {
    const result = parseIntent("cement");    // Material name without a clear intent keyword triggers issue material fallback
    expect(result.intent).toBe("STOCK_QUERY");
  });

  it("is case-insensitive", () => {
    const lower = parseIntent("stock kya hai");
    const upper = parseIntent("STOCK KYA HAI");
    expect(lower.intent).toBe(upper.intent);
  });
});

describe("SUGGESTION_CHIPS", () => {
  it("is a non-empty array", () => {
    expect(SUGGESTION_CHIPS.length).toBeGreaterThan(0);
  });

  it("every chip has label and text", () => {
    for (const chip of SUGGESTION_CHIPS) {
      expect(chip.label).toBeTruthy();
      expect(chip.text).toBeTruthy();
    }
  });

  it("includes a Dashboard chip", () => {
    const dash = SUGGESTION_CHIPS.find((c) => c.label === "Dashboard");
    expect(dash).toBeDefined();
  });

  it("includes a Stock chip", () => {
    const stock = SUGGESTION_CHIPS.find((c) => c.label === "Stock kya hai?");
    expect(stock).toBeDefined();
  });
});
