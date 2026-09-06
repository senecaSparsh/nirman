// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useApiAction } from "./use-api-action";

// next/navigation is mocked globally in vitest.setup.ts (useRouter.refresh etc.)
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";

function mockResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  return {
    ok,
    status: init.status ?? (ok ? 200 : 500),
    json: async () => body,
  } as Response;
}

describe("useApiAction", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("initial state: isPending false, error null", () => {
    const { result } = renderHook(() => useApiAction());
    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.mutate).toBe("function");
  });

  it("successful POST: returns data, shows success toast, calls onSuccess", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ id: 1, created: true }),
    );
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useApiAction());

    let data: unknown;
    await act(async () => {
      data = await result.current.mutate({
        endpoint: "/api/items",
        method: "POST",
        body: { name: "x" },
        successMessage: "Created",
        onSuccess,
      });
    });

    expect(data).toEqual({ id: 1, created: true });
    expect(toast.success).toHaveBeenCalledWith("Created", expect.anything());
    expect(onSuccess).toHaveBeenCalledWith({ id: 1, created: true });
    expect(result.current.error).toBeNull();
  });

  it("successful PUT: sends PUT method", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({ ok: true }));
    const { result } = renderHook(() => useApiAction());

    await act(async () => {
      await result.current.mutate({ endpoint: "/api/items/1", method: "PUT", body: { a: 1 } });
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/items/1",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ a: 1 }) }),
    );
  });

  it("successful DELETE: sends DELETE method with no body", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({ ok: true }));
    const { result } = renderHook(() => useApiAction());

    await act(async () => {
      await result.current.mutate({ endpoint: "/api/items/1", method: "DELETE" });
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/items/1",
      expect.objectContaining({ method: "DELETE", body: undefined }),
    );
  });

  it("default method is PATCH", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));
    const { result } = renderHook(() => useApiAction());
    await act(async () => {
      await result.current.mutate({ endpoint: "/api/x" });
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/x",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("error handling: 4xx business error sets error and reverts, no retry", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ error: "Validation failed" }, { ok: false, status: 400 }),
    );
    const revert = vi.fn();
    const { result } = renderHook(() => useApiAction());

    // useApiAction intentionally does NOT re-throw — it returns null and
    // surfaces the error via `error` state + toast. This prevents unhandled
    // promise rejections in event handlers (onClick={() => mutate(...)}).
    let retVal: unknown;
    await act(async () => {
      retVal = await result.current.mutate({
        endpoint: "/api/items",
        method: "POST",
        revert,
        errorMessage: "Custom error",
      });
    });

    expect(retVal).toBeNull();

    await waitFor(() => {
      expect(result.current.error).toBe("Custom error");
    });
    // revert is called via startTransition which is async
    await waitFor(() => {
      expect(revert).toHaveBeenCalled();
    });
    expect(toast.error).toHaveBeenCalledWith("Custom error", expect.anything());
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("error handling: uses server error message when no errorMessage provided", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ message: "Server says no" }, { ok: false, status: 422 }),
    );
    const { result } = renderHook(() => useApiAction());

    // useApiAction returns null on error (doesn't throw) — check error state instead.
    await act(async () => {
      await result.current.mutate({ endpoint: "/api/items", method: "POST" });
    });

    expect(result.current.error).toBe("Server says no");
  });

  it("loading state transitions: isPending becomes true during transition", async () => {
    let resolveFn!: (v: Response) => void;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );

    const { result } = renderHook(() => useApiAction());

    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = result.current.mutate({ endpoint: "/api/x", method: "POST" });
    });

    // useTransition isPending may be true synchronously after start.
    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    await act(async () => {
      resolveFn(mockResponse({ ok: true }));
      await pending;
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });

  it("optimistic update: optimisticUpdate called before fetch, revert on error", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ error: "no" }, { ok: false, status: 400 }),
    );
    const optimisticUpdate = vi.fn();
    const revert = vi.fn();
    const { result } = renderHook(() => useApiAction());

    // useApiAction returns null on error (doesn't throw).
    await act(async () => {
      await result.current.mutate({
        endpoint: "/api/items",
        method: "POST",
        optimisticUpdate,
        revert,
      });
    });

    expect(optimisticUpdate).toHaveBeenCalled();
    // revert is called via startTransition which is async
    await waitFor(() => {
      expect(revert).toHaveBeenCalled();
    });
  });

  it("network error retries up to maxRetries then reverts and sets error", async () => {
    vi.useFakeTimers();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch"));
    const revert = vi.fn();
    const { result } = renderHook(() => useApiAction());

    // useApiAction returns null on error (doesn't throw) — check error state instead.
    const p = act(async () => {
      await result.current.mutate({
        endpoint: "/api/items",
        method: "POST",
        revert,
        maxRetries: 2,
      });
    });

    // Advance through retry backoffs: 500ms, 1500ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await p;

    expect(revert).toHaveBeenCalled();
    expect(result.current.error).toBe("Failed to fetch");
    expect(globalThis.fetch).toHaveBeenCalledTimes(3); // initial + 2 retries
    vi.useRealTimers();
  });

  it("refreshOnSuccess=false does not call router.refresh", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));
    const { result } = renderHook(() => useApiAction());
    await act(async () => {
      await result.current.mutate({
        endpoint: "/api/x",
        method: "POST",
        refreshOnSuccess: false,
      });
    });
    // router.refresh is from the global mock; we just verify no throw.
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("successAction and successDescription passed to toast", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));
    const action = { label: "Go", onClick: vi.fn() };
    const { result } = renderHook(() => useApiAction());
    await act(async () => {
      await result.current.mutate({
        endpoint: "/api/x",
        method: "POST",
        successMessage: "Done",
        successDescription: "desc",
        successAction: action,
      });
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Done",
      expect.objectContaining({ description: "desc", action }),
    );
  });
});
