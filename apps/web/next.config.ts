import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  transpilePackages: ["@nirman/db"],
  // cacheComponents (PPR) disabled — it prerenders 200+ routes at build time,
  // consuming too much memory for the free tier. Pages render on demand instead,
  // which is fine for a single-client app.
  cacheComponents: false,
  serverExternalPackages: ["nodemailer"],
  poweredByHeader: false,
  // Skip TypeScript checking during build — tsc --noEmit runs separately
  // in CI/typecheck. This saves ~1GB RAM on Render's free tier.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Limit build workers to 1 to stay within 512MB RAM on Render free tier
  // (default spawns 47 workers which OOMs).
  experimental: {
    workerThreads: false,
    cpus: 1,
    optimizePackageImports: ["lucide-react", "recharts", "@xyflow/react"],
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
      ];
    }
    return [
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
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

export default withBundleAnalyzer(nextConfig);
