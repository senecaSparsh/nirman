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

export function usePushNotifications() {
  const [permission, setPermission] = useState<PermissionState>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check current permission on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
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
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);

      if (result === "granted") {
        // Subscribe to push via the service worker
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.ready;
          // Try to subscribe with a dummy VAPID key — in production this
          // would come from the server. For now, we just register for
          // local notifications (shown by the SW on push events).
          try {
            const sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              // VAPID public key — replace with real key when server-side push is configured
              applicationServerKey: undefined,
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
