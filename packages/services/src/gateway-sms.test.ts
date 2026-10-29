/**
 * Unit tests for the self-hosted SMS gateway sender (gateway-sms.ts).
 * Fetch is stubbed — tests the API contract, not a live phone.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeGatewayBaseUrl,
  sendSmsViaGateway,
  testSmsGateway,
  smsGatewayConfigFromEnv,
  isSmsGatewayConfiguredFromEnv,
} from "./gateway-sms";

const CFG = { url: "http://192.168.1.50:8080", username: "sms", password: "secret" };

function mockFetch(status = 200, body: unknown = {}) {
  const spy = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SMS_GATEWAY_URL;
  delete process.env.SMS_GATEWAY_USER;
  delete process.env.SMS_GATEWAY_PASSWORD;
  delete process.env.SMS_GATEWAY_SIM;
});

describe("normalizeGatewayBaseUrl", () => {
  it("accepts a plain base URL", () => {
    expect(normalizeGatewayBaseUrl("http://192.168.1.50:8080")).toBe("http://192.168.1.50:8080");
  });
  it("strips trailing slashes and a pasted /message or /webhooks suffix", () => {
    expect(normalizeGatewayBaseUrl("http://10.0.0.2:8080/")).toBe("http://10.0.0.2:8080");
    expect(normalizeGatewayBaseUrl("https://sms.example.com/3rdparty/v1/message")).toBe(
      "https://sms.example.com/3rdparty/v1",
    );
    expect(normalizeGatewayBaseUrl("http://10.0.0.2:8080/webhooks")).toBe("http://10.0.0.2:8080");
  });
});

describe("sendSmsViaGateway", () => {
  it("POSTs {message, phoneNumbers[E.164]} to {base}/message with basic auth", async () => {
    const spy = mockFetch(202, { id: "m1", state: "Pending" });
    const result = await sendSmsViaGateway(CFG, "9876543210", "Hello");
    expect(result.sent).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://192.168.1.50:8080/message");
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(auth).toBe(`Basic ${Buffer.from("sms:secret").toString("base64")}`);
    expect(JSON.parse(init.body as string)).toEqual({
      message: "Hello",
      phoneNumbers: ["+919876543210"],
    });
  });

  it("includes simNumber for dual-SIM phones", async () => {
    const spy = mockFetch(200);
    await sendSmsViaGateway({ ...CFG, simNumber: 2 }, "+919876543210", "Hi");
    expect(JSON.parse((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).simNumber).toBe(2);
  });

  it("returns a credential error on 401/403 and a status error otherwise", async () => {
    mockFetch(401);
    expect((await sendSmsViaGateway(CFG, "9876543210", "x")).error).toMatch(/username\/password/);
    mockFetch(500);
    expect((await sendSmsViaGateway(CFG, "9876543210", "x")).error).toMatch(/500/);
  });

  it("surfaces network failure instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await sendSmsViaGateway(CFG, "9876543210", "x");
    expect(result.sent).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });
});

describe("testSmsGateway", () => {
  it("GETs {base}/webhooks — 200 means reachable + authed", async () => {
    const spy = mockFetch(200, []);
    expect((await testSmsGateway(CFG)).sent).toBe(true);
    expect((spy.mock.calls[0] as unknown as [string])[0]).toBe("http://192.168.1.50:8080/webhooks");
  });
  it("flags bad credentials", async () => {
    mockFetch(401);
    expect((await testSmsGateway(CFG)).error).toMatch(/Wrong username or password/);
  });
});

describe("env config", () => {
  it("is unset without all three vars", () => {
    expect(smsGatewayConfigFromEnv()).toBeNull();
    expect(isSmsGatewayConfiguredFromEnv()).toBe(false);
  });
  it("reads URL+user+password, optional SIM", () => {
    process.env.SMS_GATEWAY_URL = "http://phone:8080";
    process.env.SMS_GATEWAY_USER = "u";
    process.env.SMS_GATEWAY_PASSWORD = "p";
    process.env.SMS_GATEWAY_SIM = "2";
    const cfg = smsGatewayConfigFromEnv();
    expect(cfg).toEqual({ url: "http://phone:8080", username: "u", password: "p", simNumber: 2 });
    expect(isSmsGatewayConfiguredFromEnv()).toBe(true);
  });
});
