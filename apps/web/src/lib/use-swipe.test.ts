// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSwipeAction } from "./use-swipe";

// Mock haptic so it doesn't try to call navigator.vibrate
vi.mock("@/lib/haptic", () => ({
  haptic: vi.fn(),
}));

function makeTouchEvent(clientX: number, clientY: number = 0): React.TouchEvent {
  return {
    touches: [{ clientX, clientY } as unknown as React.Touch],
  } as unknown as React.TouchEvent;
}

describe("useSwipeAction", () => {
  it("starts with offset=0 and open=false", () => {
    const { result } = renderHook(() =>
      useSwipeAction({ actions: [{ label: "Delete", color: "#f00", onPress: vi.fn() }] }),
    );
    expect(result.current.offset).toBe(0);
    expect(result.current.open).toBe(false);
  });

  it("calculates actionWidth as maxSwipe / actions.length (capped at 80)", () => {
    const { result } = renderHook(() =>
      useSwipeAction({ actions: [{ label: "A", color: "#f00", onPress: vi.fn() }] }),
    );
    // maxSwipe=160, 1 action → 160, but capped at 80
    expect(result.current.actionWidth).toBe(80);
  });

  it("calculates actionWidth for 2 actions", () => {
    const { result } = renderHook(() =>
      useSwipeAction({
        actions: [
          { label: "A", color: "#f00", onPress: vi.fn() },
          { label: "B", color: "#0f0", onPress: vi.fn() },
        ],
      }),
    );
    // 160 / 2 = 80, capped at 80
    expect(result.current.actionWidth).toBe(80);
  });

  it("calculates actionWidth for 3 actions (160/3 ≈ 53)", () => {
    const { result } = renderHook(() =>
      useSwipeAction({
        actions: [
          { label: "A", color: "#f00", onPress: vi.fn() },
          { label: "B", color: "#0f0", onPress: vi.fn() },
          { label: "C", color: "#00f", onPress: vi.fn() },
        ],
      }),
    );
    expect(result.current.actionWidth).toBe(Math.min(160 / 3, 80));
  });

  it("moving touch left sets a negative offset", () => {
    const { result } = renderHook(() =>
      useSwipeAction({ actions: [{ label: "Delete", color: "#f00", onPress: vi.fn() }] }),
    );
    act(() => {
      result.current.bind.onTouchStart(makeTouchEvent(100));
    });
    act(() => {
      result.current.bind.onTouchMove(makeTouchEvent(60));
    });
    expect(result.current.offset).toBeLessThan(0);
  });

  it("does not move on vertical swipes (horizontal=null → false)", () => {
    const { result } = renderHook(() =>
      useSwipeAction({ actions: [{ label: "Delete", color: "#f00", onPress: vi.fn() }] }),
    );
    act(() => {
      result.current.bind.onTouchStart(makeTouchEvent(100, 100));
    });
    // Move mostly vertically
    act(() => {
      result.current.bind.onTouchMove(makeTouchEvent(102, 200));
    });
    expect(result.current.offset).toBe(0);
  });

  it("releases past threshold opens the action", () => {
    const { result } = renderHook(() =>
      useSwipeAction({ actions: [{ label: "Delete", color: "#f00", onPress: vi.fn() }] }),
    );
    act(() => {
      result.current.bind.onTouchStart(makeTouchEvent(200));
    });
    act(() => {
      result.current.bind.onTouchMove(makeTouchEvent(120)); // -80, past half of 80
    });
    act(() => {
      result.current.bind.onTouchEnd();
    });
    expect(result.current.open).toBe(true);
    expect(result.current.offset).toBe(-80); // revealWidth = 80
  });

  it("releases before threshold snaps back to 0", () => {
    const { result } = renderHook(() =>
      useSwipeAction({ actions: [{ label: "Delete", color: "#f00", onPress: vi.fn() }] }),
    );
    act(() => {
      result.current.bind.onTouchStart(makeTouchEvent(200));
    });
    act(() => {
      result.current.bind.onTouchMove(makeTouchEvent(180)); // -20, not past half
    });
    act(() => {
      result.current.bind.onTouchEnd();
    });
    expect(result.current.open).toBe(false);
    expect(result.current.offset).toBe(0);
  });

  it("close() resets offset and open", () => {
    const { result } = renderHook(() =>
      useSwipeAction({ actions: [{ label: "Delete", color: "#f00", onPress: vi.fn() }] }),
    );
    // Open it first
    act(() => {
      result.current.bind.onTouchStart(makeTouchEvent(200));
    });
    act(() => {
      result.current.bind.onTouchMove(makeTouchEvent(100));
    });
    act(() => {
      result.current.bind.onTouchEnd();
    });
    expect(result.current.open).toBe(true);
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
    expect(result.current.offset).toBe(0);
  });

  it("ignores touchMove when not swiping", () => {
    const { result } = renderHook(() =>
      useSwipeAction({ actions: [{ label: "Delete", color: "#f00", onPress: vi.fn() }] }),
    );
    // Call touchMove without touchStart
    act(() => {
      result.current.bind.onTouchMove(makeTouchEvent(50));
    });
    expect(result.current.offset).toBe(0);
  });

  it("handles touchStart with no touches gracefully", () => {
    const { result } = renderHook(() =>
      useSwipeAction({ actions: [{ label: "Delete", color: "#f00", onPress: vi.fn() }] }),
    );
    act(() => {
      result.current.bind.onTouchStart({ touches: [] } as unknown as React.TouchEvent);
    });
    // Should not throw
    expect(result.current.offset).toBe(0);
  });
});
