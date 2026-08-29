/* Nirman Field PWA — Service Worker
 *
 * Offline-first app shell caching for the /field mobile receiving flow.
 * Strategy:
 *   - Precache the app shell (start_url + manifest + icon) on install.
 *   - Navigation requests: network-first, fall back to cached shell when offline.
 *   - Static assets (_next/static, images): stale-while-revalidate.
 *   - API GETs: network-first with cache fallback (so the field page can show
 *     the last-known receivable POs list offline).
 *   - API POSTs (mutations): NEVER cached — they go through the IndexedDB offline
 *     queue in the page, not the service worker, so conflict resolution stays in
 *     the app layer where server-wins logic lives.
 *
 * Background Sync: listens for the "sync" event tagged "nirman-queue" and posts
 * a message to all clients to trigger syncQueue(). The clients own the queue +
 * fetch logic (with credentials); the SW is just the wake-up trigger.
 */

const SHELL_CACHE = "nirman-shell-v2";
const ASSET_CACHE = "nirman-assets-v1";
const API_CACHE = "nirman-api-v1";

const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon.svg", "/field", "/m/site/field"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Best-effort precache; ignore failures (offline install is fine).
      await Promise.allSettled(SHELL_URLS.map((u) => cache.add(u)));
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![SHELL_CACHE, ASSET_CACHE, API_CACHE].includes(k))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never intercept non-GET (mutations go through the page's offline queue).
  if (req.method !== "GET") return;

  // Never intercept auth endpoints.
  if (url.pathname.startsWith("/api/auth/")) return;

  // Navigation requests — network-first, fall back to cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || caches.match("/") || Response.error();
        }
      })(),
    );
    return;
  }

  // Static assets — stale-while-revalidate.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$/)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
    return;
  }

  // API GETs — network-first with cache fallback (last-known data offline).
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(API_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || Response.error();
        }
      })(),
    );
    return;
  }
});

// Background Sync — wake up clients to flush the offline queue.
self.addEventListener("sync", (event) => {
  if (event.tag === "nirman-queue") {
    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        for (const c of clients) c.postMessage({ type: "SYNC_QUEUE" });
      })(),
    );
  }
});

// Push message from the page (manual sync trigger when SW has no sync event).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// ── Push notifications ──────────────────────────────────────────
// Listens for push events from the server (web push API) and displays
// a notification. The notification payload is JSON: { title, body, icon, href }.
self.addEventListener("push", (event) => {
  let payload = { title: "Nirman", body: "New update", href: "/m/home" };
  try {
    if (event.data) {
      const text = event.data.text();
      payload = JSON.parse(text);
    }
  } catch {
    // If JSON parse fails, use the raw text as body
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || "/icon.svg",
    badge: "/icon.svg",
    data: { href: payload.href || "/m/home" },
    vibrate: [100, 50, 100],
    tag: payload.tag || "nirman-notification",
    requireInteraction: payload.requireInteraction || false,
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

// ── Notification click — focus/open the app and navigate ─────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/m/home";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // If a client is already open, focus it and navigate
      for (const client of allClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({ type: "NAVIGATE", href });
          return;
        }
      }

      // Otherwise open a new window
      await self.clients.openWindow(href);
    })(),
  );
});
