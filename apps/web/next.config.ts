import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
