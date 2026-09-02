/**
 * Haptic feedback — wraps navigator.vibrate with graceful fallback.
 *
 * Usage: call the appropriate method on tap interactions that need
 * tactile confirmation:
 * - haptic.light()    — light tap (status change, chip select)
 * - haptic.medium()   — medium tap (bulk action, mark all)
 * - haptic.success()  — strong tap + pattern (form submit success)
 * - haptic.error()    — error pattern (form validation failure)
 * - haptic(pattern)   — custom pattern (function call, backwards compat)
 *
 * No-op on desktop browsers (no vibration API) and iOS Safari (which
 * doesn't support the Vibration API — the tap sound is the feedback there).
 */

function vibrate(pattern: number | number[] = 10): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw on certain patterns — ignore.
  }
}

type HapticFn = ((pattern?: number | number[]) => void) & {
  light: () => void;
  medium: () => void;
  success: () => void;
  error: () => void;
};

const hapticFn = vibrate as HapticFn;
hapticFn.light = () => vibrate(10);
hapticFn.medium = () => vibrate(20);
hapticFn.success = () => vibrate([10, 30, 10]);
hapticFn.error = () => vibrate([30, 50, 30]);

export const haptic = hapticFn;
