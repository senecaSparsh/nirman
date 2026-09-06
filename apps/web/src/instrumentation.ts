/**
 * Next.js Instrumentation Hook
 * =============================
 *
 * Runs ONCE when the Next.js server starts (before any request is handled).
 * This is the correct place for:
 *
 *  1. **Environment variable validation** — fail fast before the server
 *     accepts traffic if required vars are missing.
 *  2. **Global unhandled rejection/catch handlers** — log errors that escape
 *     all try/catch blocks so they're visible in logs (and Sentry if enabled).
 *  3. **Sentry initialization** — if SENTRY_DSN is set, wire up error tracking
 *     before the app handles any request.
 *
 * This file is automatically detected by Next.js — no import needed.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the server (not in the edge runtime).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 1. Validate environment variables.
    const { validateEnv } = await import("./lib/env-validation");
    validateEnv();

    // 2. Initialize Sentry if configured (optional — no-op without SENTRY_DSN).
    const sentryDsn = process.env.SENTRY_DSN;
    if (sentryDsn) {
      try {
        const Sentry = await import("@sentry/nextjs");
        Sentry.init({
          dsn: sentryDsn,
          tracesSampleRate: 0.1, // 10% of transactions traced (perf)
          profilesSampleRate: 0.1, // 10% of profiles sampled
          environment: process.env.NODE_ENV,
          // Don't send PII.
          sendDefaultPii: false,
          // Filter out noisy non-errors.
          ignoreErrors: [
            "module factory is not available", // Turbopack cache desync (handled client-side)
            "ChunkLoadError", // Stale chunks (handled client-side)
            "Failed to fetch dynamically imported module", // Stale chunks
          ],
        });
        console.log("[instrumentation] Sentry initialized");
      } catch (err) {
        console.warn("[instrumentation] Sentry init failed (continuing without):", err);
      }
    }

    // 3. Global unhandled error/rejection handlers.
    // These catch errors that escape all try/catch blocks. Without them,
    // Node.js logs the error but the process may continue in a bad state.
    // With them, we log a clear structured message and (in production) let
    // the start wrapper's health check detect the degraded state.
    process.on("unhandledRejection", (reason, _promise) => {
      const msg = reason instanceof Error ? reason.message : String(reason);
      console.error("[unhandledRejection]", msg, reason);
      // Don't exit — the start wrapper's health check will catch a truly
      // broken state. Exiting here would cause unnecessary restarts for
      // non-fatal rejections (e.g. a failed background task).
    });

    process.on("uncaughtException", (err) => {
      console.error("[uncaughtException]", err.message, err.stack);
      // An uncaught exception means the process is in an undefined state.
      // In production, exit so the start wrapper can restart cleanly.
      // In dev, let the dev wrapper handle it.
      if (process.env.NODE_ENV === "production") {
        console.error("[uncaughtException] exiting process for clean restart");
        process.exit(1);
      }
    });

    console.log(
      `[instrumentation] server initialized ` +
        `(env: ${process.env.NODE_ENV}, sentry: ${sentryDsn ? "on" : "off"})`,
    );
  }
}
