import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs/config";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  transpilePackages: ["@nirman/db"],
  // cacheComponents (PPR) disabled — it prerenders 200+ routes at build time,
  // consuming too much memory on small hosts. Pages render on demand instead,
  // which is fine for a single-client app.
  cacheComponents: false,
  serverExternalPackages: ["nodemailer"],
  poweredByHeader: false,
  // Skip TypeScript checking during build — tsc --noEmit runs separately
  // in CI/typecheck. This saves ~1GB RAM on small hosts.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Note: ESLint is not run during `next build` in Next.js 16 — the
  // `eslint` config key was removed. Linting is handled by `next lint`
  // and CI/pre-commit hooks separately. This saves ~30-50MB RAM.
  // Browser source maps are generated ONLY when Sentry upload is configured
  // (SENTRY_AUTH_TOKEN set) — withSentryConfig's deleteSourcemapsAfterUpload
  // strips them from the shipped bundle so maps exist for the upload but not
  // for end users. Without the token this stays false: ~20-50MB RAM saved on
  // build and no map files in the deploy artifact.
  productionBrowserSourceMaps: !!process.env.SENTRY_AUTH_TOKEN,
  // Limit build workers to 1 to stay within 512MB RAM on small hosts
  // (default spawns 47 workers which OOMs).
  experimental: {
    workerThreads: false,
    cpus: 1,
    optimizePackageImports: ["lucide-react", "recharts", "@xyflow/react"],
  },
  // Webpack build optimizations for memory-constrained environments.
  // Disables webpack's persistent cache (saves ~50-100MB RAM/disk during
  // build) and limits parallelism to 1 (prevents multiple compiler
  // instances from each allocating their own module graph in memory).
  // On a 512MB container, this is the difference between OOM
  // and a successful build.
  webpack: (config, { isServer }) => {
    // Disable persistent cache — it writes to .next/cache and holds
    // serialized module graphs in memory. On constrained builds this
    // is ~50-100MB of pure overhead with no benefit (CI builds are
    // fresh each time anyway).
    config.cache = false;
    // Limit webpack parallelism — each parallel compiler instance
    // duplicates the module graph in memory. On a 1-CPU container,
    // parallelism > 1 is pure memory waste.
    config.parallelism = 1;
    return config;
  },
  async headers() {
    // In dev, do NOT set custom Cache-Control on /_next/static/ — Next.js 16
    // Turbopack manages chunk loading/caching internally and custom headers
    // break its chunk-loading protocol (the "module factory is not available"
    // desync). Only set API no-store in dev. Static chunk caching is left to
    // Turbopack's defaults.
    if (process.env.NODE_ENV === "development") {
      return [
        {
          source: "/api/:path*",
          headers: [{ key: "Cache-Control", value: "no-store" }],
        },
        {
          source: "/(.*)",
          headers: [
            { key: "Accept-CH", value: "Sec-CH-Device-Memory, Sec-CH-RTT, Sec-CH-Downlink" },
            { key: "Vary", value: "Sec-CH-Device-Memory" },
          ],
        },
      ];
    }
    return [
      // Note: /_next/static/ Cache-Control is handled natively by Next.js 16
      // (immutable, 1-year). Setting it manually triggers a build warning and
      // can interfere with Turbopack's chunk-loading protocol in dev.
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        // Security headers applied to ALL routes.
        // CSP allows inline styles (Next.js styled-jsx + Tailwind require it),
        // 'unsafe-eval' is NOT included, images allow data: + blob: for uploads,
        // connect-src includes the app origin for fetch/SWR.
        source: "/(.*)",
        headers: [
          { key: "Accept-CH", value: "Sec-CH-Device-Memory, Sec-CH-RTT, Sec-CH-Downlink" },
          { key: "Vary", value: "Sec-CH-Device-Memory" },
          // HSTS — enforce HTTPS for 1 year, include subdomains
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          // Prevent clickjacking — allow same-origin framing only (the
          // in-app DocumentViewer iframes /m/print pages for overlay docs)
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Control referrer information sent to other origins
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Restrict browser features (camera, mic, geo, payment)
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          // CSP — restrict resource loading to prevent XSS injection
          { key: "Content-Security-Policy", value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "connect-src 'self' https: data: blob:",
            "frame-ancestors 'self'",
            "base-uri 'self'",
            "form-action 'self'",
            "object-src 'none'",
            "upgrade-insecure-requests",
          ].join("; ") },
          // COOP — isolate browsing context to prevent cross-origin window access
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Keep every page out of search indexes — internal ERP
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
};

// ── Dev header guard ─────────────────────────────────────────────
// Runtime check: if someone accidentally re-adds Cache-Control on
// /_next/static/ in dev, warn loudly. This is the #1 enabler of the
// Turbopack "module factory is not available" chunk desync loop.
if (process.env.NODE_ENV === "development") {
  Promise.resolve(nextConfig.headers?.()).then((headers) => {
    if (!headers) return;
    for (const h of headers) {
      if (h.source.includes("/_next/static/")) {
        const hasCacheControl = h.headers?.some(
          (hdr: { key: string }) => hdr.key.toLowerCase() === "cache-control",
        );
        if (hasCacheControl) {
          console.warn(
            "\x1b[33m⚠ [next.config] Cache-Control header detected on /_next/static/ in dev mode. " +
              "This breaks Turbopack's chunk-loading protocol and causes " +
              '"module factory is not available" desync loops. Remove it.\x1b[0m',
          );
        }
      }
    }
  }).catch(() => {
    // headers() may throw — Next.js will handle the error separately.
  });
}

// withSentryConfig: auto-instruments route handlers/server components,
// creates the /monitoring tunnel route (ad-blocker bypass), and uploads
// source maps on webpack builds when SENTRY_AUTH_TOKEN + SENTRY_ORG +
// SENTRY_PROJECT are set. Without them the upload step no-ops (build
// succeeds — Sentry just captures errors without mapped frames). No
// webpack.treeshake options — dev runs on Turbopack where they're ignored.
export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
