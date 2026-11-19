import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentUpgrade: 'security',
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
