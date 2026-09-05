// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "./use-debounce";

describe("useDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("hello", 300));
    expect(result.current).toBe("hello");
  });

  it("does not update the debounced value before the delay", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: "hello", delay: 300 },
    });
    rerender({ value: "world", delay: 300 });
    expect(result.current).toBe("hello");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe("hello");
  });

  it("updates the debounced value after the delay", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: "hello", delay: 300 },
    });
    rerender({ value: "world", delay: 300 });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe("world");
  });

  it("resets the timer when value changes rapidly", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: "a", delay: 300 },
    });
    rerender({ value: "b", delay: 300 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ value: "c", delay: 300 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // Only 400ms since "b", 200ms since "c" — not enough
    expect(result.current).toBe("a");
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // 300ms since "c" — should now update
    expect(result.current).toBe("c");
  });

  it("uses default delay of 300ms", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value), {
      initialProps: { value: "init" },
    });
    rerender({ value: "changed" });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe("init");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("changed");
  });

  it("works with numeric values", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 100), {
      initialProps: { value: 0 },
    });
    rerender({ value: 42 });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(42);
  });

  it("works with object values", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 100), {
      initialProps: { value: { a: 1 } },
    });
    const newObj = { a: 2 };
    rerender({ value: newObj });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(newObj);
  });

  it("clears timer on unmount", () => {
    const { result, rerender, unmount } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: "init" },
    });
    rerender({ value: "changed" });
    unmount();
    // Should not throw or update after unmount
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe("init");
  });
});
