import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { swrFetcher, swrConfig } from "./swr";

describe("swrFetcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on a successful (2xx) response", async () => {
    const data = { items: [1, 2, 3] };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(data),
      }),
    );
    const result = await swrFetcher("/api/items");
    expect(result).toEqual(data);
    expect(fetch).toHaveBeenCalledWith("/api/items", { credentials: "include" });
  });

  it("throws an error with HTTP status on a non-ok response (catch-all)", async () => {
    // The .catch() in swrFetcher catches the inner throw, so it always
    // falls back to `HTTP {status}` regardless of the body content.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: "Forbidden" }),
      }),
    );
    await expect(swrFetcher("/api/secure")).rejects.toThrow("HTTP 403");
  });

  it("throws HTTP status when body has a message but not error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: "Bad request" }),
      }),
    );
    await expect(swrFetcher("/api/data")).rejects.toThrow("HTTP 400");
  });

  it("falls back to HTTP status code when body has no error/message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      }),
    );
    await expect(swrFetcher("/api/data")).rejects.toThrow("HTTP 500");
  });

  it("falls back to HTTP status code when json parsing fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error("parse error")),
      }),
    );
    await expect(swrFetcher("/api/data")).rejects.toThrow("HTTP 502");
  });

  it("includes credentials in the fetch call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      }),
    );
    await swrFetcher("/api/test");
    expect(fetch).toHaveBeenCalledWith("/api/test", { credentials: "include" });
  });
});

describe("swrConfig", () => {
  it("uses swrFetcher as the default fetcher", () => {
    expect(swrConfig.fetcher).toBe(swrFetcher);
  });

  it("disables revalidateOnFocus", () => {
    expect(swrConfig.revalidateOnFocus).toBe(false);
  });

  it("sets dedupingInterval to 2000ms", () => {
    expect(swrConfig.dedupingInterval).toBe(2000);
  });

  it("sets errorRetryCount to 3", () => {
    expect(swrConfig.errorRetryCount).toBe(3);
  });

  it("isPaused returns true when navigator.onLine is false", () => {
    const orig = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    expect(swrConfig.isPaused()).toBe(true);
    Object.defineProperty(navigator, "onLine", { value: orig, configurable: true });
  });

  it("isPaused returns false when navigator.onLine is true", () => {
    const orig = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    expect(swrConfig.isPaused()).toBe(false);
    Object.defineProperty(navigator, "onLine", { value: orig, configurable: true });
  });

  it("onError is a function", () => {
    expect(typeof swrConfig.onError).toBe("function");
  });

  it("onError does not throw when called", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => swrConfig.onError(new Error("test"), "/api/test")).not.toThrow();
    spy.mockRestore();
  });
});
