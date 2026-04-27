import type { NextConfig } from "next";
import { URL } from "node:url";

const isProd = process.env.NODE_ENV === "production";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const rpcUrl = process.env.NEXT_PUBLIC_TEMPO_RPC_URL || "";
const wsUrl = process.env.NEXT_PUBLIC_TEMPO_WS_URL || "";
const devOrigin = process.env.NEXT_PUBLIC_DEV_ORIGIN || "";

function originFromUrl(u: string): string | null {
  if (!u) return null;
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

const rpcHttp = originFromUrl(rpcUrl);
const rpcWs = originFromUrl(wsUrl);

// connect-src: self + RPC (HTTP+WS) + Irys gateways
const connectSrc = [
  "'self'",
  rpcHttp,
  rpcWs,
  "https://gateway.irys.xyz",
  "https://devnet.irys.xyz",
  "https://uploader.irys.xyz",
  // dev-only: allow ngrok tunnels so local mobile/agents can hit the dev server
  !isProd ? "https://*.ngrok-free.app" : null,
  !isProd ? "wss://*.ngrok-free.app" : null,
].filter(Boolean) as string[];

const imgSrc = [
  "'self'",
  "data:",
  "blob:",
  "https://gateway.irys.xyz",
  "https://devnet.irys.xyz",
  "https://arweave.net",
];

const csp = [
  "default-src 'self'",
  // Next.js 16 still needs 'unsafe-inline' 'unsafe-eval' for its runtime chunks
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src ${imgSrc.join(" ")}`,
  `connect-src ${connectSrc.join(" ")}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  isProd ? "upgrade-insecure-requests" : null,
]
  .filter(Boolean)
  .join("; ");

// Dev-only origins (e.g. ngrok) for Next 16 cross-origin dev warnings.
// We always allow ngrok wildcard in dev so a new tunnel URL doesn't need an
// env edit + restart. NEXT_PUBLIC_DEV_ORIGIN can still pin extra hosts.
const allowedDevOrigins = !isProd
  ? ["*.ngrok-free.app", devOrigin].filter(Boolean) as string[]
  : [];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: csp },
          ...(isProd
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
      {
        // Same-origin CORS for API routes: only our app URL may call us.
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: appUrl },
          { key: "Vary", value: "Origin" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          { key: "Access-Control-Max-Age", value: "600" },
        ],
      },
    ];
  },
};

export default nextConfig;
