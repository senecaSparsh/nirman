import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nirman/db"],
  // cacheComponents (PPR) disabled — it prerenders 200+ routes at build time,
  // consuming too much memory for the free tier. Pages render on demand instead,
  // which is fine for a single-client app.
  cacheComponents: false,
  serverExternalPackages: ["nodemailer"],
  // Limit build workers to 1 to stay within 512MB RAM on Render free tier
  // (default spawns 47 workers which OOMs).
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
};

export default nextConfig;
