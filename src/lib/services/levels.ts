import { and, eq, asc } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { notFound } from "@/lib/api/http";

export const georefSchema = z.object({ originLat: z.number(), originLng: z.number(), rotationDeg: z.number(), metersPerUnit: z.number().positive() });
export const backgroundSchema = z.object({ url: z.string(), x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(), opacity: z.number().min(0).max(1), rotationDeg: z.number().optional() });

export const levelInput = z.object({
  name: z.string().min(1).max(120),
  shortName: z.string().min(1).max(12),
  sortIndex: z.number().int().optional(),
  widthM: z.number().positive().max(5000).optional(),
  heightM: z.number().positive().max(5000).optional(),
  background: backgroundSchema.nullable().optional(),
  georef: georefSchema.nullable().optional(),
});
export type LevelInput = z.infer<typeof levelInput>;

export async function listLevels(eventId: string) {
  return await db().select().from(schema.levels).where(eq(schema.levels.eventId, eventId)).orderBy(asc(schema.levels.sortIndex)).all();
}

export async function getLevel(eventId: string, id: string) {
  return (await db().select().from(schema.levels).where(and(eq(schema.levels.id, id), eq(schema.levels.eventId, eventId))).get()) ?? null;
}

export async function createLevel(eventId: string, input: LevelInput) {
  const id = newId("lv");
  const existing = await listLevels(eventId);
  await db().insert(schema.levels).values({
            id, eventId, name: input.name, shortName: input.shortName, sortIndex: input.sortIndex ?? existing.length,
            widthM: input.widthM ?? 200, heightM: input.heightM ?? 120, background: input.background ?? null,
            georef: input.georef ?? existing[0]?.georef ?? null,
          }).run();
  return (await getLevel(eventId, id))!;
}

export async function updateLevel(eventId: string, id: string, patch: Partial<LevelInput>) {
  if (!(await getLevel(eventId, id))) throw notFound("level");
  await db().update(schema.levels).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(schema.levels.id, id)).run();
  return (await getLevel(eventId, id))!;
}

export async function deleteLevel(eventId: string, id: string) {
  if (!(await getLevel(eventId, id))) throw notFound("level");
  await db().delete(schema.levels).where(eq(schema.levels.id, id)).run();
}

export async function reorderLevels(eventId: string, ids: string[]) {
  for (const [i, id] of ids.entries()) { await db().update(schema.levels).set({ sortIndex: i }).where(and(eq(schema.levels.id, id), eq(schema.levels.eventId, eventId))).run(); }
  return await listLevels(eventId);
}
