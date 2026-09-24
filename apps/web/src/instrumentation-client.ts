/**
 * Sentry Client Config (instrumentation-client.ts — the current convention;
 * supersedes the legacy sentry.client.config.ts).
 *
 * Initializes error tracking in the browser. Only active if
 * NEXT_PUBLIC_SENTRY_DSN is set — without it `enabled: false` makes this a
 * zero-overhead no-op.
 *
 * To enable: set NEXT_PUBLIC_SENTRY_DSN in .env (dev) or Coolify env (prod).
 * It must be NEXT_PUBLIC_ so Next.js inlines it into the client bundle.
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "",
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // 100% in dev, 10% in production.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Session Replay: 10% of sessions, 100% of sessions with errors.
  // Replays help reproduce field-worker bugs we can't see locally.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  enableLogs: true,

  // Don't send PII — user names/phones stay out of Sentry.
  sendDefaultPii: false,

  integrations: [Sentry.replayIntegration()],

  // Stale-chunk and cache-desync noise is handled by ChunkErrorRecovery +
  // the service worker — don't report it as an error.
  ignoreErrors: [
    "module factory is not available",
    "ChunkLoadError",
    "Failed to fetch dynamically imported module",
    "Loading chunk",
    "Loading CSS chunk",
  ],
});

// App Router navigation transitions become Sentry spans.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
