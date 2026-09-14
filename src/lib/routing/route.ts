/**
 * High-level routing: resolve endpoints, attach them to the network, run A*, and turn the result
 * into level-grouped steps with simple turn-by-turn instructions.
 *
 * Endpoints are attached to the network through a per-query {@link GraphOverlay}: the endpoint
 * becomes a temporary node joined by straight "connector" edges to its projections on the K
 * nearest edges of its level. The shared graph is never mutated, so one graph can serve many
 * concurrent queries.
 */

import type {
  BundleBooth,
  BundleElement,
  BundleExhibitor,
  BundleLevel,
  BundleTransition,
  BundleWayNode,
  PlanBundle,
  Point,
  RouteEndpoint,
  RouteError,
  RouteResult,
  RouteStep,
  TransitionKind,
} from "@/lib/domain/types";
import { bbox, distance, pointInPolygon, polygonCentroid, round, segmentsIntersect, type BBox } from "@/lib/domain/geometry";
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
  /** Intermediate stops, visited in order (at most {@link MAX_VIA_POINTS}). */
  via?: RouteEndpoint[];
  /** How many nearest edges each endpoint is connected to (default 3). */
  snapEdges?: number;
}

export interface ResolvedEndpoint {
  levelId: string;
  point: Point;
  /** Human readable name used in the arrival instruction. */
  label: string;
}

/** Maximum number of `via` waypoints accepted by {@link findRoute}. */
export const MAX_VIA_POINTS = 8;
const DEFAULT_SNAP_EDGES = 3;
/**
 * Candidate edges further than `max(nearest * SNAP_MAX_RATIO, nearest + SNAP_SLACK_M)` from the
 * endpoint are not used: a connector to a distant aisle would be a straight line through whatever
 * lies in between.
 */
const SNAP_MAX_RATIO = 2;
const SNAP_SLACK_M = 2;
const TURN_ANGLE_DEG = 35;
const UTURN_ANGLE_DEG = 150;
/** Segments shorter than this do not generate turn instructions (avoids jitter at connectors). */
const MIN_TURN_SEGMENT_M = 0.5;
const COLLINEAR_SIN = Math.sin((1 * Math.PI) / 180);
const GENERIC_DESTINATION = "your destination";

/* ------------------------------------------------------------------ */
/* Bundle lookups                                                       */
/* ------------------------------------------------------------------ */

export interface BundleIndex {
  levels: Map<string, BundleLevel>;
  booths: Map<string, BundleBooth>;
  /** Booths by external id and by (lower-cased) label; ids win over labels on lookup. */
  boothsByExternalId: Map<string, BundleBooth>;
  boothsByLabel: Map<string, BundleBooth>;
  boothsByLevel: Map<string, BundleBooth[]>;
  exhibitors: Map<string, BundleExhibitor>;
  exhibitorsByExternalId: Map<string, BundleExhibitor>;
  exhibitorsBySlug: Map<string, BundleExhibitor>;
  elements: Map<string, BundleElement>;
  nodes: Map<string, BundleWayNode>;
  transitions: Map<string, BundleTransition>;
}

const indexCache = new WeakMap<PlanBundle, BundleIndex>();

/** Id / label / slug lookups for a bundle, memoised per bundle object. */
export function bundleIndex(bundle: PlanBundle): BundleIndex {
  let idx = indexCache.get(bundle);
  if (idx) return idx;
  idx = {
    levels: new Map(),
    booths: new Map(),
    boothsByExternalId: new Map(),
    boothsByLabel: new Map(),
    boothsByLevel: new Map(),
    exhibitors: new Map(),
    exhibitorsByExternalId: new Map(),
    exhibitorsBySlug: new Map(),
    elements: new Map(),
    nodes: new Map(),
    transitions: new Map(),
  };
  for (const l of bundle.levels ?? []) {
    idx.levels.set(l.id, l);
    for (const el of l.elements ?? []) idx.elements.set(el.id, el);
  }
  for (const b of bundle.booths ?? []) {
    idx.booths.set(b.id, b);
    if (b.externalId && !idx.boothsByExternalId.has(b.externalId)) idx.boothsByExternalId.set(b.externalId, b);
    const label = (b.label ?? "").trim().toLowerCase();
    if (label && !idx.boothsByLabel.has(label)) idx.boothsByLabel.set(label, b);
    let list = idx.boothsByLevel.get(b.levelId);
    if (!list) {
      list = [];
      idx.boothsByLevel.set(b.levelId, list);
    }
    list.push(b);
  }
  for (const ex of bundle.exhibitors ?? []) {
    idx.exhibitors.set(ex.id, ex);
    if (ex.externalId && !idx.exhibitorsByExternalId.has(ex.externalId)) idx.exhibitorsByExternalId.set(ex.externalId, ex);
    const slug = (ex.slug ?? "").trim().toLowerCase();
    if (slug && !idx.exhibitorsBySlug.has(slug)) idx.exhibitorsBySlug.set(slug, ex);
  }
  for (const n of bundle.wayfinding?.nodes ?? []) idx.nodes.set(n.id, n);
  for (const t of bundle.wayfinding?.transitions ?? []) idx.transitions.set(t.id, t);
  indexCache.set(bundle, idx);
  return idx;
}

/** Find a booth by id, external id or label (label match is case-insensitive). */
export function findBooth(bundle: PlanBundle, id: string): BundleBooth | undefined {
  const idx = bundleIndex(bundle);
  return idx.booths.get(id) ?? idx.boothsByExternalId.get(id) ?? idx.boothsByLabel.get(id.trim().toLowerCase());
}

/** Find an exhibitor by id, external id or slug. */
export function findExhibitor(bundle: PlanBundle, id: string): BundleExhibitor | undefined {
  const idx = bundleIndex(bundle);
  return idx.exhibitors.get(id) ?? idx.exhibitorsByExternalId.get(id) ?? idx.exhibitorsBySlug.get(id.trim().toLowerCase());
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
 * node -> node position, point -> itself. Booths may be referenced by id, external id or label
 * and exhibitors by id, external id or slug.
 */
export function resolveEndpoint(bundle: PlanBundle, endpoint: RouteEndpoint): ResolvedEndpoint | null {
  const idx = bundleIndex(bundle);
  switch (endpoint.type) {
    case "booth": {
      const b = findBooth(bundle, endpoint.id);
      if (!b) return null;
      return { levelId: b.levelId, point: boothPoint(b), label: boothLabel(bundle, b) };
    }
    case "exhibitor": {
      const ex = findExhibitor(bundle, endpoint.id);
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
      return { levelId: n.levelId, point: [n.x, n.y], label: GENERIC_DESTINATION };
    }
    case "point": {
      if (!Number.isFinite(endpoint.x) || !Number.isFinite(endpoint.y) || !endpoint.levelId) return null;
      return { levelId: endpoint.levelId, point: [endpoint.x, endpoint.y], label: GENERIC_DESTINATION };
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

interface BoothObstacle {
  booth: BundleBooth;
  box: BBox;
}

const obstacleCache = new WeakMap<BundleBooth[], BoothObstacle[]>();

function boothObstacles(bundle: PlanBundle, levelId: string): BoothObstacle[] {
  const list = bundleIndex(bundle).boothsByLevel.get(levelId);
  if (!list) return [];
  let obs = obstacleCache.get(list);
  if (!obs) {
    obs = list.filter((b) => Array.isArray(b.polygon) && b.polygon.length >= 3).map((b) => ({ booth: b, box: bbox(b.polygon) }));
    obstacleCache.set(list, obs);
  }
  return obs;
}

function segmentCrossesPolygon(a: Point, b: Point, poly: Point[]): boolean {
  for (let i = 0, n = poly.length; i < n; i++) {
    if (segmentsIntersect(a, b, poly[i], poly[(i + 1) % n])) return true;
  }
  return pointInPolygon([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], poly);
}

/** Does the straight connector a -> b cut through a booth other than the ones the endpoint sits in? */
function connectorBlocked(a: Point, b: Point, obstacles: BoothObstacle[], ignore: Set<BundleBooth>): boolean {
  const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]);
  const minY = Math.min(a[1], b[1]), maxY = Math.max(a[1], b[1]);
  for (const o of obstacles) {
    if (ignore.has(o.booth)) continue;
    if (o.box.maxX < minX || o.box.minX > maxX || o.box.maxY < minY || o.box.minY > maxY) continue;
    if (segmentCrossesPolygon(a, b, o.booth.polygon)) return true;
  }
  return false;
}

/** Pick the projections an endpoint may be connected to: nearby, and not through another booth. */
function selectHits(bundle: PlanBundle, levelId: string, point: Point, hits: NearestEdgeHit[]): NearestEdgeHit[] {
  if (hits.length === 0) return hits;
  const nearest = hits[0].dist;
  const maxDist = Math.max(nearest * SNAP_MAX_RATIO, nearest + SNAP_SLACK_M);
  const near = hits.filter((h) => h.dist <= maxDist);
  const obstacles = boothObstacles(bundle, levelId);
  if (obstacles.length === 0) return near;
  const ignore = new Set<BundleBooth>();
  for (const o of obstacles) if (pointInPolygon(point, o.booth.polygon)) ignore.add(o.booth);
  const clear = near.filter((h) => !connectorBlocked(point, h.point, obstacles, ignore));
  // Better a route through a booth than no route at all.
  return clear.length > 0 ? clear : [near[0]];
}

function attachEndpoint(
  bundle: PlanBundle,
  graph: RoutingGraph,
  overlay: GraphOverlay,
  resolved: ResolvedEndpoint,
  endpoint: RouteEndpoint,
  accessibleOnly: boolean,
  k: number,
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
  hits = selectHits(bundle, resolved.levelId, resolved.point, hits);
  if (hits.length === 0) return null;

  const endpointNode = overlayAddNode(graph, overlay, resolved.levelId, resolved.point, `~endpoint_${overlay.nodes.length}`);
  const projections: Attachment["projections"] = [];
  for (const hit of hits) {
    const s = hit.segment;
    const proj = overlayAddNode(graph, overlay, resolved.levelId, hit.point, `~proj_${overlay.nodes.length}`);
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

/** Remove consecutive duplicate and collinear points from a polyline. */
export function simplifyPolyline(points: Point[]): Point[] {
  const dedup: Point[] = [];
  for (const p of points) {
    const last = dedup[dedup.length - 1];
    if (last && distance(last, p) < 1e-9) continue;
    dedup.push(p);
  }
  if (dedup.length <= 2) return dedup;
  const out: Point[] = [dedup[0]];
  for (let i = 1; i < dedup.length - 1; i++) {
    if (isCollinear(out[out.length - 1], dedup[i], dedup[i + 1])) continue;
    out.push(dedup[i]);
  }
  out.push(dedup[dedup.length - 1]);
  return out;
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
function runToSteps(levelId: string, run: Point[]): RouteStep[] {
  const pts = simplifyPolyline(run);
  if (pts.length < 2) return [];
  const steps: RouteStep[] = [];
  let cur: Point[] = [pts[0]];
  let instruction = "Head along the aisle";
  for (let i = 1; i < pts.length; i++) {
    cur.push(pts[i]);
    if (i < pts.length - 1) {
      const turn = turnInstruction(pts[i - 1], pts[i], pts[i + 1]);
      if (turn) {
        steps.push(makeStep(levelId, cur, instruction));
        cur = [pts[i]];
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
  points: Point[];
  /** Transition taken at the end of this run (undefined for the last run). */
  transition?: TransitionInfo;
}

interface Leg {
  runs: LevelRun[];
  destination: ResolvedEndpoint;
}

function pathToRuns(graph: RoutingGraph, overlay: GraphOverlay, path: AStarResult): LevelRun[] {
  const first = getNode(graph, overlay, path.nodes[0]);
  const runs: LevelRun[] = [{ levelId: first.levelId, points: [[first.x, first.y]] }];
  for (let i = 0; i < path.edges.length; i++) {
    const e = getEdge(graph, overlay, path.edges[i]);
    const v = getNode(graph, overlay, path.nodes[i + 1]);
    const cur = runs[runs.length - 1];
    if (e.transition && v.levelId !== cur.levelId) {
      cur.transition = { ...e.transition, fromLevelId: cur.levelId, toLevelId: v.levelId };
      runs.push({ levelId: v.levelId, points: [[v.x, v.y]] });
      continue;
    }
    cur.points.push([v.x, v.y]);
  }
  return runs;
}

function assembleResult(bundle: PlanBundle, legs: Leg[], from: RouteEndpoint, to: RouteEndpoint, accessible: boolean): RouteResult {
  const steps: RouteStep[] = [];
  const levelIds: string[] = [];
  let distanceM = 0;
  let transitionSeconds = 0;
  for (let li = 0; li < legs.length; li++) {
    const leg = legs[li];
    for (const run of leg.runs) {
      if (levelIds[levelIds.length - 1] !== run.levelId) levelIds.push(run.levelId);
      const walking = runToSteps(run.levelId, run.points);
      for (const s of walking) distanceM += s.distanceM;
      steps.push(...walking);
      const t = run.transition;
      if (t) {
        const last = run.points[run.points.length - 1];
        transitionSeconds += t.travelSeconds;
        steps.push({
          levelId: run.levelId,
          points: [roundPoint(last)],
          distanceM: 0,
          instruction: `Take the ${TRANSITION_LABEL[t.kind] ?? t.kind} to ${levelName(bundle, t.toLevelId)}`,
          transition: { id: t.id, kind: t.kind, toLevelId: t.toLevelId },
        });
      }
    }
    const lastRun = leg.runs[leg.runs.length - 1];
    const end = lastRun.points[lastRun.points.length - 1];
    const final = li === legs.length - 1;
    steps.push({
      levelId: lastRun.levelId,
      points: [roundPoint(end)],
      distanceM: 0,
      instruction: final ? `Arrive at ${leg.destination.label}` : `Stop at ${leg.destination.label}`,
    });
  }
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

/** Route one leg between two resolved endpoints using a fresh overlay. */
function routeLeg(
  bundle: PlanBundle,
  graph: RoutingGraph,
  a: { endpoint: RouteEndpoint; resolved: ResolvedEndpoint },
  b: { endpoint: RouteEndpoint; resolved: ResolvedEndpoint },
  accessible: boolean,
  k: number,
): Leg | RouteError {
  if (a.resolved.levelId === b.resolved.levelId && distance(a.resolved.point, b.resolved.point) < 1e-6) {
    return { runs: [{ levelId: a.resolved.levelId, points: [a.resolved.point] }], destination: b.resolved };
  }
  const overlay = createOverlay();
  const start = attachEndpoint(bundle, graph, overlay, a.resolved, a.endpoint, accessible, k);
  if (!start) return { ok: false, error: `No wayfinding network on level ${levelName(bundle, a.resolved.levelId)}` };
  const end = attachEndpoint(bundle, graph, overlay, b.resolved, b.endpoint, accessible, k);
  if (!end) return { ok: false, error: `No wayfinding network on level ${levelName(bundle, b.resolved.levelId)}` };
  connectSharedSegments(graph, overlay, start, end);

  const path = astar(graph, start.node, end.node, { accessible }, overlay);
  if (!path) {
    const what = accessible ? "No accessible route" : "No route";
    return { ok: false, error: `${what} from ${describe(a.endpoint)} to ${describe(b.endpoint)}` };
  }
  return { runs: pathToRuns(graph, overlay, path), destination: b.resolved };
}

/**
 * Find a route between two endpoints, optionally through `via` waypoints in order. Endpoints are
 * connected to the network by projecting them onto the nearest edges of their level; the shared
 * graph is never mutated.
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
  const via = opts.via ?? [];
  if (via.length > MAX_VIA_POINTS) {
    return { ok: false, error: `Too many via points (${via.length}); the maximum is ${MAX_VIA_POINTS}` };
  }

  const stops: { endpoint: RouteEndpoint; resolved: ResolvedEndpoint }[] = [];
  const sequence = [from, ...via, to];
  for (let i = 0; i < sequence.length; i++) {
    const endpoint = sequence[i];
    const resolved = resolveEndpoint(bundle, endpoint);
    if (!resolved) {
      const role = i === 0 ? "start" : i === sequence.length - 1 ? "destination" : `via point ${i}`;
      return { ok: false, error: `Unknown ${role}: ${describe(endpoint)}` };
    }
    stops.push({ endpoint, resolved });
  }

  const legs: Leg[] = [];
  for (let i = 1; i < stops.length; i++) {
    const leg = routeLeg(bundle, graph, stops[i - 1], stops[i], accessible, k);
    if ("ok" in leg) return leg;
    legs.push(leg);
  }
  return assembleResult(bundle, legs, from, to, accessible);
}
