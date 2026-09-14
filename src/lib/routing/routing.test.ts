import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  type BundleBooth,
  type BundleElement,
  type BundleExhibitor,
  type BundleLevel,
  type BundleTransition,
  type BundleWayEdge,
  type BundleWayNode,
  type PlanBundle,
  type Point,
  type RouteEndpoint,
  type RouteResult,
} from "@/lib/domain/types";
import { closestPointOnSegment, pointInPolygon, segmentsIntersect } from "@/lib/domain/geometry";
import { astar, buildGraph, endpointKey, findRoute, generateWayfindingGraph, optimizeRoute, resolveEndpoint } from "./index";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

function level(id: string, name: string, widthM: number, heightM: number, elements: BundleElement[] = []): BundleLevel {
  return { id, name, shortName: name, sortIndex: 0, widthM, heightM, background: null, georef: null, elements };
}

function booth(id: string, levelId: string, x: number, y: number, w: number, h: number, extra: Partial<BundleBooth> = {}): BundleBooth {
  return {
    id,
    levelId,
    label: id,
    polygon: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
    center: [x + w / 2, y + h / 2],
    boothType: "standard",
    status: "available",
    areaM2: w * h,
    rotationDeg: 0,
    colors: null,
    labelHidden: false,
    exhibitorIds: [],
    metadata: {},
    ...extra,
  };
}

function exhibitor(id: string, name: string, boothIds: string[], slug = id): BundleExhibitor {
  return {
    id,
    name,
    slug,
    gallery: [],
    featured: false,
    logoInBooth: false,
    socials: {},
    tags: [],
    metadata: {},
    extraIds: [],
    categoryIds: [],
    boothIds,
    boothLabels: boothIds,
  };
}

function node(id: string, levelId: string, x: number, y: number): BundleWayNode {
  return { id, levelId, x, y };
}

function edge(from: string, to: string, extra: Partial<BundleWayEdge> = {}): BundleWayEdge {
  return { id: `${from}-${to}`, from, to, accessible: true, oneWay: false, virtual: false, weight: 1, ...extra };
}

function transition(id: string, kind: BundleTransition["kind"], nodeIds: string[], travelSeconds: number, accessible = true): BundleTransition {
  return { id, name: id, kind, accessible, nodeIds, travelSeconds };
}

interface BundleInit {
  levels: BundleLevel[];
  booths?: BundleBooth[];
  exhibitors?: BundleExhibitor[];
  nodes?: BundleWayNode[];
  edges?: BundleWayEdge[];
  transitions?: BundleTransition[];
}

function makeBundle(init: BundleInit): PlanBundle {
  return {
    format: "tessera.bundle",
    formatVersion: 1,
    version: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    event: { id: "ev", slug: "ev", name: "Test Event", venue: {}, status: "published", settings: DEFAULT_SETTINGS },
    levels: init.levels,
    booths: init.booths ?? [],
    exhibitors: init.exhibitors ?? [],
    categories: [],
    sessions: [],
    wayfinding: { nodes: init.nodes ?? [], edges: init.edges ?? [], transitions: init.transitions ?? [] },
    banners: [],
    extras: [],
  };
}

/** A 4-connected lattice of cols x rows nodes with the given spacing. Node ids: `${prefix}_${ix}_${iy}`. */
function gridNetwork(levelId: string, cols: number, rows: number, spacing: number, prefix = "g"): { nodes: BundleWayNode[]; edges: BundleWayEdge[] } {
  const nodes: BundleWayNode[] = [];
  const edges: BundleWayEdge[] = [];
  const id = (ix: number, iy: number) => `${prefix}_${ix}_${iy}`;
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      nodes.push(node(id(ix, iy), levelId, ix * spacing, iy * spacing));
      if (ix > 0) edges.push(edge(id(ix - 1, iy), id(ix, iy)));
      if (iy > 0) edges.push(edge(id(ix, iy - 1), id(ix, iy)));
    }
  }
  return { nodes, edges };
}

function pt(levelId: string, x: number, y: number): RouteEndpoint {
  return { type: "point", levelId, x, y };
}

function crossesBooth(a: Point, b: Point, booth: BundleBooth): boolean {
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (pointInPolygon(mid, booth.polygon)) return true;
  const poly = booth.polygon;
  for (let i = 0; i < poly.length; i++) {
    if (segmentsIntersect(a, b, poly[i], poly[(i + 1) % poly.length])) return true;
  }
  return false;
}

function distanceToPolygon(p: Point, poly: Point[]): number {
  if (pointInPolygon(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, closestPointOnSegment(p, poly[i], poly[(i + 1) % poly.length]).dist);
  return best;
}

/** The route's polyline (walking steps only, consecutive duplicates removed). */
function routePoints(route: RouteResult): Point[] {
  const out: Point[] = [];
  for (const step of route.steps) {
    if (step.points.length < 2) continue;
    for (const p of step.points) {
      const last = out[out.length - 1];
      if (last && last[0] === p[0] && last[1] === p[1]) continue;
      out.push(p);
    }
  }
  return out;
}

function routeSegments(route: RouteResult): [Point, Point][] {
  const pts = routePoints(route);
  const segs: [Point, Point][] = [];
  for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
  return segs;
}

function expectOk(r: ReturnType<typeof findRoute>): RouteResult {
  if (!r.ok) throw new Error(`expected a route, got error: ${r.error}`);
  return r;
}

/* ------------------------------------------------------------------ */
/* Synthetic hall: two booth rows and a corridor                        */
/* ------------------------------------------------------------------ */

function hallBundle(): PlanBundle {
  const L = "L1";
  const booths: BundleBooth[] = [];
  for (let i = 0; i < 8; i++) {
    booths.push(booth(`A${i + 1}`, L, 10 + i * 5, 10, 5, 6, { externalId: `ext-A${i + 1}` }));
    booths.push(booth(`B${i + 1}`, L, 10 + i * 5, 24, 5, 6));
  }
  const nodes = [
    node("TL", L, 5, 5), node("TR", L, 55, 5),
    node("ML", L, 5, 20), node("MR", L, 55, 20),
    node("BL", L, 5, 35), node("BR", L, 55, 35),
  ];
  const edges = [
    edge("TL", "TR"), edge("TL", "ML"), edge("ML", "BL"),
    edge("BL", "BR"), edge("TR", "MR"), edge("MR", "BR"),
    edge("ML", "MR"),
  ];
  return makeBundle({
    levels: [level(L, "Level 1", 60, 40)],
    booths,
    exhibitors: [exhibitor("ex1", "Acme Corp", ["B6"], "acme-corp")],
    nodes,
    edges,
  });
}

describe("findRoute in a synthetic hall", () => {
  const bundle = hallBundle();
  const graph = buildGraph(bundle);

  it("routes booth to booth along the corridor, not through booths", () => {
    const route = expectOk(findRoute(bundle, graph, { type: "booth", id: "A1" }, { type: "booth", id: "B6" }));
    // centroid A1 (12.5,13) -> aisle y=20 (7 m) -> x=37.5 (25 m) -> centroid B6 (37.5,27) (7 m)
    expect(route.distanceM).toBeCloseTo(39, 1);
    expect(route.durationSeconds).toBe(Math.round(39 / 1.4));
    expect(route.levelIds).toEqual(["L1"]);
    expect(route.accessible).toBe(false);
    expect(route.steps.map((s) => s.instruction)).toEqual(["Head along the aisle", "Turn left", "Turn right", "Arrive at Booth B6"]);

    const others = bundle.booths.filter((b) => b.id !== "A1" && b.id !== "B6");
    for (const [a, b] of routeSegments(route)) {
      for (const other of others) expect(crossesBooth(a, b, other), `segment ${a}-${b} crosses ${other.id}`).toBe(false);
    }
    // Every interior vertex lies on the network (the middle aisle at y = 20).
    const pts = routePoints(route);
    expect(pts[0]).toEqual([12.5, 13]);
    expect(pts[pts.length - 1]).toEqual([37.5, 27]);
    for (const p of pts.slice(1, -1)) expect(p[1]).toBeCloseTo(20, 6);
  });

  it("follows the network even when the straight line is shorter", () => {
    const route = expectOk(findRoute(bundle, graph, { type: "booth", id: "A1" }, { type: "booth", id: "A8" }));
    // Straight line would be 35 m through the row; the network goes via the middle aisle: 7 + 35 + 7.
    expect(route.distanceM).toBeCloseTo(49, 1);
    for (const [a, b] of routeSegments(route)) {
      for (const other of bundle.booths.filter((x) => x.id !== "A1" && x.id !== "A8")) {
        expect(crossesBooth(a, b, other), `segment ${a}-${b} crosses ${other.id}`).toBe(false);
      }
    }
  });

  it("resolves exhibitor endpoints to their first booth and names them on arrival", () => {
    const resolved = resolveEndpoint(bundle, { type: "exhibitor", id: "ex1" });
    expect(resolved?.levelId).toBe("L1");
    expect(resolved?.point[0]).toBeCloseTo(37.5);
    expect(resolved?.point[1]).toBeCloseTo(27);
    const route = expectOk(findRoute(bundle, graph, pt("L1", 5, 5), { type: "exhibitor", id: "ex1" }));
    expect(route.steps[route.steps.length - 1].instruction).toBe("Arrive at Acme Corp");
    expect(resolveEndpoint(bundle, { type: "booth", id: "nope" })).toBeNull();
    expect(resolveEndpoint(bundle, { type: "exhibitor", id: "nope" })).toBeNull();
  });

  it("accepts booth labels / external ids and exhibitor slugs as ids", () => {
    expect(resolveEndpoint(bundle, { type: "booth", id: "ext-A3" })?.point).toEqual([22.5, 13]);
    expect(resolveEndpoint(bundle, { type: "booth", id: "b6" })?.point).toEqual([37.5, 27]);
    expect(resolveEndpoint(bundle, { type: "exhibitor", id: "acme-corp" })?.label).toBe("Acme Corp");
    const byId = expectOk(findRoute(bundle, graph, { type: "booth", id: "A1" }, { type: "booth", id: "B6" }));
    const byLabel = expectOk(findRoute(bundle, graph, { type: "booth", id: "ext-A1" }, { type: "exhibitor", id: "acme-corp" }));
    expect(byLabel.distanceM).toBe(byId.distanceM);
  });

  it("resolves node and element endpoints", () => {
    expect(resolveEndpoint(bundle, { type: "node", id: "MR" })).toEqual({ levelId: "L1", point: [55, 20], label: "your destination" });
    const withElements = makeBundle({
      levels: [
        level("L1", "Level 1", 60, 40, [
          { id: "ent", levelId: "L1", kind: "entrance", geometry: { type: "point", point: [30, 40] }, props: { name: "Main Entrance" }, sortIndex: 0 },
          { id: "stage", levelId: "L1", kind: "stage", geometry: { type: "polygon", points: [[0, 0], [10, 0], [10, 10], [0, 10]] }, props: { name: "Stage" }, sortIndex: 1 },
        ]),
      ],
    });
    expect(resolveEndpoint(withElements, { type: "element", id: "ent" })).toEqual({ levelId: "L1", point: [30, 40], label: "Main Entrance" });
    expect(resolveEndpoint(withElements, { type: "element", id: "stage" })).toEqual({ levelId: "L1", point: [5, 5], label: "Stage" });
  });

  it("generates turn instructions with correct handedness (y down)", () => {
    const route = expectOk(findRoute(bundle, graph, pt("L1", 30, 20), pt("L1", 55, 30)));
    const instructions = route.steps.map((s) => s.instruction);
    // East along y=20, then south down x=55: clockwise on screen => right turn.
    expect(instructions).toEqual(["Head along the aisle", "Turn right", "Arrive at your destination"]);
    expect(route.steps[0].distanceM).toBeCloseTo(25, 6);
    expect(route.steps[1].distanceM).toBeCloseTo(10, 6);

    const back = expectOk(findRoute(bundle, graph, pt("L1", 55, 30), pt("L1", 30, 20)));
    expect(back.steps.map((s) => s.instruction)).toEqual(["Head along the aisle", "Turn left", "Arrive at your destination"]);
  });

  it("simplifies collinear points and handles same-edge endpoints", () => {
    const route = expectOk(findRoute(bundle, graph, pt("L1", 20, 20), pt("L1", 40, 20)));
    expect(route.distanceM).toBeCloseTo(20, 6);
    expect(route.steps[0].points).toEqual([[20, 20], [40, 20]]);
  });

  it("returns errors for unknown endpoints and levels without a network", () => {
    const err = findRoute(bundle, graph, { type: "booth", id: "missing" }, { type: "booth", id: "A1" });
    expect(err.ok).toBe(false);
    if (!err.ok) expect(err.error).toMatch(/Unknown start/);
    const noNet = makeBundle({ levels: [level("L9", "Empty", 10, 10)] });
    const r = findRoute(noNet, buildGraph(noNet), pt("L9", 1, 1), pt("L9", 5, 5));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/No wayfinding network/);
  });

  it("returns a zero-length route when start and destination coincide", () => {
    const route = expectOk(findRoute(bundle, graph, { type: "booth", id: "A1" }, { type: "booth", id: "A1" }));
    expect(route.distanceM).toBe(0);
    expect(route.durationSeconds).toBe(0);
    expect(route.steps).toHaveLength(1);
    expect(route.steps[0].instruction).toBe("Arrive at Booth A1");
  });

  it("visits via waypoints in order", () => {
    const direct = expectOk(findRoute(bundle, graph, { type: "booth", id: "A1" }, { type: "booth", id: "A2" }));
    const detour = expectOk(findRoute(bundle, graph, { type: "booth", id: "A1" }, { type: "booth", id: "A2" }, { via: [{ type: "booth", id: "B6" }] }));
    expect(detour.distanceM).toBeGreaterThan(direct.distanceM);
    // A1 -> B6 (39 m) + B6 -> A2 (7 + 20 + 7 = 34 m)
    expect(detour.distanceM).toBeCloseTo(73, 1);
    const instructions = detour.steps.map((s) => s.instruction);
    expect(instructions).toContain("Stop at Booth B6");
    expect(instructions.indexOf("Stop at Booth B6")).toBeLessThan(instructions.indexOf("Arrive at Booth A2"));
    expect(instructions[instructions.length - 1]).toBe("Arrive at Booth A2");
    const pts = routePoints(detour);
    expect(pts.some((p) => p[0] === 37.5 && p[1] === 27)).toBe(true);
    expect(detour.from).toEqual({ type: "booth", id: "A1" });
    expect(detour.to).toEqual({ type: "booth", id: "A2" });

    const two = expectOk(findRoute(bundle, graph, pt("L1", 5, 5), pt("L1", 5, 5), { via: [pt("L1", 55, 5), pt("L1", 55, 35)] }));
    expect(two.distanceM).toBeCloseTo(50 + 30 + 80, 6);
    expect(two.steps.filter((s) => s.instruction?.startsWith("Stop at"))).toHaveLength(2);

    const tooMany = findRoute(bundle, graph, pt("L1", 5, 5), pt("L1", 55, 5), { via: Array.from({ length: 9 }, () => pt("L1", 30, 20)) });
    expect(tooMany.ok).toBe(false);
    const badVia = findRoute(bundle, graph, pt("L1", 5, 5), pt("L1", 55, 5), { via: [{ type: "booth", id: "nope" }] });
    expect(badVia.ok).toBe(false);
    if (!badVia.ok) expect(badVia.error).toMatch(/via point 1/);
  });
});

/* ------------------------------------------------------------------ */
/* Accessibility                                                        */
/* ------------------------------------------------------------------ */

describe("accessible routing", () => {
  it("avoids inaccessible edges when accessible=true", () => {
    const L = "L1";
    const bundle = makeBundle({
      levels: [level(L, "Level 1", 20, 20)],
      nodes: [node("A", L, 0, 0), node("B", L, 10, 0), node("C", L, 0, 10), node("D", L, 10, 10)],
      edges: [edge("A", "B", { accessible: false }), edge("A", "C"), edge("C", "D"), edge("D", "B")],
    });
    const graph = buildGraph(bundle);
    const from: RouteEndpoint = { type: "node", id: "A" };
    const to: RouteEndpoint = { type: "node", id: "B" };
    expect(expectOk(findRoute(bundle, graph, from, to)).distanceM).toBeCloseTo(10, 6);
    const acc = expectOk(findRoute(bundle, graph, from, to, { accessible: true }));
    expect(acc.distanceM).toBeCloseTo(30, 6);
    expect(acc.accessible).toBe(true);
  });

  it("snaps only onto accessible edges when accessible=true", () => {
    const L = "L1";
    const bundle = makeBundle({
      levels: [level(L, "Level 1", 40, 20)],
      nodes: [node("A", L, 0, 0), node("B", L, 30, 0), node("C", L, 0, 5), node("D", L, 30, 5)],
      // Steps along y=0 (inaccessible) and a ramp along y=5 (accessible), joined at both ends.
      edges: [edge("A", "B", { accessible: false }), edge("C", "D"), edge("A", "C"), edge("B", "D")],
    });
    const graph = buildGraph(bundle);
    const normal = expectOk(findRoute(bundle, graph, pt(L, 5, -1), pt(L, 25, -1)));
    expect(normal.distanceM).toBeCloseTo(22, 6);
    const acc = expectOk(findRoute(bundle, graph, pt(L, 5, -1), pt(L, 25, -1), { accessible: true }));
    expect(acc.distanceM).toBeCloseTo(6 + 20 + 6, 6);
    for (const p of routePoints(acc).slice(1, -1)) expect(p[1]).toBeCloseTo(5, 6);
  });
});

/* ------------------------------------------------------------------ */
/* Multi-level                                                          */
/* ------------------------------------------------------------------ */

function twoLevelBundle(): PlanBundle {
  return makeBundle({
    levels: [level("L1", "Level 1", 60, 10), level("L2", "Level 2", 60, 10)],
    nodes: [
      node("a1", "L1", 0, 0), node("a2", "L1", 20, 0), node("a3", "L1", 40, 0),
      node("b1", "L2", 0, 0), node("b2", "L2", 20, 0), node("b3", "L2", 40, 0),
    ],
    edges: [edge("a1", "a2"), edge("a2", "a3"), edge("b1", "b2"), edge("b2", "b3")],
    transitions: [
      transition("stairs-1", "stairs", ["a2", "b2"], 10, false),
      transition("lift-1", "elevator", ["a3", "b3"], 30, true),
    ],
  });
}

describe("multi-level routing", () => {
  const bundle = twoLevelBundle();
  const graph = buildGraph(bundle);

  it("reports steps for both levels and a transition instruction", () => {
    const route = expectOk(findRoute(bundle, graph, pt("L1", 0, 1), pt("L2", 0, 1)));
    expect(route.levelIds).toEqual(["L1", "L2"]);
    expect(route.distanceM).toBeCloseTo(1 + 20 + 20 + 1, 6);
    expect(route.durationSeconds).toBe(Math.round(42 / 1.4 + 10));
    const transitionStep = route.steps.find((s) => s.transition);
    expect(transitionStep?.instruction).toBe("Take the stairs to Level 2");
    expect(transitionStep?.transition).toEqual({ id: "stairs-1", kind: "stairs", toLevelId: "L2" });
    expect(transitionStep?.levelId).toBe("L1");
    expect(route.steps.some((s) => s.levelId === "L1" && s.points.length >= 2)).toBe(true);
    expect(route.steps.some((s) => s.levelId === "L2" && s.points.length >= 2)).toBe(true);
    // Steps are grouped by level: L1 steps first, then L2 steps.
    const levelSeq = route.steps.map((s) => s.levelId);
    expect(levelSeq.indexOf("L2")).toBe(levelSeq.lastIndexOf("L1") + 1);
    expect(route.steps[route.steps.length - 1]).toMatchObject({ levelId: "L2", instruction: "Arrive at your destination" });
  });

  it("uses the elevator instead of the stairs when accessible=true", () => {
    const route = expectOk(findRoute(bundle, graph, pt("L1", 0, 1), pt("L2", 0, 1), { accessible: true }));
    const transitionStep = route.steps.find((s) => s.transition);
    expect(transitionStep?.transition?.kind).toBe("elevator");
    expect(transitionStep?.instruction).toBe("Take the elevator to Level 2");
    expect(route.distanceM).toBeCloseTo(1 + 40 + 40 + 1, 6);
    expect(route.durationSeconds).toBe(Math.round(82 / 1.4 + 30));
  });

  it("prices transitions at travelSeconds * walking speed", () => {
    const g = buildGraph(bundle);
    const lift = g.edges.find((e) => e.transition?.id === "lift-1");
    expect(lift?.cost).toBeCloseTo(30 * 1.4, 6);
    expect(lift?.length).toBe(0);
    expect(g.stats.transitionCount).toBe(2);
    const a1 = g.nodeIndexById.get("a1") as number;
    const b1 = g.nodeIndexById.get("b1") as number;
    const res = astar(g, a1, b1);
    expect(res?.cost).toBeCloseTo(20 + 14 + 20, 6);
    expect(astar(g, a1, b1, { accessible: true })?.cost).toBeCloseTo(40 + 42 + 40, 6);
  });
});

/* ------------------------------------------------------------------ */
/* One-way edges                                                        */
/* ------------------------------------------------------------------ */

describe("oneWay edges", () => {
  const L = "L1";
  const bundle = makeBundle({
    levels: [level(L, "Level 1", 20, 20)],
    nodes: [node("A", L, 0, 0), node("B", L, 10, 0), node("C", L, 5, 10)],
    edges: [edge("A", "B", { oneWay: true }), edge("A", "C"), edge("C", "B")],
  });
  const graph = buildGraph(bundle);
  const detour = 2 * Math.hypot(5, 10);

  it("is respected between nodes", () => {
    expect(expectOk(findRoute(bundle, graph, { type: "node", id: "A" }, { type: "node", id: "B" })).distanceM).toBeCloseTo(10, 6);
    expect(expectOk(findRoute(bundle, graph, { type: "node", id: "B" }, { type: "node", id: "A" })).distanceM).toBeCloseTo(detour, 1);
  });

  it("is respected for points snapped onto the one-way edge", () => {
    const along = expectOk(findRoute(bundle, graph, pt(L, 2, 0.5), pt(L, 8, 0.5)));
    expect(along.distanceM).toBeCloseTo(0.5 + 6 + 0.5, 6);
    const against = expectOk(findRoute(bundle, graph, pt(L, 8, 0.5), pt(L, 2, 0.5)));
    // Cannot walk west along A-B: must go round via C.
    expect(against.distanceM).toBeGreaterThan(20);
    expect(routePoints(against).some((p) => p[1] >= 9.9)).toBe(true);
    for (const [a, b] of routeSegments(against)) {
      if (Math.abs(a[1]) < 1e-6 && Math.abs(b[1]) < 1e-6) expect(b[0]).toBeGreaterThanOrEqual(a[0]);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Multi-stop optimisation                                              */
/* ------------------------------------------------------------------ */

describe("optimizeRoute", () => {
  const L = "L1";
  const net = gridNetwork(L, 6, 6, 10);
  const bundle = makeBundle({ levels: [level(L, "Level 1", 60, 60)], nodes: net.nodes, edges: net.edges });
  const graph = buildGraph(bundle);
  const start: RouteEndpoint = { type: "node", id: "g_0_0" };
  const stops: RouteEndpoint[] = [
    { type: "node", id: "g_5_5" },
    { type: "node", id: "g_0_5" },
    { type: "node", id: "g_5_0" },
    { type: "node", id: "g_3_3" },
    pt(L, 12, 40),
  ];

  function tourDistance(seq: RouteEndpoint[], closed = false): number {
    let total = 0;
    const all = closed ? [...seq, start] : seq;
    let prev = start;
    for (const s of all) {
      total += expectOk(findRoute(bundle, graph, prev, s)).distanceM;
      prev = s;
    }
    return total;
  }

  function bruteForceBest(items: RouteEndpoint[], closed: boolean): number {
    let best = Infinity;
    const permute = (rest: RouteEndpoint[], acc: RouteEndpoint[]) => {
      if (rest.length === 0) {
        best = Math.min(best, tourDistance(acc, closed));
        return;
      }
      for (let i = 0; i < rest.length; i++) permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, rest[i]]);
    };
    permute(items, []);
    return best;
  }

  it("visits every stop once with a total no worse than the given order", () => {
    const res = optimizeRoute(bundle, graph, start, stops);
    if (!("order" in res)) throw new Error(res.error);
    expect(res.order).toHaveLength(stops.length);
    expect(new Set(res.order.map(endpointKey))).toEqual(new Set(stops.map(endpointKey)));
    expect(res.legs).toHaveLength(stops.length);
    expect(res.legs[0].from).toEqual(start);
    res.legs.forEach((leg, i) => expect(leg.to).toEqual(res.order[i]));
    expect(res.distanceM).toBeCloseTo(res.legs.reduce((s, l) => s + l.distanceM, 0), 6);
    expect(res.durationSeconds).toBe(Math.round(res.legs.reduce((s, l) => s + l.durationSeconds, 0)));
    const naive = tourDistance(stops);
    expect(res.distanceM).toBeLessThanOrEqual(naive + 1e-6);
    expect(res.distanceM).toBeLessThan(naive);
    // With five stops the exact optimum is cheap to enumerate.
    expect(res.distanceM).toBeCloseTo(bruteForceBest(stops, false), 6);
  });

  it("adds a closing leg when returnToStart is set", () => {
    const res = optimizeRoute(bundle, graph, start, stops, { returnToStart: true });
    if (!("order" in res)) throw new Error(res.error);
    expect(res.legs).toHaveLength(stops.length + 1);
    expect(res.legs[res.legs.length - 1].to).toEqual(start);
    expect(res.distanceM).toBeLessThanOrEqual(tourDistance(stops, true) + 1e-6);
    expect(res.distanceM).toBeCloseTo(bruteForceBest(stops, true), 6);
  });

  it("rejects unreachable stops and too many stops", () => {
    const res = optimizeRoute(bundle, graph, start, [...stops, { type: "booth", id: "nope" }]);
    expect("ok" in res && res.ok === false).toBe(true);
    const many = Array.from({ length: 26 }, (_, i) => pt(L, i, i));
    const tooMany = optimizeRoute(bundle, graph, start, many);
    expect("ok" in tooMany && tooMany.ok === false).toBe(true);
    const none = optimizeRoute(bundle, graph, start, []);
    expect("order" in none && none.order.length === 0).toBe(true);
  });

  it("prefers avoiding a slow lift when ordering multi-level stops", () => {
    const two = twoLevelBundle();
    const g = buildGraph(two);
    const res = optimizeRoute(two, g, { type: "node", id: "a1" }, [{ type: "node", id: "b1" }, { type: "node", id: "a3" }], { accessible: true });
    if (!("order" in res)) throw new Error(res.error);
    // Going a1 -> a3 -> (lift) -> b3 -> b1 rides the lift once; a1 -> b1 first would ride it twice.
    expect(res.order.map(endpointKey)).toEqual(["node:a3", "node:b1"]);
    expect(res.legs.filter((l) => l.steps.some((s) => s.transition)).length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Automatic network generation                                         */
/* ------------------------------------------------------------------ */

function components(nodes: BundleWayNode[], edges: BundleWayEdge[]): number {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    adj.get(e.to)?.push(e.from);
  }
  const seen = new Set<string>();
  let count = 0;
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    count++;
    const stack = [n.id];
    seen.add(n.id);
    while (stack.length) {
      const id = stack.pop() as string;
      for (const m of adj.get(id) ?? []) if (!seen.has(m)) { seen.add(m); stack.push(m); }
    }
  }
  return count;
}

describe("generateWayfindingGraph", () => {
  const L = "L1";
  const lvl = level(L, "Level 1", 40, 30);
  const block = [booth("X1", L, 15, 10, 5, 5), booth("X2", L, 20, 10, 5, 5), booth("X3", L, 15, 15, 5, 5), booth("X4", L, 20, 15, 5, 5)];

  it("produces a connected network around a block of booths with deterministic ids", () => {
    const auto = generateWayfindingGraph(lvl, block);
    expect(auto.nodes.length).toBeGreaterThan(0);
    expect(auto.edges.length).toBeGreaterThan(0);
    expect(components(auto.nodes, auto.edges)).toBe(1);
    expect(auto.nodes[0].id).toMatch(/^auto_L1_\d+_\d+$/);
    const again = generateWayfindingGraph(lvl, block);
    expect(again.nodes.map((n) => n.id)).toEqual(auto.nodes.map((n) => n.id));
    expect(again.edges.map((e) => e.id)).toEqual(auto.edges.map((e) => e.id));
    // No node inside a booth or within the 0.6 m clearance of one.
    for (const n of auto.nodes) {
      for (const b of block) expect(distanceToPolygon([n.x, n.y], b.polygon), `node ${n.id} is too close to ${b.id}`).toBeGreaterThan(0.6);
    }
    // The network surrounds the block (nodes on all four sides).
    expect(auto.nodes.some((n) => n.x < 14 && n.y > 10 && n.y < 20)).toBe(true);
    expect(auto.nodes.some((n) => n.x > 26 && n.y > 10 && n.y < 20)).toBe(true);
    expect(auto.nodes.some((n) => n.y < 9 && n.x > 15 && n.x < 25)).toBe(true);
    expect(auto.nodes.some((n) => n.y > 21 && n.x > 15 && n.x < 25)).toBe(true);
    // All referenced nodes exist and ids are unique.
    const ids = new Set(auto.nodes.map((n) => n.id));
    expect(ids.size).toBe(auto.nodes.length);
    for (const e of auto.edges) {
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
    }
    expect(new Set(auto.edges.map((e) => e.id)).size).toBe(auto.edges.length);
    // Default bounds: booth bbox padded by 6 m, clipped to the level.
    expect(auto.stats.cols).toBe(22);
    expect(auto.stats.rows).toBe(22);
  });

  it("routes between two points on opposite sides of the block", () => {
    const auto = generateWayfindingGraph(lvl, block);
    const bundle = makeBundle({ levels: [lvl], booths: block, nodes: auto.nodes, edges: auto.edges });
    const graph = buildGraph(bundle);
    const route = expectOk(findRoute(bundle, graph, pt(L, 10, 15), pt(L, 30, 15)));
    expect(route.distanceM).toBeGreaterThan(20);
    expect(route.distanceM).toBeLessThan(35);
    for (const [a, b] of routeSegments(route)) {
      for (const bo of block) expect(crossesBooth(a, b, bo), `segment ${a}-${b} crosses ${bo.id}`).toBe(false);
    }
  });

  it("respects walls and blocksRouting overrides", () => {
    const wall: BundleElement = {
      id: "w1",
      levelId: L,
      kind: "wall",
      geometry: { type: "polyline", points: [[20, 0], [20, 22]] },
      props: { strokeWidth: 0.3 },
      sortIndex: 0,
    };
    const walkableZone: BundleElement = {
      id: "z1",
      levelId: L,
      kind: "zone",
      geometry: { type: "polygon", points: [[0, 0], [40, 0], [40, 30], [0, 30]] },
      props: { blocksRouting: false },
      sortIndex: 1,
    };
    const walled = level(L, "Level 1", 40, 30, [wall, walkableZone]);
    const auto = generateWayfindingGraph(walled, []);
    expect(components(auto.nodes, auto.edges)).toBe(1);
    for (const n of auto.nodes) expect(n.x > 19.2 && n.x < 20.8 && n.y < 22.6, `node ${n.id} is on the wall`).toBe(false);
    const bundle = makeBundle({ levels: [walled], nodes: auto.nodes, edges: auto.edges });
    const route = expectOk(findRoute(bundle, buildGraph(bundle), pt(L, 10, 5), pt(L, 30, 5)));
    // Must go around the bottom of the wall (y > 22) instead of straight across (20 m).
    expect(route.distanceM).toBeGreaterThan(2 * Math.hypot(10, 18));
    expect(routePoints(route).some((p) => p[1] > 22)).toBe(true);
    for (const [a, b] of routeSegments(route)) {
      expect(segmentsIntersect(a, b, [20, 0], [20, 22]), `segment ${a}-${b} crosses the wall`).toBe(false);
    }
  });

  it("blocks rooms and stages but not zones marked walkable", () => {
    const room: BundleElement = {
      id: "r1",
      levelId: L,
      kind: "room",
      geometry: { type: "polygon", points: [[10, 10], [30, 10], [30, 20], [10, 20]] },
      props: {},
      sortIndex: 0,
    };
    const withRoom = level(L, "Level 1", 40, 30, [room]);
    const auto = generateWayfindingGraph(withRoom, []);
    expect(auto.nodes.some((n) => n.x > 11 && n.x < 29 && n.y > 11 && n.y < 19)).toBe(false);
    const walkable = level(L, "Level 1", 40, 30, [{ ...room, props: { blocksRouting: false } }]);
    const open = generateWayfindingGraph(walkable, []);
    expect(open.nodes.some((n) => n.x > 11 && n.x < 29 && n.y > 11 && n.y < 19)).toBe(true);
  });

  it("keeps the output size sane for a 200x150 m hall", () => {
    const H = "hall";
    const hall = level(H, "Hall", 200, 150);
    const booths: BundleBooth[] = [];
    let i = 0;
    for (let y = 6; y + 6 <= 144; y += 12) {
      for (let x = 6; x + 3 <= 194; x += 3) {
        if ((x - 6) % 30 >= 27) continue; // 3 m cross aisles every 30 m
        booths.push(booth(`h${i++}`, H, x, y, 3, 3));
        booths.push(booth(`h${i++}`, H, x, y + 3, 3, 3));
      }
    }
    const t0 = performance.now();
    const auto = generateWayfindingGraph(hall, booths);
    const ms = performance.now() - t0;
    expect(auto.nodes.length).toBeGreaterThan(1000);
    expect(auto.nodes.length).toBeLessThan(20000);
    expect(auto.stats.nodes).toBe(auto.nodes.length);
    expect(components(auto.nodes, auto.edges)).toBe(1);
    expect(ms).toBeLessThan(5000);
  });

  it("returns an empty network when there is nothing to rasterise", () => {
    const auto = generateWayfindingGraph(level("E", "Empty", 0, 0), []);
    expect(auto.nodes).toEqual([]);
    expect(auto.edges).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Performance                                                          */
/* ------------------------------------------------------------------ */

describe("performance", () => {
  it("answers a query on a 300x200 grid (60k nodes) in under 100 ms", () => {
    const L = "big";
    const net = gridNetwork(L, 300, 200, 1);
    const bundle = makeBundle({ levels: [level(L, "Big", 300, 200)], nodes: net.nodes, edges: net.edges });
    const tBuild = performance.now();
    const graph = buildGraph(bundle);
    const buildMs = performance.now() - tBuild;
    expect(graph.stats.nodeCount).toBe(60000);

    // Warm up the JIT with a short query, then time the corner-to-corner query.
    expectOk(findRoute(bundle, graph, pt(L, 10, 10), pt(L, 20, 20)));
    const t0 = performance.now();
    const route = expectOk(findRoute(bundle, graph, { type: "node", id: "g_0_0" }, { type: "node", id: "g_299_199" }));
    const queryMs = performance.now() - t0;
    expect(route.distanceM).toBeCloseTo(299 + 199, 6);
    expect(queryMs).toBeLessThan(100);

    const t1 = performance.now();
    const snapped = expectOk(findRoute(bundle, graph, pt(L, 0.5, 0.5), pt(L, 298.5, 198.5)));
    const snapMs = performance.now() - t1;
    // 0.5 m onto the lattice at each end, then 297 + 197 m along it.
    expect(snapped.distanceM).toBeCloseTo(0.5 + 0.5 + 297 + 197 + 0.5 + 0.5, 6);
    expect(snapMs).toBeLessThan(100);
    expect(buildMs).toBeLessThan(2000);
  });
});
