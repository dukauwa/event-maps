import { NextResponse, type NextRequest } from "next/server";
import { DATABASE_SETUP_MESSAGE, databaseMissing } from "@/lib/db/config";

/**
 * Deployed to a serverless host without a hosted database, the app would run with a private copy of the data per
 * function: pages would miss what the API just saved. Show the one-step setup instead of a half-working app.
 */
export function proxy(request: NextRequest) {
  if (!databaseMissing()) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname === "/setup") return NextResponse.next();
  if (pathname.startsWith("/api/") || pathname.startsWith("/x/api/") || pathname.endsWith(".json")) {
    return NextResponse.json({ error: { code: "database_not_configured", message: DATABASE_SETUP_MESSAGE } }, { status: 503 });
  }
  return NextResponse.rewrite(new URL("/setup", request.url));
}

export const config = {
  // Everything except build output and static assets.
  matcher: ["/((?!_next/|sdk/|maplibre/|pdfjs/|fonts/|favicon\\.ico|robots\\.txt).*)"],
};
