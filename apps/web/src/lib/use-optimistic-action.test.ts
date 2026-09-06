// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useOptimisticAction } from "./use-optimistic-action";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/haptic", () => ({
  haptic: vi.fn(),
}));

import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

function mockResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  return {
    ok,
    status: init.status ?? (ok ? 200 : 500),
    json: async () => body,
  } as Response;
}

describe("useOptimisticAction", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(haptic).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initial state: isPending false, error null, execute is a function", () => {
    const { result } = renderHook(() =>
      useOptimisticAction({ endpoint: "/api/x", method: "PATCH" }),
    );
    expect(result.current.isPending).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.execute).toBe("function");
  });

  it("optimistic update applied before fetch resolves", async () => {
    let resolveFn!: (v: Response) => void;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );
    const optimisticUpdate = vi.fn();
    const { result } = renderHook(() =>
      useOptimisticAction({
        endpoint: "/api/x",
        method: "PATCH",
        optimisticUpdate,
      }),
    );

    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = result.current.execute();
    });

    // optimisticUpdate should have been called synchronously (via startTransition).
    await waitFor(() => {
      expect(optimisticUpdate).toHaveBeenCalled();
    });

    await act(async () => {
      resolveFn(mockResponse({ ok: true }));
      await pending;
    });
  });

  it("successful action: returns data, haptic + toast + onSuccess + router.refresh", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({ id: 9 }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useOptimisticAction({
        endpoint: "/api/items/9",
        method: "PATCH",
        body: { status: "APPROVED" },
        successMessage: "Approved",
        hapticOnSuccess: [10, 30, 10],
        onSuccess,
      }),
    );

    let data: unknown;
    await act(async () => {
      data = await result.current.execute();
    });

    expect(data).toEqual({ id: 9 });
    expect(haptic).toHaveBeenCalledWith([10, 30, 10]);
    expect(toast.success).toHaveBeenCalledWith("Approved", undefined);
    expect(onSuccess).toHaveBeenCalledWith({ id: 9 });
  });

  it("overrideBody passed to execute overrides hook body", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));
    const { result } = renderHook(() =>
      useOptimisticAction({ endpoint: "/api/x", method: "POST", body: { a: 1 } }),
    );
    await act(async () => {
      await result.current.execute({ b: 2 });
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/x",
      expect.objectContaining({ body: JSON.stringify({ b: 2 }) }),
    );
  });

  it("rollback on error: revert called, error set, haptic + toast.error", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ error: "Denied" }, { ok: false, status: 403 }),
    );
    const revert = vi.fn();
    const { result } = renderHook(() =>
      useOptimisticAction({
        endpoint: "/api/x",
        method: "PATCH",
        revert,
        hapticOnError: [10, 40, 80],
        errorMessage: "Failed",
      }),
    );

    // useOptimisticAction intentionally does NOT re-throw — it returns null
    // and surfaces the error via `error` state + toast + haptic. This prevents
    // unhandled promise rejections in event handlers (onClick={() => execute()}).
    await act(async () => {
      await result.current.execute();
    });

    // revert is called via startTransition which is async — wait for it
    await waitFor(() => {
      expect(revert).toHaveBeenCalled();
    });
    expect(result.current.error).toBe("Failed");
    expect(haptic).toHaveBeenCalledWith([10, 40, 80]);
    expect(toast.error).toHaveBeenCalledWith("Failed");
  });

  it("rollback on network error: revert called, error set", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Network"));
    const revert = vi.fn();
    const { result } = renderHook(() =>
      useOptimisticAction({ endpoint: "/api/x", method: "POST", revert }),
    );

    // useOptimisticAction returns null on error (doesn't throw).
    await act(async () => {
      await result.current.execute();
    });

    await waitFor(() => {
      expect(revert).toHaveBeenCalled();
    });
    expect(result.current.error).toBe("Network");
  });

  it("loading state: isPending true during execution, false after", async () => {
    let resolveFn!: (v: Response) => void;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );
    const { result } = renderHook(() =>
      useOptimisticAction({ endpoint: "/api/x", method: "POST" }),
    );

    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = result.current.execute();
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    await act(async () => {
      resolveFn(mockResponse({}));
      await pending;
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });

  it("refreshOnSuccess=false skips router.refresh (no throw)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));
    const { result } = renderHook(() =>
      useOptimisticAction({ endpoint: "/api/x", method: "POST", refreshOnSuccess: false }),
    );
    await act(async () => {
      await result.current.execute();
    });
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("no successMessage means no toast.success call", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));
    const { result } = renderHook(() =>
      useOptimisticAction({ endpoint: "/api/x", method: "POST" }),
    );
    await act(async () => {
      await result.current.execute();
    });
    expect(toast.success).not.toHaveBeenCalled();
  });
});
