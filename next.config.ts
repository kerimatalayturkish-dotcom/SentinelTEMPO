import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: true, // already checked locally, saves ~200MB RAM on Render
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://gateway.irys.xyz https://arweave.net",
              "connect-src 'self' https://rpc.moderato.tempo.xyz https://rpc.tempo.xyz wss://rpc.moderato.tempo.xyz wss://rpc.tempo.xyz https://publish.twitter.com https://gateway.irys.xyz",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
      {
        // CORS: restrict API routes
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
};

export default nextConfig;
