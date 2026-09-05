// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTodayDate, useTodayDateState } from "./use-today-date";

describe("useTodayDate", () => {
  it("returns a date string in YYYY-MM-DD format after mount", () => {
    const { result } = renderHook(() => useTodayDate());
    // In jsdom, useEffect runs synchronously during renderHook
    expect(result.current).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns the correct date matching new Date().toISOString().slice(0,10)", () => {
    const { result } = renderHook(() => useTodayDate());
    const expected = new Date().toISOString().slice(0, 10);
    expect(result.current).toBe(expected);
  });

  it("returns a non-empty string after mount", () => {
    const { result } = renderHook(() => useTodayDate());
    expect(result.current).not.toBe("");
  });
});

describe("useTodayDateState", () => {
  it("returns a date string after mount", () => {
    const { result } = renderHook(() => useTodayDateState());
    expect(result.current[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns a setter function", () => {
    const { result } = renderHook(() => useTodayDateState());
    expect(typeof result.current[1]).toBe("function");
  });

  it("allows manual override via the setter", () => {
    const { result } = renderHook(() => useTodayDateState());
    // Wait for the effect to set today's date
    expect(result.current[0]).not.toBe("");
    act(() => {
      result.current[1]("2026-01-15");
    });
    expect(result.current[0]).toBe("2026-01-15");
  });

  it("does not override a manually set date on re-render", () => {
    const { result, rerender } = renderHook(() => useTodayDateState());
    expect(result.current[0]).not.toBe("");
    act(() => {
      result.current[1]("2025-06-20");
    });
    expect(result.current[0]).toBe("2025-06-20");
    // Re-render — the effect checks `if (!date)` so it won't override
    rerender();
    expect(result.current[0]).toBe("2025-06-20");
  });
});
