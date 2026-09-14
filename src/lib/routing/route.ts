/**
 * High-level routing: resolve endpoints, attach them to the network, run A*, and turn the result
 * into level-grouped steps with simple turn-by-turn instructions.
 */

import type {
  BundleBooth,
  BundleElement,
  BundleExhibitor,
  BundleLevel,
  BundleWayNode,
  PlanBundle,
  Point,
  RouteEndpoint,
  RouteError,
  RouteResult,
  RouteStep,
  TransitionKind,
} from "@/lib/domain/types";
import { distance, polygonCentroid, round } from "@/lib/domain/geometry";
import { astar, type AStarResult } from "./astar";
import {
  WALKING_SPEED_MPS,
  createOverlay,
  getEdge,
  getNode,
  nearestEdges,
  overlayAddEdge,
  overlayAddNode,
  type GraphOverlay,
  type IndexedSegment,
  type NearestEdgeHit,
  type RoutingGraph,
  type TransitionInfo,
} from "./graph";

export interface FindRouteOptions {
  /** Only use accessible edges and transitions. */
  accessible?: boolean;
  /** How many nearest edges each endpoint is connected to (default 3). */
  snapEdges?: number;
}

export interface ResolvedEndpoint {
  levelId: string;
  point: Point;
  /** Human readable name used in the arrival instruction. */
  label: string;
}

const DEFAULT_SNAP_EDGES = 3;
const TURN_ANGLE_DEG = 35;
const UTURN_ANGLE_DEG = 150;
/** Segments shorter than this do not generate turn instructions (avoids jitter at connectors). */
const MIN_TURN_SEGMENT_M = 0.5;
const COLLINEAR_SIN = Math.sin((1 * Math.PI) / 180);

/* ------------------------------------------------------------------ */
/* Bundle lookups                                                       */
/* ------------------------------------------------------------------ */

export interface BundleIndex {
  levels: Map<string, BundleLevel>;
  booths: Map<string, BundleBooth>;
  exhibitors: Map<string, BundleExhibitor>;
  elements: Map<string, BundleElement>;
  nodes: Map<string, BundleWayNode>;
}

const indexCache = new WeakMap<PlanBundle, BundleIndex>();

/** Id lookups for a bundle, memoised per bundle object. */
export function bundleIndex(bundle: PlanBundle): BundleIndex {
  let idx = indexCache.get(bundle);
  if (idx) return idx;
  idx = {
    levels: new Map(),
    booths: new Map(),
    exhibitors: new Map(),
    elements: new Map(),
    nodes: new Map(),
  };
  for (const l of bundle.levels ?? []) {
    idx.levels.set(l.id, l);
    for (const el of l.elements ?? []) idx.elements.set(el.id, el);
  }
  for (const b of bundle.booths ?? []) idx.booths.set(b.id, b);
  for (const ex of bundle.exhibitors ?? []) idx.exhibitors.set(ex.id, ex);
  for (const n of bundle.wayfinding?.nodes ?? []) idx.nodes.set(n.id, n);
  indexCache.set(bundle, idx);
  return idx;
}

export function levelName(bundle: PlanBundle, levelId: string): string {
  return bundleIndex(bundle).levels.get(levelId)?.name ?? levelId;
}

/** Stable string key for an endpoint (used for caching). */
export function endpointKey(endpoint: RouteEndpoint): string {
  if (endpoint.type === "point") return `point:${endpoint.levelId}:${endpoint.x}:${endpoint.y}`;
  return `${endpoint.type}:${endpoint.id}`;
}

function boothLabel(bundle: PlanBundle, booth: BundleBooth): string {
  const term = bundle.event?.settings?.terms?.booth || "Booth";
  return `${term} ${booth.label}`.trim();
}

function boothPoint(booth: BundleBooth): Point {
  if (Array.isArray(booth.polygon) && booth.polygon.length >= 3) return polygonCentroid(booth.polygon);
  return booth.center;
}

function polylineMidpoint(points: Point[]): Point {
  if (points.length === 0) return [0, 0];
  if (points.length === 1) return points[0];
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  let target = total / 2;
  for (let i = 1; i < points.length; i++) {
    const d = distance(points[i - 1], points[i]);
    if (d >= target && d > 0) {
      const t = target / d;
      return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t];
    }
    target -= d;
  }
  return points[points.length - 1];
}

function elementPoint(el: BundleElement): Point | null {
  const g = el.geometry;
  if (!g) return null;
  if (g.type === "point") return g.point;
  if (g.type === "polygon") return g.points.length >= 3 ? polygonCentroid(g.points) : g.points.length > 0 ? polylineMidpoint(g.points) : null;
  if (g.type === "polyline") return g.points.length > 0 ? polylineMidpoint(g.points) : null;
  return null;
}

/**
 * Resolve an endpoint to a level and a plan point.
 * booth -> polygon centroid, exhibitor -> its first booth, element -> point/centroid,
 * node -> node position, point -> itself.
 */
export function resolveEndpoint(bundle: PlanBundle, endpoint: RouteEndpoint): ResolvedEndpoint | null {
  const idx = bundleIndex(bundle);
  switch (endpoint.type) {
    case "booth": {
      const b = idx.booths.get(endpoint.id);
      if (!b) return null;
      return { levelId: b.levelId, point: boothPoint(b), label: boothLabel(bundle, b) };
    }
    case "exhibitor": {
      const ex = idx.exhibitors.get(endpoint.id);
      if (!ex) return null;
      for (const bid of ex.boothIds ?? []) {
        const b = idx.booths.get(bid);
        if (b) return { levelId: b.levelId, point: boothPoint(b), label: ex.name };
      }
      return null;
    }
    case "element": {
      const el = idx.elements.get(endpoint.id);
      if (!el) return null;
      const point = elementPoint(el);
      if (!point) return null;
      const label = (typeof el.props?.name === "string" && el.props.name) || (typeof el.props?.text === "string" && el.props.text) || el.kind;
      return { levelId: el.levelId, point, label };
    }
    case "node": {
      const n = idx.nodes.get(endpoint.id);
      if (!n) return null;
      return { levelId: n.levelId, point: [n.x, n.y], label: "your destination" };
    }
    case "point": {
      if (!Number.isFinite(endpoint.x) || !Number.isFinite(endpoint.y) || !endpoint.levelId) return null;
      return { levelId: endpoint.levelId, point: [endpoint.x, endpoint.y], label: "your destination" };
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Endpoint attachment (overlay)                                        */
/* ------------------------------------------------------------------ */

interface Attachment {
  /** Overlay (or base) node index representing the endpoint itself. */
  node: number;
  /** Projection nodes created on the network and the hits they came from. */
  projections: { hit: NearestEdgeHit; node: number }[];
}

function attachEndpoint(
  graph: RoutingGraph,
  overlay: GraphOverlay,
  resolved: ResolvedEndpoint,
  endpoint: RouteEndpoint,
  accessibleOnly: boolean,
  k: number,
  jointNodes: Set<number>,
): Attachment | null {
  if (endpoint.type === "node") {
    const ni = graph.nodeIndexById.get(endpoint.id);
    if (ni !== undefined) return { node: ni, projections: [] };
  }
  const index = graph.spatial.get(resolved.levelId);
  if (!index || index.segments.length === 0) return null;

  const walkable = (s: IndexedSegment): boolean => !accessibleOnly || s.accessible;
  let hits = nearestEdges(index, resolved.point, k, (s) => walkable(s) && !s.virtual);
  if (hits.length === 0) hits = nearestEdges(index, resolved.point, k, walkable);
  if (hits.length === 0) return null;

  const endpointNode = overlayAddNode(graph, overlay, resolved.levelId, resolved.point, `~endpoint_${overlay.nodes.length}`);
  const projections: Attachment["projections"] = [];
  for (const hit of hits) {
    const s = hit.segment;
    const proj = overlayAddNode(graph, overlay, resolved.levelId, hit.point, `~proj_${overlay.nodes.length}`);
    jointNodes.add(proj);
    // Endpoint <-> projection connector (both directions, always accessible, drawn as part of the route).
    overlayAddEdge(graph, overlay, endpointNode, proj, { sourceId: `connector:${s.edgeId}`, length: hit.dist, connector: true });
    overlayAddEdge(graph, overlay, proj, endpointNode, { sourceId: `connector:${s.edgeId}`, length: hit.dist, connector: true });
    // Projection <-> segment ends, inheriting the segment's flags and direction.
    const common = { sourceId: s.edgeId, weight: s.weight, accessible: s.accessible, virtual: s.virtual };
    const la = hit.t * s.length;
    const lb = (1 - hit.t) * s.length;
    overlayAddEdge(graph, overlay, s.a, proj, { ...common, length: la });
    overlayAddEdge(graph, overlay, proj, s.b, { ...common, length: lb });
    if (!s.oneWay) {
      overlayAddEdge(graph, overlay, proj, s.a, { ...common, length: la });
      overlayAddEdge(graph, overlay, s.b, proj, { ...common, length: lb });
    }
    projections.push({ hit, node: proj });
  }
  return { node: endpointNode, projections };
}

/** When both endpoints project onto the same segment, allow walking directly between the projections. */
function connectSharedSegments(graph: RoutingGraph, overlay: GraphOverlay, from: Attachment, to: Attachment): void {
  for (const pa of from.projections) {
    for (const pb of to.projections) {
      const s = pa.hit.segment;
      if (s !== pb.hit.segment) continue;
      const ta = pa.hit.t;
      const tb = pb.hit.t;
      if (s.oneWay && tb < ta) continue;
      overlayAddEdge(graph, overlay, pa.node, pb.node, {
        sourceId: s.edgeId,
        length: Math.abs(tb - ta) * s.length,
        weight: s.weight,
        accessible: s.accessible,
        virtual: s.virtual,
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Polyline helpers                                                     */
/* ------------------------------------------------------------------ */

interface PathPoint {
  p: Point;
  /** Point where a connector joins the network; no turn instruction is generated here. */
  joint: boolean;
}

function isCollinear(a: Point, b: Point, c: Point): boolean {
  const d1x = b[0] - a[0], d1y = b[1] - a[1];
  const d2x = c[0] - b[0], d2y = c[1] - b[1];
  const l1 = Math.hypot(d1x, d1y);
  const l2 = Math.hypot(d2x, d2y);
  if (l1 < 1e-9 || l2 < 1e-9) return true;
  const cross = d1x * d2y - d1y * d2x;
  const dot = d1x * d2x + d1y * d2y;
  return dot > 0 && Math.abs(cross) <= COLLINEAR_SIN * l1 * l2;
}

function simplifyPathPoints(pts: PathPoint[]): PathPoint[] {
  // Drop consecutive duplicates first, merging joint flags.
  const dedup: PathPoint[] = [];
  for (const pt of pts) {
    const last = dedup[dedup.length - 1];
    if (last && distance(last.p, pt.p) < 1e-9) {
      if (pt.joint) last.joint = true;
      continue;
    }
    dedup.push({ p: pt.p, joint: pt.joint });
  }
  if (dedup.length <= 2) return dedup;
  const out: PathPoint[] = [dedup[0]];
  for (let i = 1; i < dedup.length - 1; i++) {
    const prev = out[out.length - 1];
    if (isCollinear(prev.p, dedup[i].p, dedup[i + 1].p)) continue;
    out.push(dedup[i]);
  }
  out.push(dedup[dedup.length - 1]);
  return out;
}

/** Remove consecutive duplicate and collinear points from a polyline. */
export function simplifyPolyline(points: Point[]): Point[] {
  return simplifyPathPoints(points.map((p) => ({ p, joint: false }))).map((pt) => pt.p);
}

export function polylineLength(points: Point[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += distance(points[i - 1], points[i]);
  return d;
}

/**
 * Turn instruction at vertex b of a -> b -> c, or null when the heading change is small.
 * Plan coordinates have y pointing DOWN, so a positive cross product is a clockwise (right) turn.
 */
export function turnInstruction(a: Point, b: Point, c: Point): string | null {
  const d1x = b[0] - a[0], d1y = b[1] - a[1];
  const d2x = c[0] - b[0], d2y = c[1] - b[1];
  const l1 = Math.hypot(d1x, d1y);
  const l2 = Math.hypot(d2x, d2y);
  if (l1 < MIN_TURN_SEGMENT_M || l2 < MIN_TURN_SEGMENT_M) return null;
  const cross = d1x * d2y - d1y * d2x;
  const dot = d1x * d2x + d1y * d2y;
  const angle = (Math.atan2(Math.abs(cross), dot) * 180) / Math.PI;
  if (angle <= TURN_ANGLE_DEG) return null;
  if (angle >= UTURN_ANGLE_DEG) return "Make a U-turn";
  return cross > 0 ? "Turn right" : "Turn left";
}

const TRANSITION_LABEL: Record<TransitionKind, string> = {
  stairs: "stairs",
  escalator: "escalator",
  elevator: "elevator",
  ramp: "ramp",
  door: "door",
  bridge: "bridge",
};

function roundPoint(p: Point): Point {
  return [round(p[0], 3), round(p[1], 3)];
}

function makeStep(levelId: string, points: Point[], instruction: string): RouteStep {
  return { levelId, points: points.map(roundPoint), distanceM: round(polylineLength(points), 2), instruction };
}

/** Split one level's polyline into walking steps at significant turns. */
function runToSteps(levelId: string, run: PathPoint[], firstInstruction: string): RouteStep[] {
  const pts = simplifyPathPoints(run);
  if (pts.length < 2) return [];
  const steps: RouteStep[] = [];
  let cur: Point[] = [pts[0].p];
  let instruction = firstInstruction;
  for (let i = 1; i < pts.length; i++) {
    cur.push(pts[i].p);
    if (i < pts.length - 1 && !pts[i].joint) {
      const turn = turnInstruction(pts[i - 1].p, pts[i].p, pts[i + 1].p);
      if (turn) {
        steps.push(makeStep(levelId, cur, instruction));
        cur = [pts[i].p];
        instruction = turn;
      }
    }
  }
  steps.push(makeStep(levelId, cur, instruction));
  return steps;
}

/* ------------------------------------------------------------------ */
/* Result assembly                                                      */
/* ------------------------------------------------------------------ */

interface LevelRun {
  levelId: string;
  points: PathPoint[];
  /** Transition taken at the end of this run (undefined for the last run). */
  transition?: TransitionInfo;
}

function pathToRuns(graph: RoutingGraph, overlay: GraphOverlay, path: AStarResult, jointNodes: Set<number>): LevelRun[] {
  const first = getNode(graph, overlay, path.nodes[0]);
  const runs: LevelRun[] = [{ levelId: first.levelId, points: [{ p: [first.x, first.y], joint: jointNodes.has(first.index) }] }];
  for (let i = 0; i < path.edges.length; i++) {
    const e = getEdge(graph, overlay, path.edges[i]);
    const v = getNode(graph, overlay, path.nodes[i + 1]);
    const cur = runs[runs.length - 1];
    if (e.transition && v.levelId !== cur.levelId) {
      cur.transition = { ...e.transition, fromLevelId: cur.levelId, toLevelId: v.levelId };
      runs.push({ levelId: v.levelId, points: [{ p: [v.x, v.y], joint: jointNodes.has(v.index) }] });
      continue;
    }
    cur.points.push({ p: [v.x, v.y], joint: jointNodes.has(v.index) });
  }
  return runs;
}

function assembleResult(
  bundle: PlanBundle,
  runs: LevelRun[],
  from: RouteEndpoint,
  to: RouteEndpoint,
  destination: ResolvedEndpoint,
  accessible: boolean,
): RouteResult {
  const steps: RouteStep[] = [];
  const levelIds: string[] = [];
  let distanceM = 0;
  let transitionSeconds = 0;
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (levelIds[levelIds.length - 1] !== run.levelId) levelIds.push(run.levelId);
    const walking = runToSteps(run.levelId, run.points, "Head along the aisle");
    for (const s of walking) distanceM += s.distanceM;
    steps.push(...walking);
    const t = run.transition;
    if (t) {
      const last = run.points[run.points.length - 1].p;
      transitionSeconds += t.travelSeconds;
      const targetName = levelName(bundle, t.toLevelId);
      const label = TRANSITION_LABEL[t.kind] ?? t.kind;
      steps.push({
        levelId: run.levelId,
        points: [roundPoint(last)],
        distanceM: 0,
        instruction: `Take the ${label} to ${targetName}`,
        transition: { id: t.id, kind: t.kind, toLevelId: t.toLevelId },
      });
    }
  }
  const lastRun = runs[runs.length - 1];
  const end = lastRun.points[lastRun.points.length - 1].p;
  steps.push({ levelId: lastRun.levelId, points: [roundPoint(end)], distanceM: 0, instruction: `Arrive at ${destination.label}` });
  distanceM = round(distanceM, 2);
  return {
    ok: true,
    from,
    to,
    accessible,
    distanceM,
    durationSeconds: Math.round(distanceM / WALKING_SPEED_MPS + transitionSeconds),
    steps,
    levelIds,
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

function describe(endpoint: RouteEndpoint): string {
  if (endpoint.type === "point") return `point (${endpoint.x}, ${endpoint.y}) on level ${endpoint.levelId}`;
  return `${endpoint.type} ${endpoint.id}`;
}

/**
 * Find a route between two endpoints. Endpoints are connected to the network by projecting them
 * onto the nearest edges of their level; the shared graph is never mutated.
 */
export function findRoute(
  bundle: PlanBundle,
  graph: RoutingGraph,
  from: RouteEndpoint,
  to: RouteEndpoint,
  opts: FindRouteOptions = {},
): RouteResult | RouteError {
  const accessible = opts.accessible === true;
  const k = Math.max(1, Math.floor(opts.snapEdges ?? DEFAULT_SNAP_EDGES));

  const a = resolveEndpoint(bundle, from);
  if (!a) return { ok: false, error: `Unknown start: ${describe(from)}` };
  const b = resolveEndpoint(bundle, to);
  if (!b) return { ok: false, error: `Unknown destination: ${describe(to)}` };

  if (a.levelId === b.levelId && distance(a.point, b.point) < 1e-6) {
    return assembleResult(bundle, [{ levelId: a.levelId, points: [{ p: a.point, joint: false }] }], from, to, b, accessible);
  }

  const overlay = createOverlay();
  const joints = new Set<number>();
  const start = attachEndpoint(graph, overlay, a, from, accessible, k, joints);
  if (!start) return { ok: false, error: `No wayfinding network on level ${levelName(bundle, a.levelId)}` };
  const end = attachEndpoint(graph, overlay, b, to, accessible, k, joints);
  if (!end) return { ok: false, error: `No wayfinding network on level ${levelName(bundle, b.levelId)}` };
  connectSharedSegments(graph, overlay, start, end);

  const path = astar(graph, start.node, end.node, { accessible }, overlay);
  if (!path) {
    return { ok: false, error: accessible ? "No accessible route found" : "No route found" };
  }
  const runs = pathToRuns(graph, overlay, path, joints);
  return assembleResult(bundle, runs, from, to, b, accessible);
}
