import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql"],
  // Migrations are read at runtime, so they must be traced into the serverless bundle (Vercel prunes what it cannot
  // see imported). On serverless hosts only libSQL's HTTP client runs, which is traced like any import; the native
  // driver for local files is loaded lazily and never needed there.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*.sql", "./drizzle/meta/**"] },
  // The local development database must never ship.
  outputFileTracingExcludes: { "/**": ["./data/**"] },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }, { protocol: "http", hostname: "**" }] },
  async headers() {
    return [
      {
        // The embeddable viewer and SDK must be frameable from anywhere.
        source: "/e/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
      {
        source: "/sdk/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
    ];
  },
};

export default nextConfig;
