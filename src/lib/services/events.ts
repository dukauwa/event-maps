import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { newId, secretToken } from "@/lib/ids";
import { DEFAULT_SETTINGS, type EventSettings } from "@/lib/domain/types";
import { publishEvent as publishBundle } from "@/lib/bundle";
import { emitWebhook } from "./webhooks";
import { slugify } from "@/lib/seed/demo";
import { conflict, notFound } from "@/lib/api/http";

export const eventInput = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
  subtitle: z.string().max(300).nullish(),
  description: z.string().max(5000).nullish(),
  startsAt: z.string().nullish(),
  endsAt: z.string().nullish(),
  timezone: z.string().nullish(),
  venueName: z.string().max(200).nullish(),
  venueAddress: z.string().max(400).nullish(),
  venueLat: z.number().nullish(),
  venueLng: z.number().nullish(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});
export type EventInput = z.infer<typeof eventInput>;

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
/** Deep-merge settings patches so clients can send partial updates. */
export function mergeSettings(base: EventSettings, patch: Record<string, unknown> | undefined): EventSettings {
  if (!patch) return base;
  const merge = (a: unknown, b: unknown): unknown => {
    if (isObj(a) && isObj(b)) {
      const out: Record<string, unknown> = { ...a };
      for (const [k, v] of Object.entries(b)) out[k] = merge(a[k], v);
      return out;
    }
    return b === undefined ? a : b;
  };
  return merge(base, patch) as EventSettings;
}

export function listEvents(orgId: string) {
  return db().select().from(schema.events).where(eq(schema.events.orgId, orgId)).orderBy(desc(schema.events.createdAt)).all();
}

export function getEvent(orgId: string, id: string) {
  return db().select().from(schema.events).where(and(eq(schema.events.id, id), eq(schema.events.orgId, orgId))).get() ?? null;
}

export function createEvent(orgId: string, input: EventInput) {
  const id = newId("ev");
  let slug = input.slug || slugify(input.name);
  if (db().select().from(schema.events).where(eq(schema.events.slug, slug)).get()) slug = `${slug}-${secretToken(4).toLowerCase()}`;
  const settings = mergeSettings(DEFAULT_SETTINGS, input.settings);
  db().insert(schema.events).values({
    id, orgId, slug, name: input.name, subtitle: input.subtitle ?? null, description: input.description ?? null, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null,
    timezone: input.timezone ?? "UTC", venueName: input.venueName ?? null, venueAddress: input.venueAddress ?? null, venueLat: input.venueLat ?? null, venueLng: input.venueLng ?? null,
    status: input.status ?? "draft", settings,
  }).run();
  // Every event starts with one level so the designer has a canvas.
  db().insert(schema.levels).values({ id: newId("lv"), eventId: id, name: "Level 1", shortName: "L1", sortIndex: 0, widthM: 200, heightM: 120, georef: input.venueLat != null && input.venueLng != null ? { originLat: input.venueLat, originLng: input.venueLng, rotationDeg: 0, metersPerUnit: 1 } : null }).run();
  return db().select().from(schema.events).where(eq(schema.events.id, id)).get()!;
}

export function updateEvent(orgId: string, id: string, patch: Partial<EventInput>) {
  const ev = getEvent(orgId, id);
  if (!ev) throw notFound("event");
  if (patch.slug && patch.slug !== ev.slug && db().select().from(schema.events).where(eq(schema.events.slug, patch.slug)).get()) throw conflict("Slug already in use");
  const { settings, ...rest } = patch;
  db().update(schema.events).set({ ...rest, ...(settings ? { settings: mergeSettings(ev.settings, settings) } : {}), updatedAt: new Date().toISOString() }).where(eq(schema.events.id, id)).run();
  return getEvent(orgId, id)!;
}

export function deleteEvent(orgId: string, id: string) {
  db().delete(schema.events).where(and(eq(schema.events.id, id), eq(schema.events.orgId, orgId))).run();
}

export function publishEvent(orgId: string, id: string, note?: string) {
  const ev = getEvent(orgId, id);
  if (!ev) throw notFound("event");
  const r = publishBundle(db(), id, note);
  emitWebhook(orgId, id, "floorplan.published", { eventId: id, slug: ev.slug, version: r?.version });
  return r;
}

export function unpublishEvent(orgId: string, id: string) {
  db().update(schema.events).set({ status: "draft", updatedAt: new Date().toISOString() }).where(and(eq(schema.events.id, id), eq(schema.events.orgId, orgId))).run();
}

export function listVersions(eventId: string) {
  return db().select({ id: schema.floorplanVersions.id, version: schema.floorplanVersions.version, note: schema.floorplanVersions.note, createdAt: schema.floorplanVersions.createdAt }).from(schema.floorplanVersions).where(eq(schema.floorplanVersions.eventId, eventId)).orderBy(desc(schema.floorplanVersions.version)).all();
}

/** Copy an event's map (levels, elements, booths, wayfinding, pricing, categories) into a new draft event. Reuse a map next year. */
export function duplicateEvent(orgId: string, id: string, opts: { name: string; slug?: string; includeExhibitors?: boolean }) {
  const src = getEvent(orgId, id);
  if (!src) throw notFound("event");
  const d = db();
  const target = createEvent(orgId, { name: opts.name, slug: opts.slug, subtitle: src.subtitle, description: src.description, timezone: src.timezone, venueName: src.venueName, venueAddress: src.venueAddress, venueLat: src.venueLat, venueLng: src.venueLng, settings: src.settings as unknown as Record<string, unknown> });
  d.delete(schema.levels).where(eq(schema.levels.eventId, target.id)).run();
  const levelMap = new Map<string, string>();
  for (const l of d.select().from(schema.levels).where(eq(schema.levels.eventId, id)).all()) {
    const nid = newId("lv");
    levelMap.set(l.id, nid);
    d.insert(schema.levels).values({ ...l, id: nid, eventId: target.id, createdAt: undefined, updatedAt: undefined }).run();
  }
  const catMap = new Map<string, string>();
  for (const c of d.select().from(schema.categories).where(eq(schema.categories.eventId, id)).all()) {
    const nid = newId("ca");
    catMap.set(c.id, nid);
    d.insert(schema.categories).values({ ...c, id: nid, eventId: target.id, parentId: c.parentId ? catMap.get(c.parentId) ?? null : null }).run();
  }
  const elMap = new Map<string, string>();
  for (const e of d.select().from(schema.elements).where(eq(schema.elements.eventId, id)).all()) {
    const nid = newId("el");
    elMap.set(e.id, nid);
    d.insert(schema.elements).values({ ...e, id: nid, eventId: target.id, levelId: levelMap.get(e.levelId)!, createdAt: undefined, updatedAt: undefined }).run();
  }
  const boothMap = new Map<string, string>();
  for (const b of d.select().from(schema.booths).where(eq(schema.booths.eventId, id)).all()) {
    const nid = newId("bo");
    boothMap.set(b.id, nid);
    d.insert(schema.booths).values({ ...b, id: nid, eventId: target.id, levelId: levelMap.get(b.levelId)!, status: "available", holdUntil: null, createdAt: undefined, updatedAt: undefined }).run();
  }
  const nodeMap = new Map<string, string>();
  for (const n of d.select().from(schema.wayNodes).where(eq(schema.wayNodes.eventId, id)).all()) {
    const nid = newId("wn");
    nodeMap.set(n.id, nid);
    d.insert(schema.wayNodes).values({ ...n, id: nid, eventId: target.id, levelId: levelMap.get(n.levelId)! }).run();
  }
  for (const e of d.select().from(schema.wayEdges).where(eq(schema.wayEdges.eventId, id)).all()) {
    d.insert(schema.wayEdges).values({ ...e, id: newId("we"), eventId: target.id, levelId: levelMap.get(e.levelId)!, fromNodeId: nodeMap.get(e.fromNodeId)!, toNodeId: nodeMap.get(e.toNodeId)! }).run();
  }
  for (const t of d.select().from(schema.transitions).where(eq(schema.transitions.eventId, id)).all()) {
    d.insert(schema.transitions).values({ ...t, id: newId("tr"), eventId: target.id, nodeIds: t.nodeIds.map((n) => nodeMap.get(n)!).filter(Boolean) }).run();
  }
  for (const p of d.select().from(schema.pricingRules).where(eq(schema.pricingRules.eventId, id)).all()) {
    d.insert(schema.pricingRules).values({ ...p, id: newId("pr"), eventId: target.id }).run();
  }
  if (opts.includeExhibitors) {
    const exMap = new Map<string, string>();
    for (const e of d.select().from(schema.exhibitors).where(eq(schema.exhibitors.eventId, id)).all()) {
      const nid = newId("ex");
      exMap.set(e.id, nid);
      d.insert(schema.exhibitors).values({ ...e, id: nid, eventId: target.id, portalToken: secretToken(32), createdAt: undefined, updatedAt: undefined }).run();
    }
    for (const ec of d.select().from(schema.exhibitorCategories).all()) {
      if (exMap.has(ec.exhibitorId) && catMap.has(ec.categoryId)) d.insert(schema.exhibitorCategories).values({ exhibitorId: exMap.get(ec.exhibitorId)!, categoryId: catMap.get(ec.categoryId)! }).run();
    }
  }
  return getEvent(orgId, target.id)!;
}
