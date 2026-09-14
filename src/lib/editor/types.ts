/**
 * Editor document model. A flattened, serialisable view of one event's map that the designer
 * edits locally; `diffDocuments` turns changes back into API calls.
 *
 * Coordinates are plan metres, x right, y DOWN (same as the bundle).
 */
import type {
  BoothColors,
  BoothStatus,
  BoothType,
  BundleBooth,
  BundleElement,
  ElementKind,
  ElementProps,
  Geometry,
  Georef,
  LevelBackground,
  PlanBundle,
  Point,
  Polygon,
  TransitionKind,
} from "@/lib/domain/types";
import { polygonArea, polygonCentroid, asRect, round } from "@/lib/domain/geometry";

export interface EditorBooth {
  id: string;
  levelId: string;
  label: string;
  externalId: string | null;
  polygon: Polygon;
  boothType: BoothType;
  status: BoothStatus;
  priceCents: number | null;
  colors: BoothColors | null;
  labelHidden: boolean;
  height3d: number | null;
  notes: string | null;
  metadata: Record<string, string>;
  /** Read-only in the designer; assignments are managed in the booth sales screens. */
  exhibitorIds: string[];
  sortIndex: number;
}

export interface EditorElement {
  id: string;
  levelId: string;
  kind: ElementKind;
  geometry: Geometry;
  props: ElementProps;
  sortIndex: number;
}

export interface EditorLevel {
  id: string;
  name: string;
  shortName: string;
  sortIndex: number;
  widthM: number;
  heightM: number;
  background: LevelBackground | null;
  georef: Georef | null;
}

export interface EditorNode { id: string; levelId: string; x: number; y: number }
export interface EditorEdge { id: string; levelId: string; from: string; to: string; accessible: boolean; oneWay: boolean; virtual: boolean; weight: number }
export interface EditorTransition { id: string; name: string; kind: TransitionKind; accessible: boolean; nodeIds: string[]; travelSeconds: number }

/** A merge performed locally that must be replayed through `POST booths/merge` on save. */
export interface PendingMerge { keepId: string; removedIds: string[]; label: string }

export interface EditorDocument {
  levels: EditorLevel[];
  booths: EditorBooth[];
  elements: EditorElement[];
  nodes: EditorNode[];
  edges: EditorEdge[];
  transitions: EditorTransition[];
  pendingMerges: PendingMerge[];
}

export type IdPrefix = "bo" | "el" | "wn" | "we" | "tr" | "lv";

let counter = 0;
/** Client-side id. Elements (`el_`) and way nodes (`wn_`) keep their ids on the server; others are reconciled after save. */
export function clientId(prefix: IdPrefix): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 12).padEnd(10, "0");
  return `${prefix}_${rand}${(counter % 1296).toString(36).padStart(2, "0")}`;
}

export function idKind(id: string): "booth" | "element" | "node" | "edge" | "transition" | "level" | "unknown" {
  if (id.startsWith("bo_")) return "booth";
  if (id.startsWith("el_")) return "element";
  if (id.startsWith("wn_") || id.startsWith("auto_")) return "node";
  if (id.startsWith("we_")) return "edge";
  if (id.startsWith("tr_")) return "transition";
  if (id.startsWith("lv_")) return "level";
  return "unknown";
}

export function emptyDocument(): EditorDocument {
  return { levels: [], booths: [], elements: [], nodes: [], edges: [], transitions: [], pendingMerges: [] };
}

/** Build the editor document from a live bundle (+ booth notes, which the public bundle omits). */
export function documentFromBundle(bundle: PlanBundle, notes: Record<string, string | null> = {}): EditorDocument {
  return {
    levels: bundle.levels.map((l) => ({ id: l.id, name: l.name, shortName: l.shortName, sortIndex: l.sortIndex, widthM: l.widthM, heightM: l.heightM, background: l.background, georef: l.georef })),
    booths: bundle.booths.map((b, i) => ({
      id: b.id,
      levelId: b.levelId,
      label: b.label,
      externalId: b.externalId ?? null,
      polygon: b.polygon,
      boothType: b.boothType,
      status: b.status,
      priceCents: b.priceCents ?? null,
      colors: b.colors,
      labelHidden: b.labelHidden,
      height3d: b.height3d ?? null,
      notes: notes[b.id] ?? null,
      metadata: b.metadata ?? {},
      exhibitorIds: b.exhibitorIds,
      sortIndex: i,
    })),
    elements: bundle.levels.flatMap((l) => l.elements.map((e) => ({ id: e.id, levelId: e.levelId, kind: e.kind, geometry: e.geometry, props: e.props ?? {}, sortIndex: e.sortIndex }))),
    nodes: bundle.wayfinding.nodes.map((n) => ({ ...n })),
    edges: bundle.wayfinding.edges.map((e) => {
      const from = bundle.wayfinding.nodes.find((n) => n.id === e.from);
      return { id: e.id, levelId: from?.levelId ?? "", from: e.from, to: e.to, accessible: e.accessible, oneWay: e.oneWay, virtual: e.virtual, weight: e.weight };
    }).filter((e) => e.levelId),
    transitions: bundle.wayfinding.transitions.map((t) => ({ ...t, nodeIds: [...t.nodeIds] })),
    pendingMerges: [],
  };
}

export function boothToBundle(b: EditorBooth): BundleBooth {
  const r = asRect(b.polygon);
  return {
    id: b.id,
    levelId: b.levelId,
    label: b.label,
    externalId: b.externalId,
    polygon: b.polygon,
    center: polygonCentroid(b.polygon).map((n) => round(n, 3)) as Point,
    boothType: b.boothType,
    status: b.status,
    priceCents: b.priceCents,
    currency: null,
    areaM2: round(polygonArea(b.polygon), 2),
    widthM: r ? round(r.w, 3) : null,
    heightM: r ? round(r.h, 3) : null,
    rotationDeg: r ? r.rotationDeg : 0,
    colors: b.colors,
    labelHidden: b.labelHidden,
    exhibitorIds: b.exhibitorIds,
    height3d: b.height3d,
    metadata: b.metadata,
  };
}

/** Rebuild a bundle from the editor state (route preview, exports). Exhibitors/sessions etc. come from `base`. */
export function bundleFromDocument(base: PlanBundle, doc: EditorDocument): PlanBundle {
  const elementsByLevel = new Map<string, BundleElement[]>();
  for (const e of doc.elements) elementsByLevel.set(e.levelId, [...(elementsByLevel.get(e.levelId) ?? []), { ...e }]);
  return {
    ...base,
    generatedAt: new Date().toISOString(),
    levels: [...doc.levels].sort((a, b) => a.sortIndex - b.sortIndex).map((l) => ({ ...l, elements: (elementsByLevel.get(l.id) ?? []).sort((a, b) => a.sortIndex - b.sortIndex) })),
    booths: doc.booths.map(boothToBundle),
    wayfinding: {
      nodes: doc.nodes.map((n) => ({ id: n.id, levelId: n.levelId, x: n.x, y: n.y })),
      edges: doc.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, accessible: e.accessible, oneWay: e.oneWay, virtual: e.virtual, weight: e.weight })),
      transitions: doc.transitions.map((t) => ({ ...t })),
    },
  };
}
