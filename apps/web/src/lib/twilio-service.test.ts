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
import { createHmac } from "crypto";
import type { NextRequest } from "next/server";
import {
  normalizeTwilioNumber,
  isTwilioNumber,
  mapTwilioCallStatus,
  mapTwilioDirection,
  isSafeRecordingUrl,
  verifyTwilioSignature,
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

  it("maps trunking-originating to OUTBOUND (PBX user dials out via SIP trunk)", () => {
    expect(mapTwilioDirection("trunking-originating")).toBe("OUTBOUND");
  });

  it("maps trunking-terminating to INBOUND (external caller delivered to PBX via SIP trunk)", () => {
    expect(mapTwilioDirection("trunking-terminating")).toBe("INBOUND");
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

/**
 * Regression: voice/status webhooks POST form-encoded bodies whose
 * signatures cover the URL + sorted POST params. A previous version used
 * validateRequestWithBody (empty params + required bodySHA256 query
 * param) which rejected every real Twilio call.
 */
describe("verifyTwilioSignature", () => {
  const AUTH_TOKEN = "test-auth-token-123";
  const BASE = "https://nirman.example.com";
  const PATH = "/api/telephony/webhook/twilio/voice";
  const COMPANY = "co_123";

  function signedRequest(params: Record<string, string>, tamperedParams?: Record<string, string>) {
    const url = `${BASE}${PATH}?companyId=${COMPANY}`;
    const bodyParams = tamperedParams ?? params;
    // Twilio algorithm: HMAC-SHA1 over url + each param sorted by key.
    let data = url;
    for (const k of Object.keys(params).sort()) data += k + params[k];
    const signature = createHmac("sha1", AUTH_TOKEN).update(data).digest("base64");
    const rawBody = new URLSearchParams(bodyParams).toString();
    const req = {
      url: `http://internal:3000${PATH}?companyId=${COMPANY}`,
      headers: { get: (h: string) => (h === "x-twilio-signature" ? signature : null) },
    } as unknown as NextRequest;
    return { req, rawBody };
  }

  const PARAMS = {
    CallSid: "CA_abc",
    From: "+919812345678",
    To: "+17123181444",
    CallStatus: "ringing",
    Direction: "inbound",
  };

  it("accepts a correctly-signed form-encoded webhook body", () => {
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    process.env.NEXT_PUBLIC_APP_URL = BASE;
    const { req, rawBody } = signedRequest(PARAMS);
    expect(verifyTwilioSignature(req, rawBody)).toBe(true);
  });

  it("rejects a body whose params were tampered with", () => {
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    process.env.NEXT_PUBLIC_APP_URL = BASE;
    const { req, rawBody } = signedRequest(PARAMS, { ...PARAMS, From: "+910000000000" });
    expect(verifyTwilioSignature(req, rawBody)).toBe(false);
  });

  it("rejects a garbage signature", () => {
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    process.env.NEXT_PUBLIC_APP_URL = BASE;
    const req = {
      url: `http://internal:3000${PATH}?companyId=${COMPANY}`,
      headers: { get: () => "notasignature==" },
    } as unknown as NextRequest;
    expect(verifyTwilioSignature(req, new URLSearchParams(PARAMS).toString())).toBe(false);
  });

  it("rejects when no auth token is configured in production", () => {
    const saved = process.env.TWILIO_AUTH_TOKEN;
    const savedEnv = process.env.NODE_ENV;
    delete process.env.TWILIO_AUTH_TOKEN;
    (process.env as Record<string, string>).NODE_ENV = "production";
    const { req, rawBody } = signedRequest(PARAMS);
    expect(verifyTwilioSignature(req, rawBody)).toBe(false);
    process.env.TWILIO_AUTH_TOKEN = saved;
    (process.env as Record<string, string>).NODE_ENV = savedEnv ?? "test";
  });
});
