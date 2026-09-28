/**
 * Booths from a vector PDF: floor plans exported from CAD, ExpoFP or an organiser's designer draw every stand as a
 * closed path with its number printed inside. Reading those paths gives exact shapes (not the bounding boxes the raster
 * detector can offer) and works on top of a busy background image, where flood-filling pixels does not.
 *
 * Pure functions: `extractPathShapes` walks a pdf.js operator list (the caller passes pdf.js's `OPS` table), and
 * `boothsFromShapes` pairs shapes with text runs. Everything is in canvas pixel space (y down).
 */
import type { Point } from "@/lib/domain/types";
import type { DraftBooth, TextItem } from "./raster-booths";

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
function apply(m: Matrix, x: number, y: number): Point {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** The subset of pdf.js `OPS` codes this reader understands. */
export interface PdfOps { save: number; restore: number; transform: number; constructPath: number; paintFormXObjectBegin: number; paintFormXObjectEnd: number; endPath: number }

/** pdf.js 6 path encoding inside `constructPath`: a flat Float32Array of these opcodes followed by their coordinates. */
const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;

export interface PathShape { points: Point[]; closed: boolean }

/** Closed sub-paths of every stroked or filled path, in canvas pixels (`viewport` maps PDF user space to the canvas). */
export function extractPathShapes(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, ops: PdfOps, viewport: Matrix | number[]): PathShape[] {
  const vp = viewport as Matrix;
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  const out: PathShape[] = [];
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[] | null;
    if (fn === ops.save) stack.push(ctm);
    else if (fn === ops.restore) ctm = stack.pop() ?? IDENTITY;
    else if (fn === ops.transform && args) ctm = multiply(ctm, args.slice(0, 6) as Matrix);
    else if (fn === ops.paintFormXObjectBegin && args) {
      stack.push(ctm);
      const m = args[0] as number[] | null;
      if (m && m.length === 6) ctm = multiply(ctm, m as Matrix);
    } else if (fn === ops.paintFormXObjectEnd) ctm = stack.pop() ?? IDENTITY;
    else if (fn === ops.constructPath && args) {
      const paint = args[0] as number;
      if (paint === ops.endPath) continue; // clipping path only, never drawn
      const data = (args[1] as ArrayLike<number>[] | undefined)?.[0];
      if (!data || typeof (data as { length?: number }).length !== "number") continue;
      const full = multiply(vp, ctm);
      let cur: Point[] = [];
      let closed = false;
      const flush = () => {
        if (cur.length >= 3) {
          const first = cur[0], last = cur[cur.length - 1];
          const loops = Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.5;
          if (loops) cur.pop();
          if (cur.length >= 3) out.push({ points: cur, closed: closed || loops });
        }
        cur = []; closed = false;
      };
      for (let k = 0; k < data.length;) {
        const op = data[k];
        if (op === DRAW.moveTo) { flush(); cur.push(apply(full, data[k + 1], data[k + 2])); k += 3; }
        else if (op === DRAW.lineTo) { cur.push(apply(full, data[k + 1], data[k + 2])); k += 3; }
        else if (op === DRAW.curveTo) { cur.push(apply(full, data[k + 5], data[k + 6])); k += 7; }
        else if (op === DRAW.quadraticCurveTo) { cur.push(apply(full, data[k + 3], data[k + 4])); k += 5; }
        else if (op === DRAW.closePath) { closed = true; k += 1; flush(); }
        else break; // unknown encoding: stop reading this path rather than misread coordinates
      }
      flush();
    }
  }
  return out;
}

export function polygonAreaPx(p: Point[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
  return Math.abs(a / 2);
}

function pointInPolygon(x: number, y: number, p: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Stand numbers: A12, N2141, C-12, 1405, GL1 — optionally followed by a colon when the number names a space ("N141: Main Stage"). */
const LABEL = /^([A-Z]{0,3}[-.]?\d{1,5}[A-Z]?)(:?)$/i;
/** Text that is not a name: dimensions, areas, lone numbers. */
const NOT_A_NAME = /^(\d+(\.\d+)?\s*['’′]?\s*[x×]\s*\d+(\.\d+)?\s*['’′]?|\d+(\.\d+)?\s*(m²|m2|sq\.?\s*(ft|m)|ft|m)|[\d\s.,'’]+)$/i;

export interface VectorBoothOptions {
  /** Ignore shapes smaller than this (pixels²). Default 16. */
  minAreaPx?: number;
  /** Ignore shapes covering more than this fraction of the page (hall outlines, frames). Default 0.25. */
  maxAreaFraction?: number;
  pageArea?: number;
}

export interface VectorBoothResult { booths: DraftBooth[]; shapes: number; labelled: number }

/**
 * A shape becomes a booth when it is the smallest closed shape around a stand number. Other text inside that booth
 * becomes its name (exhibitor, or the space's name when the number ends with a colon).
 */
export function boothsFromShapes(shapes: PathShape[], texts: TextItem[], opts: VectorBoothOptions = {}): VectorBoothResult {
  const minArea = opts.minAreaPx ?? 16;
  const maxArea = opts.pageArea ? opts.pageArea * (opts.maxAreaFraction ?? 0.25) : Number.POSITIVE_INFINITY;
  const candidates = shapes
    .map((s) => ({ ...s, area: polygonAreaPx(s.points) }))
    .filter((s) => s.area >= minArea && s.area <= maxArea)
    // De-duplicate shapes drawn twice (fill + stroke passes, or stacked layers).
    .filter((s, i, all) => all.findIndex((o) => Math.abs(o.area - s.area) < 1 && Math.abs(o.points[0][0] - s.points[0][0]) < 0.5 && Math.abs(o.points[0][1] - s.points[0][1]) < 0.5) === i);
  const smallestAround = (t: TextItem) => {
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    let best = -1;
    for (let i = 0; i < candidates.length; i++) if (pointInPolygon(cx, cy, candidates[i].points) && (best < 0 || candidates[i].area < candidates[best].area)) best = i;
    return best;
  };
  const reading = [...texts].sort((a, b) => a.y - b.y || a.x - b.x);
  const label = new Map<number, { text: string; space: boolean }>();
  const labelTexts = new Set<TextItem>();
  for (const t of reading) {
    const m = LABEL.exec(t.text.trim());
    if (!m) continue;
    const i = smallestAround(t);
    if (i < 0 || label.has(i)) continue;
    label.set(i, { text: m[1].toUpperCase(), space: m[2] === ":" });
    labelTexts.add(t);
  }
  const names = new Map<number, string[]>();
  for (const t of reading) {
    if (labelTexts.has(t)) continue;
    const s = t.text.trim();
    if (!s || NOT_A_NAME.test(s)) continue;
    const i = smallestAround(t);
    if (i < 0 || !label.has(i)) continue;
    names.set(i, [...(names.get(i) ?? []), s]);
  }
  const used = new Map<string, number>();
  const booths: DraftBooth[] = [];
  for (const [i, l] of label) {
    const pts = candidates[i].points;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    const n = used.get(l.text) ?? 0;
    used.set(l.text, n + 1);
    const name = (names.get(i) ?? []).join(" ").replace(/\s*-\s+/g, "-").replace(/\s+/g, " ").trim();
    booths.push({
      label: n === 0 ? l.text : `${l.text}-${n + 1}`,
      rect: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y },
      polygon: pts,
      labelSource: "text",
      ...(name ? { name, nameKind: l.space ? "space" as const : "exhibitor" as const } : l.space ? { nameKind: "space" as const } : {}),
    });
  }
  booths.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  return { booths, shapes: candidates.length, labelled: label.size };
}
