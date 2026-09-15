import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Migrations and the native SQLite binding are read at runtime, so they must be traced
  // into the serverless bundle (Vercel prunes anything it cannot see being imported).
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*.sql", "./drizzle/meta/**", "./node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/prebuilds/linux-*.node", "./node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/build/Release/*.node"],
  },
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
