/**
 * Snapping: to the grid and to nearby booth/element edges and vertices, with alignment guides.
 * All distances are in plan metres; the caller converts its pixel tolerance with `px / scale`.
 */
import type { Point } from "@/lib/domain/types";
import type { BBox } from "@/lib/domain/geometry";
import type { EditorDocument } from "./types";
import { geometryPoints } from "./geometry-ops";

export interface SnapTargets {
  /** Sorted unique x coordinates of vertices (edges of axis-aligned shapes). */
  xs: number[];
  /** Sorted unique y coordinates. */
  ys: number[];
  vertices: Point[];
}

export interface SnapGuide { axis: "x" | "y"; value: number }

export interface SnapOptions {
  grid: boolean;
  gridSize: number;
  /** Snap to other objects' edges/vertices. */
  objects: boolean;
  tolerance: number;
}

export const DEFAULT_SNAP: SnapOptions = { grid: true, gridSize: 0.5, objects: true, tolerance: 0.4 };

function uniqSorted(values: number[]): number[] {
  const out: number[] = [];
  for (const v of values.sort((a, b) => a - b)) if (!out.length || Math.abs(out[out.length - 1] - v) > 1e-6) out.push(v);
  return out;
}

/** Collect snap targets on a level, excluding the objects being moved. */
export function buildSnapTargets(doc: EditorDocument, levelId: string, exclude: Iterable<string> = []): SnapTargets {
  const ex = new Set(exclude);
  const xs: number[] = [], ys: number[] = [], vertices: Point[] = [];
  const add = (pts: Point[]) => { for (const p of pts) { xs.push(p[0]); ys.push(p[1]); vertices.push(p); } };
  for (const b of doc.booths) if (b.levelId === levelId && !ex.has(b.id)) add(b.polygon);
  for (const e of doc.elements) if (e.levelId === levelId && !ex.has(e.id) && e.kind !== "text") add(geometryPoints(e.geometry));
  return { xs: uniqSorted(xs), ys: uniqSorted(ys), vertices };
}

/** Nearest value in a sorted array within `tol`, or null. */
export function nearestValue(sorted: number[], v: number, tol: number): number | null {
  let lo = 0, hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < v) lo = mid + 1; else hi = mid;
  }
  let best: number | null = null, bestD = tol;
  for (const i of [lo - 1, lo, lo + 1]) {
    if (i < 0 || i >= sorted.length) continue;
    const d = Math.abs(sorted[i] - v);
    if (d <= bestD) { bestD = d; best = sorted[i]; }
  }
  return best;
}

export function snapToGrid(p: Point, size: number): Point {
  if (!size || size <= 0) return p;
  return [Math.round(p[0] / size) * size, Math.round(p[1] / size) * size];
}

export interface SnapResult { point: Point; guides: SnapGuide[] }

/** Snap a single point: nearby vertex first, then edges (x/y independently), then grid. */
export function snapPoint(p: Point, targets: SnapTargets | null, opts: SnapOptions): SnapResult {
  const guides: SnapGuide[] = [];
  let [x, y] = p;
  let sx = false, sy = false;
  if (opts.objects && targets) {
    let bestV: Point | null = null, bestD = opts.tolerance;
    for (const v of targets.vertices) {
      const d = Math.hypot(v[0] - p[0], v[1] - p[1]);
      if (d <= bestD) { bestD = d; bestV = v; }
    }
    if (bestV) {
      x = bestV[0]; y = bestV[1]; sx = sy = true;
      guides.push({ axis: "x", value: x }, { axis: "y", value: y });
    } else {
      const nx = nearestValue(targets.xs, p[0], opts.tolerance);
      const ny = nearestValue(targets.ys, p[1], opts.tolerance);
      if (nx !== null) { x = nx; sx = true; guides.push({ axis: "x", value: nx }); }
      if (ny !== null) { y = ny; sy = true; guides.push({ axis: "y", value: ny }); }
    }
  }
  if (opts.grid) {
    const g = snapToGrid([x, y], opts.gridSize);
    if (!sx) x = g[0];
    if (!sy) y = g[1];
  }
  return { point: [round3(x), round3(y)], guides };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000 + 0;

/**
 * Snap a translation of a bounding box: the moved box's edges and centre lines are matched
 * against target edges; falls back to snapping the box origin to the grid.
 */
export function snapDelta(box: BBox, dx: number, dy: number, targets: SnapTargets | null, opts: SnapOptions): { dx: number; dy: number; guides: SnapGuide[] } {
  const guides: SnapGuide[] = [];
  let outDx = dx, outDy = dy;
  let sx = false, sy = false;
  if (opts.objects && targets) {
    const candX = [box.minX + dx, box.maxX + dx, (box.minX + box.maxX) / 2 + dx];
    const candY = [box.minY + dy, box.maxY + dy, (box.minY + box.maxY) / 2 + dy];
    let bx: { corr: number; value: number } | null = null;
    for (const c of candX) {
      const n = nearestValue(targets.xs, c, opts.tolerance);
      if (n !== null && (!bx || Math.abs(n - c) < Math.abs(bx.corr))) bx = { corr: n - c, value: n };
    }
    let by: { corr: number; value: number } | null = null;
    for (const c of candY) {
      const n = nearestValue(targets.ys, c, opts.tolerance);
      if (n !== null && (!by || Math.abs(n - c) < Math.abs(by.corr))) by = { corr: n - c, value: n };
    }
    if (bx) { outDx = dx + bx.corr; sx = true; guides.push({ axis: "x", value: bx.value }); }
    if (by) { outDy = dy + by.corr; sy = true; guides.push({ axis: "y", value: by.value }); }
  }
  if (opts.grid) {
    const g = snapToGrid([box.minX + dx, box.minY + dy], opts.gridSize);
    if (!sx) outDx = g[0] - box.minX;
    if (!sy) outDy = g[1] - box.minY;
  }
  return { dx: round3(outDx), dy: round3(outDy), guides };
}
