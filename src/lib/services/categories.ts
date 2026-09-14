import { and, eq, asc } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { notFound } from "@/lib/api/http";

export const categoryInput = z.object({
  name: z.string().min(1).max(120),
  color: z.string().max(20).nullish(),
  parentId: z.string().nullish(),
  sortIndex: z.number().int().optional(),
});
export type CategoryInput = z.infer<typeof categoryInput>;

export function listCategories(eventId: string) {
  const rows = db().select().from(schema.categories).where(eq(schema.categories.eventId, eventId)).orderBy(asc(schema.categories.sortIndex), asc(schema.categories.name)).all();
  const counts = new Map<string, number>();
  for (const r of db().select({ c: schema.exhibitorCategories.categoryId }).from(schema.exhibitorCategories).innerJoin(schema.exhibitors, eq(schema.exhibitors.id, schema.exhibitorCategories.exhibitorId)).where(eq(schema.exhibitors.eventId, eventId)).all()) counts.set(r.c, (counts.get(r.c) ?? 0) + 1);
  return rows.map((r) => ({ ...r, exhibitorCount: counts.get(r.id) ?? 0 }));
}

export function getCategory(eventId: string, idOrName: string) {
  return db().select().from(schema.categories).where(and(eq(schema.categories.eventId, eventId), eq(schema.categories.id, idOrName))).get()
    ?? db().select().from(schema.categories).where(and(eq(schema.categories.eventId, eventId), eq(schema.categories.name, idOrName))).get()
    ?? null;
}

export function createCategory(eventId: string, input: CategoryInput) {
  const id = newId("ca");
  const n = db().select().from(schema.categories).where(eq(schema.categories.eventId, eventId)).all().length;
  db().insert(schema.categories).values({ id, eventId, name: input.name, color: input.color ?? null, parentId: input.parentId ?? null, sortIndex: input.sortIndex ?? n }).run();
  return getCategory(eventId, id)!;
}

export function updateCategory(eventId: string, id: string, patch: Partial<CategoryInput>) {
  if (!getCategory(eventId, id)) throw notFound("category");
  db().update(schema.categories).set(patch).where(eq(schema.categories.id, id)).run();
  return getCategory(eventId, id)!;
}

export function deleteCategory(eventId: string, id: string) {
  if (!getCategory(eventId, id)) throw notFound("category");
  db().delete(schema.categories).where(eq(schema.categories.id, id)).run();
}

/** Find-or-create by name ("Parent/Child" creates a hierarchy like ExpoFP's import). */
export function ensureCategory(eventId: string, path: string): string {
  const parts = path.split("/").map((s) => s.trim()).filter(Boolean);
  let parentId: string | null = null;
  let id = "";
  for (const name of parts) {
    const existing = db().select().from(schema.categories).where(and(eq(schema.categories.eventId, eventId), eq(schema.categories.name, name))).all().find((c) => (c.parentId ?? null) === parentId);
    id = existing?.id ?? createCategory(eventId, { name, parentId }).id;
    parentId = id;
  }
  return id;
}
