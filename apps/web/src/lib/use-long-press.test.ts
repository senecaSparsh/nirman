// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLongPress } from "./use-long-press";

// Mock haptic
vi.mock("@/lib/haptic", () => ({
  haptic: vi.fn(),
}));

function makeTouchEvent(clientX: number, clientY: number = 0): React.TouchEvent {
  return {
    touches: [{ clientX, clientY } as unknown as React.Touch],
  } as unknown as React.TouchEvent;
}

function makeMouseEvent(clientX: number, clientY: number = 0): React.MouseEvent {
  return { clientX, clientY } as unknown as React.MouseEvent;
}

describe("useLongPress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with pressing=false", () => {
    const { result } = renderHook(() => useLongPress(vi.fn()));
    expect(result.current.pressing).toBe(false);
  });

  it("sets pressing=true on touch start", () => {
    const { result } = renderHook(() => useLongPress(vi.fn()));
    act(() => {
      result.current.bind.onTouchStart(makeTouchEvent(100, 200));
    });
    expect(result.current.pressing).toBe(true);
  });

  it("fires onLongPress after the default 500ms", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => {
      result.current.bind.onTouchStart(makeTouchEvent(100, 200));
    });
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).toHaveBeenCalledWith(100, 200);
  });

  it("fires onLongPress after a custom ms", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, 1000));
    act(() => {
      result.current.bind.onTouchStart(makeTouchEvent(50, 60));
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).toHaveBeenCalledWith(50, 60);
  });

  it("does not fire if touch ends before the delay", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => {
      result.current.bind.onTouchStart(makeTouchEvent(100, 200));
    });
    act(() => {
      result.current.bind.onTouchEnd();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.pressing).toBe(false);
  });

  it("cancels on significant movement (>10px)", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => {
      result.current.bind.onTouchStart(makeTouchEvent(100, 100));
    });
    act(() => {
      result.current.bind.onTouchMove(makeTouchEvent(120, 100)); // 20px horizontal
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    expect(result.current.pressing).toBe(false);
  });

  it("cancels on significant vertical movement (>10px)", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => {
      result.current.bind.onTouchStart(makeTouchEvent(100, 100));
    });
    act(() => {
      result.current.bind.onTouchMove(makeTouchEvent(100, 115)); // 15px vertical
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("does not cancel on small movement (≤10px)", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => {
      result.current.bind.onTouchStart(makeTouchEvent(100, 100));
    });
    act(() => {
      result.current.bind.onTouchMove(makeTouchEvent(105, 100)); // 5px
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).toHaveBeenCalled();
  });

  it("works with mouse events", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => {
      result.current.bind.onMouseDown(makeMouseEvent(30, 40));
    });
    expect(result.current.pressing).toBe(true);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).toHaveBeenCalledWith(30, 40);
  });

  it("mouseUp cancels the press", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => {
      result.current.bind.onMouseDown(makeMouseEvent(30, 40));
    });
    act(() => {
      result.current.bind.onMouseUp();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("mouseLeave cancels the press", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => {
      result.current.bind.onMouseDown(makeMouseEvent(30, 40));
    });
    act(() => {
      result.current.bind.onMouseLeave();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("touchCancel cancels the press", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => {
      result.current.bind.onTouchStart(makeTouchEvent(100, 200));
    });
    act(() => {
      result.current.bind.onTouchCancel();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("sets pressing=false after long press fires", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => {
      result.current.bind.onTouchStart(makeTouchEvent(100, 200));
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.pressing).toBe(false);
  });
});
