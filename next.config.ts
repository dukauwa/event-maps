import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql"],
  // Read at runtime, so they must be traced into the serverless bundle (Vercel prunes what it cannot see imported):
  // the migrations, and libSQL's native driver for file databases. The native driver is required lazily and picks its
  // binary by platform name, which static tracing cannot follow. (With a hosted database only the HTTP client runs.)
  outputFileTracingIncludes: {
    "/**": [
      "./drizzle/**/*.sql",
      "./drizzle/meta/**",
      // File patterns only: pnpm links packages with symlinked folders, which a bare `**` would try to read as files.
      "./node_modules/.pnpm/@libsql+client@*/node_modules/**/*.{js,cjs,json}",
      "./node_modules/.pnpm/libsql@*/node_modules/**/*.{js,cjs,json,node}",
      "./node_modules/.pnpm/@libsql+linux-x64-gnu@*/node_modules/@libsql/linux-x64-gnu/*.{json,node}",
    ],
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
