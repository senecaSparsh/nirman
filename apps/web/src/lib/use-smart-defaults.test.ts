// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSmartDefaults } from "./use-smart-defaults";

describe("useSmartDefaults", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("starts with empty defaults and loaded=true after mount (effects run synchronously in jsdom)", () => {
    const { result } = renderHook(() => useSmartDefaults("po"));
    // In jsdom, useEffect runs synchronously during renderHook
    expect(result.current.defaults).toEqual({});
    expect(result.current.hasDefaults).toBe(false);
  });

  it("sets loaded=true after mount", async () => {
    const { result } = renderHook(() => useSmartDefaults("po"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
  });

  it("hasDefaults is false when no defaults are stored", async () => {
    const { result } = renderHook(() => useSmartDefaults("po"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.hasDefaults).toBe(false);
  });

  it("hasDefaults is true when defaults are stored", async () => {
    localStorage.setItem("nirman:defaults:po", JSON.stringify({ supplierId: "s1" }));
    const { result } = renderHook(() => useSmartDefaults("po"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.hasDefaults).toBe(true);
  });

  it("getDefault returns a stored value", async () => {
    localStorage.setItem("nirman:defaults:po", JSON.stringify({ supplierId: "s1" }));
    const { result } = renderHook(() => useSmartDefaults("po"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.getDefault("supplierId")).toBe("s1");
  });

  it("getDefault returns undefined for a missing field", async () => {
    localStorage.setItem("nirman:defaults:po", JSON.stringify({ supplierId: "s1" }));
    const { result } = renderHook(() => useSmartDefaults("po"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.getDefault("projectId")).toBeUndefined();
  });

  it("getDefault returns undefined for empty string values", async () => {
    localStorage.setItem("nirman:defaults:po", JSON.stringify({ supplierId: "" }));
    const { result } = renderHook(() => useSmartDefaults("po"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.getDefault("supplierId")).toBeUndefined();
  });

  it("recordDefaults persists values to localStorage", async () => {
    const { result } = renderHook(() => useSmartDefaults("po"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.recordDefaults({ supplierId: "s1", projectId: "p1" }));
    const stored = JSON.parse(localStorage.getItem("nirman:defaults:po")!);
    expect(stored).toEqual({ supplierId: "s1", projectId: "p1" });
  });

  it("recordDefaults skips empty/null/undefined values", async () => {
    const { result } = renderHook(() => useSmartDefaults("po"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() =>
      result.current.recordDefaults({ supplierId: "s1", projectId: "", notes: undefined, x: null as unknown as undefined }),
    );
    const stored = JSON.parse(localStorage.getItem("nirman:defaults:po")!);
    expect(stored).toEqual({ supplierId: "s1" });
  });

  it("recordDefaults merges with existing values", async () => {
    localStorage.setItem("nirman:defaults:po", JSON.stringify({ supplierId: "s1" }));
    const { result } = renderHook(() => useSmartDefaults("po"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.recordDefaults({ projectId: "p1" }));
    const stored = JSON.parse(localStorage.getItem("nirman:defaults:po")!);
    expect(stored).toEqual({ supplierId: "s1", projectId: "p1" });
  });

  it("clearDefaults removes the stored values", async () => {
    localStorage.setItem("nirman:defaults:po", JSON.stringify({ supplierId: "s1" }));
    const { result } = renderHook(() => useSmartDefaults("po"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.clearDefaults());
    expect(localStorage.getItem("nirman:defaults:po")).toBeNull();
  });

  it("handles corrupted localStorage gracefully", async () => {
    localStorage.setItem("nirman:defaults:po", "not-json{");
    const { result } = renderHook(() => useSmartDefaults("po"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.defaults).toEqual({});
    expect(result.current.hasDefaults).toBe(false);
  });

  it("handles non-object localStorage gracefully", async () => {
    localStorage.setItem("nirman:defaults:po", JSON.stringify([1, 2, 3]));
    const { result } = renderHook(() => useSmartDefaults("po"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.defaults).toEqual({});
  });

  it("uses separate keys per formType", async () => {
    localStorage.setItem("nirman:defaults:po", JSON.stringify({ supplierId: "s1" }));
    const { result } = renderHook(() => useSmartDefaults("invoice"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.getDefault("supplierId")).toBeUndefined();
  });
});
