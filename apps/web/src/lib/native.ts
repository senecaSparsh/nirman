"use client";

import { Capacitor } from "@capacitor/core";

/**
 * Native-app bridge — detection + one-time wiring for the Capacitor shell
 * (apps/mobile). On the open web every function here is a no-op or returns
 * web-safe defaults, so it's safe to call unconditionally.
 *
 * What the shell changes vs. plain Safari/Chrome:
 *  - No browser chrome; status bar overlays the WebView (CSS env(safe-area-*)
 *    already handles the notch).
 *  - Push notifications come from APNs/FCM via @capacitor/push-notifications
 *    (the Web Push API doesn't exist inside WKWebView). Tokens are stored
 *    in the same PushSubscription table with a "capacitor://" endpoint —
 *    see packages/services/src/push.ts for the sender.
 *  - navigator.vibrate is unavailable on iOS — lib/haptic.ts delegates to
 *    @capacitor/haptics here instead.
 *  - Android hardware back button needs an explicit history.back().
 */

export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

export function nativePlatform(): "ios" | "android" | "web" {
  if (!isNativeApp()) return "web";
  return Capacitor.getPlatform() as "ios" | "android";
}

/** The PushSubscription.endpoint scheme used for native device tokens. */
export const NATIVE_ENDPOINT_PREFIX = "capacitor://";

export function nativeEndpoint(token: string, platform: string): string {
  return `${NATIVE_ENDPOINT_PREFIX}${platform}/${token}`;
}

/**
 * Register for APNs/FCM push and upload the device token.
 * Call after the user has granted (or already granted) permission.
 * Resolves true when a token reached the server.
 */
export async function registerNativePush(): Promise<boolean> {
  if (!isNativeApp()) return false;
  // Android push needs a Firebase project (google-services.json + FCM
  // sender). Until that's wired, registering there would throw in native
  // code — iOS only for now.
  if (nativePlatform() !== "ios") return false;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const platform = nativePlatform();

  return new Promise((resolve) => {
    let settled = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      for (const h of handles) void h.remove();
      resolve(ok);
    };

    void PushNotifications.addListener(
      "registration",
      async ({ value: token }) => {
        try {
          const res = await fetch("/api/notifications/native-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, platform }),
          });
          done(res.ok);
        } catch {
          done(false);
        }
      },
    ).then((h) => handles.push(h));
    void PushNotifications.addListener("registrationError", () =>
      done(false),
    ).then((h) => handles.push(h));
    void PushNotifications.register();
    // Token usually arrives <1s; don't hang the caller on odd devices.
    setTimeout(() => done(false), 15000);
  });
}

let initialized = false;

/**
 * One-time native wiring — call from a client component mounted in the /m
 * layout. Idempotent.
 */
export async function initNativeApp(): Promise<void> {
  if (!isNativeApp() || initialized) return;
  initialized = true;

  // ── Status bar follows the app's own dark toggle (html.dark), not the
  // OS theme — the shell lets users flip independent of the system.
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    const syncStatusBar = () => {
      const dark = document.documentElement.classList.contains("dark");
      void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(
        () => {},
      );
    };
    syncStatusBar();
    new MutationObserver(syncStatusBar).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    if (nativePlatform() === "android") {
      const dark = document.documentElement.classList.contains("dark");
      void StatusBar.setBackgroundColor({
        color: dark ? "#16140f" : "#faf8f4",
      }).catch(() => {});
    }
  } catch {
    // Plugin unavailable — cosmetic only.
  }

  // ── Android hardware back → in-app history back (only when there's
  // somewhere to go; on the root the system exits the app by default).
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void App.exitApp();
    });
  } catch {
    // iOS has no hardware back.
  }

  // ── Print — window.print() is a no-op inside WKWebView. The local
  // Print plugin (apps/mobile/ios/.../PrintPlugin.swift +
  // android/.../PrintPlugin.java) bridges to the platform print dialog,
  // which also covers "Save as PDF". Installed unconditionally in the
  // shell so existing print buttons just work.
  try {
    const { registerPlugin } = await import("@capacitor/core");
    const Print = registerPlugin<{ print(opts: { jobName?: string }): Promise<void> }>("Print");
    window.print = () => {
      Print.print({ jobName: document.title }).catch(() => {});
    };
  } catch {
    // Plugin bridge unavailable — print stays a no-op.
  }

  // ── Push taps deep-link into the app. payload.href is set by the
  // sender (packages/services/src/push.ts) — same field web push uses.
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        const href = action.notification?.data?.href;
        if (typeof href === "string" && href.startsWith("/")) {
          window.location.href = href;
        }
      },
    );

    // Returning users who already granted permission: refresh the token
    // every launch (APNs tokens can rotate). New users grant via the
    // notifications settings toggle — no permission prompt before login.
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === "granted") {
      void registerNativePush();
    }
  } catch {
    // Push unavailable (e.g. simulator without APNs entitlement).
  }
}
