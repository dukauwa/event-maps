/**
 * Pure geometry operations used by the editor reducer: transforms over a selection, merge/split,
 * booth array generation and (re)numbering.
 */
import { union, bboxClip, polygon as turfPolygon } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon as GjPolygon } from "geojson";
import type { Geometry, Point, Polygon } from "@/lib/domain/types";
import { bbox, rotatePoint, round, type BBox } from "@/lib/domain/geometry";
import type { EditorDocument } from "./types";

export type PointFn = (p: Point) => Point;

export function mapGeometry(g: Geometry, fn: PointFn): Geometry {
  if (g.type === "point") return { type: "point", point: fn(g.point) };
  return { type: g.type, points: g.points.map(fn) } as Geometry;
}

export function geometryPoints(g: Geometry): Point[] {
  return g.type === "point" ? [g.point] : g.points;
}

export const roundPoint = (p: Point, d = 3): Point => [round(p[0], d) + 0, round(p[1], d) + 0];

export function translate(dx: number, dy: number): PointFn {
  return (p) => roundPoint([p[0] + dx, p[1] + dy]);
}

/** Bounding box of everything in `ids` (booths, elements, nodes). Null when nothing matched. */
export function selectionBBox(doc: EditorDocument, ids: Iterable<string>): BBox | null {
  const set = new Set(ids);
  const pts: Point[] = [];
  for (const b of doc.booths) if (set.has(b.id)) pts.push(...b.polygon);
  for (const e of doc.elements) if (set.has(e.id)) pts.push(...geometryPoints(e.geometry));
  for (const n of doc.nodes) if (set.has(n.id)) pts.push([n.x, n.y]);
  return pts.length ? bbox(pts) : null;
}

/** Apply a point transform to every selected booth/element/node. Unselected objects keep their identity. */
export function transformSelection(doc: EditorDocument, ids: Iterable<string>, fn: PointFn): EditorDocument {
  const set = new Set(ids);
  if (!set.size) return doc;
  return {
    ...doc,
    booths: doc.booths.map((b) => (set.has(b.id) ? { ...b, polygon: b.polygon.map(fn) } : b)),
    elements: doc.elements.map((e) => (set.has(e.id) ? { ...e, geometry: mapGeometry(e.geometry, fn) } : e)),
    nodes: doc.nodes.map((n) => {
      if (!set.has(n.id)) return n;
      const [x, y] = fn([n.x, n.y]);
      return { ...n, x, y };
    }),
  };
}

export function rotateSelection(doc: EditorDocument, ids: string[], deg: number, center?: Point): EditorDocument {
  const bb = selectionBBox(doc, ids);
  if (!bb) return doc;
  const c: Point = center ?? [(bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2];
  return transformSelection(doc, ids, (p) => roundPoint(rotatePoint(p, c, deg)));
}

export function flipSelection(doc: EditorDocument, ids: string[], axis: "h" | "v"): EditorDocument {
  const bb = selectionBBox(doc, ids);
  if (!bb) return doc;
  const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
  const flipped = transformSelection(doc, ids, (p) => (axis === "h" ? roundPoint([2 * cx - p[0], p[1]]) : roundPoint([p[0], 2 * cy - p[1]])));
  // Mirroring reverses winding; keep polygons consistently oriented.
  const set = new Set(ids);
  return { ...flipped, booths: flipped.booths.map((b) => (set.has(b.id) ? { ...b, polygon: [...b.polygon].reverse() } : b)) };
}

/** Map the selection's bounding box `from` onto `to` (resize handles). */
export function scaleSelection(doc: EditorDocument, ids: string[], from: BBox, to: BBox): EditorDocument {
  const fw = from.maxX - from.minX || 1, fh = from.maxY - from.minY || 1;
  const sx = (to.maxX - to.minX) / fw, sy = (to.maxY - to.minY) / fh;
  return transformSelection(doc, ids, (p) => roundPoint([to.minX + (p[0] - from.minX) * sx, to.minY + (p[1] - from.minY) * sy]));
}

export type AlignMode = "left" | "right" | "top" | "bottom" | "centerX" | "centerY";

function itemBoxes(doc: EditorDocument, ids: string[]): { id: string; box: BBox }[] {
  return ids.map((id) => ({ id, box: selectionBBox(doc, [id]) })).filter((x): x is { id: string; box: BBox } => !!x.box);
}

export function alignSelection(doc: EditorDocument, ids: string[], mode: AlignMode): EditorDocument {
  const items = itemBoxes(doc, ids);
  if (items.length < 2) return doc;
  const all = bbox(items.flatMap((i) => [[i.box.minX, i.box.minY], [i.box.maxX, i.box.maxY]] as Point[]));
  let out = doc;
  for (const { id, box } of items) {
    let dx = 0, dy = 0;
    if (mode === "left") dx = all.minX - box.minX;
    if (mode === "right") dx = all.maxX - box.maxX;
    if (mode === "top") dy = all.minY - box.minY;
    if (mode === "bottom") dy = all.maxY - box.maxY;
    if (mode === "centerX") dx = (all.minX + all.maxX) / 2 - (box.minX + box.maxX) / 2;
    if (mode === "centerY") dy = (all.minY + all.maxY) / 2 - (box.minY + box.maxY) / 2;
    if (dx || dy) out = transformSelection(out, [id], translate(dx, dy));
  }
  return out;
}

/** Even gaps between items along an axis (first and last stay put). */
export function distributeSelection(doc: EditorDocument, ids: string[], axis: "x" | "y"): EditorDocument {
  const items = itemBoxes(doc, ids);
  if (items.length < 3) return doc;
  const lo = axis === "x" ? (b: BBox) => b.minX : (b: BBox) => b.minY;
  const hi = axis === "x" ? (b: BBox) => b.maxX : (b: BBox) => b.maxY;
  items.sort((a, b) => lo(a.box) - lo(b.box));
  const first = items[0], last = items[items.length - 1];
  const totalSize = items.reduce((s, i) => s + (hi(i.box) - lo(i.box)), 0);
  const span = hi(last.box) - lo(first.box);
  const gap = (span - totalSize) / (items.length - 1);
  let cursor = hi(first.box) + gap;
  let out = doc;
  for (const item of items.slice(1, -1)) {
    const d = cursor - lo(item.box);
    out = transformSelection(out, [item.id], axis === "x" ? translate(d, 0) : translate(0, d));
    cursor += hi(item.box) - lo(item.box) + gap;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Merge / split                                                        */
/* ------------------------------------------------------------------ */

function ringOf(poly: Polygon): Feature<GjPolygon> {
  return turfPolygon([[...poly, poly[0]]]);
}

/** Union of touching/overlapping polygons. Null when they do not form a single polygon. */
export function mergePolygons(polys: Polygon[]): Polygon | null {
  if (polys.length < 2) return polys[0] ?? null;
  let merged: Feature<GjPolygon | MultiPolygon> = ringOf(polys[0]);
  for (const p of polys.slice(1)) {
    const u = union({ type: "FeatureCollection", features: [merged, ringOf(p)] });
    if (!u || u.geometry.type !== "Polygon") return null;
    merged = u;
  }
  const geom = merged.geometry as GjPolygon;
  if (geom.type !== "Polygon") return null;
  const outer: number[][] = geom.coordinates[0];
  const ring = outer.slice(0, -1).map(([x, y]) => roundPoint([x, y]));
  return dedupeRing(ring);
}

function dedupeRing(ring: Polygon): Polygon {
  const out: Polygon = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-6 || Math.abs(last[1] - p[1]) > 1e-6) out.push(p);
  }
  if (out.length > 1) {
    const [f, l] = [out[0], out[out.length - 1]];
    if (Math.abs(f[0] - l[0]) < 1e-6 && Math.abs(f[1] - l[1]) < 1e-6) out.pop();
  }
  return out;
}

/** Split a polygon along a horizontal (`h`, y = at) or vertical (`v`, x = at) line. Defaults to the middle. */
export function splitPolygon(poly: Polygon, axis: "h" | "v", at?: number): [Polygon, Polygon] | null {
  const bb = bbox(poly);
  const cut = at ?? (axis === "h" ? (bb.minY + bb.maxY) / 2 : (bb.minX + bb.maxX) / 2);
  const pad = 1; // avoid degenerate clips on the outer boundary
  const boxA: [number, number, number, number] = axis === "h" ? [bb.minX - pad, bb.minY - pad, bb.maxX + pad, cut] : [bb.minX - pad, bb.minY - pad, cut, bb.maxY + pad];
  const boxB: [number, number, number, number] = axis === "h" ? [bb.minX - pad, cut, bb.maxX + pad, bb.maxY + pad] : [cut, bb.minY - pad, bb.maxX + pad, bb.maxY + pad];
  const parts: Polygon[] = [];
  for (const box of [boxA, boxB]) {
    const clipped = bboxClip(ringOf(poly), box);
    const g = clipped.geometry;
    const rings: number[][][] = g.type === "Polygon" ? [g.coordinates[0] as number[][]] : (g.coordinates as number[][][][]).map((c) => c[0]);
    const biggest = rings.map((r) => dedupeRing(r.slice(0, -1).map(([x, y]) => roundPoint([x, y])))).filter((r) => r.length >= 3).sort((a, b) => ringArea(b) - ringArea(a))[0];
    if (!biggest || ringArea(biggest) < 1e-6) return null;
    parts.push(biggest);
  }
  return [parts[0], parts[1]];
}

function ringArea(r: Polygon): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/* ------------------------------------------------------------------ */
/* Booth array + numbering                                              */
/* ------------------------------------------------------------------ */

export interface BoothArrayOptions {
  /** Top-left corner of the block. */
  x: number;
  y: number;
  columns: number;
  rows: number;
  boothWidth: number;
  boothDepth: number;
  /** Aisle between columns (0 = booths share side walls). */
  aisleX: number;
  /** Aisle between rows (or between back-to-back pairs). */
  aisleY: number;
  /** Rows come in pairs that share a back wall; the aisle is between pairs. */
  backToBack: boolean;
  numbering: NumberingScheme;
}

export interface NumberingScheme {
  prefix: string;
  start: number;
  step: number;
  /** Zero-pad numbers to this many digits (0 = none). */
  pad: number;
  /** `sequential`: prefix+n across the whole block; `rowLetters`: A1, A2 … B1 … (letter per row); `rowNumbers`: 101, 102 … 201 … */
  mode: "sequential" | "rowLetters" | "rowNumbers";
  /** Alternate direction on every other row (boustrophedon). */
  snake: boolean;
}

export const DEFAULT_NUMBERING: NumberingScheme = { prefix: "", start: 1, step: 1, pad: 0, mode: "sequential", snake: false };

export function rowLetter(i: number): string {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function formatNumber(n: number, pad: number): string {
  return pad > 0 ? String(n).padStart(pad, "0") : String(n);
}

/** Generate a rectangular block of booths. Returns polygons in row-major order with labels. */
export function generateBoothArray(o: BoothArrayOptions): { label: string; polygon: Polygon; row: number; col: number }[] {
  const out: { label: string; polygon: Polygon; row: number; col: number }[] = [];
  const cols = Math.max(1, Math.floor(o.columns)), rows = Math.max(1, Math.floor(o.rows));
  let seq = o.numbering.start;
  for (let r = 0; r < rows; r++) {
    let y: number;
    if (o.backToBack) {
      const pair = Math.floor(r / 2), inPair = r % 2;
      y = o.y + pair * (2 * o.boothDepth + o.aisleY) + inPair * o.boothDepth;
    } else {
      y = o.y + r * (o.boothDepth + o.aisleY);
    }
    const reverse = o.numbering.snake && r % 2 === 1;
    for (let ci = 0; ci < cols; ci++) {
      const c = reverse ? cols - 1 - ci : ci;
      const x = o.x + c * (o.boothWidth + o.aisleX);
      const corners: Polygon = [[x, y], [x + o.boothWidth, y], [x + o.boothWidth, y + o.boothDepth], [x, y + o.boothDepth]];
      const polygon: Polygon = corners.map((p) => roundPoint(p));
      let label: string;
      const n = o.numbering;
      if (n.mode === "rowLetters") label = `${n.prefix}${rowLetter(r)}${formatNumber(n.start + ci * n.step, n.pad)}`;
      else if (n.mode === "rowNumbers") label = `${n.prefix}${(r + 1) * 100 + n.start - 1 + ci * n.step}`;
      else { label = `${n.prefix}${formatNumber(seq, n.pad)}`; seq += n.step; }
      out.push({ label, polygon, row: r, col: c });
    }
  }
  return out;
}

export interface RenumberOptions {
  prefix: string;
  start: number;
  step: number;
  pad: number;
  suffix: string;
  /** Visit order: reading order (rows top→bottom, then left→right), columns, or the current selection order. */
  order: "rows" | "columns" | "selection";
  /** Row grouping tolerance in metres when ordering by rows/columns. */
  tolerance: number;
}

export const DEFAULT_RENUMBER: RenumberOptions = { prefix: "", start: 1, step: 1, pad: 0, suffix: "", order: "rows", tolerance: 1.5 };

/** New labels for the given booths (by id) following `opts`. */
export function renumberLabels(doc: EditorDocument, ids: string[], opts: RenumberOptions): Record<string, string> {
  const booths = ids.map((id) => doc.booths.find((b) => b.id === id)).filter((b): b is NonNullable<typeof b> => !!b);
  const withCenter = booths.map((b) => { const bb = bbox(b.polygon); return { b, cx: (bb.minX + bb.maxX) / 2, cy: (bb.minY + bb.maxY) / 2 }; });
  if (opts.order !== "selection") {
    const primary = opts.order === "rows" ? "cy" : "cx", secondary = opts.order === "rows" ? "cx" : "cy";
    withCenter.sort((a, b) => {
      const d = a[primary] - b[primary];
      if (Math.abs(d) > opts.tolerance) return d;
      return a[secondary] - b[secondary];
    });
  }
  const out: Record<string, string> = {};
  withCenter.forEach(({ b }, i) => { out[b.id] = `${opts.prefix}${formatNumber(opts.start + i * opts.step, opts.pad)}${opts.suffix}`; });
  return out;
}

/** Make `label` unique among `taken`: B12 → B12-2, B12-3 … */
export function uniqueLabel(label: string, taken: Set<string>): string {
  if (!taken.has(label)) return label;
  const m = /^(.*?)(\d+)$/.exec(label);
  if (m) {
    let n = Number(m[2]) + 1;
    const width = m[2].length;
    while (taken.has(`${m[1]}${String(n).padStart(width, "0")}`)) n++;
    return `${m[1]}${String(n).padStart(width, "0")}`;
  }
  let i = 2;
  while (taken.has(`${label}-${i}`)) i++;
  return `${label}-${i}`;
}

/** Next free label in the style of the existing ones (B12 → B13); falls back to `B1`. */
export function nextBoothLabel(labels: Iterable<string>, prefixHint = "B"): string {
  const taken = new Set(labels);
  let best: { prefix: string; n: number; width: number } | null = null;
  for (const l of taken) {
    const m = /^([A-Za-z-]*)(\d+)$/.exec(l);
    if (!m) continue;
    const n = Number(m[2]);
    if (!best || n > best.n) best = { prefix: m[1], n, width: m[2].length };
  }
  if (!best) return uniqueLabel(`${prefixHint}1`, taken);
  return uniqueLabel(`${best.prefix}${String(best.n + 1).padStart(best.width, "0")}`, taken);
}
