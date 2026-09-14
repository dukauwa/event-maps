/**
 * Routing graph built from a PlanBundle's wayfinding network.
 *
 * - Nodes and edges are stored both as objects (metadata) and as flat typed arrays (hot path for A*).
 * - Adjacency is a CSR structure (`outStart` / `outEdges`) over directed edges.
 * - Every level gets a uniform-grid spatial index over its (undirected) walkable segments, used to
 *   snap arbitrary points onto the nearest edges.
 * - Transitions become inter-level directed edges whose cost in "meter equivalents" is
 *   `travelSeconds * WALKING_SPEED_MPS`.
 *
 * The graph is immutable once built; per-query additions (endpoint connectors) go into a
 * {@link GraphOverlay} so the shared graph can be cached and reused across queries.
 */

import type { PlanBundle, Point, TransitionKind } from "@/lib/domain/types";
import { closestPointOnSegment, distance } from "@/lib/domain/geometry";

/** Average walking speed used to convert seconds to meter-equivalent cost and back. */
export const WALKING_SPEED_MPS = 1.4;

export interface GraphNode {
  index: number;
  id: string;
  levelId: string;
  x: number;
  y: number;
}

export interface TransitionInfo {
  id: string;
  name: string;
  kind: TransitionKind;
  travelSeconds: number;
  fromLevelId: string;
  toLevelId: string;
}

export interface GraphEdge {
  index: number;
  /** Id of the bundle edge / transition this directed edge came from (or a synthetic id for overlays). */
  sourceId: string;
  from: number;
  to: number;
  /** Geometric walking length in meters (0 for transitions). */
  length: number;
  /** Traversal cost in meter equivalents (length * weight, or travelSeconds * walking speed). */
  cost: number;
  accessible: boolean;
  /** Virtual edges are walkable but should not be drawn as part of the aisle network. */
  virtual: boolean;
  /** Set when this edge represents a transition between levels. */
  transition: TransitionInfo | null;
  /** True for the short connector edges that attach a route endpoint to the network. */
  connector: boolean;
}

/** An undirected walkable segment on one level, as stored in the spatial index. */
export interface IndexedSegment {
  index: number;
  /** Bundle edge id. */
  edgeId: string;
  /** Node indices; a -> b is the declared direction (relevant when `oneWay`). */
  a: number;
  b: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  length: number;
  weight: number;
  oneWay: boolean;
  accessible: boolean;
  virtual: boolean;
}

export interface LevelSpatialIndex {
  levelId: string;
  cellSize: number;
  minX: number;
  minY: number;
  cols: number;
  rows: number;
  cells: Map<number, number[]>;
  segments: IndexedSegment[];
}

export interface NearestEdgeHit {
  segment: IndexedSegment;
  /** Closest point on the segment. */
  point: Point;
  /** Parameter along a -> b in [0, 1]. */
  t: number;
  dist: number;
}

export interface RoutingGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeIndexById: Map<string, number>;
  /** Level ids by integer index (see `nodeLevel`). */
  levelIds: string[];
  levelIndexById: Map<string, number>;
  nodeLevel: Int32Array;
  nodeX: Float64Array;
  nodeY: Float64Array;
  /** CSR adjacency: outgoing edge indices of node n are outEdges[outStart[n] .. outStart[n + 1]). */
  outStart: Int32Array;
  outEdges: Int32Array;
  edgeFrom: Int32Array;
  edgeTo: Int32Array;
  edgeCost: Float64Array;
  edgeAccessible: Uint8Array;
  /** Smallest edge weight multiplier (<= 1); used to keep the A* heuristic admissible. */
  minWeight: number;
  spatial: Map<string, LevelSpatialIndex>;
  stats: { nodeCount: number; edgeCount: number; transitionCount: number };
}

/* ------------------------------------------------------------------ */
/* Build                                                                */
/* ------------------------------------------------------------------ */

interface PendingEdge {
  sourceId: string;
  from: number;
  to: number;
  length: number;
  cost: number;
  accessible: boolean;
  virtual: boolean;
  transition: TransitionInfo | null;
}

export function buildGraph(bundle: PlanBundle): RoutingGraph {
  const wf = bundle.wayfinding ?? { nodes: [], edges: [], transitions: [] };

  const levelIds: string[] = [];
  const levelIndexById = new Map<string, number>();
  const levelIndex = (id: string): number => {
    let li = levelIndexById.get(id);
    if (li === undefined) {
      li = levelIds.length;
      levelIds.push(id);
      levelIndexById.set(id, li);
    }
    return li;
  };
  for (const level of bundle.levels ?? []) levelIndex(level.id);

  const nodes: GraphNode[] = [];
  const nodeIndexById = new Map<string, number>();
  for (const n of wf.nodes ?? []) {
    if (!n || typeof n.id !== "string" || nodeIndexById.has(n.id)) continue;
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    const index = nodes.length;
    nodes.push({ index, id: n.id, levelId: n.levelId, x: n.x, y: n.y });
    nodeIndexById.set(n.id, index);
    levelIndex(n.levelId);
  }

  const pending: PendingEdge[] = [];
  const segmentsByLevel = new Map<string, IndexedSegment[]>();
  let minWeight = 1;

  for (const e of wf.edges ?? []) {
    if (!e) continue;
    const from = nodeIndexById.get(e.from);
    const to = nodeIndexById.get(e.to);
    if (from === undefined || to === undefined || from === to) continue;
    const a = nodes[from];
    const b = nodes[to];
    const weight = Number.isFinite(e.weight) && e.weight > 0 ? e.weight : 1;
    if (weight < minWeight) minWeight = weight;
    const length = distance([a.x, a.y], [b.x, b.y]);
    const cost = length * weight;
    const accessible = e.accessible !== false;
    const virtual = e.virtual === true;
    const oneWay = e.oneWay === true;
    pending.push({ sourceId: e.id, from, to, length, cost, accessible, virtual, transition: null });
    if (!oneWay) pending.push({ sourceId: e.id, from: to, to: from, length, cost, accessible, virtual, transition: null });

    if (a.levelId === b.levelId) {
      let list = segmentsByLevel.get(a.levelId);
      if (!list) {
        list = [];
        segmentsByLevel.set(a.levelId, list);
      }
      list.push({
        index: list.length,
        edgeId: e.id,
        a: from,
        b: to,
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        length,
        weight,
        oneWay,
        accessible,
        virtual,
      });
    }
  }

  let transitionCount = 0;
  for (const t of wf.transitions ?? []) {
    if (!t || !Array.isArray(t.nodeIds)) continue;
    const idx: number[] = [];
    for (const id of t.nodeIds) {
      const ni = nodeIndexById.get(id);
      if (ni !== undefined && !idx.includes(ni)) idx.push(ni);
    }
    if (idx.length < 2) continue;
    const travelSeconds = Number.isFinite(t.travelSeconds) && t.travelSeconds > 0 ? t.travelSeconds : 0;
    const cost = travelSeconds * WALKING_SPEED_MPS;
    const accessible = t.accessible !== false;
    transitionCount++;
    for (let i = 0; i < idx.length; i++) {
      for (let j = 0; j < idx.length; j++) {
        if (i === j) continue;
        const from = idx[i];
        const to = idx[j];
        pending.push({
          sourceId: t.id,
          from,
          to,
          length: 0,
          cost,
          accessible,
          virtual: true,
          transition: {
            id: t.id,
            name: t.name ?? "",
            kind: t.kind,
            travelSeconds,
            fromLevelId: nodes[from].levelId,
            toLevelId: nodes[to].levelId,
          },
        });
      }
    }
  }

  // CSR adjacency via counting sort on `from`.
  const N = nodes.length;
  const E = pending.length;
  const outStart = new Int32Array(N + 1);
  for (const p of pending) outStart[p.from + 1]++;
  for (let i = 0; i < N; i++) outStart[i + 1] += outStart[i];
  const fill = outStart.slice(0, N);
  const outEdges = new Int32Array(E);
  const edges: GraphEdge[] = new Array<GraphEdge>(E);
  const edgeFrom = new Int32Array(E);
  const edgeTo = new Int32Array(E);
  const edgeCost = new Float64Array(E);
  const edgeAccessible = new Uint8Array(E);
  for (let i = 0; i < E; i++) {
    const p = pending[i];
    edges[i] = {
      index: i,
      sourceId: p.sourceId,
      from: p.from,
      to: p.to,
      length: p.length,
      cost: p.cost,
      accessible: p.accessible,
      virtual: p.virtual,
      transition: p.transition,
      connector: false,
    };
    edgeFrom[i] = p.from;
    edgeTo[i] = p.to;
    edgeCost[i] = p.cost;
    edgeAccessible[i] = p.accessible ? 1 : 0;
    outEdges[fill[p.from]++] = i;
  }

  const nodeLevel = new Int32Array(N);
  const nodeX = new Float64Array(N);
  const nodeY = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    nodeLevel[i] = levelIndexById.get(n.levelId) ?? -1;
    nodeX[i] = n.x;
    nodeY[i] = n.y;
  }

  const spatial = new Map<string, LevelSpatialIndex>();
  for (const [levelId, segments] of segmentsByLevel) spatial.set(levelId, buildSpatialIndex(levelId, segments));

  return {
    nodes,
    edges,
    nodeIndexById,
    levelIds,
    levelIndexById,
    nodeLevel,
    nodeX,
    nodeY,
    outStart,
    outEdges,
    edgeFrom,
    edgeTo,
    edgeCost,
    edgeAccessible,
    minWeight,
    spatial,
    stats: { nodeCount: N, edgeCount: E, transitionCount },
  };
}

/* ------------------------------------------------------------------ */
/* Spatial index                                                        */
/* ------------------------------------------------------------------ */

const MAX_GRID_CELLS = 250_000;

function buildSpatialIndex(levelId: string, segments: IndexedSegment[]): LevelSpatialIndex {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of segments) {
    minX = Math.min(minX, s.ax, s.bx);
    maxX = Math.max(maxX, s.ax, s.bx);
    minY = Math.min(minY, s.ay, s.by);
    maxY = Math.max(maxY, s.ay, s.by);
  }
  if (!Number.isFinite(minX)) {
    minX = minY = 0;
    maxX = maxY = 1;
  }
  const w = Math.max(maxX - minX, 1e-6);
  const h = Math.max(maxY - minY, 1e-6);
  // Aim for roughly one segment per cell, but keep cells at least 1 m and the grid bounded.
  let cellSize = Math.max(1, Math.sqrt((w * h) / Math.max(1, segments.length)) * 1.5);
  while (Math.ceil(w / cellSize) * Math.ceil(h / cellSize) > MAX_GRID_CELLS) cellSize *= 2;
  const cols = Math.max(1, Math.ceil(w / cellSize));
  const rows = Math.max(1, Math.ceil(h / cellSize));
  const cells = new Map<number, number[]>();
  const cellOf = (v: number, min: number, count: number): number =>
    Math.min(count - 1, Math.max(0, Math.floor((v - min) / cellSize)));
  for (const s of segments) {
    const cx0 = cellOf(Math.min(s.ax, s.bx), minX, cols);
    const cx1 = cellOf(Math.max(s.ax, s.bx), minX, cols);
    const cy0 = cellOf(Math.min(s.ay, s.by), minY, rows);
    const cy1 = cellOf(Math.max(s.ay, s.by), minY, rows);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = cy * cols + cx;
        let bucket = cells.get(key);
        if (!bucket) {
          bucket = [];
          cells.set(key, bucket);
        }
        bucket.push(s.index);
      }
    }
  }
  return { levelId, cellSize, minX, minY, cols, rows, cells, segments };
}

/**
 * Find the K nearest indexed segments to a point, optionally filtered. Uses ring expansion over
 * the grid so the query cost is proportional to the local density, not the level size.
 */
export function nearestEdges(
  index: LevelSpatialIndex,
  p: Point,
  k: number,
  filter?: (s: IndexedSegment) => boolean,
): NearestEdgeHit[] {
  if (k <= 0 || index.segments.length === 0) return [];
  const { cellSize, minX, minY, cols, rows, cells, segments } = index;
  const qx = Math.floor((p[0] - minX) / cellSize);
  const qy = Math.floor((p[1] - minY) / cellSize);
  const maxRing = Math.max(qx, cols - 1 - qx, qy, rows - 1 - qy, 0);
  const best: NearestEdgeHit[] = [];
  const seen = new Set<number>();

  const consider = (cx: number, cy: number): void => {
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
    const bucket = cells.get(cy * cols + cx);
    if (!bucket) return;
    for (const si of bucket) {
      if (seen.has(si)) continue;
      seen.add(si);
      const s = segments[si];
      if (filter && !filter(s)) continue;
      const c = closestPointOnSegment(p, [s.ax, s.ay], [s.bx, s.by]);
      if (best.length < k || c.dist < best[best.length - 1].dist) {
        const hit: NearestEdgeHit = { segment: s, point: c.point, t: c.t, dist: c.dist };
        let i = best.length;
        best.push(hit);
        while (i > 0 && best[i - 1].dist > hit.dist) {
          best[i] = best[i - 1];
          i--;
        }
        best[i] = hit;
        if (best.length > k) best.pop();
      }
    }
  };

  for (let r = 0; r <= maxRing; r++) {
    // Anything in ring r is at least (r - 1) * cellSize away from p.
    if (best.length >= k && (r - 1) * cellSize > best[best.length - 1].dist) break;
    if (r === 0) {
      consider(qx, qy);
      continue;
    }
    for (let dx = -r; dx <= r; dx++) {
      consider(qx + dx, qy - r);
      consider(qx + dx, qy + r);
    }
    for (let dy = -r + 1; dy <= r - 1; dy++) {
      consider(qx - r, qy + dy);
      consider(qx + r, qy + dy);
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Overlay: per-query temporary nodes and edges                         */
/* ------------------------------------------------------------------ */

export interface GraphOverlay {
  /** Extra nodes; node index = graph.nodes.length + position. */
  nodes: GraphNode[];
  /** Extra directed edges; edge index = graph.edges.length + position. */
  edges: GraphEdge[];
  /** Extra outgoing edge indices for any node (base or overlay). */
  outgoing: Map<number, number[]>;
}

export function createOverlay(): GraphOverlay {
  return { nodes: [], edges: [], outgoing: new Map() };
}

export function overlayAddNode(graph: RoutingGraph, overlay: GraphOverlay, levelId: string, point: Point, id?: string): number {
  const index = graph.nodes.length + overlay.nodes.length;
  overlay.nodes.push({ index, id: id ?? `~overlay_${overlay.nodes.length}`, levelId, x: point[0], y: point[1] });
  return index;
}

export interface OverlayEdgeInit {
  sourceId: string;
  length?: number;
  weight?: number;
  accessible?: boolean;
  virtual?: boolean;
  connector?: boolean;
  transition?: TransitionInfo | null;
}

export function overlayAddEdge(graph: RoutingGraph, overlay: GraphOverlay, from: number, to: number, init: OverlayEdgeInit): number {
  const a = getNode(graph, overlay, from);
  const b = getNode(graph, overlay, to);
  const length = init.length ?? distance([a.x, a.y], [b.x, b.y]);
  const weight = init.weight !== undefined && init.weight > 0 ? init.weight : 1;
  const index = graph.edges.length + overlay.edges.length;
  overlay.edges.push({
    index,
    sourceId: init.sourceId,
    from,
    to,
    length,
    cost: length * weight,
    accessible: init.accessible ?? true,
    virtual: init.virtual ?? true,
    transition: init.transition ?? null,
    connector: init.connector ?? false,
  });
  let list = overlay.outgoing.get(from);
  if (!list) {
    list = [];
    overlay.outgoing.set(from, list);
  }
  list.push(index);
  return index;
}

export function getNode(graph: RoutingGraph, overlay: GraphOverlay | undefined, index: number): GraphNode {
  if (index < graph.nodes.length) return graph.nodes[index];
  const n = overlay?.nodes[index - graph.nodes.length];
  if (!n) throw new Error(`Unknown node index ${index}`);
  return n;
}

export function getEdge(graph: RoutingGraph, overlay: GraphOverlay | undefined, index: number): GraphEdge {
  if (index < graph.edges.length) return graph.edges[index];
  const e = overlay?.edges[index - graph.edges.length];
  if (!e) throw new Error(`Unknown edge index ${index}`);
  return e;
}

/** Total number of nodes visible through an overlay. */
export function nodeCount(graph: RoutingGraph, overlay?: GraphOverlay): number {
  return graph.nodes.length + (overlay?.nodes.length ?? 0);
}

/** Does the level have at least one walkable segment in the network? */
export function levelHasNetwork(graph: RoutingGraph, levelId: string): boolean {
  const idx = graph.spatial.get(levelId);
  return !!idx && idx.segments.length > 0;
}
