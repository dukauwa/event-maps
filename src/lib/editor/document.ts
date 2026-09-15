/**
 * The designer's state: one immutable document, an undo/redo history, the selection and the
 * "last saved" snapshot. Every edit is an action handled by the pure `editorReducer`.
 *
 * Interaction-only state (active tool, viewport, drag previews) lives in the React components;
 * a drag dispatches a single action on drop so history stays coarse.
 */
import type { Geometry, Point, Polygon } from "@/lib/domain/types";
import type { BBox } from "@/lib/domain/geometry";
import {
  alignSelection,
  distributeSelection,
  flipSelection,
  mergePolygons,
  renumberLabels,
  rotateSelection,
  scaleSelection,
  splitPolygon,
  transformSelection,
  translate,
  uniqueLabel,
  generateBoothArray,
  type AlignMode,
  type BoothArrayOptions,
  type RenumberOptions,
} from "./geometry-ops";
import { connectPath, removeFromNetwork, type PathTarget } from "./path";
import { diffDocuments, remapIds } from "./diff";
import { clientId, idKind, emptyDocument, type EditorBooth, type EditorDocument, type EditorEdge, type EditorElement, type EditorLevel, type EditorNode, type EditorTransition } from "./types";

export * from "./types";
export * from "./geometry-ops";
export * from "./snap";
export * from "./path";
export * from "./diff";

export interface ClipboardData { booths: EditorBooth[]; elements: EditorElement[] }

export interface EditorState {
  doc: EditorDocument;
  past: EditorDocument[];
  future: EditorDocument[];
  selection: string[];
  activeLevelId: string;
  clipboard: ClipboardData | null;
  lastSaved: EditorDocument;
  /** Increments on every document change; the autosave effect keys off it. */
  revision: number;
}

export const HISTORY_LIMIT = 200;

export type EditorAction =
  | { type: "load"; doc: EditorDocument; activeLevelId?: string }
  | { type: "select"; ids: string[]; mode?: "replace" | "add" | "toggle" }
  | { type: "setActiveLevel"; levelId: string }
  | { type: "addBooth"; booth: EditorBooth; select?: boolean }
  | { type: "addBooths"; booths: EditorBooth[]; select?: boolean }
  | { type: "updateBooths"; ids: string[]; patch: Partial<Omit<EditorBooth, "id">> }
  | { type: "setLabels"; labels: Record<string, string> }
  /** Replace (not merge) a booth's metadata, so keys can be removed. */
  | { type: "setBoothMetadata"; id: string; metadata: Record<string, string> }
  | { type: "addElement"; element: EditorElement; select?: boolean }
  | { type: "updateElements"; ids: string[]; patch: Partial<Omit<EditorElement, "id">> }
  | { type: "setGeometry"; booths?: Record<string, Polygon>; elements?: Record<string, Geometry>; nodes?: Record<string, Point> }
  | { type: "move"; ids: string[]; dx: number; dy: number }
  | { type: "rotate"; ids: string[]; deg: number; center?: Point }
  | { type: "flip"; ids: string[]; axis: "h" | "v" }
  | { type: "scale"; ids: string[]; from: BBox; to: BBox }
  | { type: "align"; ids: string[]; mode: AlignMode }
  | { type: "distribute"; ids: string[]; axis: "x" | "y" }
  | { type: "order"; ids: string[]; mode: "front" | "back" | "forward" | "backward" }
  | { type: "delete"; ids: string[] }
  | { type: "duplicate"; ids: string[]; dx?: number; dy?: number }
  | { type: "copy"; ids: string[] }
  | { type: "paste"; dx?: number; dy?: number; levelId?: string }
  | { type: "mergeBooths"; ids: string[]; label?: string }
  | { type: "splitBooth"; id: string; axis: "h" | "v"; at?: number }
  | { type: "renumber"; ids: string[]; opts: RenumberOptions }
  | { type: "pathConnect"; levelId: string; target: PathTarget; fromNodeId: string | null; newNodeId?: string; select?: boolean; flags?: { accessible?: boolean; oneWay?: boolean; virtual?: boolean; weight?: number } }
  /** Generate a rectangular block of booths (see `generateBoothArray`); `template` seeds type/status/colours. */
  | { type: "array"; levelId: string; opts: BoothArrayOptions; template?: Partial<Pick<EditorBooth, "boothType" | "status" | "priceCents" | "colors" | "height3d">> }
  | { type: "addNode"; node: EditorNode; select?: boolean }
  | { type: "updateEdges"; ids: string[]; patch: Partial<Omit<EditorEdge, "id" | "from" | "to" | "levelId">> }
  | { type: "setLevelGraph"; levelId: string; nodes: { id: string; x: number; y: number }[]; edges: { id?: string; from: string; to: string; accessible?: boolean; oneWay?: boolean; virtual?: boolean; weight?: number }[] }
  | { type: "addTransition"; transition: EditorTransition; select?: boolean }
  | { type: "updateTransitions"; ids: string[]; patch: Partial<Omit<EditorTransition, "id">> }
  | { type: "addLevel"; level: EditorLevel; activate?: boolean }
  | { type: "updateLevel"; id: string; patch: Partial<Omit<EditorLevel, "id">> }
  | { type: "deleteLevel"; id: string }
  | { type: "reorderLevels"; ids: string[] }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reconcileIds"; map: Record<string, string> }
  | { type: "markSaved"; doc: EditorDocument };

export function initialState(doc: EditorDocument, activeLevelId?: string): EditorState {
  const sorted = [...doc.levels].sort((a, b) => a.sortIndex - b.sortIndex);
  return { doc, past: [], future: [], selection: [], activeLevelId: activeLevelId ?? sorted[0]?.id ?? "", clipboard: null, lastSaved: doc, revision: 0 };
}

export function emptyState(): EditorState {
  return initialState(emptyDocument());
}

function commit(state: EditorState, doc: EditorDocument, selection?: string[]): EditorState {
  if (doc === state.doc && !selection) return state;
  const past = doc === state.doc ? state.past : [...state.past.slice(-(HISTORY_LIMIT - 1)), state.doc];
  const existing = existingIds(doc);
  const sel = (selection ?? state.selection).filter((id) => existing.has(id));
  return { ...state, doc, past, future: doc === state.doc ? state.future : [], selection: sel, revision: doc === state.doc ? state.revision : state.revision + 1 };
}

function existingIds(doc: EditorDocument): Set<string> {
  const s = new Set<string>();
  for (const b of doc.booths) s.add(b.id);
  for (const e of doc.elements) s.add(e.id);
  for (const n of doc.nodes) s.add(n.id);
  for (const e of doc.edges) s.add(e.id);
  for (const t of doc.transitions) s.add(t.id);
  return s;
}

export function labelsOf(doc: EditorDocument): Set<string> {
  return new Set(doc.booths.map((b) => b.label));
}

export interface SelectedItems {
  booths: EditorBooth[];
  elements: EditorElement[];
  nodes: EditorNode[];
  edges: EditorEdge[];
  transitions: EditorTransition[];
}

export function getSelected(doc: EditorDocument, selection: string[]): SelectedItems {
  const set = new Set(selection);
  return {
    booths: doc.booths.filter((b) => set.has(b.id)),
    elements: doc.elements.filter((e) => set.has(e.id)),
    nodes: doc.nodes.filter((n) => set.has(n.id)),
    edges: doc.edges.filter((e) => set.has(e.id)),
    transitions: doc.transitions.filter((t) => set.has(t.id)),
  };
}

function applyPatch<T extends { id: string }>(items: T[], ids: Set<string>, patch: object, getId: (t: T) => string, mergeKey?: keyof T & string): T[] {
  let changed = false;
  const p = patch as Record<string, unknown>;
  const out = items.map((it) => {
    if (!ids.has(getId(it))) return it;
    changed = true;
    const next: Record<string, unknown> = { ...it, ...p };
    if (mergeKey && p[mergeKey] && typeof p[mergeKey] === "object") next[mergeKey] = { ...(it[mergeKey] as object), ...(p[mergeKey] as object) };
    return next as T;
  });
  return changed ? out : items;
}

function cloneBooths(doc: EditorDocument, booths: EditorBooth[], dx: number, dy: number, levelId?: string): EditorBooth[] {
  const taken = labelsOf(doc);
  const t = translate(dx, dy);
  return booths.map((b) => {
    const label = uniqueLabel(b.label, taken);
    taken.add(label);
    return { ...b, id: clientId("bo"), label, externalId: null, levelId: levelId ?? b.levelId, polygon: b.polygon.map(t), status: "available", exhibitorIds: [], sortIndex: doc.booths.length };
  });
}

function cloneElements(elements: EditorElement[], dx: number, dy: number, levelId?: string): EditorElement[] {
  const t = translate(dx, dy);
  return elements.map((e) => ({ ...e, id: clientId("el"), levelId: levelId ?? e.levelId, geometry: e.geometry.type === "point" ? { type: "point", point: t(e.geometry.point) } : { type: e.geometry.type, points: e.geometry.points.map(t) } as Geometry }));
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { doc } = state;
  switch (action.type) {
    case "load":
      return initialState(action.doc, action.activeLevelId ?? state.activeLevelId);

    case "select": {
      const mode = action.mode ?? "replace";
      let sel: string[];
      if (mode === "replace") sel = [...new Set(action.ids)];
      else if (mode === "add") sel = [...new Set([...state.selection, ...action.ids])];
      else { const cur = new Set(state.selection); for (const id of action.ids) { if (cur.has(id)) cur.delete(id); else cur.add(id); } sel = [...cur]; }
      if (sel.length === state.selection.length && sel.every((id, i) => id === state.selection[i])) return state;
      return { ...state, selection: sel };
    }

    case "setActiveLevel":
      if (action.levelId === state.activeLevelId) return state;
      return { ...state, activeLevelId: action.levelId, selection: [] };

    case "addBooth": {
      const label = uniqueLabel(action.booth.label, labelsOf(doc));
      const booth = { ...action.booth, label };
      return commit(state, { ...doc, booths: [...doc.booths, booth] }, action.select === false ? undefined : [booth.id]);
    }

    case "addBooths": {
      const taken = labelsOf(doc);
      const booths = action.booths.map((b) => { const label = uniqueLabel(b.label, taken); taken.add(label); return { ...b, label }; });
      return commit(state, { ...doc, booths: [...doc.booths, ...booths] }, action.select === false ? undefined : booths.map((b) => b.id));
    }

    case "updateBooths": {
      const ids = new Set(action.ids);
      const patch = { ...action.patch };
      if (patch.label !== undefined) {
        if (ids.size !== 1) delete patch.label;
        else {
          const taken = new Set(doc.booths.filter((b) => !ids.has(b.id)).map((b) => b.label));
          patch.label = uniqueLabel(patch.label, taken);
        }
      }
      return commit(state, { ...doc, booths: applyPatch(doc.booths, ids, patch, (b) => b.id, "metadata") });
    }

    case "setLabels": {
      const taken = new Set(doc.booths.filter((b) => !(b.id in action.labels)).map((b) => b.label));
      const booths = doc.booths.map((b) => {
        const l = action.labels[b.id];
        if (l === undefined) return b;
        const label = uniqueLabel(l, taken);
        taken.add(label);
        return label === b.label ? b : { ...b, label };
      });
      return commit(state, booths.some((b, i) => b !== doc.booths[i]) ? { ...doc, booths } : doc);
    }

    case "setBoothMetadata":
      return commit(state, { ...doc, booths: doc.booths.map((b) => (b.id === action.id ? { ...b, metadata: action.metadata } : b)) });

    case "addElement": {
      const maxSort = doc.elements.reduce((m, e) => (e.levelId === action.element.levelId ? Math.max(m, e.sortIndex) : m), -1);
      const element = { ...action.element, sortIndex: maxSort + 1 };
      return commit(state, { ...doc, elements: [...doc.elements, element] }, action.select === false ? undefined : [element.id]);
    }

    case "updateElements":
      return commit(state, { ...doc, elements: applyPatch(doc.elements, new Set(action.ids), action.patch, (e) => e.id, "props") });

    case "setGeometry": {
      const b = action.booths ?? {}, e = action.elements ?? {}, n = action.nodes ?? {};
      const booths = Object.keys(b).length ? doc.booths.map((x) => (b[x.id] ? { ...x, polygon: b[x.id] } : x)) : doc.booths;
      const elements = Object.keys(e).length ? doc.elements.map((x) => (e[x.id] ? { ...x, geometry: e[x.id] } : x)) : doc.elements;
      const nodes = Object.keys(n).length ? doc.nodes.map((x) => (n[x.id] ? { ...x, x: n[x.id][0], y: n[x.id][1] } : x)) : doc.nodes;
      if (booths === doc.booths && elements === doc.elements && nodes === doc.nodes) return state;
      return commit(state, { ...doc, booths, elements, nodes });
    }

    case "move":
      if (!action.dx && !action.dy) return state;
      return commit(state, transformSelection(doc, action.ids, translate(action.dx, action.dy)));

    case "rotate":
      return commit(state, rotateSelection(doc, action.ids, action.deg, action.center));

    case "flip":
      return commit(state, flipSelection(doc, action.ids, action.axis));

    case "scale":
      return commit(state, scaleSelection(doc, action.ids, action.from, action.to));

    case "align":
      return commit(state, alignSelection(doc, action.ids, action.mode));

    case "distribute":
      return commit(state, distributeSelection(doc, action.ids, action.axis));

    case "order": {
      const ids = new Set(action.ids);
      const levels = new Set(doc.elements.filter((e) => ids.has(e.id)).map((e) => e.levelId));
      let elements = doc.elements;
      for (const levelId of levels) {
        const onLevel = elements.filter((e) => e.levelId === levelId).sort((a, b) => a.sortIndex - b.sortIndex);
        let ordered: EditorElement[];
        const sel = onLevel.filter((e) => ids.has(e.id)), rest = onLevel.filter((e) => !ids.has(e.id));
        if (action.mode === "front") ordered = [...rest, ...sel];
        else if (action.mode === "back") ordered = [...sel, ...rest];
        else {
          ordered = [...onLevel];
          const step = action.mode === "forward" ? 1 : -1;
          const indices = ordered.map((e, i) => (ids.has(e.id) ? i : -1)).filter((i) => i >= 0);
          for (const i of step > 0 ? indices.reverse() : indices) {
            const j = i + step;
            if (j < 0 || j >= ordered.length || ids.has(ordered[j].id)) continue;
            [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
          }
        }
        const sortOf = new Map(ordered.map((e, i) => [e.id, i]));
        elements = elements.map((e) => (e.levelId === levelId && sortOf.get(e.id) !== e.sortIndex ? { ...e, sortIndex: sortOf.get(e.id)! } : e));
      }
      return commit(state, elements === doc.elements ? doc : { ...doc, elements });
    }

    case "delete": {
      const ids = new Set(action.ids);
      if (!ids.size) return state;
      let next: EditorDocument = { ...doc, booths: doc.booths.filter((b) => !ids.has(b.id)), elements: doc.elements.filter((e) => !ids.has(e.id)) };
      next = removeFromNetwork(next, ids);
      return commit(state, next, state.selection.filter((id) => !ids.has(id)));
    }

    case "duplicate": {
      const ids = new Set(action.ids);
      const dx = action.dx ?? 1, dy = action.dy ?? 1;
      const booths = cloneBooths(doc, doc.booths.filter((b) => ids.has(b.id)), dx, dy);
      const elements = cloneElements(doc.elements.filter((e) => ids.has(e.id)), dx, dy);
      if (!booths.length && !elements.length) return state;
      return commit(state, { ...doc, booths: [...doc.booths, ...booths], elements: [...doc.elements, ...elements] }, [...booths.map((b) => b.id), ...elements.map((e) => e.id)]);
    }

    case "copy": {
      const ids = new Set(action.ids);
      const booths = doc.booths.filter((b) => ids.has(b.id)), elements = doc.elements.filter((e) => ids.has(e.id));
      if (!booths.length && !elements.length) return state;
      return { ...state, clipboard: { booths, elements } };
    }

    case "paste": {
      if (!state.clipboard) return state;
      const dx = action.dx ?? 2, dy = action.dy ?? 2;
      const booths = cloneBooths(doc, state.clipboard.booths, dx, dy, action.levelId);
      const elements = cloneElements(state.clipboard.elements, dx, dy, action.levelId);
      return commit(state, { ...doc, booths: [...doc.booths, ...booths], elements: [...doc.elements, ...elements] }, [...booths.map((b) => b.id), ...elements.map((e) => e.id)]);
    }

    case "mergeBooths": {
      const order = new Map(action.ids.map((id, i) => [id, i]));
      const booths = doc.booths.filter((b) => order.has(b.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
      if (booths.length < 2 || new Set(booths.map((b) => b.levelId)).size > 1) return state;
      const polygon = mergePolygons(booths.map((b) => b.polygon));
      if (!polygon) return state;
      const keep = booths[0];
      const removedIds = booths.slice(1).map((b) => b.id);
      const label = action.label ?? keep.label;
      const merged: EditorBooth = { ...keep, polygon, label, boothType: keep.boothType === "table" ? "standard" : keep.boothType, exhibitorIds: [...new Set(booths.flatMap((b) => b.exhibitorIds))] };
      const removed = new Set(removedIds);
      // Merging into a booth that was itself a previous merge target keeps one pending op per surviving booth.
      const folded = (m: { keepId: string }) => removed.has(m.keepId) || m.keepId === keep.id;
      const pendingMerges = [...doc.pendingMerges.filter((m) => !folded(m)), { keepId: keep.id, removedIds: [...new Set([...removedIds, ...doc.pendingMerges.filter(folded).flatMap((m) => m.removedIds)])], label }];
      return commit(state, { ...doc, booths: doc.booths.filter((b) => !removed.has(b.id)).map((b) => (b.id === keep.id ? merged : b)), pendingMerges }, [keep.id]);
    }

    case "splitBooth": {
      const booth = doc.booths.find((b) => b.id === action.id);
      if (!booth) return state;
      const parts = splitPolygon(booth.polygon, action.axis, action.at);
      if (!parts) return state;
      const taken = labelsOf(doc);
      const second: EditorBooth = { ...booth, id: clientId("bo"), polygon: parts[1], label: uniqueLabel(booth.label, taken), externalId: null, exhibitorIds: [], status: "available", sortIndex: doc.booths.length };
      const first = { ...booth, polygon: parts[0] };
      return commit(state, { ...doc, booths: [...doc.booths.map((b) => (b.id === booth.id ? first : b)), second] }, [first.id, second.id]);
    }

    case "renumber":
      return editorReducer(state, { type: "setLabels", labels: renumberLabels(doc, action.ids, action.opts) });

    case "pathConnect": {
      const r = connectPath(doc, action.levelId, action.target, action.fromNodeId, action.newNodeId, action.flags);
      return commit(state, r.doc, action.select === false ? undefined : [r.nodeId]);
    }

    case "array": {
      const cells = generateBoothArray(action.opts);
      if (!cells.length) return state;
      const booths: EditorBooth[] = cells.map((c, i) => ({
        id: clientId("bo"), levelId: action.levelId, label: c.label, externalId: null, polygon: c.polygon,
        boothType: action.template?.boothType ?? "standard", status: action.template?.status ?? "available", priceCents: action.template?.priceCents ?? null,
        colors: action.template?.colors ?? null, labelHidden: false, height3d: action.template?.height3d ?? null, notes: null, metadata: {}, exhibitorIds: [], sortIndex: doc.booths.length + i,
      }));
      return editorReducer(state, { type: "addBooths", booths });
    }

    case "addNode":
      return commit(state, { ...doc, nodes: [...doc.nodes, action.node] }, action.select === false ? undefined : [action.node.id]);

    case "updateEdges":
      return commit(state, { ...doc, edges: applyPatch(doc.edges, new Set(action.ids), action.patch, (e) => e.id) });

    case "setLevelGraph": {
      const nodes: EditorNode[] = [...doc.nodes.filter((n) => n.levelId !== action.levelId), ...action.nodes.map((n) => ({ id: n.id, levelId: action.levelId, x: n.x, y: n.y }))];
      const known = new Set(nodes.map((n) => n.id));
      const edges: EditorEdge[] = [
        ...doc.edges.filter((e) => e.levelId !== action.levelId),
        ...action.edges.filter((e) => known.has(e.from) && known.has(e.to) && e.from !== e.to).map((e) => ({ id: e.id ?? clientId("we"), levelId: action.levelId, from: e.from, to: e.to, accessible: e.accessible ?? true, oneWay: e.oneWay ?? false, virtual: e.virtual ?? false, weight: e.weight ?? 1 })),
      ];
      const transitions = doc.transitions.map((t) => (t.nodeIds.some((n) => !known.has(n)) ? { ...t, nodeIds: t.nodeIds.filter((n) => known.has(n)) } : t));
      return commit(state, { ...doc, nodes, edges, transitions }, []);
    }

    case "addTransition":
      return commit(state, { ...doc, transitions: [...doc.transitions, action.transition] }, action.select === false ? undefined : [action.transition.id]);

    case "updateTransitions":
      return commit(state, { ...doc, transitions: applyPatch(doc.transitions, new Set(action.ids), action.patch, (t) => t.id) });

    case "addLevel": {
      const level = { ...action.level, sortIndex: action.level.sortIndex ?? doc.levels.length };
      const next = commit(state, { ...doc, levels: [...doc.levels, level] });
      return action.activate === false ? next : { ...next, activeLevelId: level.id, selection: [] };
    }

    case "updateLevel":
      return commit(state, { ...doc, levels: applyPatch(doc.levels, new Set([action.id]), action.patch, (l) => l.id) });

    case "deleteLevel": {
      if (!doc.levels.some((l) => l.id === action.id) || doc.levels.length <= 1) return state;
      const gone = new Set([action.id, ...doc.booths.filter((b) => b.levelId === action.id).map((b) => b.id), ...doc.elements.filter((e) => e.levelId === action.id).map((e) => e.id), ...doc.nodes.filter((n) => n.levelId === action.id).map((n) => n.id)]);
      let next: EditorDocument = { ...doc, levels: doc.levels.filter((l) => l.id !== action.id).map((l, i) => (l.sortIndex === i ? l : { ...l, sortIndex: i })), booths: doc.booths.filter((b) => !gone.has(b.id)), elements: doc.elements.filter((e) => !gone.has(e.id)) };
      next = removeFromNetwork(next, gone);
      const committed = commit(state, next, []);
      const sorted = [...next.levels].sort((a, b) => a.sortIndex - b.sortIndex);
      return state.activeLevelId === action.id ? { ...committed, activeLevelId: sorted[0]?.id ?? "" } : committed;
    }

    case "reorderLevels": {
      const pos = new Map(action.ids.map((id, i) => [id, i]));
      const levels = doc.levels.map((l) => { const s = pos.get(l.id); return s === undefined || s === l.sortIndex ? l : { ...l, sortIndex: s }; });
      return commit(state, levels.some((l, i) => l !== doc.levels[i]) ? { ...doc, levels } : doc);
    }

    case "undo": {
      if (!state.past.length) return state;
      const prev = state.past[state.past.length - 1];
      const existing = existingIds(prev);
      return { ...state, doc: prev, past: state.past.slice(0, -1), future: [state.doc, ...state.future], selection: state.selection.filter((id) => existing.has(id)), revision: state.revision + 1 };
    }

    case "redo": {
      if (!state.future.length) return state;
      const [next, ...rest] = state.future;
      const existing = existingIds(next);
      return { ...state, doc: next, past: [...state.past, state.doc], future: rest, selection: state.selection.filter((id) => existing.has(id)), revision: state.revision + 1 };
    }

    case "reconcileIds": {
      const m = action.map;
      if (!Object.keys(m).length) return state;
      return {
        ...state,
        doc: remapIds(doc, m),
        past: state.past.map((d) => remapIds(d, m)),
        future: state.future.map((d) => remapIds(d, m)),
        lastSaved: remapIds(state.lastSaved, m),
        selection: state.selection.map((id) => m[id] ?? id),
        activeLevelId: m[state.activeLevelId] ?? state.activeLevelId,
        clipboard: state.clipboard,
      };
    }

    case "markSaved": {
      const strip = (d: EditorDocument) => (d.pendingMerges.length ? { ...d, pendingMerges: [] } : d);
      const current = strip(doc);
      const saved = { ...action.doc, pendingMerges: [] };
      // When the server now holds exactly what we have, share the identity so `isDirty` is false.
      const lastSaved = diffDocuments(current, saved).isEmpty ? current : saved;
      return { ...state, lastSaved, doc: current, past: state.past.map(strip), future: state.future.map(strip) };
    }

    default:
      return state;
  }
}

/** Ids in `selection` grouped by kind; handy for menus. */
export function selectionKinds(selection: string[]): Set<ReturnType<typeof idKind>> {
  return new Set(selection.map(idKind));
}

export function isDirty(state: EditorState): boolean {
  return state.doc !== state.lastSaved;
}
