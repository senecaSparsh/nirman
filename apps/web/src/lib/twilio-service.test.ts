/**
 * Unit tests for Twilio service pure helpers.
 *
 *   normalizeTwilioNumber  — strip + and non-digits
 *   isTwilioNumber         — check if a number belongs to the Twilio account
 *   mapTwilioCallStatus    — map Twilio status to our CallLog status
 *   mapTwilioDirection     — map Twilio direction to INBOUND/OUTBOUND/INTERNAL
 *   isSafeRecordingUrl     — validate a recording URL to prevent SSRF
 */
import { describe, it, expect } from "vitest";
import {
  normalizeTwilioNumber,
  isTwilioNumber,
  mapTwilioCallStatus,
  mapTwilioDirection,
  isSafeRecordingUrl,
} from "./twilio-service";

describe("normalizeTwilioNumber", () => {
  it("strips leading + and non-digits", () => {
    expect(normalizeTwilioNumber("+919876543210")).toBe("919876543210");
  });

  it("strips spaces and dashes", () => {
    expect(normalizeTwilioNumber("+91 98765-43210")).toBe("919876543210");
  });

  it("handles number without +", () => {
    expect(normalizeTwilioNumber("919876543210")).toBe("919876543210");
  });

  it("handles empty string", () => {
    expect(normalizeTwilioNumber("")).toBe("");
  });

  it("strips parentheses", () => {
    expect(normalizeTwilioNumber("(91) 9876543210")).toBe("919876543210");
  });
});

describe("isTwilioNumber", () => {
  const twilioNumbers = [
    { phoneNumber: "+919876543210", friendlyName: "Office" },
    { phoneNumber: "+1234567890", friendlyName: "US Office" },
  ] as any;

  it("returns true when number is in the list", () => {
    expect(isTwilioNumber("+919876543210", twilioNumbers)).toBe(true);
  });

  it("returns true when number matches without +", () => {
    expect(isTwilioNumber("919876543210", twilioNumbers)).toBe(true);
  });

  it("returns false when number is not in the list", () => {
    expect(isTwilioNumber("+9999999999", twilioNumbers)).toBe(false);
  });

  it("returns false for empty list", () => {
    expect(isTwilioNumber("+919876543210", [])).toBe(false);
  });

  it("handles number with spaces", () => {
    expect(isTwilioNumber("+91 98765 43210", twilioNumbers)).toBe(true);
  });
});

describe("mapTwilioCallStatus", () => {
  it("maps queued to RINGING", () => {
    expect(mapTwilioCallStatus("queued")).toBe("RINGING");
  });

  it("maps ringing to RINGING", () => {
    expect(mapTwilioCallStatus("ringing")).toBe("RINGING");
  });

  it("maps in-progress to ANSWERED", () => {
    expect(mapTwilioCallStatus("in-progress")).toBe("ANSWERED");
  });

  it("maps completed to ANSWERED", () => {
    expect(mapTwilioCallStatus("completed")).toBe("ANSWERED");
  });

  it("maps busy to BUSY", () => {
    expect(mapTwilioCallStatus("busy")).toBe("BUSY");
  });

  it("maps failed to FAILED", () => {
    expect(mapTwilioCallStatus("failed")).toBe("FAILED");
  });

  it("maps no-answer to MISSED", () => {
    expect(mapTwilioCallStatus("no-answer")).toBe("MISSED");
  });

  it("maps canceled to REJECTED", () => {
    expect(mapTwilioCallStatus("canceled")).toBe("REJECTED");
  });

  it("maps initiated to RINGING", () => {
    expect(mapTwilioCallStatus("initiated")).toBe("RINGING");
  });

  it("is case-insensitive", () => {
    expect(mapTwilioCallStatus("QUEUED")).toBe("RINGING");
    expect(mapTwilioCallStatus("In-Progress")).toBe("ANSWERED");
  });

  it("returns uppercased unknown status", () => {
    expect(mapTwilioCallStatus("unknown-status")).toBe("UNKNOWN-STATUS");
  });

  it("returns uppercased empty string", () => {
    expect(mapTwilioCallStatus("")).toBe("");
  });
});

describe("mapTwilioDirection", () => {
  it("maps inbound to INBOUND", () => {
    expect(mapTwilioDirection("inbound")).toBe("INBOUND");
  });

  it("maps outbound-api to OUTBOUND", () => {
    expect(mapTwilioDirection("outbound-api")).toBe("OUTBOUND");
  });

  it("maps outbound-dial to OUTBOUND", () => {
    expect(mapTwilioDirection("outbound-dial")).toBe("OUTBOUND");
  });

  it("maps trunking-originating to OUTBOUND (default)", () => {
    expect(mapTwilioDirection("trunking-originating")).toBe("OUTBOUND");
  });

  it("maps trunking-terminating to OUTBOUND (default)", () => {
    expect(mapTwilioDirection("trunking-terminating")).toBe("OUTBOUND");
  });

  it("defaults unknown direction to OUTBOUND", () => {
    expect(mapTwilioDirection("unknown")).toBe("OUTBOUND");
  });

  it("defaults empty string to OUTBOUND", () => {
    expect(mapTwilioDirection("")).toBe("OUTBOUND");
  });
});

describe("isSafeRecordingUrl", () => {
  it("returns true for valid twilio.com HTTPS URL", () => {
    expect(isSafeRecordingUrl("https://api.twilio.com/recording/123")).toBe(true);
  });

  it("returns true for twiliousercontent.com URL", () => {
    expect(isSafeRecordingUrl("https://recordings.twiliousercontent.com/abc")).toBe(true);
  });

  it("returns true for twilio.com root domain", () => {
    expect(isSafeRecordingUrl("https://twilio.com/recording/123")).toBe(true);
  });

  it("returns false for HTTP (not HTTPS)", () => {
    expect(isSafeRecordingUrl("http://api.twilio.com/recording/123")).toBe(false);
  });

  it("returns false for non-Twilio domain", () => {
    expect(isSafeRecordingUrl("https://evil.com/recording/123")).toBe(false);
  });

  it("returns false for subdomain of evil.com that looks like twilio", () => {
    expect(isSafeRecordingUrl("https://twilio.com.evil.com/recording")).toBe(false);
  });

  it("returns false for URL with credentials", () => {
    expect(isSafeRecordingUrl("https://user:pass@api.twilio.com/recording")).toBe(false);
  });

  it("returns false for invalid URL", () => {
    expect(isSafeRecordingUrl("not-a-url")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isSafeRecordingUrl("")).toBe(false);
  });

  it("returns false for fake twilio domain", () => {
    expect(isSafeRecordingUrl("https://faketwilio.com/recording")).toBe(false);
  });
});
