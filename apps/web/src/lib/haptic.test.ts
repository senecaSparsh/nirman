/**
 * Unit tests for haptic feedback helper.
 *
 * The haptic module wraps navigator.vibrate with graceful fallback.
 * In the test environment (jsdom) navigator.vibrate is not available,
 * so all calls should be no-ops without throwing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { haptic } from "./haptic";

describe("haptic", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is a function", () => {
    expect(typeof haptic).toBe("function");
  });

  it("has light, medium, success, error methods", () => {
    expect(typeof haptic.light).toBe("function");
    expect(typeof haptic.medium).toBe("function");
    expect(typeof haptic.success).toBe("function");
    expect(typeof haptic.error).toBe("function");
  });

  it("does not throw when navigator.vibrate is unavailable", () => {
    expect(() => haptic()).not.toThrow();
    expect(() => haptic.light()).not.toThrow();
    expect(() => haptic.medium()).not.toThrow();
    expect(() => haptic.success()).not.toThrow();
    expect(() => haptic.error()).not.toThrow();
  });

  it("calls navigator.vibrate when available", () => {
    const vibrateSpy = vi.fn();
    navigator.vibrate = vibrateSpy;

    haptic(15);
    expect(vibrateSpy).toHaveBeenCalledWith(15);

    haptic.light();
    expect(vibrateSpy).toHaveBeenCalledWith(10);

    haptic.medium();
    expect(vibrateSpy).toHaveBeenCalledWith(20);

    haptic.success();
    expect(vibrateSpy).toHaveBeenCalledWith([10, 30, 10]);

    haptic.error();
    expect(vibrateSpy).toHaveBeenCalledWith([30, 50, 30]);

    // @ts-expect-error — vibrate is not optional in Navigator type, but we need to clean up
    delete navigator.vibrate;
  });

  it("default pattern is 10", () => {
    const vibrateSpy = vi.fn();
    navigator.vibrate = vibrateSpy;

    haptic();
    expect(vibrateSpy).toHaveBeenCalledWith(10);

    // @ts-expect-error — cleanup
    delete navigator.vibrate;
  });

  it("accepts custom array pattern", () => {
    const vibrateSpy = vi.fn();
    navigator.vibrate = vibrateSpy;

    haptic([100, 50, 100]);
    expect(vibrateSpy).toHaveBeenCalledWith([100, 50, 100]);

    // @ts-expect-error — cleanup
    delete navigator.vibrate;
  });

  it("does not throw if navigator.vibrate throws", () => {
    navigator.vibrate = () => {
      throw new Error("Pattern not supported");
    };

    expect(() => haptic([999])).not.toThrow();
    expect(() => haptic.light()).not.toThrow();

    // @ts-expect-error — cleanup
    delete navigator.vibrate;
  });
});
