import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { TRANSITION_KINDS } from "@/lib/domain/types";
import { badRequest, notFound } from "@/lib/api/http";

export const graphInput = z.object({
  levelId: z.string(),
  nodes: z.array(z.object({ id: z.string(), x: z.number(), y: z.number() })).max(50000),
  edges: z.array(z.object({ id: z.string().optional(), from: z.string(), to: z.string(), accessible: z.boolean().optional(), oneWay: z.boolean().optional(), virtual: z.boolean().optional(), weight: z.number().positive().optional() })).max(100000),
});
export type GraphInput = z.infer<typeof graphInput>;

export const transitionInput = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(TRANSITION_KINDS).optional(),
  accessible: z.boolean().optional(),
  nodeIds: z.array(z.string()).min(2),
  travelSeconds: z.number().int().nonnegative().optional(),
});
export type TransitionInput = z.infer<typeof transitionInput>;

export function getWayfinding(eventId: string, levelId?: string) {
  let nodes = db().select().from(schema.wayNodes).where(eq(schema.wayNodes.eventId, eventId)).all();
  let edges = db().select().from(schema.wayEdges).where(eq(schema.wayEdges.eventId, eventId)).all();
  if (levelId) { nodes = nodes.filter((n) => n.levelId === levelId); edges = edges.filter((e) => e.levelId === levelId); }
  const transitions = db().select().from(schema.transitions).where(eq(schema.transitions.eventId, eventId)).all();
  return {
    nodes: nodes.map((n) => ({ id: n.id, levelId: n.levelId, x: n.x, y: n.y })),
    edges: edges.map((e) => ({ id: e.id, levelId: e.levelId, from: e.fromNodeId, to: e.toNodeId, accessible: e.accessible, oneWay: e.oneWay, virtual: e.virtual, weight: e.weight })),
    transitions,
  };
}

/**
 * Replace a level's network. Node ids that already exist are kept (so transitions keep pointing at them);
 * new ids are minted for the rest. Returns the id mapping so the editor can reconcile.
 */
export function replaceLevelGraph(eventId: string, input: GraphInput) {
  const level = db().select().from(schema.levels).where(and(eq(schema.levels.id, input.levelId), eq(schema.levels.eventId, eventId))).get();
  if (!level) throw badRequest("Unknown levelId");
  const idMap = new Map<string, string>();
  db().transaction((tx) => {
    const existing = new Set(tx.select({ id: schema.wayNodes.id }).from(schema.wayNodes).where(eq(schema.wayNodes.levelId, input.levelId)).all().map((r) => r.id));
    const incoming = new Set(input.nodes.map((n) => n.id));
    const toDelete = [...existing].filter((id) => !incoming.has(id));
    if (toDelete.length) {
      tx.delete(schema.wayNodes).where(inArray(schema.wayNodes.id, toDelete)).run();
      // Keep transitions consistent: drop references to deleted nodes.
      const gone = new Set(toDelete);
      for (const t of tx.select().from(schema.transitions).where(eq(schema.transitions.eventId, eventId)).all()) {
        if (t.nodeIds.some((n) => gone.has(n))) tx.update(schema.transitions).set({ nodeIds: t.nodeIds.filter((n) => !gone.has(n)) }).where(eq(schema.transitions.id, t.id)).run();
      }
    }
    tx.delete(schema.wayEdges).where(eq(schema.wayEdges.levelId, input.levelId)).run();
    for (const n of input.nodes) {
      if (existing.has(n.id)) {
        tx.update(schema.wayNodes).set({ x: n.x, y: n.y }).where(eq(schema.wayNodes.id, n.id)).run();
        idMap.set(n.id, n.id);
      } else {
        const id = n.id.startsWith("wn_") ? n.id : newId("wn");
        tx.insert(schema.wayNodes).values({ id, eventId, levelId: input.levelId, x: n.x, y: n.y }).run();
        idMap.set(n.id, id);
      }
    }
    for (const e of input.edges) {
      const from = idMap.get(e.from), to = idMap.get(e.to);
      if (!from || !to || from === to) continue;
      tx.insert(schema.wayEdges).values({ id: newId("we"), eventId, levelId: input.levelId, fromNodeId: from, toNodeId: to, accessible: e.accessible ?? true, oneWay: e.oneWay ?? false, virtual: e.virtual ?? false, weight: e.weight ?? 1 }).run();
    }
  });
  return { idMap: Object.fromEntries(idMap), ...getWayfinding(eventId, input.levelId) };
}

export function listTransitions(eventId: string) {
  return db().select().from(schema.transitions).where(eq(schema.transitions.eventId, eventId)).all();
}

export function createTransition(eventId: string, input: TransitionInput) {
  const nodes = db().select().from(schema.wayNodes).where(and(eq(schema.wayNodes.eventId, eventId), inArray(schema.wayNodes.id, input.nodeIds))).all();
  if (nodes.length !== input.nodeIds.length) throw badRequest("Unknown node ids in transition");
  const id = newId("tr");
  db().insert(schema.transitions).values({ id, eventId, name: input.name, kind: input.kind ?? "stairs", accessible: input.accessible ?? false, nodeIds: input.nodeIds, travelSeconds: input.travelSeconds ?? 60 }).run();
  return db().select().from(schema.transitions).where(eq(schema.transitions.id, id)).get()!;
}

export function updateTransition(eventId: string, id: string, patch: Partial<TransitionInput>) {
  const t = db().select().from(schema.transitions).where(and(eq(schema.transitions.id, id), eq(schema.transitions.eventId, eventId))).get();
  if (!t) throw notFound("transition");
  db().update(schema.transitions).set(patch).where(eq(schema.transitions.id, id)).run();
  return db().select().from(schema.transitions).where(eq(schema.transitions.id, id)).get()!;
}

export function deleteTransition(eventId: string, id: string) {
  db().delete(schema.transitions).where(and(eq(schema.transitions.id, id), eq(schema.transitions.eventId, eventId))).run();
}
