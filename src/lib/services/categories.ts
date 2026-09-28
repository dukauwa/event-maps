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

export async function listCategories(eventId: string) {
  const rows = await db().select().from(schema.categories).where(eq(schema.categories.eventId, eventId)).orderBy(asc(schema.categories.sortIndex), asc(schema.categories.name)).all();
  const counts = new Map<string, number>();
  for (const r of await db().select({ c: schema.exhibitorCategories.categoryId }).from(schema.exhibitorCategories).innerJoin(schema.exhibitors, eq(schema.exhibitors.id, schema.exhibitorCategories.exhibitorId)).where(eq(schema.exhibitors.eventId, eventId)).all()) counts.set(r.c, (counts.get(r.c) ?? 0) + 1);
  return rows.map((r) => ({ ...r, exhibitorCount: counts.get(r.id) ?? 0 }));
}

export async function getCategory(eventId: string, idOrName: string) {
  return (await db().select().from(schema.categories).where(and(eq(schema.categories.eventId, eventId), eq(schema.categories.id, idOrName))).get())
    ?? (await db().select().from(schema.categories).where(and(eq(schema.categories.eventId, eventId), eq(schema.categories.name, idOrName))).get())
    ?? null;
}

export async function createCategory(eventId: string, input: CategoryInput) {
  const id = newId("ca");
  const n = (await db().select().from(schema.categories).where(eq(schema.categories.eventId, eventId)).all()).length;
  await db().insert(schema.categories).values({ id, eventId, name: input.name, color: input.color ?? null, parentId: input.parentId ?? null, sortIndex: input.sortIndex ?? n }).run();
  return (await getCategory(eventId, id))!;
}

export async function updateCategory(eventId: string, id: string, patch: Partial<CategoryInput>) {
  if (!(await getCategory(eventId, id))) throw notFound("category");
  await db().update(schema.categories).set(patch).where(eq(schema.categories.id, id)).run();
  return (await getCategory(eventId, id))!;
}

export async function deleteCategory(eventId: string, id: string) {
  if (!(await getCategory(eventId, id))) throw notFound("category");
  await db().delete(schema.categories).where(eq(schema.categories.id, id)).run();
}

/** Find-or-create by name ("Parent/Child" creates a hierarchy like ExpoFP's import). */
export async function ensureCategory(eventId: string, path: string): Promise<string> {
  const parts = path.split("/").map((s) => s.trim()).filter(Boolean);
  let parentId: string | null = null;
  let id = "";
  for (const name of parts) {
    const existing = (await db().select().from(schema.categories).where(and(eq(schema.categories.eventId, eventId), eq(schema.categories.name, name))).all()).find((c) => (c.parentId ?? null) === parentId);
    id = existing?.id ?? (await createCategory(eventId, { name, parentId })).id;
    parentId = id;
  }
  return id;
}
