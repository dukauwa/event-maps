import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findEventBySlugOrId } from "@/lib/bundle";

export const dynamic = "force-dynamic";

/** Lightweight version probe (mirrors ExpoFP's data/version.json) for cache invalidation and offline sync. */
export async function GET(_req: Request, ctx: RouteContext<"/e/[slug]/version.json">) {
  const { slug } = await ctx.params;
  const ev = findEventBySlugOrId(db(), slug);
  if (!ev) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ version: ev.publishedVersion, publishedAt: ev.publishedAt, status: ev.status }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
}
