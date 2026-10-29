import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce the minimal Node.js server copied into the deployment container.
  output: "standalone",
  serverExternalPackages: ["pg"],
  outputFileTracingIncludes: {
    "/*": ["./private/report-assets/physician-signature.png"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
