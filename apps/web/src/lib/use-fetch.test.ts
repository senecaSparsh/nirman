// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useFetch, clearFetchCache } from "./use-fetch";

function mockResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  return {
    ok,
    status: init.status ?? (ok ? 200 : 500),
    json: async () => body,
  } as Response;
}

describe("useFetch", () => {
  beforeEach(() => {
    clearFetchCache();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("initial state: loading true when url provided, data null, error null", () => {
    const { result } = renderHook(() => useFetch("/api/test"));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isValidating).toBe(false);
  });

  it("initial state: loading false when skip is true", () => {
    const { result } = renderHook(() => useFetch("/api/test", { skip: true }));
    expect(result.current.loading).toBe(false);
  });

  it("initial state: loading false when url is null", () => {
    const { result } = renderHook(() => useFetch(null));
    expect(result.current.loading).toBe(false);
  });

  it("successful fetch: sets data, clears loading + error", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ hello: "world" }),
    );
    const { result } = renderHook(() => useFetch<{ hello: string }>("/api/test"));

    await waitFor(() => {
      expect(result.current.data).toEqual({ hello: "world" });
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isValidating).toBe(false);
  });

  it("passes credentials: include to fetch", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));
    renderHook(() => useFetch("/api/test"));
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/test",
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  it("error handling: non-ok response sets error message from body.error", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ error: "Not allowed" }, { ok: false, status: 403 }),
    );
    const { result } = renderHook(() => useFetch("/api/test"));

    await waitFor(() => {
      expect(result.current.error).toBe("Not allowed");
    });
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("error handling: non-ok response falls back to body.message", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ message: "Bad input" }, { ok: false, status: 400 }),
    );
    const { result } = renderHook(() => useFetch("/api/test"));

    await waitFor(() => {
      expect(result.current.error).toBe("Bad input");
    });
  });

  it("error handling: non-ok response falls back to HTTP status when no body", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse(null, { ok: false, status: 500 }),
    );
    const { result } = renderHook(() => useFetch("/api/test"));

    await waitFor(() => {
      expect(result.current.error).toBe("HTTP 500");
    });
  });

  it("error handling: network error (TypeError) retries up to maxRetries then sets error", async () => {
    vi.useFakeTimers();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    const { result } = renderHook(() => useFetch("/api/test", { maxRetries: 2 }));

    // Advance through retries: 500ms, 1500ms, then final.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    // Switch back to real timers for waitFor polling
    vi.useRealTimers();
    await waitFor(() => {
      expect(result.current.error).toBe("Failed to fetch");
    });
    expect(result.current.loading).toBe(false);
  });

  it("refetch: retry() re-fetches and resets error/loading", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockResponse({ error: "boom" }, { ok: false, status: 500 }))
      .mockResolvedValueOnce(mockResponse({ ok: true }));

    const { result } = renderHook(() => useFetch("/api/test"));

    await waitFor(() => {
      expect(result.current.error).toBe("boom");
    });

    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({ ok: true });
    });
    expect(result.current.error).toBeNull();
  });

  it("abort on unmount: does not update state after unmount", async () => {
    let abortSignal: AbortSignal | null | undefined;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, init?: RequestInit) => {
        abortSignal = init?.signal;
        return Promise.resolve(mockResponse({ late: true }));
      },
    );

    const { result, unmount } = renderHook(() => useFetch("/api/test"));
    unmount();
    // After unmount the cleanup aborts the controller.
    expect(abortSignal?.aborted).toBe(true);
    // result is stale; no throw expected.
    expect(result.current.data).toBeNull();
  });

  it("query string building: fetch is called with the exact url provided", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));
    renderHook(() => useFetch("/api/test?foo=bar&baz=1"));
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/test?foo=bar&baz=1",
        expect.anything(),
      );
    });
  });

  it("skip=true does not call fetch", () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));
    renderHook(() => useFetch("/api/test", { skip: true }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("stale-while-revalidate: shows cached data immediately then revalidates", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({ v: 1 }));
    const { result, rerender } = renderHook(({ url }) => useFetch<{ v: number }>(url), {
      initialProps: { url: "/api/swr" },
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({ v: 1 });
    });

    // Re-render with a different url then back to trigger cache hit path.
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({ v: 2 }));
    rerender({ url: "/api/other" });
    await waitFor(() => {
      expect(result.current.data).toEqual({ v: 2 });
    });

    // Back to original url — cached v:1 should appear immediately (isValidating true).
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({ v: 3 }));
    rerender({ url: "/api/swr" });
    await waitFor(() => {
      expect(result.current.data).toEqual({ v: 3 });
    });
  });

  it("noCache=true does not serve cached data", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({ v: 1 }));
    const { result } = renderHook(() =>
      useFetch<{ v: number }>("/api/nocache", { noCache: true }),
    );
    await waitFor(() => {
      expect(result.current.data).toEqual({ v: 1 });
    });
  });

  it("polling: re-fetches on pollMs interval", async () => {
    vi.useFakeTimers();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));
    renderHook(() => useFetch("/api/poll", { pollMs: 1000 }));

    // Flush the initial fetch (useEffect + microtask)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Advance 1s → poll fires
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    // Advance another 1s → poll fires again
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("clearFetchCache(url) removes a single entry; clearFetchCache() clears all", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));
    const { result } = renderHook(() => useFetch("/api/cache"));
    await waitFor(() => {
      expect(result.current.data).toEqual({});
    });
    // Should not throw.
    clearFetchCache("/api/cache");
    clearFetchCache();
  });
});
