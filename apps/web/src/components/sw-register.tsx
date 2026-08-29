"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { syncQueue } from "@/lib/offline/queue";

/**
 * Registers the field PWA service worker and wires the Background Sync
 * wake-up message to the offline queue's sync processor. Mounted once in
 * the root layout so every page gets offline app-shell caching + sync.
 */
export function SwRegister() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Only register in production + secure contexts; in dev the SW caching
    // interferes with HMR and Turbopack. The offline queue still works in dev
    // (it just syncs immediately since navigator.onLine is true).
    if (process.env.NODE_ENV !== "production") return;

    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (cancelled) return;
        // If a new SW takes over, reload once so the latest shell is active.
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              reg.waiting?.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch((err) => console.error("[sw] registration failed:", err));

    const onControllerChange = () => window.location.reload();
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "SYNC_QUEUE") {
        // Background Sync woke us — flush the queue.
        void syncQueue().catch((err) => console.error("[sw] sync failed:", err));
      }
      if (event.data?.type === "NAVIGATE" && event.data?.href) {
        // Notification click — navigate to the target page
        router.push(event.data.href);
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.addEventListener("message", onMessage);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [router]);

  return null;
}
