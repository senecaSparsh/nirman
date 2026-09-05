/**
 * Sentry Client Config
 * =====================
 *
 * Client-side Sentry configuration. Initializes error tracking in the
 * browser. Only active if NEXT_PUBLIC_SENTRY_DSN is set.
 *
 * To enable client-side tracking, set NEXT_PUBLIC_SENTRY_DSN in your
 * env (must be NEXT_PUBLIC_ so it's exposed to the browser).
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "",
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  ignoreErrors: [
    "module factory is not available",
    "ChunkLoadError",
    "Failed to fetch dynamically imported module",
    "Loading chunk",
    "Loading CSS chunk",
  ],
});
