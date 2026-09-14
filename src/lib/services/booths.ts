import { and, eq, asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { union, polygon as turfPolygon } from "@turf/turf";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { asRect, polygonArea, round } from "@/lib/domain/geometry";
import { BOOTH_STATUSES, BOOTH_TYPES, type BoothStatus, type Polygon } from "@/lib/domain/types";
import { badRequest, conflict, notFound } from "@/lib/api/http";
import { emitWebhook } from "./webhooks";
import type { Booth, Event } from "@/lib/db/schema";

const point = z.tuple([z.number(), z.number()]);
export const polygonSchema = z.array(point).min(3).max(500);

export const boothInput = z.object({
  label: z.string().min(1).max(40),
  levelId: z.string(),
  externalId: z.string().max(120).nullish(),
  polygon: polygonSchema,
  boothType: z.enum(BOOTH_TYPES).optional(),
  status: z.enum(BOOTH_STATUSES).optional(),
  priceCents: z.number().int().nonnegative().nullish(),
  currency: z.string().length(3).nullish(),
  colors: z.record(z.string(), z.string()).nullish(),
  labelHidden: z.boolean().optional(),
  height3d: z.number().nonnegative().nullish(),
  notes: z.string().max(2000).nullish(),
  metadata: z.record(z.string(), z.string()).optional(),
  sortIndex: z.number().int().optional(),
  exhibitorIds: z.array(z.string()).optional(),
});
export type BoothInput = z.infer<typeof boothInput>;
export const boothPatch = boothInput.partial();

export interface BoothWithExhibitors extends Booth { exhibitorIds: string[] }

function derived(polygon: Polygon) {
  const r = asRect(polygon);
  return { areaM2: round(polygonArea(polygon), 2), widthM: r ? round(r.w, 3) : null, heightM: r ? round(r.h, 3) : null, rotationDeg: r ? r.rotationDeg : 0 };
}

export function withExhibitors(rows: Booth[]): BoothWithExhibitors[] {
  if (!rows.length) return [];
  const links = db().select().from(schema.boothExhibitors).where(inArray(schema.boothExhibitors.boothId, rows.map((b) => b.id))).all();
  const m = new Map<string, string[]>();
  for (const l of links.sort((a, b) => a.sortIndex - b.sortIndex)) m.set(l.boothId, [...(m.get(l.boothId) ?? []), l.exhibitorId]);
  return rows.map((b) => ({ ...b, exhibitorIds: m.get(b.id) ?? [] }));
}

export function listBooths(eventId: string, filter: { levelId?: string; status?: BoothStatus; q?: string; exhibitorId?: string } = {}): BoothWithExhibitors[] {
  let rows = db().select().from(schema.booths).where(eq(schema.booths.eventId, eventId)).orderBy(asc(schema.booths.sortIndex), asc(schema.booths.label)).all();
  if (filter.levelId) rows = rows.filter((b) => b.levelId === filter.levelId);
  if (filter.status) rows = rows.filter((b) => b.status === filter.status);
  if (filter.q) { const q = filter.q.toLowerCase(); rows = rows.filter((b) => b.label.toLowerCase().includes(q) || b.externalId?.toLowerCase().includes(q)); }
  let out = withExhibitors(rows);
  if (filter.exhibitorId) out = out.filter((b) => b.exhibitorIds.includes(filter.exhibitorId!));
  return out;
}

export function getBooth(eventId: string, idOrLabel: string): BoothWithExhibitors | null {
  const row = db().select().from(schema.booths).where(and(eq(schema.booths.eventId, eventId), eq(schema.booths.id, idOrLabel))).get()
    ?? db().select().from(schema.booths).where(and(eq(schema.booths.eventId, eventId), eq(schema.booths.label, idOrLabel))).get()
    ?? db().select().from(schema.booths).where(and(eq(schema.booths.eventId, eventId), eq(schema.booths.externalId, idOrLabel))).get();
  return row ? withExhibitors([row])[0] : null;
}

export function createBooth(ev: Event, input: BoothInput): BoothWithExhibitors {
  const level = db().select().from(schema.levels).where(and(eq(schema.levels.id, input.levelId), eq(schema.levels.eventId, ev.id))).get();
  if (!level) throw badRequest("Unknown levelId");
  if (db().select().from(schema.booths).where(and(eq(schema.booths.eventId, ev.id), eq(schema.booths.label, input.label))).get()) throw conflict(`Booth label '${input.label}' already exists`);
  const id = newId("bo");
  db().insert(schema.booths).values({
    id, eventId: ev.id, levelId: input.levelId, label: input.label, externalId: input.externalId ?? null, polygon: input.polygon, ...derived(input.polygon),
    boothType: input.boothType ?? "standard", status: input.status ?? "available", priceCents: input.priceCents ?? null, currency: input.currency ?? null,
    colors: input.colors ?? null, labelHidden: input.labelHidden ?? false, height3d: input.height3d ?? null, notes: input.notes ?? null, sortIndex: input.sortIndex ?? 0,
  }).run();
  if (input.exhibitorIds?.length) setBoothExhibitors(ev, id, input.exhibitorIds, false);
  const b = getBooth(ev.id, id)!;
  emitWebhook(ev.orgId, ev.id, "booth.created", b);
  return b;
}

export function updateBooth(ev: Event, id: string, patch: z.infer<typeof boothPatch>): BoothWithExhibitors {
  const before = getBooth(ev.id, id);
  if (!before) throw notFound("booth");
  if (patch.label && patch.label !== before.label && db().select().from(schema.booths).where(and(eq(schema.booths.eventId, ev.id), eq(schema.booths.label, patch.label))).get()) throw conflict(`Booth label '${patch.label}' already exists`);
  const { exhibitorIds, ...rest } = patch;
  const set: Record<string, unknown> = { ...rest, updatedAt: new Date().toISOString() };
  if (patch.polygon) Object.assign(set, derived(patch.polygon));
  if (patch.status && patch.status !== "held") set.holdUntil = null;
  db().update(schema.booths).set(set).where(eq(schema.booths.id, before.id)).run();
  if (exhibitorIds) setBoothExhibitors(ev, before.id, exhibitorIds, false);
  const after = getBooth(ev.id, before.id)!;
  emitWebhook(ev.orgId, ev.id, "booth.updated", after);
  if (patch.status && patch.status !== before.status) emitWebhook(ev.orgId, ev.id, "booth.status_changed", { booth: after, previousStatus: before.status });
  return after;
}

export function setBoothStatus(ev: Event, id: string, status: BoothStatus, holdUntil?: string | null) {
  const before = getBooth(ev.id, id);
  if (!before) throw notFound("booth");
  db().update(schema.booths).set({ status, holdUntil: status === "held" ? holdUntil ?? null : null, updatedAt: new Date().toISOString() }).where(eq(schema.booths.id, before.id)).run();
  const after = getBooth(ev.id, before.id)!;
  if (before.status !== status) emitWebhook(ev.orgId, ev.id, "booth.status_changed", { booth: after, previousStatus: before.status });
  return after;
}

export function deleteBooth(ev: Event, id: string) {
  const b = getBooth(ev.id, id);
  if (!b) throw notFound("booth");
  db().delete(schema.booths).where(eq(schema.booths.id, b.id)).run();
  emitWebhook(ev.orgId, ev.id, "booth.deleted", { id: b.id, label: b.label });
}

export function setBoothExhibitors(ev: Event, boothId: string, exhibitorIds: string[], emit = true) {
  const booth = getBooth(ev.id, boothId);
  if (!booth) throw notFound("booth");
  const valid = exhibitorIds.length ? db().select({ id: schema.exhibitors.id }).from(schema.exhibitors).where(and(eq(schema.exhibitors.eventId, ev.id), inArray(schema.exhibitors.id, exhibitorIds))).all().map((r) => r.id) : [];
  const unknown = exhibitorIds.filter((x) => !valid.includes(x));
  if (unknown.length) throw badRequest("Unknown exhibitor ids", unknown);
  db().delete(schema.boothExhibitors).where(eq(schema.boothExhibitors.boothId, booth.id)).run();
  exhibitorIds.forEach((exhibitorId, i) => db().insert(schema.boothExhibitors).values({ boothId: booth.id, exhibitorId, sortIndex: i }).run());
  const after = getBooth(ev.id, booth.id)!;
  if (emit) {
    const added = exhibitorIds.filter((x) => !booth.exhibitorIds.includes(x));
    const removed = booth.exhibitorIds.filter((x) => !exhibitorIds.includes(x));
    if (added.length) emitWebhook(ev.orgId, ev.id, "booth.assigned", { booth: after, exhibitorIds: added });
    if (removed.length) emitWebhook(ev.orgId, ev.id, "booth.unassigned", { booth: after, exhibitorIds: removed });
  }
  return after;
}

export function assignExhibitor(ev: Event, boothId: string, exhibitorId: string, opts: { markSold?: boolean } = {}) {
  const booth = getBooth(ev.id, boothId);
  if (!booth) throw notFound("booth");
  const ids = booth.exhibitorIds.includes(exhibitorId) ? booth.exhibitorIds : [...booth.exhibitorIds, exhibitorId];
  const after = setBoothExhibitors(ev, booth.id, ids);
  if (opts.markSold && after.status !== "sold") return setBoothStatus(ev, booth.id, "sold");
  return after;
}

export function unassignExhibitor(ev: Event, boothId: string, exhibitorId: string) {
  const booth = getBooth(ev.id, boothId);
  if (!booth) throw notFound("booth");
  return setBoothExhibitors(ev, booth.id, booth.exhibitorIds.filter((x) => x !== exhibitorId));
}

/** Upsert many booths by externalId (preferred) or label. Returns counts. */
export function bulkUpsertBooths(ev: Event, items: BoothInput[]) {
  let created = 0, updated = 0;
  const errors: { index: number; error: string }[] = [];
  items.forEach((item, index) => {
    try {
      const existing = (item.externalId && getBooth(ev.id, item.externalId)) || getBooth(ev.id, item.label);
      if (existing) { updateBooth(ev, existing.id, item); updated++; } else { createBooth(ev, item); created++; }
    } catch (e) {
      errors.push({ index, error: e instanceof Error ? e.message : String(e) });
    }
  });
  return { created, updated, errors };
}

/** Merge adjacent booths into one (polygon union). Keeps the first booth's label and exhibitors; deletes the rest. */
export function mergeBooths(ev: Event, boothIds: string[], label?: string) {
  const rows = boothIds.map((id) => getBooth(ev.id, id)).filter((b): b is BoothWithExhibitors => !!b);
  if (rows.length < 2) throw badRequest("Select at least two booths to merge");
  if (new Set(rows.map((r) => r.levelId)).size > 1) throw badRequest("Booths must be on the same level");
  let merged = turfPolygon([[...rows[0].polygon, rows[0].polygon[0]]]);
  for (const r of rows.slice(1)) {
    const u = union({ type: "FeatureCollection", features: [merged, turfPolygon([[...r.polygon, r.polygon[0]]])] });
    if (!u || u.geometry.type !== "Polygon") throw badRequest("Booths must be adjacent (touching) to merge");
    merged = u as typeof merged;
  }
  const ring = merged.geometry.coordinates[0].slice(0, -1).map(([x, y]) => [round(x, 3), round(y, 3)] as [number, number]);
  const keep = rows[0];
  const exhibitorIds = [...new Set(rows.flatMap((r) => r.exhibitorIds))];
  for (const r of rows.slice(1)) deleteBooth(ev, r.id);
  return updateBooth(ev, keep.id, { polygon: ring, label: label ?? keep.label, exhibitorIds, boothType: keep.boothType === "table" ? "standard" : keep.boothType });
}

/** Release holds whose timer ran out. Called opportunistically on reads and by the orders service. */
export function releaseExpiredHolds(ev: Event) {
  const now = new Date().toISOString();
  const expired = db().select().from(schema.booths).where(and(eq(schema.booths.eventId, ev.id), eq(schema.booths.status, "held"))).all().filter((b) => b.holdUntil && b.holdUntil < now);
  for (const b of expired) setBoothStatus(ev, b.id, "available");
  return expired.length;
}
