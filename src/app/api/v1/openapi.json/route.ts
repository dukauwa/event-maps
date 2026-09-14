import { NextResponse } from "next/server";
import { CORS_HEADERS } from "@/lib/api/http";
import { openApiDocument } from "@/lib/api/openapi";
import { requestOrigin } from "@/lib/auth/session";

export async function GET() {
  return NextResponse.json(openApiDocument(await requestOrigin()), { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" } });
}
