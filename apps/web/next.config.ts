import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nirman/db"],
  cacheComponents: true,
};

export default nextConfig;
