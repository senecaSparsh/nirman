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

const SHELL_CACHE = "nirman-shell-v4";
const ASSET_CACHE = "nirman-assets-v3";
const API_CACHE = "nirman-api-v3";

const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon.svg", "/field", "/m/site/field"];

/**
 * Returns true for hostnames that point at a local dev server rather than a
 * production deployment. Used to bypass all SW caching in dev so Turbopack's
 * content-changing chunk URLs are always fetched fresh from the network.
 */
function isDevOrigin(hostname) {
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname === "::1"
  ) {
    return true;
  }
  // Private/LAN IPv4 ranges (RFC 1918) — dev servers accessed over the LAN.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 127) return true; // 127.0.0.0/8 (loopback, any octet)
  }
  // mDNS / .local hostnames commonly used for dev.
  if (hostname.endsWith(".local")) return true;
  return false;
}

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

  // Dev mode bypass: never cache anything when the SW is running against a
  // dev server. Turbopack reuses chunk URLs with changed content, so a
  // stale-while-revalidate strategy would serve old compiled JS and cause
  // ReferenceErrors from ghost variables that no longer exist in the source.
  // Cover all common dev origins: localhost, loopback, 0.0.0.0, IPv6 ::1,
  // and private/LAN IPv4 ranges (10.x, 172.16-31.x, 192.168.x) plus .local
  // mDNS hostnames — a leftover prod SW on a phone that previously loaded a
  // production build will otherwise stale-cache chunks served over the LAN.
  if (isDevOrigin(url.hostname)) {
    return; // Let the request go straight to the network.
  }

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

  // Static assets — stale-while-revalidate with deploy detection.
  // When a new build is deployed, Next.js content-hashes chunk filenames.
  // A user with a stale tab may request a chunk that no longer exists → 404.
  // On 404 for /_next/static/ chunks, we clear the asset cache and notify
  // all clients to reload (so they pick up the new HTML with new chunk hashes).
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$/)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then(async (res) => {
            if (res.ok) {
              cache.put(req, res.clone());
            } else if (res.status === 404 && url.pathname.startsWith("/_next/static/")) {
              // Chunk no longer exists (new deploy) — clear stale chunks
              // and tell clients to reload for the new chunk hashes.
              console.warn("[sw] chunk 404 — clearing asset cache + notifying clients:", url.pathname);
              await cache.keys().then((keys) =>
                Promise.all(
                  keys
                    .filter((k) => new URL(k.url).pathname.startsWith("/_next/static/"))
                    .map((k) => cache.delete(k)),
                ),
              );
              const clients = await self.clients.matchAll({ includeUncontrolled: true });
              for (const c of clients) c.postMessage({ type: "STALE_CHUNK" });
            }
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
