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
import { pointInPolygon, segmentsIntersect } from "@/lib/domain/geometry";
import { astar, buildGraph, endpointKey, findRoute, generateWayfindingGraph, optimizeRoute, resolveEndpoint } from "./index";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

function level(id: string, name: string, widthM: number, heightM: number, elements: BundleElement[] = []): BundleLevel {
  return { id, name, shortName: name, sortIndex: 0, widthM, heightM, background: null, georef: null, elements };
}

function booth(id: string, levelId: string, x: number, y: number, w: number, h: number, exhibitorIds: string[] = []): BundleBooth {
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
    exhibitorIds,
  };
}

function exhibitor(id: string, name: string, boothIds: string[]): BundleExhibitor {
  return { id, name, slug: id, gallery: [], featured: false, socials: {}, tags: [], categoryIds: [], boothIds, boothLabels: boothIds };
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

function routeSegments(route: RouteResult): [Point, Point][] {
  const segs: [Point, Point][] = [];
  for (const step of route.steps) {
    for (let i = 1; i < step.points.length; i++) segs.push([step.points[i - 1], step.points[i]]);
  }
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
    booths.push(booth(`A${i + 1}`, L, 10 + i * 5, 10, 5, 6));
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
    exhibitors: [exhibitor("ex1", "Acme Corp", ["B6"])],
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
    expect(route.steps[0].instruction).toBe("Head along the aisle");
    expect(route.steps[route.steps.length - 1].instruction).toBe("Arrive at Booth B6");

    const others = bundle.booths.filter((b) => b.id !== "A1" && b.id !== "B6");
    for (const [a, b] of routeSegments(route)) {
      for (const other of others) expect(crossesBooth(a, b, other), `segment ${a}-${b} crosses ${other.id}`).toBe(false);
    }
    // Every interior vertex lies on the network (the middle aisle at y = 20).
    const pts = route.steps.flatMap((s) => s.points);
    for (const p of pts.slice(1, -1)) expect(p[1]).toBeCloseTo(20, 6);
  });

  it("follows the network even when the straight line is shorter", () => {
    const route = expectOk(findRoute(bundle, graph, { type: "booth", id: "A1" }, { type: "booth", id: "A8" }));
    // Straight line would be 35 m through the row; the network goes via the middle aisle: 7 + 35 + 7.
    expect(route.distanceM).toBeCloseTo(49, 1);
  });

  it("resolves exhibitor endpoints to their first booth and names them on arrival", () => {
    const resolved = resolveEndpoint(bundle, { type: "exhibitor", id: "ex1" });
    expect(resolved?.levelId).toBe("L1");
    expect(resolved?.point[0]).toBeCloseTo(37.5);
    expect(resolved?.point[1]).toBeCloseTo(27);
    const route = expectOk(findRoute(bundle, graph, pt("L1", 5, 5), { type: "exhibitor", id: "ex1" }));
    expect(route.steps[route.steps.length - 1].instruction).toBe("Arrive at Acme Corp");
    expect(resolveEndpoint(bundle, { type: "booth", id: "nope" })).toBeNull();
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
    const noNet = makeBundle({ levels: [level("L9", "Empty", 10, 10)] });
    const r = findRoute(noNet, buildGraph(noNet), pt("L9", 1, 1), pt("L9", 5, 5));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/No wayfinding network/);
  });

  it("returns a zero-length route when start and destination coincide", () => {
    const route = expectOk(findRoute(bundle, graph, { type: "booth", id: "A1" }, { type: "booth", id: "A1" }));
    expect(route.distanceM).toBe(0);
    expect(route.steps).toHaveLength(1);
    expect(route.steps[0].instruction).toBe("Arrive at Booth A1");
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
    for (const p of acc.steps.flatMap((s) => s.points).slice(1, -1)) expect(p[1]).toBeCloseTo(5, 6);
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
    const a1 = g.nodeIndexById.get("a1") as number;
    const b1 = g.nodeIndexById.get("b1") as number;
    const res = astar(g, a1, b1);
    expect(res?.cost).toBeCloseTo(20 + 14 + 20, 6);
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
    expect(against.distanceM).toBeCloseTo(0.5 + 2 + detour + 2 + 0.5, 1);
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

  function naiveTotal(seq: RouteEndpoint[], closed = false): number {
    let total = 0;
    const all = closed ? [...seq, start] : seq;
    let prev = start;
    for (const s of all) {
      total += expectOk(findRoute(bundle, graph, prev, s)).distanceM;
      prev = s;
    }
    return total;
  }

  it("visits every stop once with a total no worse than the given order", () => {
    const res = optimizeRoute(bundle, graph, start, stops);
    if (!("order" in res)) throw new Error(res.error);
    expect(res.order).toHaveLength(stops.length);
    expect(new Set(res.order.map(endpointKey))).toEqual(new Set(stops.map(endpointKey)));
    expect(res.legs).toHaveLength(stops.length);
    expect(res.legs[0].from).toEqual(start);
    res.legs.forEach((leg, i) => expect(leg.to).toEqual(res.order[i]));
    expect(res.distanceM).toBeLessThanOrEqual(naiveTotal(stops) + 1e-6);
    expect(res.distanceM).toBeCloseTo(res.legs.reduce((s, l) => s + l.distanceM, 0), 6);
    // The optimal open tour here: (0,0) -> (12,40)... is 130 m long; the scrambled input order is much worse.
    expect(res.distanceM).toBeLessThan(naiveTotal(stops));
    expect(res.distanceM).toBeCloseTo(130, 6);
  });

  it("adds a closing leg when returnToStart is set", () => {
    const res = optimizeRoute(bundle, graph, start, stops, { returnToStart: true });
    if (!("order" in res)) throw new Error(res.error);
    expect(res.legs).toHaveLength(stops.length + 1);
    expect(res.legs[res.legs.length - 1].to).toEqual(start);
    expect(res.distanceM).toBeLessThanOrEqual(naiveTotal(stops, true) + 1e-6);
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
    // No node inside the booth block inflated by the 0.6 m clearance.
    for (const n of auto.nodes) {
      expect(n.x > 14.4 && n.x < 25.6 && n.y > 9.4 && n.y < 20.6, `node ${n.id} is inside the block`).toBe(false);
    }
    // All referenced nodes exist and ids are unique.
    const ids = new Set(auto.nodes.map((n) => n.id));
    expect(ids.size).toBe(auto.nodes.length);
    for (const e of auto.edges) {
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
    }
    expect(new Set(auto.edges.map((e) => e.id)).size).toBe(auto.edges.length);
  });

  it("routes between two points on opposite sides of the block", () => {
    const auto = generateWayfindingGraph(lvl, block);
    const bundle = makeBundle({ levels: [lvl], booths: block, nodes: auto.nodes, edges: auto.edges });
    const graph = buildGraph(bundle);
    const route = expectOk(findRoute(bundle, graph, pt(L, 5, 15), pt(L, 35, 15)));
    expect(route.distanceM).toBeGreaterThan(30);
    expect(route.distanceM).toBeLessThan(45);
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
    expect(route.distanceM).toBeGreaterThan(50);
    expect(route.steps.flatMap((s) => s.points).some((p) => p[1] > 22)).toBe(true);
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
    expect(snapped.distanceM).toBeCloseTo(299 + 199, 6);
    expect(snapMs).toBeLessThan(100);
    expect(buildMs).toBeLessThan(2000);
  });
});
