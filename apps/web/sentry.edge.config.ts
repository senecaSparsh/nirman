/**
 * Sentry Edge Config — middleware/edge-runtime error capture.
 * Loaded by src/instrumentation.ts when NEXT_RUNTIME === "edge".
 * No-op without SENTRY_DSN.
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || "",
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  sendDefaultPii: false,
});
