import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    formats: ['image/webp'],
    remotePatterns: [],
    unoptimized: false, // Keep optimization on
    domains: [],
  },
};

export default nextConfig;
