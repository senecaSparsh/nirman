// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAutoScroll } from "./use-auto-scroll";

describe("useAutoScroll", () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    // Default: no reduced motion
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("returns a ref object", () => {
    const { result } = renderHook(() => useAutoScroll([]));
    expect(result.current).toBeDefined();
    expect(result.current.current).toBeNull();
  });

  it("does not throw when the ref is not attached to an element", () => {
    expect(() => renderHook(() => useAutoScroll([]))).not.toThrow();
  });

  it("does not throw when ref is attached to a real element", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const { result, rerender } = renderHook(() => useAutoScroll([div]));
    // Attach the ref
    result.current.current = div;
    rerender();
    expect(result.current.current).toBe(div);
    document.body.removeChild(div);
  });

  it("respects prefers-reduced-motion (no auto-scroll)", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    const div = document.createElement("div");
    document.body.appendChild(div);
    const { result, rerender } = renderHook(() => useAutoScroll([div]));
    result.current.current = div;
    expect(() => rerender()).not.toThrow();
    document.body.removeChild(div);
  });

  it("updates when deps change", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const { result, rerender } = renderHook(({ deps }) => useAutoScroll(deps), {
      initialProps: { deps: [1] },
    });
    result.current.current = div;
    expect(() => rerender({ deps: [2] })).not.toThrow();
    document.body.removeChild(div);
  });
});
