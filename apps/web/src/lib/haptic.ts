/**
 * Haptic feedback — wraps navigator.vibrate with graceful fallback.
 *
 * Usage: call haptic() on tap interactions that need tactile confirmation.
 * - haptic(10) — light tap (status change, chip select)
 * - haptic(20) — medium tap (bulk action, mark all)
 * - haptic(30) — strong tap (form submit success)
 * - haptic([10, 30, 10]) — pattern (error/warning)
 *
 * No-op on desktop browsers (no vibration API) and iOS Safari (which
 * doesn't support the Vibration API — the tap sound is the feedback there).
 */
export function haptic(pattern: number | number[] = 10): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw on certain patterns — ignore.
  }
}
