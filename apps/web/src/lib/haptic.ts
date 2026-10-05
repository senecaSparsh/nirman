/**
 * Haptic feedback — Capacitor Haptics inside the native app, navigator.vibrate
 * on the web (Android Chrome), no-op elsewhere.
 *
 * Usage: call the appropriate method on tap interactions that need
 * tactile confirmation:
 * - haptic.light()    — light tap (status change, chip select)
 * - haptic.medium()   — medium tap (bulk action, mark all)
 * - haptic.success()  — strong tap + pattern (form submit success)
 * - haptic.error()    — error pattern (form validation failure)
 * - haptic(pattern)   — custom pattern (function call, backwards compat)
 *
 * No-op on desktop browsers and iOS Safari (which doesn't support the
 * Vibration API — inside the app the same calls drive the Taptic Engine).
 */

import { isNativeApp } from "@/lib/native";

type HapticsMod = typeof import("@capacitor/haptics");

let hapticsPromise: Promise<HapticsMod> | null = null;
function capHaptics(): Promise<HapticsMod> | null {
  if (!isNativeApp()) return null;
  hapticsPromise ??= import("@capacitor/haptics");
  return hapticsPromise;
}

/** Fire a native haptic; resolves false when not running in the shell. */
function nativeFire(
  run: (mod: HapticsMod) => Promise<void>,
): boolean {
  const mod = capHaptics();
  if (!mod) return false;
  void mod.then(run).catch(() => {});
  return true;
}

function vibrate(pattern: number | number[] = 10): void {
  if (nativeFire((m) => m.Haptics.vibrate({ duration: Array.isArray(pattern) ? (pattern[0] ?? 10) : pattern }))) {
    return;
  }
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
hapticFn.light = () => {
  if (!nativeFire((m) => m.Haptics.impact({ style: m.ImpactStyle.Light }))) {
    vibrate(10);
  }
};
hapticFn.medium = () => {
  if (!nativeFire((m) => m.Haptics.impact({ style: m.ImpactStyle.Medium }))) {
    vibrate(20);
  }
};
hapticFn.success = () => {
  if (
    !nativeFire((m) =>
      m.Haptics.notification({ type: m.NotificationType.Success }),
    )
  ) {
    vibrate([10, 30, 10]);
  }
};
hapticFn.error = () => {
  if (
    !nativeFire((m) =>
      m.Haptics.notification({ type: m.NotificationType.Error }),
    )
  ) {
    vibrate([30, 50, 30]);
  }
};

export const haptic = hapticFn;
