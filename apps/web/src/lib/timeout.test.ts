/**
 * Unit tests for withTimeout helper.
 */
import { describe, it, expect } from "vitest";
import { withTimeout } from "./timeout";

describe("withTimeout", () => {
  it("returns the work result when it completes in time", async () => {
    const result = await withTimeout(Promise.resolve(42), 1000);
    expect(result).toBe(42);
  });

  it("returns a 504 Response when work times out", async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 200));
    const result = await withTimeout(slow as Promise<any>, 10);
    expect(result).toBeInstanceOf(Response);
    const resp = result as Response;
    expect(resp.status).toBe(504);
    const body = await resp.json();
    expect(body.error).toBe("Request timed out");
  });

  it("uses custom message in 504 response", async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 200));
    const result = await withTimeout(slow as Promise<any>, 10, "Backup timed out");
    expect(result).toBeInstanceOf(Response);
    const resp = result as Response;
    expect(resp.status).toBe(504);
    const body = await resp.json();
    expect(body.error).toBe("Backup timed out");
  });

  it("504 response has JSON content-type header", async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 200));
    const result = await withTimeout(slow as Promise<any>, 10);
    const resp = result as Response;
    expect(resp.headers.get("content-type")).toBe("application/json");
  });

  it("returns work result when work resolves immediately and timeout is large", async () => {
    const result = await withTimeout(Promise.resolve("done"), 5000);
    expect(result).toBe("done");
  });

  it("returns work rejection when work rejects before timeout", async () => {
    await expect(withTimeout(Promise.reject(new Error("fail")), 1000)).rejects.toThrow("fail");
  });

  it("handles object results", async () => {
    const obj = { a: 1, b: "two" };
    const result = await withTimeout(Promise.resolve(obj), 1000);
    expect(result).toEqual(obj);
  });

  it("handles array results", async () => {
    const result = await withTimeout(Promise.resolve([1, 2, 3]), 1000);
    expect(result).toEqual([1, 2, 3]);
  });
});
