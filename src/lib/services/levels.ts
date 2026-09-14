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

export function listLevels(eventId: string) {
  return db().select().from(schema.levels).where(eq(schema.levels.eventId, eventId)).orderBy(asc(schema.levels.sortIndex)).all();
}

export function getLevel(eventId: string, id: string) {
  return db().select().from(schema.levels).where(and(eq(schema.levels.id, id), eq(schema.levels.eventId, eventId))).get() ?? null;
}

export function createLevel(eventId: string, input: LevelInput) {
  const id = newId("lv");
  const existing = listLevels(eventId);
  db().insert(schema.levels).values({
    id, eventId, name: input.name, shortName: input.shortName, sortIndex: input.sortIndex ?? existing.length,
    widthM: input.widthM ?? 200, heightM: input.heightM ?? 120, background: input.background ?? null,
    georef: input.georef ?? existing[0]?.georef ?? null,
  }).run();
  return getLevel(eventId, id)!;
}

export function updateLevel(eventId: string, id: string, patch: Partial<LevelInput>) {
  if (!getLevel(eventId, id)) throw notFound("level");
  db().update(schema.levels).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(schema.levels.id, id)).run();
  return getLevel(eventId, id)!;
}

export function deleteLevel(eventId: string, id: string) {
  if (!getLevel(eventId, id)) throw notFound("level");
  db().delete(schema.levels).where(eq(schema.levels.id, id)).run();
}

export function reorderLevels(eventId: string, ids: string[]) {
  ids.forEach((id, i) => db().update(schema.levels).set({ sortIndex: i }).where(and(eq(schema.levels.id, id), eq(schema.levels.eventId, eventId))).run());
  return listLevels(eventId);
}
