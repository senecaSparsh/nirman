import { describe, expect, it, vi } from "vitest";
import { installFriendlyFetch } from "./friendly-fetch";

describe("installFriendlyFetch", () => {
  it("translates network TypeErrors into friendly text, keeping TypeError for retry detection", async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("window", { fetch: fakeFetch });
    installFriendlyFetch();
    const p = (window as unknown as { fetch: typeof fetch }).fetch("/x");
    await expect(p).rejects.toBeInstanceOf(TypeError);
    await expect(fakeFetch.mock.results.length > 0).toBe(true);
    await expect((window as unknown as { fetch: typeof fetch }).fetch("/x")).rejects.toThrow(
      "No internet connection",
    );
    vi.unstubAllGlobals();
  });
});
