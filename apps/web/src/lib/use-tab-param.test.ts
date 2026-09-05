// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Override next/navigation to provide controllable search params + router
const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};
let mockSearchParams = new URLSearchParams();
let mockPathname = "/test";

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

import { useTabParam, useQueryParam } from "./use-tab-param";

describe("useTabParam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockPathname = "/test";
  });

  it("returns the fallback when no tab param is in the URL", () => {
    const { result } = renderHook(() => useTabParam(["overview", "details"] as const, "overview"));
    expect(result.current[0]).toBe("overview");
  });

  it("returns the tab from the URL when valid", () => {
    mockSearchParams = new URLSearchParams("tab=details");
    const { result } = renderHook(() => useTabParam(["overview", "details"] as const, "overview"));
    expect(result.current[0]).toBe("details");
  });

  it("falls back when the tab param is not in the allowed list", () => {
    mockSearchParams = new URLSearchParams("tab=nonsense");
    const { result } = renderHook(() => useTabParam(["overview", "details"] as const, "overview"));
    expect(result.current[0]).toBe("overview");
  });

  it("setValue pushes a new URL with the tab param", () => {
    const { result } = renderHook(() => useTabParam(["overview", "details"] as const, "overview"));
    act(() => result.current[1]("details"));
    expect(mockRouter.push).toHaveBeenCalledWith("/test?tab=details", { scroll: false });
  });

  it("setValue removes the param when switching to the fallback", () => {
    mockSearchParams = new URLSearchParams("tab=details");
    const { result } = renderHook(() => useTabParam(["overview", "details"] as const, "overview"));
    act(() => result.current[1]("overview"));
    expect(mockRouter.push).toHaveBeenCalledWith("/test", { scroll: false });
  });

  it("uses replace when options.replace is true", () => {
    const { result } = renderHook(() =>
      useTabParam(["overview", "details"] as const, "overview", { replace: true }),
    );
    act(() => result.current[1]("details"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/test?tab=details", { scroll: false });
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("supports a custom param name", () => {
    mockSearchParams = new URLSearchParams("view=list");
    const { result } = renderHook(() =>
      useTabParam(["list", "grid"] as const, "list", { param: "view" }),
    );
    expect(result.current[0]).toBe("list");
  });

  it("preserves other query params when setting the tab", () => {
    mockSearchParams = new URLSearchParams("filter=active&tab=overview");
    const { result } = renderHook(() => useTabParam(["overview", "details"] as const, "overview"));
    act(() => result.current[1]("details"));
    expect(mockRouter.push).toHaveBeenCalled();
    const url = mockRouter.push.mock.calls[0]![0] as string;
    expect(url).toContain("filter=active");
    expect(url).toContain("tab=details");
  });
});

describe("useQueryParam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockPathname = "/test";
  });

  it("returns the fallback when the param is not in the URL", () => {
    const { result } = renderHook(() => useQueryParam("status", "all"));
    expect(result.current[0]).toBe("all");
  });

  it("returns the param value from the URL", () => {
    mockSearchParams = new URLSearchParams("status=active");
    const { result } = renderHook(() => useQueryParam("status", "all"));
    expect(result.current[0]).toBe("active");
  });

  it("setValue replaces the URL with the new param", () => {
    const { result } = renderHook(() => useQueryParam("status", "all"));
    act(() => result.current[1]("pending"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/test?status=pending", { scroll: false });
  });

  it("setValue removes the param when value equals fallback", () => {
    mockSearchParams = new URLSearchParams("status=active");
    const { result } = renderHook(() => useQueryParam("status", "all"));
    act(() => result.current[1]("all"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/test", { scroll: false });
  });

  it("setValue removes the param when value is empty", () => {
    mockSearchParams = new URLSearchParams("status=active");
    const { result } = renderHook(() => useQueryParam("status", "all"));
    act(() => result.current[1](""));
    expect(mockRouter.replace).toHaveBeenCalledWith("/test", { scroll: false });
  });
});
