import { and, eq, asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { newId, secretToken } from "@/lib/ids";
import { SPONSOR_LEVELS } from "@/lib/domain/types";
import { badRequest, conflict, notFound } from "@/lib/api/http";
import { emitWebhook } from "./webhooks";
import { slugify } from "@/lib/seed/demo";
import type { Event, Exhibitor } from "@/lib/db/schema";

export const exhibitorInput = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/).optional(),
  externalId: z.string().max(120).nullish(),
  gripId: z.string().max(120).nullish(),
  logoUrl: z.string().max(200000).nullish(),
  gallery: z.array(z.string()).max(30).optional(),
  description: z.string().max(20000).nullish(),
  website: z.string().max(500).nullish(),
  email: z.string().max(200).nullish(),
  phone: z.string().max(60).nullish(),
  country: z.string().max(100).nullish(),
  address: z.string().max(300).nullish(),
  city: z.string().max(120).nullish(),
  zip: z.string().max(30).nullish(),
  featured: z.boolean().optional(),
  sponsorLevel: z.enum(SPONSOR_LEVELS).nullish(),
  customButtonTitle: z.string().max(80).nullish(),
  customButtonUrl: z.string().max(1000).nullish(),
  videoUrl: z.string().max(1000).nullish(),
  leadingImageUrl: z.string().max(200000).nullish(),
  logoInBooth: z.boolean().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  rebookingState: z.number().int().min(0).max(3).optional(),
  socials: z.record(z.string(), z.string()).optional(),
  tags: z.array(z.string().max(60)).max(50).optional(),
  contactName: z.string().max(120).nullish(),
  categoryIds: z.array(z.string()).optional(),
  boothIds: z.array(z.string()).optional(),
  boothLabels: z.array(z.string()).optional(),
});
export type ExhibitorInput = z.infer<typeof exhibitorInput>;
export const exhibitorPatch = exhibitorInput.partial();

export interface ExhibitorFull extends Exhibitor { categoryIds: string[]; boothIds: string[]; boothLabels: string[] }

export async function hydrate(rows: Exhibitor[]): Promise<ExhibitorFull[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const cats = await db().select().from(schema.exhibitorCategories).where(inArray(schema.exhibitorCategories.exhibitorId, ids)).all();
  const links = await db().select({ boothId: schema.boothExhibitors.boothId, exhibitorId: schema.boothExhibitors.exhibitorId, label: schema.booths.label }).from(schema.boothExhibitors).innerJoin(schema.booths, eq(schema.booths.id, schema.boothExhibitors.boothId)).where(inArray(schema.boothExhibitors.exhibitorId, ids)).all();
  const cm = new Map<string, string[]>(), bm = new Map<string, { id: string; label: string }[]>();
  for (const c of cats) cm.set(c.exhibitorId, [...(cm.get(c.exhibitorId) ?? []), c.categoryId]);
  for (const l of links) bm.set(l.exhibitorId, [...(bm.get(l.exhibitorId) ?? []), { id: l.boothId, label: l.label }]);
  return rows.map((r) => ({ ...r, categoryIds: cm.get(r.id) ?? [], boothIds: (bm.get(r.id) ?? []).map((b) => b.id), boothLabels: (bm.get(r.id) ?? []).map((b) => b.label) }));
}

export async function listExhibitors(eventId: string, filter: { q?: string; categoryId?: string; levelId?: string; featured?: boolean; unassigned?: boolean } = {}): Promise<ExhibitorFull[]> {
  let rows = await hydrate(await db().select().from(schema.exhibitors).where(eq(schema.exhibitors.eventId, eventId)).orderBy(asc(schema.exhibitors.name)).all());
  if (filter.q) { const q = filter.q.toLowerCase(); rows = rows.filter((e) => e.name.toLowerCase().includes(q) || e.externalId?.toLowerCase().includes(q) || e.boothLabels.some((l) => l.toLowerCase().includes(q))); }
  if (filter.categoryId) rows = rows.filter((e) => e.categoryIds.includes(filter.categoryId!));
  if (filter.featured !== undefined) rows = rows.filter((e) => e.featured === filter.featured);
  if (filter.unassigned) rows = rows.filter((e) => e.boothIds.length === 0);
  if (filter.levelId) {
    const boothLevel = new Map((await db().select({ id: schema.booths.id, levelId: schema.booths.levelId }).from(schema.booths).where(eq(schema.booths.eventId, eventId)).all()).map((b) => [b.id, b.levelId]));
    rows = rows.filter((e) => e.boothIds.some((b) => boothLevel.get(b) === filter.levelId));
  }
  return rows;
}

export async function getExhibitor(eventId: string, idSlugOrExternal: string): Promise<ExhibitorFull | null> {
  const row = (await db().select().from(schema.exhibitors).where(and(eq(schema.exhibitors.eventId, eventId), eq(schema.exhibitors.id, idSlugOrExternal))).get())
    ?? (await db().select().from(schema.exhibitors).where(and(eq(schema.exhibitors.eventId, eventId), eq(schema.exhibitors.slug, idSlugOrExternal))).get())
    ?? (await db().select().from(schema.exhibitors).where(and(eq(schema.exhibitors.eventId, eventId), eq(schema.exhibitors.externalId, idSlugOrExternal))).get());
  return row ? (await hydrate([row]))[0] : null;
}

async function uniqueSlug(eventId: string, base: string, ignoreId?: string) {
  let slug = base || "exhibitor";
  let i = 2;
  for (;;) {
    const hit = await db().select().from(schema.exhibitors).where(and(eq(schema.exhibitors.eventId, eventId), eq(schema.exhibitors.slug, slug))).get();
    if (!hit || hit.id === ignoreId) return slug;
    slug = `${base}-${i++}`;
  }
}

async function resolveBoothIds(eventId: string, input: ExhibitorInput | Partial<ExhibitorInput>): Promise<string[] | undefined> {
  if (!input.boothIds && !input.boothLabels) return undefined;
  const ids = new Set(input.boothIds ?? []);
  for (const label of input.boothLabels ?? []) {
    const b = await db().select({ id: schema.booths.id }).from(schema.booths).where(and(eq(schema.booths.eventId, eventId), eq(schema.booths.label, label))).get();
    if (!b) throw badRequest(`Unknown booth label '${label}'`);
    ids.add(b.id);
  }
  return [...ids];
}

export async function createExhibitor(ev: Event, input: ExhibitorInput): Promise<ExhibitorFull> {
  if (input.externalId && (await getExhibitor(ev.id, input.externalId))) throw conflict(`externalId '${input.externalId}' already exists`);
  const id = newId("ex");
  const { categoryIds, boothIds: _b, boothLabels: _l, slug, ...rest } = input;
  void _b; void _l;
  await db().insert(schema.exhibitors).values({ id, eventId: ev.id, ...rest, slug: await uniqueSlug(ev.id, slug ?? slugify(input.name)), gallery: input.gallery ?? [], socials: input.socials ?? {}, tags: input.tags ?? [], featured: input.featured ?? false, portalToken: secretToken(32) }).run();
  if (categoryIds) await setExhibitorCategories(ev.id, id, categoryIds);
  const booths = await resolveBoothIds(ev.id, input);
  if (booths) await setExhibitorBooths(ev, id, booths);
  const e = (await getExhibitor(ev.id, id))!;
  await emitWebhook(ev.orgId, ev.id, "exhibitor.created", e);
  return e;
}

export async function updateExhibitor(ev: Event, id: string, patch: Partial<ExhibitorInput>): Promise<ExhibitorFull> {
  const before = await getExhibitor(ev.id, id);
  if (!before) throw notFound("exhibitor");
  const { categoryIds, boothIds: _b, boothLabels: _l, slug, ...rest } = patch;
  void _b; void _l;
  await db().update(schema.exhibitors).set({ ...rest, ...(slug ? { slug: await uniqueSlug(ev.id, slug, before.id) } : {}), updatedAt: new Date().toISOString() }).where(eq(schema.exhibitors.id, before.id)).run();
  if (categoryIds) await setExhibitorCategories(ev.id, before.id, categoryIds);
  const booths = await resolveBoothIds(ev.id, patch);
  if (booths) await setExhibitorBooths(ev, before.id, booths);
  const after = (await getExhibitor(ev.id, before.id))!;
  await emitWebhook(ev.orgId, ev.id, "exhibitor.updated", after);
  return after;
}

export async function deleteExhibitor(ev: Event, id: string) {
  const e = await getExhibitor(ev.id, id);
  if (!e) throw notFound("exhibitor");
  await db().delete(schema.exhibitors).where(eq(schema.exhibitors.id, e.id)).run();
  await emitWebhook(ev.orgId, ev.id, "exhibitor.deleted", { id: e.id, name: e.name });
}

export async function setExhibitorCategories(eventId: string, exhibitorId: string, categoryIds: string[]) {
  const valid = categoryIds.length ? (await db().select({ id: schema.categories.id }).from(schema.categories).where(and(eq(schema.categories.eventId, eventId), inArray(schema.categories.id, categoryIds))).all()).map((r) => r.id) : [];
  await db().delete(schema.exhibitorCategories).where(eq(schema.exhibitorCategories.exhibitorId, exhibitorId)).run();
  for (const c of new Set(valid)) await db().insert(schema.exhibitorCategories).values({ exhibitorId, categoryId: c }).run();
}

export async function setExhibitorBooths(ev: Event, exhibitorId: string, boothIds: string[]) {
  const current = await db().select().from(schema.boothExhibitors).where(eq(schema.boothExhibitors.exhibitorId, exhibitorId)).all();
  for (const c of current) if (!boothIds.includes(c.boothId)) await db().delete(schema.boothExhibitors).where(and(eq(schema.boothExhibitors.boothId, c.boothId), eq(schema.boothExhibitors.exhibitorId, exhibitorId))).run();
  for (const b of boothIds) {
    const booth = await db().select().from(schema.booths).where(and(eq(schema.booths.id, b), eq(schema.booths.eventId, ev.id))).get();
    if (!booth) throw badRequest(`Unknown booth '${b}'`);
    if (!current.some((c) => c.boothId === b)) {
      const n = (await db().select().from(schema.boothExhibitors).where(eq(schema.boothExhibitors.boothId, b)).all()).length;
      await db().insert(schema.boothExhibitors).values({ boothId: b, exhibitorId, sortIndex: n }).run();
      await emitWebhook(ev.orgId, ev.id, "booth.assigned", { boothId: b, label: booth.label, exhibitorIds: [exhibitorId] });
    }
  }
}

export async function rotatePortalToken(eventId: string, id: string) {
  const e = await getExhibitor(eventId, id);
  if (!e) throw notFound("exhibitor");
  const portalToken = secretToken(32);
  await db().update(schema.exhibitors).set({ portalToken }).where(eq(schema.exhibitors.id, e.id)).run();
  return portalToken;
}

export function portalPath(e: Exhibitor) {
  return `/x/${e.portalToken}`;
}

/** Upsert by externalId, then gripId, then exact name. */
export async function bulkUpsertExhibitors(ev: Event, items: ExhibitorInput[]) {
  let created = 0, updated = 0;
  const errors: { index: number; error: string }[] = [];
  for (const [index, item] of items.entries()) {
    try {
      const existing = (item.externalId && (await getExhibitor(ev.id, item.externalId)))
        || (item.gripId && (await hydrate(await db().select().from(schema.exhibitors).where(and(eq(schema.exhibitors.eventId, ev.id), eq(schema.exhibitors.gripId, item.gripId))).all()))[0])
        || (await hydrate(await db().select().from(schema.exhibitors).where(and(eq(schema.exhibitors.eventId, ev.id), eq(schema.exhibitors.name, item.name))).all()))[0];
      if (existing) { await updateExhibitor(ev, existing.id, item); updated++; } else { await createExhibitor(ev, item); created++; }
    } catch (e) {
      errors.push({ index, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { created, updated, errors };
}
