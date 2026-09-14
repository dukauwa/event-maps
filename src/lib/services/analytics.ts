import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { ANALYTICS_TYPES } from "@/lib/domain/types";
import { countBanner } from "./banners";

export const analyticsInput = z.object({
  events: z.array(z.object({
    type: z.enum(ANALYTICS_TYPES),
    sessionId: z.string().max(80).optional(),
    targetType: z.string().max(40).optional(),
    targetId: z.string().max(80).optional(),
    query: z.string().max(200).optional(),
    levelId: z.string().max(80).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
    at: z.string().optional(),
  })).max(500),
});

export function ingestAnalytics(eventId: string, input: z.infer<typeof analyticsInput>, userAgent?: string | null) {
  const device = userAgent && /Mobi|Android|iPhone|iPad/i.test(userAgent) ? "mobile" : "desktop";
  const rows = input.events.map((e) => ({
    id: newId("an"), eventId, type: e.type, sessionId: e.sessionId ?? null, targetType: e.targetType ?? null, targetId: e.targetId ?? null, query: e.query?.slice(0, 200) ?? null,
    levelId: e.levelId ?? null, x: e.x ?? null, y: e.y ?? null, meta: { device, ...(e.meta ?? {}) }, createdAt: e.at && !Number.isNaN(Date.parse(e.at)) ? new Date(e.at).toISOString() : new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 200) db().insert(schema.analyticsEvents).values(rows.slice(i, i + 200)).run();
  for (const e of input.events) if (e.targetType === "banner" && e.targetId && (e.type === "banner_impression" || e.type === "banner_click")) countBanner(e.targetId, e.type === "banner_click" ? "click" : "impression");
  return rows.length;
}

export interface AnalyticsSummary {
  range: { from: string; to: string };
  totals: Record<string, number>;
  uniqueSessions: number;
  byDay: { day: string; views: number; sessions: number; searches: number; routes: number }[];
  devices: Record<string, number>;
  topExhibitors: { id: string; name: string; views: number; bookmarks: number; routes: number }[];
  topBooths: { id: string; label: string; clicks: number }[];
  topSearches: { query: string; count: number }[];
  zeroResultSearches: { query: string; count: number }[];
  topCategories: { id: string; name: string; count: number }[];
  heatmap: { levelId: string; x: number; y: number; weight: number }[];
}

export function analyticsSummary(eventId: string, from?: string, to?: string): AnalyticsSummary {
  const toD = to ? new Date(to) : new Date();
  const fromD = from ? new Date(from) : new Date(toD.getTime() - 30 * 86400e3);
  const rows = db().select().from(schema.analyticsEvents).where(and(eq(schema.analyticsEvents.eventId, eventId), gte(schema.analyticsEvents.createdAt, fromD.toISOString()), lte(schema.analyticsEvents.createdAt, toD.toISOString()))).all();
  const totals: Record<string, number> = {};
  const sessions = new Set<string>();
  const byDay = new Map<string, { views: number; sessions: Set<string>; searches: number; routes: number }>();
  const devices: Record<string, number> = {};
  const exViews = new Map<string, { views: number; bookmarks: number; routes: number }>();
  const boothClicks = new Map<string, number>();
  const searches = new Map<string, number>();
  const zero = new Map<string, number>();
  const cats = new Map<string, number>();
  const heat = new Map<string, { levelId: string; x: number; y: number; weight: number }>();
  for (const r of rows) {
    totals[r.type] = (totals[r.type] ?? 0) + 1;
    if (r.sessionId) sessions.add(r.sessionId);
    const day = r.createdAt.slice(0, 10);
    const d = byDay.get(day) ?? { views: 0, sessions: new Set<string>(), searches: 0, routes: 0 };
    if (r.type === "view") { d.views++; devices[(r.meta?.device as string) ?? "unknown"] = (devices[(r.meta?.device as string) ?? "unknown"] ?? 0) + 1; }
    if (r.type === "search") { d.searches++; if (r.query) { const q = r.query.toLowerCase().trim(); searches.set(q, (searches.get(q) ?? 0) + 1); if (r.meta?.results === 0) zero.set(q, (zero.get(q) ?? 0) + 1); } }
    if (r.type === "route") d.routes++;
    if (r.sessionId) d.sessions.add(r.sessionId);
    byDay.set(day, d);
    if (r.targetType === "exhibitor" && r.targetId) {
      const e = exViews.get(r.targetId) ?? { views: 0, bookmarks: 0, routes: 0 };
      if (r.type === "exhibitor_view") e.views++;
      if (r.type === "bookmark") e.bookmarks++;
      if (r.type === "route") e.routes++;
      exViews.set(r.targetId, e);
    }
    if (r.targetType === "booth" && r.targetId && r.type === "booth_click") boothClicks.set(r.targetId, (boothClicks.get(r.targetId) ?? 0) + 1);
    if (r.targetType === "category" && r.targetId) cats.set(r.targetId, (cats.get(r.targetId) ?? 0) + 1);
    if (r.x != null && r.y != null && r.levelId) {
      const key = `${r.levelId}:${Math.round(r.x / 4) * 4}:${Math.round(r.y / 4) * 4}`;
      const h = heat.get(key) ?? { levelId: r.levelId, x: Math.round(r.x / 4) * 4, y: Math.round(r.y / 4) * 4, weight: 0 };
      h.weight++;
      heat.set(key, h);
    }
  }
  const exName = new Map(db().select({ id: schema.exhibitors.id, name: schema.exhibitors.name }).from(schema.exhibitors).where(eq(schema.exhibitors.eventId, eventId)).all().map((e) => [e.id, e.name]));
  const boothLabel = new Map(db().select({ id: schema.booths.id, label: schema.booths.label }).from(schema.booths).where(eq(schema.booths.eventId, eventId)).all().map((b) => [b.id, b.label]));
  const catName = new Map(db().select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories).where(eq(schema.categories.eventId, eventId)).all().map((c) => [c.id, c.name]));
  const top = <T,>(m: Map<string, T>, score: (v: T) => number, n = 10) => [...m.entries()].sort((a, b) => score(b[1]) - score(a[1])).slice(0, n);
  return {
    range: { from: fromD.toISOString(), to: toD.toISOString() },
    totals,
    uniqueSessions: sessions.size,
    byDay: [...byDay.entries()].sort().map(([day, d]) => ({ day, views: d.views, sessions: d.sessions.size, searches: d.searches, routes: d.routes })),
    devices,
    topExhibitors: top(exViews, (v) => v.views).filter(([id]) => exName.has(id)).map(([id, v]) => ({ id, name: exName.get(id)!, ...v })),
    topBooths: top(boothClicks, (v) => v).filter(([id]) => boothLabel.has(id)).map(([id, clicks]) => ({ id, label: boothLabel.get(id)!, clicks })),
    topSearches: top(searches, (v) => v, 15).map(([query, count]) => ({ query, count })),
    zeroResultSearches: top(zero, (v) => v).map(([query, count]) => ({ query, count })),
    topCategories: top(cats, (v) => v).filter(([id]) => catName.has(id)).map(([id, count]) => ({ id, name: catName.get(id)!, count })),
    heatmap: [...heat.values()],
  };
}

export function exhibitorAnalytics(eventId: string, exhibitorId: string) {
  const rows = db().select().from(schema.analyticsEvents).where(and(eq(schema.analyticsEvents.eventId, eventId), eq(schema.analyticsEvents.targetId, exhibitorId))).all();
  const byDay = new Map<string, number>();
  const totals: Record<string, number> = {};
  for (const r of rows) { totals[r.type] = (totals[r.type] ?? 0) + 1; if (r.type === "exhibitor_view") byDay.set(r.createdAt.slice(0, 10), (byDay.get(r.createdAt.slice(0, 10)) ?? 0) + 1); }
  return { totals, byDay: [...byDay.entries()].sort().map(([day, views]) => ({ day, views })) };
}
