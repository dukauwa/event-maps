import { and, eq, asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { ELEMENT_KINDS } from "@/lib/domain/types";
import { badRequest, notFound } from "@/lib/api/http";

const point = z.tuple([z.number(), z.number()]);
export const geometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("polygon"), points: z.array(point).min(3).max(2000) }),
  z.object({ type: z.literal("polyline"), points: z.array(point).min(2).max(5000) }),
  z.object({ type: z.literal("point"), point }),
]);

export const elementInput = z.object({
  id: z.string().optional(),
  levelId: z.string(),
  kind: z.enum(ELEMENT_KINDS),
  geometry: geometrySchema,
  props: z.record(z.string(), z.unknown()).optional(),
  sortIndex: z.number().int().optional(),
});
export type ElementInput = z.infer<typeof elementInput>;

export function listElements(eventId: string, levelId?: string) {
  const rows = db().select().from(schema.elements).where(eq(schema.elements.eventId, eventId)).orderBy(asc(schema.elements.sortIndex)).all();
  return levelId ? rows.filter((e) => e.levelId === levelId) : rows;
}

export function getElement(eventId: string, id: string) {
  return db().select().from(schema.elements).where(and(eq(schema.elements.eventId, eventId), eq(schema.elements.id, id))).get() ?? null;
}

function assertLevel(eventId: string, levelId: string) {
  if (!db().select().from(schema.levels).where(and(eq(schema.levels.id, levelId), eq(schema.levels.eventId, eventId))).get()) throw badRequest("Unknown levelId");
}

export function createElement(eventId: string, input: ElementInput) {
  assertLevel(eventId, input.levelId);
  const id = input.id && input.id.startsWith("el_") && !getElement(eventId, input.id) ? input.id : newId("el");
  db().insert(schema.elements).values({ id, eventId, levelId: input.levelId, kind: input.kind, geometry: input.geometry, props: (input.props ?? {}) as Record<string, unknown>, sortIndex: input.sortIndex ?? 0 }).run();
  return getElement(eventId, id)!;
}

export function updateElement(eventId: string, id: string, patch: Partial<ElementInput>) {
  if (!getElement(eventId, id)) throw notFound("element");
  if (patch.levelId) assertLevel(eventId, patch.levelId);
  const { id: _i, ...rest } = patch;
  void _i;
  db().update(schema.elements).set({ ...rest, ...(rest.props ? { props: rest.props as Record<string, unknown> } : {}), updatedAt: new Date().toISOString() }).where(eq(schema.elements.id, id)).run();
  return getElement(eventId, id)!;
}

export function deleteElement(eventId: string, id: string) {
  if (!getElement(eventId, id)) throw notFound("element");
  db().delete(schema.elements).where(eq(schema.elements.id, id)).run();
}

/** Replace all elements of a level in one transaction (editor save). Keeps ids that are supplied so sessions linked to rooms survive. */
export function replaceLevelElements(eventId: string, levelId: string, items: ElementInput[]) {
  assertLevel(eventId, levelId);
  const d = db();
  d.transaction((tx) => {
    const keep = new Set(items.map((i) => i.id).filter((x): x is string => !!x));
    const existing = tx.select({ id: schema.elements.id }).from(schema.elements).where(and(eq(schema.elements.eventId, eventId), eq(schema.elements.levelId, levelId))).all().map((r) => r.id);
    const toDelete = existing.filter((id) => !keep.has(id));
    if (toDelete.length) tx.delete(schema.elements).where(inArray(schema.elements.id, toDelete)).run();
    items.forEach((item, i) => {
      const props = (item.props ?? {}) as Record<string, unknown>;
      if (item.id && existing.includes(item.id)) {
        tx.update(schema.elements).set({ kind: item.kind, geometry: item.geometry, props, sortIndex: item.sortIndex ?? i, updatedAt: new Date().toISOString() }).where(eq(schema.elements.id, item.id)).run();
      } else {
        tx.insert(schema.elements).values({ id: item.id && item.id.startsWith("el_") ? item.id : newId("el"), eventId, levelId, kind: item.kind, geometry: item.geometry, props, sortIndex: item.sortIndex ?? i }).run();
      }
    });
  });
  return listElements(eventId, levelId);
}
