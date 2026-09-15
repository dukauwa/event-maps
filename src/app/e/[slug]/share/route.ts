import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { findEventBySlugOrId } from "@/lib/bundle";
import { newId } from "@/lib/ids";

export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const body = z.object({
  boothIds: z.array(z.string().max(80)).max(200).default([]),
  exhibitorIds: z.array(z.string().max(80)).max(200).default([]),
  sessionIds: z.array(z.string().max(80)).max(200).default([]),
});

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Create a shared plan (bookmarks) → `{ data: { id } }`; the viewer opens it with `?plan=<id>`. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const ev = findEventBySlugOrId(db(), slug);
  if (!ev) return NextResponse.json({ error: { code: "not_found", message: "event not found" } }, { status: 404, headers: CORS });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: { code: "validation_error", message: "Invalid request", details: parsed.error.issues } }, { status: 400, headers: CORS });
  const items = parsed.data;
  if (!items.boothIds.length && !items.exhibitorIds.length && !items.sessionIds.length) return NextResponse.json({ error: { code: "bad_request", message: "Nothing to share" } }, { status: 400, headers: CORS });
  // Keep only ids that belong to this event.
  const booths = new Set(db().select({ id: schema.booths.id }).from(schema.booths).where(eq(schema.booths.eventId, ev.id)).all().map((r) => r.id));
  const exhibitors = new Set(db().select({ id: schema.exhibitors.id }).from(schema.exhibitors).where(eq(schema.exhibitors.eventId, ev.id)).all().map((r) => r.id));
  const sessions = new Set(db().select({ id: schema.sessions.id }).from(schema.sessions).where(eq(schema.sessions.eventId, ev.id)).all().map((r) => r.id));
  const id = newId("sp");
  db().insert(schema.sharedPlans).values({
    id, eventId: ev.id,
    items: { boothIds: items.boothIds.filter((x) => booths.has(x)), exhibitorIds: items.exhibitorIds.filter((x) => exhibitors.has(x)), sessionIds: items.sessionIds.filter((x) => sessions.has(x)) },
  }).run();
  return NextResponse.json({ data: { id, url: `/e/${encodeURIComponent(ev.slug)}?plan=${id}` } }, { status: 201, headers: CORS });
}

/** Fetch a shared plan: `GET /e/{slug}/share?id=sp_…` → `{ data: { id, items, createdAt } }`. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const ev = findEventBySlugOrId(db(), slug);
  if (!ev) return NextResponse.json({ error: { code: "not_found", message: "event not found" } }, { status: 404, headers: CORS });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const row = id ? db().select().from(schema.sharedPlans).where(eq(schema.sharedPlans.id, id)).get() : undefined;
  if (!row || row.eventId !== ev.id) return NextResponse.json({ error: { code: "not_found", message: "shared plan not found" } }, { status: 404, headers: CORS });
  return NextResponse.json({ data: { id: row.id, items: row.items, createdAt: row.createdAt } }, { headers: { ...CORS, "Cache-Control": "public, max-age=300" } });
}
