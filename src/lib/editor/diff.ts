/**
 * Turn "last saved" vs "current" documents into a save plan of API calls.
 */
import type { EditorBooth, EditorDocument, EditorLevel, EditorTransition, PendingMerge } from "./types";

export interface BoothApiInput {
  label: string;
  levelId: string;
  externalId: string | null;
  polygon: EditorBooth["polygon"];
  boothType: EditorBooth["boothType"];
  status: EditorBooth["status"];
  priceCents: number | null;
  colors: Record<string, string> | null;
  labelHidden: boolean;
  height3d: number | null;
  notes: string | null;
  metadata: Record<string, string>;
  sortIndex: number;
}

export interface LevelApiInput {
  name: string;
  shortName: string;
  sortIndex: number;
  widthM: number;
  heightM: number;
  background: EditorLevel["background"];
  georef: EditorLevel["georef"];
}

export interface TransitionApiInput {
  name: string;
  kind: EditorTransition["kind"];
  accessible: boolean;
  nodeIds: string[];
  travelSeconds: number;
}

export interface SavePlan {
  levels: { create: EditorLevel[]; update: { id: string; patch: Partial<LevelApiInput> }[]; delete: string[] };
  booths: { create: EditorBooth[]; update: { id: string; patch: Partial<BoothApiInput> }[]; delete: string[] };
  merges: PendingMerge[];
  /** Levels whose element list changed → `PUT elements`. */
  elementLevels: string[];
  /** Levels whose nodes/edges changed → `PUT wayfinding`. */
  wayfindingLevels: string[];
  transitions: { create: EditorTransition[]; update: { id: string; patch: Partial<TransitionApiInput> }[]; delete: string[] };
  isEmpty: boolean;
}

export function boothApiInput(b: EditorBooth): BoothApiInput {
  const colors = b.colors ? (Object.fromEntries(Object.entries(b.colors).filter(([, v]) => typeof v === "string" && v)) as Record<string, string>) : null;
  return { label: b.label, levelId: b.levelId, externalId: b.externalId, polygon: b.polygon, boothType: b.boothType, status: b.status, priceCents: b.priceCents, colors: colors && Object.keys(colors).length ? colors : null, labelHidden: b.labelHidden, height3d: b.height3d, notes: b.notes, metadata: b.metadata, sortIndex: b.sortIndex };
}

export function levelApiInput(l: EditorLevel): LevelApiInput {
  return { name: l.name, shortName: l.shortName, sortIndex: l.sortIndex, widthM: l.widthM, heightM: l.heightM, background: l.background, georef: l.georef };
}

export function transitionApiInput(t: EditorTransition): TransitionApiInput {
  return { name: t.name, kind: t.kind, accessible: t.accessible, nodeIds: t.nodeIds, travelSeconds: t.travelSeconds };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function changedKeys<T extends object>(before: T, after: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(after) as (keyof T)[]) if (!same(before[k], after[k])) out[k] = after[k];
  return out;
}

export function diffDocuments(saved: EditorDocument, current: EditorDocument): SavePlan {
  const savedLevels = new Map(saved.levels.map((l) => [l.id, l]));
  const curLevels = new Map(current.levels.map((l) => [l.id, l]));
  const levels: SavePlan["levels"] = { create: [], update: [], delete: [] };
  for (const l of current.levels) {
    const prev = savedLevels.get(l.id);
    if (!prev) levels.create.push(l);
    else {
      const patch = changedKeys(levelApiInput(prev), levelApiInput(l));
      if (Object.keys(patch).length) levels.update.push({ id: l.id, patch });
    }
  }
  for (const id of savedLevels.keys()) if (!curLevels.has(id)) levels.delete.push(id);
  const deletedLevels = new Set(levels.delete);

  const savedBooths = new Map(saved.booths.map((b) => [b.id, b]));
  const curBooths = new Map(current.booths.map((b) => [b.id, b]));
  const merges = current.pendingMerges.filter((m) => savedBooths.has(m.keepId) && m.removedIds.every((id) => savedBooths.has(id)));
  const mergedAway = new Set(merges.flatMap((m) => m.removedIds));
  const booths: SavePlan["booths"] = { create: [], update: [], delete: [] };
  for (const b of current.booths) {
    const prev = savedBooths.get(b.id);
    if (!prev) booths.create.push(b);
    else {
      const patch = changedKeys(boothApiInput(prev), boothApiInput(b));
      if (Object.keys(patch).length) booths.update.push({ id: b.id, patch });
    }
  }
  for (const [id, b] of savedBooths) if (!curBooths.has(id) && !deletedLevels.has(b.levelId) && !mergedAway.has(id)) booths.delete.push(id);

  const elementLevels: string[] = [];
  const wayfindingLevels: string[] = [];
  for (const l of current.levels) {
    if (!savedLevels.has(l.id)) {
      // New level: push its content once it exists.
      if (current.elements.some((e) => e.levelId === l.id)) elementLevels.push(l.id);
      if (current.nodes.some((n) => n.levelId === l.id)) wayfindingLevels.push(l.id);
      continue;
    }
    const a = saved.elements.filter((e) => e.levelId === l.id), b = current.elements.filter((e) => e.levelId === l.id);
    if (!same(a, b)) elementLevels.push(l.id);
    const na = saved.nodes.filter((n) => n.levelId === l.id), nb = current.nodes.filter((n) => n.levelId === l.id);
    const ea = saved.edges.filter((e) => e.levelId === l.id), eb = current.edges.filter((e) => e.levelId === l.id);
    if (!same(na, nb) || !same(ea, eb)) wayfindingLevels.push(l.id);
  }

  const savedTr = new Map(saved.transitions.map((t) => [t.id, t]));
  const curTr = new Map(current.transitions.map((t) => [t.id, t]));
  const transitions: SavePlan["transitions"] = { create: [], update: [], delete: [] };
  for (const t of current.transitions) {
    const prev = savedTr.get(t.id);
    if (!prev) transitions.create.push(t);
    else {
      const patch = changedKeys(transitionApiInput(prev), transitionApiInput(t));
      if (Object.keys(patch).length) transitions.update.push({ id: t.id, patch });
    }
  }
  for (const id of savedTr.keys()) if (!curTr.has(id)) transitions.delete.push(id);

  const isEmpty =
    !levels.create.length && !levels.update.length && !levels.delete.length &&
    !booths.create.length && !booths.update.length && !booths.delete.length && !merges.length &&
    !elementLevels.length && !wayfindingLevels.length &&
    !transitions.create.length && !transitions.update.length && !transitions.delete.length;
  return { levels, booths, merges, elementLevels, wayfindingLevels, transitions, isEmpty };
}

/** Rename ids everywhere (after the server minted real ids). */
export function remapIds(doc: EditorDocument, map: Record<string, string>): EditorDocument {
  const m = (id: string) => map[id] ?? id;
  if (!Object.keys(map).length) return doc;
  return {
    levels: doc.levels.map((l) => (map[l.id] ? { ...l, id: m(l.id) } : l)),
    booths: doc.booths.map((b) => (map[b.id] || map[b.levelId] ? { ...b, id: m(b.id), levelId: m(b.levelId) } : b)),
    elements: doc.elements.map((e) => (map[e.id] || map[e.levelId] ? { ...e, id: m(e.id), levelId: m(e.levelId) } : e)),
    nodes: doc.nodes.map((n) => (map[n.id] || map[n.levelId] ? { ...n, id: m(n.id), levelId: m(n.levelId) } : n)),
    edges: doc.edges.map((e) => (map[e.id] || map[e.from] || map[e.to] || map[e.levelId] ? { ...e, id: m(e.id), from: m(e.from), to: m(e.to), levelId: m(e.levelId) } : e)),
    transitions: doc.transitions.map((t) => (map[t.id] || t.nodeIds.some((n) => map[n]) ? { ...t, id: m(t.id), nodeIds: t.nodeIds.map(m) } : t)),
    pendingMerges: doc.pendingMerges.map((p) => ({ keepId: m(p.keepId), removedIds: p.removedIds.map(m), label: p.label })),
  };
}
