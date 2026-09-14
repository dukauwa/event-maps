import { describe, expect, it } from "vitest";
import { rectPolygon } from "@/lib/domain/geometry";
import { buildSnapTargets, snapPoint, snapDelta, snapToGrid, nearestValue, DEFAULT_SNAP } from "./snap";
import { snapPathPoint, connectPath, splitEdge, removeFromNetwork } from "./path";
import { diffDocuments, remapIds, boothApiInput } from "./diff";
import { emptyDocument, type EditorBooth, type EditorDocument } from "./types";
import { editorReducer, initialState } from "./document";

function booth(id: string, label: string, x: number, y: number, w = 3, h = 3, levelId = "lv_1"): EditorBooth {
  return { id, levelId, label, externalId: null, polygon: rectPolygon(x, y, w, h), boothType: "standard", status: "available", priceCents: null, colors: null, labelHidden: false, height3d: null, notes: null, metadata: {}, exhibitorIds: [], sortIndex: 0 };
}

function doc(): EditorDocument {
  return {
    ...emptyDocument(),
    levels: [{ id: "lv_1", name: "L1", shortName: "L1", sortIndex: 0, widthM: 100, heightM: 60, background: null, georef: null }],
    booths: [booth("bo_a", "A1", 10, 10), booth("bo_b", "A2", 20, 10)],
    nodes: [{ id: "wn_1", levelId: "lv_1", x: 0, y: 5 }, { id: "wn_2", levelId: "lv_1", x: 10, y: 5 }],
    edges: [{ id: "we_1", levelId: "lv_1", from: "wn_1", to: "wn_2", accessible: false, oneWay: true, virtual: false, weight: 2 }],
    transitions: [{ id: "tr_1", name: "Stairs", kind: "stairs", accessible: false, nodeIds: ["wn_1"], travelSeconds: 30 }],
  };
}

describe("snapping", () => {
  it("snaps to grid", () => {
    expect(snapToGrid([1.24, 3.76], 0.5)).toEqual([1, 4]);
    expect(nearestValue([1, 2, 3, 10], 2.9, 0.2)).toBe(3);
    expect(nearestValue([1, 2, 3, 10], 6, 0.5)).toBeNull();
  });

  it("prefers vertices, then edges, then grid", () => {
    const targets = buildSnapTargets(doc(), "lv_1", ["bo_b"]);
    expect(targets.xs).toEqual([10, 13]);
    expect(targets.ys).toEqual([10, 13]);
    const v = snapPoint([13.2, 12.9], targets, DEFAULT_SNAP);
    expect(v.point).toEqual([13, 13]);
    expect(v.guides).toHaveLength(2);
    const e = snapPoint([12.9, 30.3], targets, DEFAULT_SNAP);
    expect(e.point).toEqual([13, 30.5]);
    expect(e.guides).toEqual([{ axis: "x", value: 13 }]);
    const g = snapPoint([40.26, 40.74], targets, DEFAULT_SNAP);
    expect(g.point).toEqual([40.5, 40.5]);
    expect(g.guides).toEqual([]);
  });

  it("snapDelta aligns the moved box's edges to neighbours", () => {
    const d = doc();
    const targets = buildSnapTargets(d, "lv_1", ["bo_a"]);
    // Dragging A1 (x 10..13) right by 6.8 puts its right edge at 19.8 -> snaps to A2's left edge at 20.
    const r = snapDelta({ minX: 10, minY: 10, maxX: 13, maxY: 13 }, 6.8, 0.1, targets, DEFAULT_SNAP);
    expect(r.dx).toBe(7);
    expect(r.guides).toContainEqual({ axis: "x", value: 20 });
    expect(r.dy).toBe(0);
    const off = snapDelta({ minX: 10, minY: 10, maxX: 13, maxY: 13 }, 0.3, 0.2, null, { ...DEFAULT_SNAP, objects: false });
    expect(off).toEqual({ dx: 0.5, dy: 0, guides: [] });
  });
});

describe("path network", () => {
  it("snaps to a node, to an edge and to free space", () => {
    const d = doc();
    expect(snapPathPoint(d, "lv_1", [0.2, 5.1], 0.5)).toMatchObject({ kind: "node", id: "wn_1" });
    const onEdge = snapPathPoint(d, "lv_1", [5, 5.3], 0.5);
    expect(onEdge).toMatchObject({ kind: "edge", edgeId: "we_1", point: [5, 5] });
    expect(snapPathPoint(d, "lv_1", [50, 50], 0.5)).toEqual({ kind: "free", point: [50, 50] });
  });

  it("splitting an edge keeps its flags on both halves", () => {
    const r = splitEdge(doc(), "we_1", [5, 5], "wn_new");
    expect(r.doc.nodes).toHaveLength(3);
    expect(r.doc.edges).toHaveLength(2);
    expect(r.doc.edges.every((e) => e.accessible === false && e.oneWay && e.weight === 2)).toBe(true);
    expect(r.doc.edges.map((e) => [e.from, e.to])).toEqual([["wn_1", "wn_new"], ["wn_new", "wn_2"]]);
  });

  it("connectPath creates T-junctions and avoids duplicate edges", () => {
    let r = connectPath(doc(), "lv_1", { kind: "free", point: [5, 20] }, null, "wn_a");
    expect(r.edgeId).toBeNull();
    r = connectPath(r.doc, "lv_1", { kind: "edge", edgeId: "we_1", point: [5, 5], t: 0.5 }, "wn_a", "wn_t");
    expect(r.nodeId).toBe("wn_t");
    expect(r.doc.edges).toHaveLength(3);
    const again = connectPath(r.doc, "lv_1", { kind: "node", id: "wn_t", point: [5, 5] }, "wn_a");
    expect(again.doc.edges).toHaveLength(3);
    expect(again.edgeId).toBe(r.edgeId);
    const self = connectPath(r.doc, "lv_1", { kind: "node", id: "wn_a", point: [5, 20] }, "wn_a");
    expect(self.edgeId).toBeNull();
  });

  it("removing a node drops its edges and transition references", () => {
    const d = removeFromNetwork(doc(), ["wn_1"]);
    expect(d.edges).toHaveLength(0);
    expect(d.transitions[0].nodeIds).toEqual([]);
  });

  it("reducer pathConnect selects the new node", () => {
    const s = editorReducer(initialState(doc()), { type: "pathConnect", levelId: "lv_1", target: { kind: "free", point: [1, 1] }, fromNodeId: "wn_2", newNodeId: "wn_x" });
    expect(s.selection).toEqual(["wn_x"]);
    expect(s.doc.edges).toHaveLength(2);
  });

  it("setLevelGraph replaces a level's network and prunes transitions", () => {
    const s = editorReducer(initialState(doc()), { type: "setLevelGraph", levelId: "lv_1", nodes: [{ id: "auto_1", x: 0, y: 0 }, { id: "auto_2", x: 1, y: 0 }], edges: [{ from: "auto_1", to: "auto_2" }, { from: "auto_1", to: "missing" }] });
    expect(s.doc.nodes.map((n) => n.id)).toEqual(["auto_1", "auto_2"]);
    expect(s.doc.edges).toHaveLength(1);
    expect(s.doc.edges[0]).toMatchObject({ accessible: true, oneWay: false, weight: 1 });
    expect(s.doc.transitions[0].nodeIds).toEqual([]);
  });
});

describe("diffDocuments", () => {
  it("is empty for identical documents", () => {
    const d = doc();
    expect(diffDocuments(d, d).isEmpty).toBe(true);
  });

  it("detects booth create / update / delete with minimal patches", () => {
    const saved = doc();
    const cur: EditorDocument = { ...saved, booths: [{ ...saved.booths[0], status: "sold", notes: "vip" }, booth("bo_n", "N1", 0, 0)] };
    const plan = diffDocuments(saved, cur);
    expect(plan.booths.create.map((b) => b.id)).toEqual(["bo_n"]);
    expect(plan.booths.update).toEqual([{ id: "bo_a", patch: { status: "sold", notes: "vip" } }]);
    expect(plan.booths.delete).toEqual(["bo_b"]);
    expect(plan.isEmpty).toBe(false);
  });

  it("uses the merge endpoint instead of delete for merged booths", () => {
    const saved = doc();
    const s = editorReducer(initialState(saved), { type: "mergeBooths", ids: ["bo_a", "bo_b"] });
    // Not adjacent in this fixture, so fake adjacency by moving first.
    const adjacent: EditorDocument = { ...saved, booths: [booth("bo_a", "A1", 10, 10), booth("bo_b", "A2", 13, 10)] };
    const merged = editorReducer(initialState(adjacent), { type: "mergeBooths", ids: ["bo_a", "bo_b"] });
    expect(s.doc.pendingMerges).toHaveLength(0);
    const plan = diffDocuments(adjacent, merged.doc);
    expect(plan.merges).toEqual([{ keepId: "bo_a", removedIds: ["bo_b"], label: "A1" }]);
    expect(plan.booths.delete).toEqual([]);
    expect(plan.booths.update).toHaveLength(1);
    expect(plan.booths.update[0].patch.polygon).toBeDefined();
  });

  it("tracks element and wayfinding levels, transitions and levels", () => {
    const saved = doc();
    const cur: EditorDocument = {
      ...saved,
      levels: [{ ...saved.levels[0], name: "Hall" }, { id: "lv_new", name: "L2", shortName: "L2", sortIndex: 1, widthM: 10, heightM: 10, background: null, georef: null }],
      elements: [{ id: "el_1", levelId: "lv_1", kind: "wall", geometry: { type: "polyline", points: [[0, 0], [1, 1]] }, props: {}, sortIndex: 0 }],
      nodes: [...saved.nodes, { id: "wn_9", levelId: "lv_new", x: 1, y: 1 }],
      transitions: [{ ...saved.transitions[0], accessible: true }, { id: "tr_new", name: "Lift", kind: "elevator", accessible: true, nodeIds: ["wn_1", "wn_9"], travelSeconds: 40 }],
    };
    const plan = diffDocuments(saved, cur);
    expect(plan.levels.create.map((l) => l.id)).toEqual(["lv_new"]);
    expect(plan.levels.update).toEqual([{ id: "lv_1", patch: { name: "Hall" } }]);
    expect(plan.elementLevels).toEqual(["lv_1"]);
    expect(plan.wayfindingLevels).toEqual(["lv_new"]);
    expect(plan.transitions.update).toEqual([{ id: "tr_1", patch: { accessible: true } }]);
    expect(plan.transitions.create.map((t) => t.id)).toEqual(["tr_new"]);
  });

  it("skips deletes for objects on a deleted level", () => {
    const saved = doc();
    const cur: EditorDocument = { ...emptyDocument(), levels: [] };
    const plan = diffDocuments(saved, cur);
    expect(plan.levels.delete).toEqual(["lv_1"]);
    expect(plan.booths.delete).toEqual([]);
    expect(plan.wayfindingLevels).toEqual([]);
  });

  it("remapIds renames references everywhere", () => {
    const d = remapIds(doc(), { bo_a: "bo_z", wn_1: "wn_z", lv_1: "lv_z" });
    expect(d.booths[0].id).toBe("bo_z");
    expect(d.booths[0].levelId).toBe("lv_z");
    expect(d.edges[0].from).toBe("wn_z");
    expect(d.transitions[0].nodeIds).toEqual(["wn_z"]);
    expect(d.levels[0].id).toBe("lv_z");
  });

  it("boothApiInput strips empty colours", () => {
    expect(boothApiInput({ ...booth("bo_a", "A1", 0, 0), colors: { fill: "" } }).colors).toBeNull();
    expect(boothApiInput({ ...booth("bo_a", "A1", 0, 0), colors: { fill: "#f00" } }).colors).toEqual({ fill: "#f00" });
  });
});
