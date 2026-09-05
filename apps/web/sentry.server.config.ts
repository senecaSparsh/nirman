/**
 * Sentry Server Config
 * =====================
 *
 * Server-side Sentry configuration. The actual init happens in
 * src/instrumentation.ts (conditionally — only if SENTRY_DSN is set).
 *
 * This file is required by @sentry/nextjs for the build process to
 * wire up source maps and server-side error capturing.
 *
 * To enable Sentry:
 *  1. Create a free account at https://sentry.io
 *  2. Get your DSN from Project Settings → Client Keys
 *  3. Set SENTRY_DSN in your .env (dev) or Render dashboard (prod)
 *  4. (Optional) Set SENTRY_AUTH_TOKEN for source map uploads
 *
 * Without SENTRY_DSN, Sentry is completely disabled — zero overhead.
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || "",
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
  sendDefaultPii: false,
  ignoreErrors: [
    "module factory is not available",
    "ChunkLoadError",
    "Failed to fetch dynamically imported module",
    "Loading chunk",
    "Loading CSS chunk",
  ],
});
