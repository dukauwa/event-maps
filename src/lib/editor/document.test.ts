import { describe, expect, it } from "vitest";
import { rectPolygon, polygonArea } from "@/lib/domain/geometry";
import {
  editorReducer,
  initialState,
  emptyDocument,
  generateBoothArray,
  DEFAULT_NUMBERING,
  DEFAULT_RENUMBER,
  renumberLabels,
  uniqueLabel,
  nextBoothLabel,
  mergePolygons,
  splitPolygon,
  alignSelection,
  distributeSelection,
  selectionBBox,
  rowLetter,
  type EditorBooth,
  type EditorDocument,
  type EditorState,
} from "./document";

function booth(id: string, label: string, x: number, y: number, w = 3, h = 3, levelId = "lv_1"): EditorBooth {
  return { id, levelId, label, externalId: null, polygon: rectPolygon(x, y, w, h), boothType: "standard", status: "available", priceCents: null, colors: null, labelHidden: false, height3d: null, notes: null, metadata: {}, exhibitorIds: [], sortIndex: 0 };
}

function doc(): EditorDocument {
  return {
    ...emptyDocument(),
    levels: [{ id: "lv_1", name: "L1", shortName: "L1", sortIndex: 0, widthM: 100, heightM: 60, background: null, georef: null }, { id: "lv_2", name: "L2", shortName: "L2", sortIndex: 1, widthM: 50, heightM: 40, background: null, georef: null }],
    booths: [booth("bo_a", "A1", 0, 0), booth("bo_b", "A2", 3, 0), booth("bo_c", "A3", 10, 10)],
    elements: [{ id: "el_z", levelId: "lv_1", kind: "zone", geometry: { type: "polygon", points: rectPolygon(20, 20, 10, 10) }, props: { name: "Zone" }, sortIndex: 0 }],
    nodes: [{ id: "wn_1", levelId: "lv_1", x: 0, y: 5 }, { id: "wn_2", levelId: "lv_1", x: 10, y: 5 }],
    edges: [{ id: "we_1", levelId: "lv_1", from: "wn_1", to: "wn_2", accessible: true, oneWay: false, virtual: false, weight: 1 }],
    transitions: [],
  };
}

const st = (): EditorState => initialState(doc());
const run = (s: EditorState, ...actions: Parameters<typeof editorReducer>[1][]) => actions.reduce(editorReducer, s);

describe("editorReducer basics", () => {
  it("selects with replace / add / toggle", () => {
    let s = run(st(), { type: "select", ids: ["bo_a"] });
    expect(s.selection).toEqual(["bo_a"]);
    s = run(s, { type: "select", ids: ["bo_b"], mode: "add" });
    expect(s.selection).toEqual(["bo_a", "bo_b"]);
    s = run(s, { type: "select", ids: ["bo_a"], mode: "toggle" });
    expect(s.selection).toEqual(["bo_b"]);
  });

  it("adds a booth with a unique label and selects it", () => {
    const s = run(st(), { type: "addBooth", booth: booth("bo_new", "A1", 30, 30) });
    expect(s.doc.booths).toHaveLength(4);
    expect(s.doc.booths[3].label).toBe("A4");
    expect(s.selection).toEqual(["bo_new"]);
    expect(s.past).toHaveLength(1);
    expect(s.revision).toBe(1);
  });

  it("moves selected objects and keeps other references stable", () => {
    const before = st();
    const s = run(before, { type: "move", ids: ["bo_a", "wn_1"], dx: 2, dy: 1 });
    expect(s.doc.booths[0].polygon[0]).toEqual([2, 1]);
    expect(s.doc.booths[1]).toBe(before.doc.booths[1]);
    expect(s.doc.nodes[0]).toEqual({ id: "wn_1", levelId: "lv_1", x: 2, y: 6 });
    expect(s.doc.nodes[1]).toBe(before.doc.nodes[1]);
  });

  it("undo / redo restore documents and prune the selection", () => {
    let s = run(st(), { type: "addBooth", booth: booth("bo_new", "Z9", 30, 30) });
    s = run(s, { type: "undo" });
    expect(s.doc.booths).toHaveLength(3);
    expect(s.selection).toEqual([]);
    expect(s.future).toHaveLength(1);
    s = run(s, { type: "redo" });
    expect(s.doc.booths).toHaveLength(4);
    expect(s.past).toHaveLength(1);
  });

  it("deletes booths, nodes (with their edges) and elements", () => {
    const s = run(st(), { type: "delete", ids: ["bo_a", "wn_1", "el_z"] });
    expect(s.doc.booths.map((b) => b.id)).toEqual(["bo_b", "bo_c"]);
    expect(s.doc.nodes.map((n) => n.id)).toEqual(["wn_2"]);
    expect(s.doc.edges).toHaveLength(0);
    expect(s.doc.elements).toHaveLength(0);
  });

  it("duplicates with an offset and fresh labels", () => {
    const s = run(st(), { type: "duplicate", ids: ["bo_a"], dx: 5, dy: 0 });
    expect(s.doc.booths).toHaveLength(4);
    const dup = s.doc.booths[3];
    expect(dup.label).toBe("A4");
    expect(dup.polygon[0]).toEqual([5, 0]);
    expect(dup.id).not.toBe("bo_a");
  });

  it("copy / paste onto another level", () => {
    let s = run(st(), { type: "copy", ids: ["bo_a", "el_z"] });
    s = run(s, { type: "paste", levelId: "lv_2", dx: 0, dy: 0 });
    expect(s.doc.booths[3].levelId).toBe("lv_2");
    expect(s.doc.elements[1].levelId).toBe("lv_2");
    expect(s.selection).toHaveLength(2);
  });

  it("updates booth labels safely (single booth, unique)", () => {
    const s = run(st(), { type: "updateBooths", ids: ["bo_b"], patch: { label: "A1" } });
    expect(s.doc.booths[1].label).toBe("A2"); // its own label is free, so the collision resolves to it
    const multi = run(st(), { type: "updateBooths", ids: ["bo_a", "bo_b"], patch: { label: "X", status: "sold" } });
    expect(multi.doc.booths[0].label).toBe("A1");
    expect(multi.doc.booths[0].status).toBe("sold");
    expect(multi.doc.booths[1].status).toBe("sold");
  });

  it("merges element props instead of replacing them", () => {
    const s = run(st(), { type: "updateElements", ids: ["el_z"], patch: { props: { fill: "#f00" } } });
    expect(s.doc.elements[0].props).toEqual({ name: "Zone", fill: "#f00" });
  });
});

describe("merge / split / renumber", () => {
  it("merges two adjacent booths into one rectangle and records the pending merge", () => {
    const s = run(st(), { type: "mergeBooths", ids: ["bo_a", "bo_b"] });
    expect(s.doc.booths.map((b) => b.id)).toEqual(["bo_a", "bo_c"]);
    const merged = s.doc.booths[0];
    expect(polygonArea(merged.polygon)).toBeCloseTo(18);
    expect(merged.polygon).toHaveLength(4);
    expect(s.doc.pendingMerges).toEqual([{ keepId: "bo_a", removedIds: ["bo_b"], label: "A1" }]);
    expect(s.selection).toEqual(["bo_a"]);
  });

  it("refuses to merge booths that do not touch", () => {
    const s = run(st(), { type: "mergeBooths", ids: ["bo_a", "bo_c"] });
    expect(s.doc.booths).toHaveLength(3);
    expect(s.past).toHaveLength(0);
  });

  it("chains merges into one pending op per surviving booth", () => {
    let s = run(st(), { type: "addBooth", booth: booth("bo_d", "A9", 6, 0), select: false });
    s = run(s, { type: "mergeBooths", ids: ["bo_a", "bo_b"] });
    s = run(s, { type: "mergeBooths", ids: ["bo_a", "bo_d"] });
    expect(s.doc.pendingMerges).toHaveLength(1);
    expect(s.doc.pendingMerges[0].removedIds.sort()).toEqual(["bo_b", "bo_d"]);
    expect(polygonArea(s.doc.booths[0].polygon)).toBeCloseTo(27);
  });

  it("splits a booth vertically into two halves", () => {
    const s = run(st(), { type: "splitBooth", id: "bo_c", axis: "v" });
    expect(s.doc.booths).toHaveLength(4);
    const [a, b] = [s.doc.booths[2], s.doc.booths[3]];
    expect(polygonArea(a.polygon)).toBeCloseTo(4.5);
    expect(polygonArea(b.polygon)).toBeCloseTo(4.5);
    expect(b.label).toBe("A4");
    expect(s.selection).toEqual(["bo_c", b.id]);
  });

  it("mergePolygons / splitPolygon helpers", () => {
    expect(mergePolygons([rectPolygon(0, 0, 2, 2), rectPolygon(2, 0, 2, 2)])).toHaveLength(4);
    expect(mergePolygons([rectPolygon(0, 0, 2, 2), rectPolygon(5, 0, 2, 2)])).toBeNull();
    const parts = splitPolygon(rectPolygon(0, 0, 4, 2), "h");
    expect(parts).not.toBeNull();
    expect(polygonArea(parts![0])).toBeCloseTo(4);
    expect(polygonArea(parts![1])).toBeCloseTo(4);
  });

  it("renumbers in reading order", () => {
    const labels = renumberLabels(doc(), ["bo_c", "bo_b", "bo_a"], { ...DEFAULT_RENUMBER, prefix: "B", start: 10, step: 10, pad: 3 });
    expect(labels).toEqual({ bo_a: "B010", bo_b: "B020", bo_c: "B030" });
    const s = run(st(), { type: "renumber", ids: ["bo_a", "bo_b", "bo_c"], opts: { ...DEFAULT_RENUMBER, prefix: "C" } });
    expect(s.doc.booths.map((b) => b.label)).toEqual(["C1", "C2", "C3"]);
  });

  it("renumber keeps labels unique when colliding with unselected booths", () => {
    const s = run(st(), { type: "renumber", ids: ["bo_a", "bo_b"], opts: { ...DEFAULT_RENUMBER, prefix: "A", start: 2 } });
    expect(s.doc.booths.map((b) => b.label)).toEqual(["A2", "A4", "A3"]);
  });

  it("label helpers", () => {
    expect(uniqueLabel("B12", new Set(["B12", "B13"]))).toBe("B14");
    expect(uniqueLabel("Cafe", new Set(["Cafe"]))).toBe("Cafe-2");
    expect(nextBoothLabel(["A1", "A2", "A10"])).toBe("A11");
    expect(nextBoothLabel([])).toBe("B1");
    expect(rowLetter(0)).toBe("A");
    expect(rowLetter(26)).toBe("AA");
  });
});

describe("booth array generation", () => {
  it("lays out columns × rows with aisles", () => {
    const out = generateBoothArray({ x: 10, y: 20, columns: 3, rows: 2, boothWidth: 3, boothDepth: 2, aisleX: 0, aisleY: 4, backToBack: false, numbering: { ...DEFAULT_NUMBERING, prefix: "A" } });
    expect(out).toHaveLength(6);
    expect(out.map((b) => b.label)).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]);
    expect(out[0].polygon).toEqual([[10, 20], [13, 20], [13, 22], [10, 22]]);
    expect(out[3].polygon[0]).toEqual([10, 26]);
  });

  it("back-to-back pairs share a wall and row-letter numbering", () => {
    const out = generateBoothArray({ x: 0, y: 0, columns: 2, rows: 4, boothWidth: 3, boothDepth: 3, aisleX: 0, aisleY: 3, backToBack: true, numbering: { ...DEFAULT_NUMBERING, mode: "rowLetters", start: 1, step: 2 } });
    expect(out.map((b) => b.label)).toEqual(["A1", "A3", "B1", "B3", "C1", "C3", "D1", "D3"]);
    expect(out[2].polygon[0][1]).toBe(3); // second row directly behind the first
    expect(out[4].polygon[0][1]).toBe(9); // aisle of 3 before the next pair
  });

  it("snake numbering alternates direction", () => {
    const out = generateBoothArray({ x: 0, y: 0, columns: 3, rows: 2, boothWidth: 3, boothDepth: 3, aisleX: 1, aisleY: 1, backToBack: false, numbering: { ...DEFAULT_NUMBERING, snake: true } });
    expect(out.map((b) => `${b.label}@${b.col}`)).toEqual(["1@0", "2@1", "3@2", "4@2", "5@1", "6@0"]);
  });

  it("addBooths dedupes labels against the document", () => {
    const gen = generateBoothArray({ x: 50, y: 50, columns: 2, rows: 1, boothWidth: 3, boothDepth: 3, aisleX: 0, aisleY: 0, backToBack: false, numbering: { ...DEFAULT_NUMBERING, prefix: "A" } });
    const s = run(st(), { type: "addBooths", booths: gen.map((g, i) => ({ ...booth(`bo_g${i}`, g.label, 0, 0), polygon: g.polygon })) });
    expect(s.doc.booths.slice(3).map((b) => b.label)).toEqual(["A4", "A5"]);
  });
});

describe("transforms", () => {
  it("rotates 90° around the selection centre", () => {
    const s = run(st(), { type: "rotate", ids: ["bo_a"], deg: 90 });
    const bb = selectionBBox(s.doc, ["bo_a"])!;
    expect(bb).toEqual({ minX: 0, minY: 0, maxX: 3, maxY: 3 });
    expect(s.doc.booths[0].polygon[0]).toEqual([3, 0]);
  });

  it("flips horizontally and keeps bbox", () => {
    const s = run(st(), { type: "flip", ids: ["bo_a", "bo_b"], axis: "h" });
    expect(selectionBBox(s.doc, ["bo_a", "bo_b"])).toEqual({ minX: 0, minY: 0, maxX: 6, maxY: 3 });
    expect(selectionBBox(s.doc, ["bo_a"])).toEqual({ minX: 3, minY: 0, maxX: 6, maxY: 3 });
  });

  it("scales to a new bounding box", () => {
    const s = run(st(), { type: "scale", ids: ["bo_a"], from: { minX: 0, minY: 0, maxX: 3, maxY: 3 }, to: { minX: 0, minY: 0, maxX: 6, maxY: 3 } });
    expect(s.doc.booths[0].polygon).toEqual([[0, 0], [6, 0], [6, 3], [0, 3]]);
  });

  it("aligns and distributes", () => {
    const d = { ...doc(), booths: [booth("bo_1", "1", 0, 0), booth("bo_2", "2", 10, 5), booth("bo_3", "3", 30, 9)] };
    const aligned = alignSelection(d, ["bo_1", "bo_2", "bo_3"], "top");
    expect(aligned.booths.map((b) => b.polygon[0][1])).toEqual([0, 0, 0]);
    const dist = distributeSelection(d, ["bo_1", "bo_2", "bo_3"], "x");
    expect(dist.booths[1].polygon[0][0]).toBe(15);
  });

  it("reorders elements front/back", () => {
    const d = { ...doc(), elements: [0, 1, 2].map((i) => ({ id: `el_${i}`, levelId: "lv_1", kind: "zone" as const, geometry: { type: "polygon" as const, points: rectPolygon(i, i, 2, 2) }, props: {}, sortIndex: i })) };
    let s = run(initialState(d), { type: "order", ids: ["el_0"], mode: "front" });
    expect(s.doc.elements.map((e) => e.sortIndex)).toEqual([2, 0, 1]);
    s = run(s, { type: "order", ids: ["el_0"], mode: "backward" });
    expect(s.doc.elements.map((e) => e.sortIndex)).toEqual([1, 0, 2]);
  });
});

describe("levels", () => {
  it("adds, updates, reorders and deletes levels (never the last one)", () => {
    let s = run(st(), { type: "addLevel", level: { id: "lv_3", name: "L3", shortName: "L3", sortIndex: 2, widthM: 10, heightM: 10, background: null, georef: null } });
    expect(s.activeLevelId).toBe("lv_3");
    s = run(s, { type: "updateLevel", id: "lv_3", patch: { name: "Mezz" } });
    expect(s.doc.levels[2].name).toBe("Mezz");
    s = run(s, { type: "reorderLevels", ids: ["lv_3", "lv_1", "lv_2"] });
    expect(s.doc.levels.map((l) => l.sortIndex)).toEqual([1, 2, 0]);
    s = run(s, { type: "deleteLevel", id: "lv_1" });
    expect(s.doc.levels.map((l) => l.id)).toEqual(["lv_2", "lv_3"]);
    expect(s.doc.booths).toHaveLength(0);
    expect(s.doc.nodes).toHaveLength(0);
    expect(s.doc.edges).toHaveLength(0);
    s = run(s, { type: "deleteLevel", id: "lv_2" }, { type: "deleteLevel", id: "lv_3" });
    expect(s.doc.levels).toHaveLength(1);
  });
});

describe("save bookkeeping", () => {
  it("reconciles ids across doc, history, selection and lastSaved", () => {
    let s = run(st(), { type: "addBooth", booth: booth("bo_tmp", "N1", 40, 40) });
    s = run(s, { type: "reconcileIds", map: { bo_tmp: "bo_real", lv_1: "lv_real" } });
    expect(s.doc.booths[3].id).toBe("bo_real");
    expect(s.doc.booths[3].levelId).toBe("lv_real");
    expect(s.selection).toEqual(["bo_real"]);
    expect(s.activeLevelId).toBe("lv_real");
    expect(s.past[0].levels[0].id).toBe("lv_real");
    expect(s.lastSaved.levels[0].id).toBe("lv_real");
    expect(s.doc.nodes[0].levelId).toBe("lv_real");
  });

  it("markSaved clears pending merges everywhere", () => {
    let s = run(st(), { type: "mergeBooths", ids: ["bo_a", "bo_b"] });
    s = run(s, { type: "markSaved", doc: s.doc });
    expect(s.doc.pendingMerges).toEqual([]);
    expect(s.lastSaved.pendingMerges).toEqual([]);
    expect(s.lastSaved.booths).toHaveLength(2);
  });
});

describe("array + path flags", () => {
  it("array action generates a labelled, selected block that respects existing labels", () => {
    const s = run(st(), { type: "array", levelId: "lv_1", opts: { x: 50, y: 50, columns: 3, rows: 2, boothWidth: 3, boothDepth: 3, aisleX: 0, aisleY: 2, backToBack: false, numbering: { ...DEFAULT_NUMBERING, prefix: "A", start: 1 } }, template: { boothType: "shell" } });
    expect(s.doc.booths).toHaveLength(9);
    const added = s.doc.booths.slice(3);
    // A1..A3 already exist → uniqueLabel bumps them.
    expect(added.map((b) => b.label)).toEqual(["A4", "A5", "A6", "A7", "A8", "A9"]);
    expect(added.every((b) => b.boothType === "shell" && b.levelId === "lv_1")).toBe(true);
    expect(s.selection).toHaveLength(6);
    expect(s.past).toHaveLength(1);
  });

  it("pathConnect applies the tool's edge flags", () => {
    const s = run(st(), { type: "pathConnect", levelId: "lv_1", target: { kind: "free", point: [20, 5] }, fromNodeId: "wn_2", newNodeId: "wn_new", flags: { accessible: false, oneWay: true } });
    const e = s.doc.edges.find((x) => x.to === "wn_new");
    expect(e).toMatchObject({ from: "wn_2", accessible: false, oneWay: true, virtual: false, weight: 1 });
  });
});

describe("markSaved identity", () => {
  it("is clean after a save that persisted everything, dirty when edits arrived meanwhile", () => {
    let s = run(st(), { type: "move", ids: ["bo_a"], dx: 1, dy: 0 });
    expect(s.doc).not.toBe(s.lastSaved);
    const savedCopy = JSON.parse(JSON.stringify(s.doc)) as EditorDocument;
    const clean = run(s, { type: "markSaved", doc: savedCopy });
    expect(clean.doc).toBe(clean.lastSaved);
    s = run(s, { type: "move", ids: ["bo_b"], dx: 0, dy: 1 });
    const dirty = run(s, { type: "markSaved", doc: savedCopy });
    expect(dirty.doc).not.toBe(dirty.lastSaved);
  });
  it("setBoothMetadata replaces keys", () => {
    let s = run(st(), { type: "updateBooths", ids: ["bo_a"], patch: { metadata: { a: "1", b: "2" } } });
    s = run(s, { type: "setBoothMetadata", id: "bo_a", metadata: { b: "3" } });
    expect(s.doc.booths[0].metadata).toEqual({ b: "3" });
  });
});
