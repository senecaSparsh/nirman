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
    if (process.env.NODE_ENV !== "production") {
      // Dev mode: unregister any stale SW from a previous production build.
      // A leftover SW will stale-cache _next/static chunks and cause
      // ReferenceErrors when Turbopack recompiles and changes chunk content
      // at the same URL. This is especially common when accessing the dev
      // server from a LAN IP (e.g. 192.168.x.x) on a device that previously
      // loaded a production build — the SW's own dev bypass only covers
      // localhost/127.0.0.1, so it will have already served stale chunks for
      // the current page load by the time this code runs. Force a single
      // reload (guarded by a URL param so it can't loop) so the page
      // re-fetches fresh chunks with the SW now gone.
      const url = new URL(window.location.href);
      const alreadyCleared = url.searchParams.get("swclear") === "1";
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          if (regs.length === 0) return;
          return Promise.all(regs.map((reg) => reg.unregister().catch(() => {})));
        })
        .then((cleared) => {
          if (cleared && !alreadyCleared) {
            url.searchParams.set("swclear", "1");
            window.location.replace(url.toString());
          }
        })
        .catch(() => {});
      return;
    }

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
