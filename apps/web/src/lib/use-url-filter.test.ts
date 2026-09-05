// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};
let mockSearchParams = new URLSearchParams();
let mockPathname = "/list";

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

import { useUrlFilter, useUrlQuery } from "./use-url-filter";

describe("useUrlFilter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockPathname = "/list";
  });

  it("returns the default value when the param is not in the URL", () => {
    const { result } = renderHook(() => useUrlFilter("status", "ALL"));
    expect(result.current[0]).toBe("ALL");
  });

  it("returns the value from the URL", () => {
    mockSearchParams = new URLSearchParams("status=DRAFT");
    const { result } = renderHook(() => useUrlFilter("status", "ALL"));
    expect(result.current[0]).toBe("DRAFT");
  });

  it("update sets the param in the URL via router.replace", () => {
    const { result } = renderHook(() => useUrlFilter<string>("status", "ALL"));
    act(() => result.current[1]("PENDING"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/list?status=PENDING", { scroll: false });
  });

  it("update removes the param when value equals default", () => {
    mockSearchParams = new URLSearchParams("status=DRAFT");
    const { result } = renderHook(() => useUrlFilter<string>("status", "ALL"));
    act(() => result.current[1]("ALL"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/list", { scroll: false });
  });

  it("update removes the param when value is empty", () => {
    mockSearchParams = new URLSearchParams("status=DRAFT");
    const { result } = renderHook(() => useUrlFilter<string>("status", "ALL"));
    act(() => result.current[1](""));
    expect(mockRouter.replace).toHaveBeenCalledWith("/list", { scroll: false });
  });

  it("preserves other query params when updating", () => {
    mockSearchParams = new URLSearchParams("page=2&status=ALL");
    const { result } = renderHook(() => useUrlFilter<string>("status", "ALL"));
    act(() => result.current[1]("DRAFT"));
    const url = mockRouter.replace.mock.calls[0]![0] as string;
    expect(url).toContain("page=2");
    expect(url).toContain("status=DRAFT");
  });

  it("returns optimistic pending value immediately after update", () => {
    const { result } = renderHook(() => useUrlFilter<string>("status", "ALL"));
    act(() => result.current[1]("DRAFT"));
    // The pending value should be visible before the URL catches up
    expect(result.current[0]).toBe("DRAFT");
  });
});

describe("useUrlQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockPathname = "/search";
  });

  it("returns the default value when no query param is set", () => {
    const { result } = renderHook(() => useUrlQuery("q", ""));
    expect(result.current[0]).toBe("");
  });

  it("returns the query from the URL", () => {
    mockSearchParams = new URLSearchParams("q=hello");
    const { result } = renderHook(() => useUrlQuery("q", ""));
    expect(result.current[0]).toBe("hello");
  });

  it("update sets the pending value immediately", () => {
    const { result } = renderHook(() => useUrlQuery("q", ""));
    act(() => result.current[1]("test query"));
    expect(result.current[0]).toBe("test query");
  });

  it("update returns a cleanup function", () => {
    const { result } = renderHook(() => useUrlQuery("q", ""));
    let cleanup: (() => void) | undefined;
    act(() => {
      cleanup = result.current[1]("test");
    });
    expect(typeof cleanup).toBe("function");
  });
});
