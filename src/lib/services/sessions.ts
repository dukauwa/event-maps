import { and, eq, asc } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { badRequest, notFound } from "@/lib/api/http";
import { emitWebhook } from "./webhooks";
import type { Event } from "@/lib/db/schema";

export const sessionInput = z.object({
  title: z.string().min(1).max(300),
  externalId: z.string().max(120).nullish(),
  description: z.string().max(20000).nullish(),
  startsAt: z.string().min(10),
  endsAt: z.string().min(10),
  boothId: z.string().nullish(),
  boothLabel: z.string().nullish(),
  elementId: z.string().nullish(),
  locationName: z.string().nullish(),
  speakers: z.array(z.object({ name: z.string(), title: z.string().optional(), company: z.string().optional(), avatarUrl: z.string().optional() })).optional(),
  track: z.string().max(120).nullish(),
  url: z.string().max(1000).nullish(),
});
export type SessionInput = z.infer<typeof sessionInput>;

export function listSessions(eventId: string) {
  return db().select().from(schema.sessions).where(eq(schema.sessions.eventId, eventId)).orderBy(asc(schema.sessions.startsAt)).all();
}

export function getSession(eventId: string, idOrExternal: string) {
  return db().select().from(schema.sessions).where(and(eq(schema.sessions.eventId, eventId), eq(schema.sessions.id, idOrExternal))).get()
    ?? db().select().from(schema.sessions).where(and(eq(schema.sessions.eventId, eventId), eq(schema.sessions.externalId, idOrExternal))).get()
    ?? null;
}

function resolveLocation(eventId: string, input: Partial<SessionInput>) {
  const out: { boothId?: string | null; elementId?: string | null } = {};
  if (input.boothId !== undefined) out.boothId = input.boothId;
  if (input.boothLabel) {
    const b = db().select({ id: schema.booths.id }).from(schema.booths).where(and(eq(schema.booths.eventId, eventId), eq(schema.booths.label, input.boothLabel))).get();
    if (!b) throw badRequest(`Unknown booth label '${input.boothLabel}'`);
    out.boothId = b.id;
  }
  if (input.elementId !== undefined) out.elementId = input.elementId;
  if (input.locationName) {
    const el = db().select().from(schema.elements).where(eq(schema.elements.eventId, eventId)).all().find((e) => e.props?.name === input.locationName);
    if (!el) throw badRequest(`Unknown location '${input.locationName}'`);
    out.elementId = el.id;
  }
  return out;
}

export function createSession(ev: Event, input: SessionInput) {
  const id = newId("se");
  const { boothLabel: _b, locationName: _l, ...rest } = input;
  void _b; void _l;
  db().insert(schema.sessions).values({ id, eventId: ev.id, ...rest, speakers: input.speakers ?? [], ...resolveLocation(ev.id, input) }).run();
  const s = getSession(ev.id, id)!;
  emitWebhook(ev.orgId, ev.id, "session.created", s);
  return s;
}

export function updateSession(ev: Event, id: string, patch: Partial<SessionInput>) {
  const before = getSession(ev.id, id);
  if (!before) throw notFound("session");
  const { boothLabel: _b, locationName: _l, ...rest } = patch;
  void _b; void _l;
  db().update(schema.sessions).set({ ...rest, ...resolveLocation(ev.id, patch), updatedAt: new Date().toISOString() }).where(eq(schema.sessions.id, before.id)).run();
  const s = getSession(ev.id, before.id)!;
  emitWebhook(ev.orgId, ev.id, "session.updated", s);
  return s;
}

export function deleteSession(ev: Event, id: string) {
  const s = getSession(ev.id, id);
  if (!s) throw notFound("session");
  db().delete(schema.sessions).where(eq(schema.sessions.id, s.id)).run();
  emitWebhook(ev.orgId, ev.id, "session.deleted", { id: s.id, title: s.title });
}

export function bulkUpsertSessions(ev: Event, items: SessionInput[]) {
  let created = 0, updated = 0;
  const errors: { index: number; error: string }[] = [];
  items.forEach((item, index) => {
    try {
      const existing = item.externalId ? getSession(ev.id, item.externalId) : null;
      if (existing) { updateSession(ev, existing.id, item); updated++; } else { createSession(ev, item); created++; }
    } catch (e) {
      errors.push({ index, error: e instanceof Error ? e.message : String(e) });
    }
  });
  return { created, updated, errors };
}
