import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Reverse-Proxy: /api/* wird auf Backend (Port 3000) geleitet.
  // Dadurch reicht es, NUR den Frontend-Port (3001) durch den Cloudflare-Tunnel
  // zu exponieren — Frontend & Backend liegen für den Browser unter derselben Origin.
  async rewrites() {
    const backend = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3000";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/health",     destination: `${backend}/health` },
    ];
  },
  // Erlaubt Cross-Origin Dev-Asset-Requests (LAN + Cloudflare-Tunnel)
  allowedDevOrigins: [
    "192.168.1.0/24",
    "192.168.2.0/24",
    "*.trycloudflare.com",
  ],
};

export default nextConfig;
