// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFieldMode } from "./field-mode";

describe("useFieldMode", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("field-mode");
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("field-mode");
  });

  it("starts with enabled=false when localStorage is empty", () => {
    const { result } = renderHook(() => useFieldMode());
    expect(result.current.enabled).toBe(false);
  });

  it("reads saved=true from localStorage on mount", () => {
    localStorage.setItem("nirman_field_mode", "true");
    const { result } = renderHook(() => useFieldMode());
    // After mount effect runs
    expect(result.current.enabled).toBe(true);
  });

  it("adds field-mode class to <html> when enabled in localStorage", () => {
    localStorage.setItem("nirman_field_mode", "true");
    renderHook(() => useFieldMode());
    expect(document.documentElement.classList.contains("field-mode")).toBe(true);
  });

  it("does not add field-mode class when disabled", () => {
    renderHook(() => useFieldMode());
    expect(document.documentElement.classList.contains("field-mode")).toBe(false);
  });

  it("toggle() enables field mode and persists to localStorage", () => {
    const { result } = renderHook(() => useFieldMode());
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(true);
    expect(localStorage.getItem("nirman_field_mode")).toBe("true");
    expect(document.documentElement.classList.contains("field-mode")).toBe(true);
  });

  it("toggle() again disables field mode", () => {
    const { result } = renderHook(() => useFieldMode());
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);
    expect(localStorage.getItem("nirman_field_mode")).toBe("false");
    expect(document.documentElement.classList.contains("field-mode")).toBe(false);
  });

  it("toggle(true) explicitly enables", () => {
    const { result } = renderHook(() => useFieldMode());
    act(() => result.current.toggle(true));
    expect(result.current.enabled).toBe(true);
  });

  it("toggle(false) explicitly disables", () => {
    const { result } = renderHook(() => useFieldMode());
    act(() => result.current.toggle(true));
    act(() => result.current.toggle(false));
    expect(result.current.enabled).toBe(false);
  });

  it("persists the value across re-renders", () => {
    const { result, rerender } = renderHook(() => useFieldMode());
    act(() => result.current.toggle(true));
    rerender();
    expect(result.current.enabled).toBe(true);
    expect(localStorage.getItem("nirman_field_mode")).toBe("true");
  });
});
