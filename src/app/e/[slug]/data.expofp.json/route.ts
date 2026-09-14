import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findEventBySlugOrId, getViewerBundle } from "@/lib/bundle";
import { toExpoFpData } from "@/lib/export/expofp";

export const dynamic = "force-dynamic";

/** ExpoFP-compatible `data.json` so existing integrations can switch by changing one URL. */
export async function GET(_req: Request, ctx: RouteContext<"/e/[slug]/data.expofp.json">) {
  const { slug } = await ctx.params;
  const ev = findEventBySlugOrId(db(), slug);
  if (!ev) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const bundle = getViewerBundle(db(), ev.id, false);
  if (!bundle) return NextResponse.json({ error: "not_published" }, { status: 404 });
  return NextResponse.json(toExpoFpData(bundle), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } });
}
