// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useSnooze,
  snoozeItem,
  unsnoozeItem,
  clearAllSnoozed,
  isSnoozed,
  type SnoozeDuration,
} from "./use-snooze";

describe("snoozeItem / isSnoozed / unsnoozeItem / clearAllSnoozed", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("isSnoozed returns false for an item that was never snoozed", () => {
    expect(isSnoozed("item-1")).toBe(false);
  });

  it("snoozeItem adds an item and isSnoozed returns true", () => {
    snoozeItem("item-1", "4h", "Test Item");
    expect(isSnoozed("item-1")).toBe(true);
  });

  it("snoozeItem with 4h sets until to ~4 hours from now", () => {
    const before = Date.now();
    snoozeItem("item-1", "4h", "Test");
    const after = Date.now();
    const stored = JSON.parse(localStorage.getItem("nirman:snoozed-items")!);
    expect(stored[0].until).toBeGreaterThanOrEqual(before + 4 * 60 * 60 * 1000 - 100);
    expect(stored[0].until).toBeLessThanOrEqual(after + 4 * 60 * 60 * 1000 + 100);
  });

  it("snoozeItem with 24h sets until to ~24 hours from now", () => {
    const before = Date.now();
    snoozeItem("item-1", "24h", "Test");
    const stored = JSON.parse(localStorage.getItem("nirman:snoozed-items")!);
    expect(stored[0].until).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000 - 100);
    expect(stored[0].until).toBeLessThanOrEqual(after_24h(before));
  });

  it("snoozeItem with monday sets until to next Monday 9 AM", () => {
    snoozeItem("item-1", "monday", "Test");
    const stored = JSON.parse(localStorage.getItem("nirman:snoozed-items")!);
    const monday = new Date(stored[0].until);
    expect(monday.getDay()).toBe(1); // Monday
    expect(monday.getHours()).toBe(9);
  });

  it("snoozeItem stores the correct durationLabel", () => {
    snoozeItem("item-1", "4h", "Test");
    const stored = JSON.parse(localStorage.getItem("nirman:snoozed-items")!);
    expect(stored[0].durationLabel).toBe("4 hours");
  });

  it("snoozeItem with monday stores 'until Monday' label", () => {
    snoozeItem("item-1", "monday", "Test");
    const stored = JSON.parse(localStorage.getItem("nirman:snoozed-items")!);
    expect(stored[0].durationLabel).toBe("until Monday");
  });

  it("snoozeItem replaces an existing snooze (dedupes by id)", () => {
    snoozeItem("item-1", "4h", "First");
    snoozeItem("item-1", "24h", "Second");
    const stored = JSON.parse(localStorage.getItem("nirman:snoozed-items")!);
    expect(stored).toHaveLength(1);
    expect(stored[0].label).toBe("Second");
    expect(stored[0].durationLabel).toBe("24 hours");
  });

  it("unsnoozeItem removes the item", () => {
    snoozeItem("item-1", "4h", "Test");
    expect(isSnoozed("item-1")).toBe(true);
    unsnoozeItem("item-1");
    expect(isSnoozed("item-1")).toBe(false);
  });

  it("clearAllSnoozed removes all items", () => {
    snoozeItem("item-1", "4h", "A");
    snoozeItem("item-2", "24h", "B");
    clearAllSnoozed();
    expect(isSnoozed("item-1")).toBe(false);
    expect(isSnoozed("item-2")).toBe(false);
  });

  it("auto-expires items whose until has passed", () => {
    // Manually insert an expired item
    const expired = [{ id: "old", until: Date.now() - 1000, label: "Old", durationLabel: "4 hours" }];
    localStorage.setItem("nirman:snoozed-items", JSON.stringify(expired));
    // isSnoozed should filter it out
    expect(isSnoozed("old")).toBe(false);
    // And the store should be cleaned up
    const stored = JSON.parse(localStorage.getItem("nirman:snoozed-items")!);
    expect(stored).toHaveLength(0);
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("nirman:snoozed-items", "not-json");
    expect(isSnoozed("item-1")).toBe(false);
  });
});

function after_24h(before: number) {
  return before + 24 * 60 * 60 * 1000 + 100;
}

describe("useSnooze hook", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("starts with an empty items list", () => {
    const { result } = renderHook(() => useSnooze());
    expect(result.current.items).toEqual([]);
  });

  it("loads existing snoozed items on mount", async () => {
    snoozeItem("item-1", "4h", "Test");
    const { result } = renderHook(() => useSnooze());
    await waitFor(() => expect(result.current.items.length).toBe(1));
    expect(result.current.items[0]!.id).toBe("item-1");
  });

  it("snooze() adds an item reactively", async () => {
    const { result } = renderHook(() => useSnooze());
    await waitFor(() => expect(result.current.items).toEqual([]));
    act(() => result.current.snooze("item-1", "4h", "Test"));
    await waitFor(() => expect(result.current.items.length).toBe(1));
    expect(result.current.items[0]!.id).toBe("item-1");
  });

  it("unsnooze() removes an item reactively", async () => {
    snoozeItem("item-1", "4h", "Test");
    const { result } = renderHook(() => useSnooze());
    await waitFor(() => expect(result.current.items.length).toBe(1));
    act(() => result.current.unsnooze("item-1"));
    await waitFor(() => expect(result.current.items.length).toBe(0));
  });

  it("clearAll() empties the list", async () => {
    snoozeItem("item-1", "4h", "A");
    snoozeItem("item-2", "24h", "B");
    const { result } = renderHook(() => useSnooze());
    await waitFor(() => expect(result.current.items.length).toBe(2));
    act(() => result.current.clearAll());
    await waitFor(() => expect(result.current.items.length).toBe(0));
  });

  it("isSnoozed() returns true for a snoozed item", async () => {
    snoozeItem("item-1", "4h", "Test");
    const { result } = renderHook(() => useSnooze());
    await waitFor(() => expect(result.current.items.length).toBe(1));
    expect(result.current.isSnoozed("item-1")).toBe(true);
    expect(result.current.isSnoozed("item-2")).toBe(false);
  });
});
