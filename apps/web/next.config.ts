import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/zod/**",
      "./node_modules/react-hook-form/**",
      "./node_modules/@hookform/**",
    ],
  },
};

export default nextConfig;
