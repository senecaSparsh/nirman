// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useRecentlyViewed,
  useTrackRecent,
  pushRecent,
  clearRecent,
  type RecentItem,
} from "./use-recently-viewed";

const STORAGE_KEY = "nirman.recent";

function seedStorage(items: RecentItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

describe("useRecentlyViewed", () => {
  beforeEach(() => {
    localStorage.clear();
    // Spy on dispatchEvent but let it call through so event listeners fire
    vi.spyOn(window, "dispatchEvent");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initial state: empty list when storage empty", async () => {
    const { result } = renderHook(() => useRecentlyViewed());
    await waitFor(() => {
      expect(result.current).toEqual([]);
    });
  });

  it("loads existing items from localStorage on mount", async () => {
    seedStorage([
      { type: "sale", id: "1", label: "Sale 1", href: "/sales/1", ts: 100 },
    ]);
    const { result } = renderHook(() => useRecentlyViewed());
    await waitFor(() => {
      expect(result.current).toHaveLength(1);
      expect(result.current[0]!.id).toBe("1");
    });
  });

  it("pushRecent prepends new item and dispatches event", () => {
    pushRecent({ type: "sale", id: "2", label: "Sale 2", href: "/sales/2" });
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed[0].id).toBe("2");
    expect(parsed[0].ts).toBeGreaterThan(0);
    expect(window.dispatchEvent).toHaveBeenCalled();
    const event = vi.mocked(window.dispatchEvent).mock.calls[0]![0] as CustomEvent;
    expect(event.type).toBe("nirman:recent-updated");
  });

  it("pushRecent deduplicates by {type, id} — moves existing to front", () => {
    seedStorage([
      { type: "sale", id: "1", label: "Sale 1", href: "/sales/1", ts: 100 },
      { type: "sale", id: "2", label: "Sale 2", href: "/sales/2", ts: 200 },
    ]);
    pushRecent({ type: "sale", id: "1", label: "Sale 1", href: "/sales/1" });
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe("1"); // moved to front
    expect(parsed[1].id).toBe("2");
  });

  it("pushRecent caps list at 10 items", () => {
    const items: RecentItem[] = Array.from({ length: 12 }, (_, i) => ({
      type: "sale",
      id: String(i),
      label: `Sale ${i}`,
      href: `/sales/${i}`,
      ts: i,
    }));
    seedStorage(items);
    pushRecent({ type: "sale", id: "99", label: "New", href: "/sales/99" });
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(parsed).toHaveLength(10);
    expect(parsed[0].id).toBe("99");
  });

  it("useRecentlyViewed reactively updates when pushRecent fires", async () => {
    const { result } = renderHook(() => useRecentlyViewed());
    await waitFor(() => {
      expect(result.current).toEqual([]);
    });

    act(() => {
      pushRecent({ type: "sale", id: "5", label: "Sale 5", href: "/sales/5" });
    });

    await waitFor(() => {
      expect(result.current).toHaveLength(1);
      expect(result.current[0]!.id).toBe("5");
    });
  });

  it("clearRecent empties storage and dispatches event", () => {
    seedStorage([
      { type: "sale", id: "1", label: "Sale 1", href: "/sales/1", ts: 100 },
    ]);
    clearRecent();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([]);
    expect(window.dispatchEvent).toHaveBeenCalled();
  });

  it("clearRecent updates the hook reactively", async () => {
    seedStorage([
      { type: "sale", id: "1", label: "Sale 1", href: "/sales/1", ts: 100 },
    ]);
    const { result } = renderHook(() => useRecentlyViewed());
    await waitFor(() => {
      expect(result.current).toHaveLength(1);
    });

    act(() => {
      clearRecent();
    });

    await waitFor(() => {
      expect(result.current).toEqual([]);
    });
  });

  it("useTrackRecent returns a stable callback that pushes", () => {
    const { result, rerender } = renderHook(() => useTrackRecent());
    const cb1 = result.current;
    // stable across re-renders of the same hook instance
    rerender();
    expect(result.current).toBe(cb1);

    act(() => {
      cb1({ type: "material", id: "m1", label: "Cement", href: "/materials/m1" });
    });
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(parsed[0].id).toBe("m1");
  });

  it("corrupted localStorage returns empty list", async () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    const { result } = renderHook(() => useRecentlyViewed());
    await waitFor(() => {
      expect(result.current).toEqual([]);
    });
  });

  it("non-array localStorage returns empty list", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: "bar" }));
    const { result } = renderHook(() => useRecentlyViewed());
    await waitFor(() => {
      expect(result.current).toEqual([]);
    });
  });

  it("pushRecent handles different types independently (dedup is type+id)", () => {
    seedStorage([
      { type: "sale", id: "1", label: "Sale 1", href: "/sales/1", ts: 100 },
    ]);
    // same id, different type — should NOT dedup.
    pushRecent({ type: "material", id: "1", label: "Mat 1", href: "/materials/1" });
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].type).toBe("material");
  });
});
