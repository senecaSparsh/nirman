// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCompanySwitch, type CompanySwitchTarget } from "./use-company-switch";

function mockResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  return {
    ok,
    status: init.status ?? (ok ? 200 : 500),
    json: async () => body,
  } as Response;
}

const target: CompanySwitchTarget = { id: "c2", name: "Company B", parentCompanyId: null };

describe("useCompanySwitch", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initial state: isSwitching false, switchingToId null", () => {
    const { result } = renderHook(() => useCompanySwitch());
    expect(result.current.isSwitching).toBe(false);
    expect(result.current.switchingToId).toBeNull();
    expect(typeof result.current.switchCompany).toBe("function");
  });

  it("optimistic update: onOptimisticSwitch called before fetch resolves", async () => {
    let resolveFn!: (v: Response) => void;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );
    const onOptimisticSwitch = vi.fn();
    const { result } = renderHook(() => useCompanySwitch({ onOptimisticSwitch }));

    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = result.current.switchCompany(target);
    });

    expect(onOptimisticSwitch).toHaveBeenCalledWith(target);
    expect(result.current.isSwitching).toBe(true);
    expect(result.current.switchingToId).toBe("c2");

    await act(async () => {
      resolveFn(mockResponse({ ok: true }));
      await pending;
    });
  });

  it("successful switch: dispatches nirman-company-switched event with detail", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));
    const { result } = renderHook(() => useCompanySwitch());

    await act(async () => {
      await result.current.switchCompany(target);
    });

    expect(window.dispatchEvent).toHaveBeenCalled();
    const event = vi.mocked(window.dispatchEvent).mock.calls[0]![0] as CustomEvent;
    expect(event.type).toBe("nirman-company-switched");
    expect(event.detail).toEqual({
      id: "c2",
      name: "Company B",
      parentCompanyId: null,
    });
    expect(result.current.isSwitching).toBe(false);
    expect(result.current.switchingToId).toBeNull();
  });

  it("non-ok response: calls onRevert, clears switching state", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ error: "no" }, { ok: false, status: 400 }),
    );
    const onRevert = vi.fn();
    const { result } = renderHook(() => useCompanySwitch({ onRevert }));

    await act(async () => {
      await result.current.switchCompany(target);
    });

    expect(onRevert).toHaveBeenCalled();
    expect(result.current.isSwitching).toBe(false);
    expect(result.current.switchingToId).toBeNull();
  });

  it("network error: calls onRevert, clears switching state", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Network"));
    const onRevert = vi.fn();
    const { result } = renderHook(() => useCompanySwitch({ onRevert }));

    await act(async () => {
      await result.current.switchCompany(target);
    });

    expect(onRevert).toHaveBeenCalled();
    expect(result.current.isSwitching).toBe(false);
  });

  it("uses custom endpoint when provided", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));
    const { result } = renderHook(() =>
      useCompanySwitch({ endpoint: "/api/custom/switch" }),
    );

    await act(async () => {
      await result.current.switchCompany(target);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/custom/switch",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ companyId: "c2" }) }),
    );
  });

  it("default endpoint is /api/companies/switch", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));
    const { result } = renderHook(() => useCompanySwitch());

    await act(async () => {
      await result.current.switchCompany(target);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/companies/switch",
      expect.anything(),
    );
  });

  it("skipRefresh=true does not call router.refresh (no throw)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));
    const { result } = renderHook(() => useCompanySwitch({ skipRefresh: true }));

    await act(async () => {
      await result.current.switchCompany(target);
    });
    // Event still dispatched.
    expect(window.dispatchEvent).toHaveBeenCalled();
  });

  it("race condition: later switch supersedes earlier — earlier does not dispatch or revert", async () => {
    let resolveA!: (v: Response) => void;
    let resolveB!: (v: Response) => void;
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveB = resolve;
          }),
      );

    const onRevert = vi.fn();
    const { result } = renderHook(() => useCompanySwitch({ onRevert }));

    const targetA: CompanySwitchTarget = { id: "a", name: "A" };
    const targetB: CompanySwitchTarget = { id: "b", name: "B" };

    act(() => {
      result.current.switchCompany(targetA);
    });
    act(() => {
      result.current.switchCompany(targetB);
    });

    // Resolve B first (the later/superseding switch).
    await act(async () => {
      resolveB(mockResponse({}));
    });
    // Now resolve A — it's superseded, should NOT dispatch event or revert.
    (window.dispatchEvent as ReturnType<typeof vi.fn>).mockClear();
    onRevert.mockClear();

    await act(async () => {
      resolveA(mockResponse({}));
    });

    expect(window.dispatchEvent).not.toHaveBeenCalled();
    expect(onRevert).not.toHaveBeenCalled();
  });
});
