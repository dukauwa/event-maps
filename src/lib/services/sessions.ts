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

export async function listSessions(eventId: string) {
  return await db().select().from(schema.sessions).where(eq(schema.sessions.eventId, eventId)).orderBy(asc(schema.sessions.startsAt)).all();
}

export async function getSession(eventId: string, idOrExternal: string) {
  return (await db().select().from(schema.sessions).where(and(eq(schema.sessions.eventId, eventId), eq(schema.sessions.id, idOrExternal))).get())
    ?? (await db().select().from(schema.sessions).where(and(eq(schema.sessions.eventId, eventId), eq(schema.sessions.externalId, idOrExternal))).get())
    ?? null;
}

async function resolveLocation(eventId: string, input: Partial<SessionInput>) {
  const out: { boothId?: string | null; elementId?: string | null } = {};
  if (input.boothId !== undefined) out.boothId = input.boothId;
  if (input.boothLabel) {
    const b = await db().select({ id: schema.booths.id }).from(schema.booths).where(and(eq(schema.booths.eventId, eventId), eq(schema.booths.label, input.boothLabel))).get();
    if (!b) throw badRequest(`Unknown booth label '${input.boothLabel}'`);
    out.boothId = b.id;
  }
  if (input.elementId !== undefined) out.elementId = input.elementId;
  if (input.locationName) {
    const el = (await db().select().from(schema.elements).where(eq(schema.elements.eventId, eventId)).all()).find((e) => e.props?.name === input.locationName);
    if (!el) throw badRequest(`Unknown location '${input.locationName}'`);
    out.elementId = el.id;
  }
  return out;
}

export async function createSession(ev: Event, input: SessionInput) {
  const id = newId("se");
  const { boothLabel: _b, locationName: _l, ...rest } = input;
  void _b; void _l;
  await db().insert(schema.sessions).values({ id, eventId: ev.id, ...rest, speakers: input.speakers ?? [], ...await resolveLocation(ev.id, input) }).run();
  const s = (await getSession(ev.id, id))!;
  await emitWebhook(ev.orgId, ev.id, "session.created", s);
  return s;
}

export async function updateSession(ev: Event, id: string, patch: Partial<SessionInput>) {
  const before = await getSession(ev.id, id);
  if (!before) throw notFound("session");
  const { boothLabel: _b, locationName: _l, ...rest } = patch;
  void _b; void _l;
  await db().update(schema.sessions).set({ ...rest, ...await resolveLocation(ev.id, patch), updatedAt: new Date().toISOString() }).where(eq(schema.sessions.id, before.id)).run();
  const s = (await getSession(ev.id, before.id))!;
  await emitWebhook(ev.orgId, ev.id, "session.updated", s);
  return s;
}

export async function deleteSession(ev: Event, id: string) {
  const s = await getSession(ev.id, id);
  if (!s) throw notFound("session");
  await db().delete(schema.sessions).where(eq(schema.sessions.id, s.id)).run();
  await emitWebhook(ev.orgId, ev.id, "session.deleted", { id: s.id, title: s.title });
}

export async function bulkUpsertSessions(ev: Event, items: SessionInput[]) {
  let created = 0, updated = 0;
  const errors: { index: number; error: string }[] = [];
  for (const [index, item] of items.entries()) {
    try {
      const existing = item.externalId ? await getSession(ev.id, item.externalId) : null;
      if (existing) { await updateSession(ev, existing.id, item); updated++; } else { await createSession(ev, item); created++; }
    } catch (e) {
      errors.push({ index, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { created, updated, errors };
}
