import { and, eq, asc } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { badRequest, conflict, notFound } from "@/lib/api/http";
import { emitWebhook } from "./webhooks";
import type { Event } from "@/lib/db/schema";

export const extraInput = z.object({
  kind: z.enum(["sponsorship", "booth_extra"]).optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).nullish(),
  priceCents: z.number().int().nonnegative().nullish(),
  currency: z.string().length(3).optional(),
  limitPerEvent: z.number().int().positive().nullish(),
  limitPerExhibitor: z.number().int().positive().nullish(),
  reserveOrBuyAllowed: z.boolean().optional(),
  sortIndex: z.number().int().optional(),
});
export type ExtraInput = z.infer<typeof extraInput>;

export function listExtras(eventId: string) {
  const rows = db().select().from(schema.extras).where(eq(schema.extras.eventId, eventId)).orderBy(asc(schema.extras.sortIndex)).all();
  const used = new Map<string, number>();
  for (const r of db().select().from(schema.exhibitorExtras).all()) used.set(r.extraId, (used.get(r.extraId) ?? 0) + r.quantity);
  return rows.map((r) => ({ ...r, quantityUsed: used.get(r.id) ?? 0 }));
}

export function getExtra(eventId: string, id: string) {
  return db().select().from(schema.extras).where(and(eq(schema.extras.eventId, eventId), eq(schema.extras.id, id))).get() ?? null;
}

export function createExtra(ev: Event, input: ExtraInput) {
  const id = newId("sp");
  db().insert(schema.extras).values({ id, eventId: ev.id, kind: input.kind ?? "sponsorship", name: input.name, description: input.description ?? null, priceCents: input.priceCents ?? null, currency: input.currency ?? ev.settings.sales.currency, limitPerEvent: input.limitPerEvent ?? null, limitPerExhibitor: input.limitPerExhibitor ?? null, reserveOrBuyAllowed: input.reserveOrBuyAllowed ?? true, sortIndex: input.sortIndex ?? 0 }).run();
  return getExtra(ev.id, id)!;
}

export function updateExtra(eventId: string, id: string, patch: Partial<ExtraInput>) {
  if (!getExtra(eventId, id)) throw notFound("extra");
  db().update(schema.extras).set(patch).where(eq(schema.extras.id, id)).run();
  return getExtra(eventId, id)!;
}

export function deleteExtra(eventId: string, id: string) {
  if (!getExtra(eventId, id)) throw notFound("extra");
  db().delete(schema.extras).where(eq(schema.extras.id, id)).run();
}

export function listExhibitorExtras(eventId: string, exhibitorId: string) {
  return db().select({ id: schema.exhibitorExtras.id, extraId: schema.exhibitorExtras.extraId, exhibitorId: schema.exhibitorExtras.exhibitorId, boothId: schema.exhibitorExtras.boothId, quantity: schema.exhibitorExtras.quantity, name: schema.extras.name, kind: schema.extras.kind, priceCents: schema.extras.priceCents, currency: schema.extras.currency })
    .from(schema.exhibitorExtras).innerJoin(schema.extras, eq(schema.extras.id, schema.exhibitorExtras.extraId))
    .where(and(eq(schema.extras.eventId, eventId), eq(schema.exhibitorExtras.exhibitorId, exhibitorId))).all();
}

export function assignExtra(ev: Event, exhibitorId: string, extraId: string, quantity = 1, boothId?: string | null) {
  const extra = getExtra(ev.id, extraId);
  if (!extra) throw notFound("extra");
  const all = db().select().from(schema.exhibitorExtras).where(eq(schema.exhibitorExtras.extraId, extraId)).all();
  const usedEvent = all.reduce((s, r) => s + r.quantity, 0);
  const usedEx = all.filter((r) => r.exhibitorId === exhibitorId).reduce((s, r) => s + r.quantity, 0);
  if (extra.limitPerEvent != null && usedEvent + quantity > extra.limitPerEvent) throw conflict(`Only ${Math.max(0, extra.limitPerEvent - usedEvent)} left for this event`);
  if (extra.limitPerExhibitor != null && usedEx + quantity > extra.limitPerExhibitor) throw conflict(`Limit per exhibitor is ${extra.limitPerExhibitor}`);
  if (quantity < 1) throw badRequest("quantity must be >= 1");
  const id = newId("sp");
  db().insert(schema.exhibitorExtras).values({ id, extraId, exhibitorId, quantity, boothId: boothId ?? null }).run();
  emitWebhook(ev.orgId, ev.id, "extra.assigned", { exhibitorId, extraId, quantity, boothId: boothId ?? null });
  return listExhibitorExtras(ev.id, exhibitorId);
}

export function removeExtra(ev: Event, exhibitorId: string, extraId: string) {
  db().delete(schema.exhibitorExtras).where(and(eq(schema.exhibitorExtras.exhibitorId, exhibitorId), eq(schema.exhibitorExtras.extraId, extraId))).run();
  emitWebhook(ev.orgId, ev.id, "extra.removed", { exhibitorId, extraId });
  return listExhibitorExtras(ev.id, exhibitorId);
}
