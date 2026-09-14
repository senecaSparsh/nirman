"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * usePushNotifications — manages browser notification permission and
 * push subscription. Asks the user for permission, subscribes to the
 * service worker's push manager, and sends the subscription to the server.
 *
 * Usage:
 *   const { permission, subscribed, requestPermission, unsubscribe } = usePushNotifications();
 *   // Show a "Enable notifications" button when permission === "default"
 *   // Call requestPermission() to ask the user
 */

type PermissionState = "default" | "granted" | "denied" | "unsupported";

/** Convert a base64url VAPID public key to the Uint8Array pushManager wants. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<PermissionState>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check current permission on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PermissionState);

    // Check if already subscribed
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setSubscribed(!!sub))
        .catch(() => {});
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    setLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);

      if (result === "granted") {
        // Subscribe to push via the service worker. Chrome/Android REQUIRE a
        // VAPID applicationServerKey — fetch the server's public key first.
        // If push isn't configured server-side (404), subscribe anyway without
        // a key (Firefox allows it); Chrome will throw and we stay unsubscribed.
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.ready;
          try {
            const vapidRes = await fetch("/api/notifications/vapid-public-key").catch(() => null);
            const vapidKey = vapidRes?.ok
              ? ((await vapidRes.json()) as { publicKey?: string }).publicKey
              : undefined;

            const applicationServerKey: BufferSource | undefined = vapidKey
              ? (urlBase64ToUint8Array(vapidKey) as unknown as Uint8Array<ArrayBuffer>)
              : undefined;
            const sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey,
            });
            setSubscribed(true);

            // Send subscription to server (best-effort)
            await fetch("/api/notifications/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                endpoint: sub.endpoint,
                keys: sub.toJSON().keys,
              }),
            }).catch(() => {});
          } catch {
            // Push subscription failed — notifications still work locally
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          // Notify server
          await fetch("/api/notifications/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => {});
        }
        setSubscribed(false);
      } catch {
        // ignore
      }
    }
  }, []);

  return {
    permission,
    subscribed,
    loading,
    requestPermission,
    unsubscribe,
  };
}
