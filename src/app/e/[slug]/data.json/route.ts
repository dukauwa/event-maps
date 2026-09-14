import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findEventBySlugOrId, getViewerBundle } from "@/lib/bundle";
import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Public bundle for a published event. `?preview=1` returns live data for signed-in organisers of that org. */
export async function GET(req: Request, ctx: RouteContext<"/e/[slug]/data.json">) {
  const { slug } = await ctx.params;
  const ev = findEventBySlugOrId(db(), slug);
  if (!ev) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const url = new URL(req.url);
  let preview = url.searchParams.get("preview") === "1";
  if (preview) {
    const u = await currentUser();
    preview = !!u && u.orgId === ev.orgId;
  }
  const bundle = getViewerBundle(db(), ev.id, preview);
  if (!bundle) return NextResponse.json({ error: "not_published" }, { status: 404 });
  return NextResponse.json(bundle, {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": preview ? "no-store" : "public, max-age=30, stale-while-revalidate=300" },
  });
}
