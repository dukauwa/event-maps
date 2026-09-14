/**
 * Automatic wayfinding network generation from level geometry.
 *
 * The level is rasterised into square cells; cells inside (inflated) booths or blocking elements
 * are marked as obstacles. An 8-connected grid graph is built over the free cells (no corner
 * cutting past obstacles), then simplified: collinear degree-2 nodes are merged away and tiny
 * disconnected islands are dropped. Node ids are deterministic (`auto_{levelId}_{ix}_{iy}`), so
 * regenerating a level yields stable ids for unchanged cells.
 */

import type { BundleBooth, BundleElement, BundleLevel, BundleWayEdge, BundleWayNode, Point, Polygon } from "@/lib/domain/types";
import { bbox, closestPointOnSegment, pointInPolygon, round } from "@/lib/domain/geometry";

export interface AutoGraphBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface AutoGraphOptions {
  /** Grid cell size in meters (default 1). */
  cellSize?: number;
  /** Extra distance kept from booths / walls in meters (default 0.6). */
  clearance?: number;
  /** Area to rasterise. Default: the level's size, or the booths' bbox padded by 6 m. */
  bounds?: AutoGraphBounds;
  /** Connected components with fewer nodes than this are dropped (default 10). */
  minComponentSize?: number;
  /** Safety limit on the number of grid cells (default 4,000,000). */
  maxCells?: number;
}

export interface AutoGraphStats {
  cols: number;
  rows: number;
  blockedCells: number;
  rawNodes: number;
  rawEdges: number;
  nodes: number;
  edges: number;
}

export interface AutoGraphResult {
  nodes: BundleWayNode[];
  edges: BundleWayEdge[];
  stats: AutoGraphStats;
}

const DEFAULT_CELL_SIZE = 1;
const DEFAULT_CLEARANCE = 0.6;
const DEFAULT_MIN_COMPONENT = 10;
const DEFAULT_MAX_CELLS = 4_000_000;
const DEFAULT_WALL_WIDTH = 0.2;
const BOUNDS_PADDING = 6;

const BLOCKING_KINDS = new Set<BundleElement["kind"]>(["wall", "zone", "shape"]);

/** Does this element block routing? wall/zone/shape block unless `blocksRouting === false`; anything blocks when `=== true`. */
export function elementBlocksRouting(el: BundleElement): boolean {
  const flag = el.props?.blocksRouting;
  if (flag === true) return true;
  if (flag === false) return false;
  return BLOCKING_KINDS.has(el.kind);
}

function elementPoints(el: BundleElement): Point[] {
  const g = el.geometry;
  if (!g) return [];
  if (g.type === "point") return [g.point];
  return g.points ?? [];
}

function resolveBounds(level: BundleLevel, booths: BundleBooth[], explicit?: AutoGraphBounds): AutoGraphBounds | null {
  if (explicit && explicit.maxX > explicit.minX && explicit.maxY > explicit.minY) return explicit;
  if (level.widthM > 0 && level.heightM > 0) return { minX: 0, minY: 0, maxX: level.widthM, maxY: level.heightM };
  const pts: Point[] = [];
  for (const b of booths) pts.push(...b.polygon);
  if (pts.length === 0) for (const el of level.elements ?? []) pts.push(...elementPoints(el));
  if (pts.length === 0) return null;
  const bb = bbox(pts);
  return { minX: bb.minX - BOUNDS_PADDING, minY: bb.minY - BOUNDS_PADDING, maxX: bb.maxX + BOUNDS_PADDING, maxY: bb.maxY + BOUNDS_PADDING };
}

/** Occupancy grid with helpers to rasterise obstacles. */
class Grid {
  readonly blocked: Uint8Array;
  constructor(
    readonly minX: number,
    readonly minY: number,
    readonly cols: number,
    readonly rows: number,
    readonly cellSize: number,
  ) {
    this.blocked = new Uint8Array(cols * rows);
  }

  centerX(ix: number): number {
    return this.minX + (ix + 0.5) * this.cellSize;
  }

  centerY(iy: number): number {
    return this.minY + (iy + 0.5) * this.cellSize;
  }

  private cellRange(minX: number, minY: number, maxX: number, maxY: number): [number, number, number, number] | null {
    const ix0 = Math.max(0, Math.floor((minX - this.minX) / this.cellSize));
    const ix1 = Math.min(this.cols - 1, Math.floor((maxX - this.minX) / this.cellSize));
    const iy0 = Math.max(0, Math.floor((minY - this.minY) / this.cellSize));
    const iy1 = Math.min(this.rows - 1, Math.floor((maxY - this.minY) / this.cellSize));
    if (ix0 > ix1 || iy0 > iy1) return null;
    return [ix0, iy0, ix1, iy1];
  }

  /** Block cells whose centre is inside the polygon or within `r` of its boundary. */
  blockPolygon(poly: Polygon, r: number): void {
    if (poly.length < 3) {
      this.blockPolyline(poly, r);
      return;
    }
    const bb = bbox(poly);
    const range = this.cellRange(bb.minX - r, bb.minY - r, bb.maxX + r, bb.maxY + r);
    if (!range) return;
    const [ix0, iy0, ix1, iy1] = range;
    const n = poly.length;
    for (let iy = iy0; iy <= iy1; iy++) {
      const cy = this.centerY(iy);
      for (let ix = ix0; ix <= ix1; ix++) {
        const idx = iy * this.cols + ix;
        if (this.blocked[idx]) continue;
        const c: Point = [this.centerX(ix), cy];
        if (pointInPolygon(c, poly)) {
          this.blocked[idx] = 1;
          continue;
        }
        if (r <= 0) continue;
        for (let i = 0; i < n; i++) {
          if (closestPointOnSegment(c, poly[i], poly[(i + 1) % n]).dist <= r) {
            this.blocked[idx] = 1;
            break;
          }
        }
      }
    }
  }

  /** Block cells whose centre is within `r` of any segment of the polyline. */
  blockPolyline(points: Point[], r: number): void {
    if (points.length === 1) {
      this.blockDisc(points[0], r);
      return;
    }
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const range = this.cellRange(Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r);
      if (!range) continue;
      const [ix0, iy0, ix1, iy1] = range;
      for (let iy = iy0; iy <= iy1; iy++) {
        const cy = this.centerY(iy);
        for (let ix = ix0; ix <= ix1; ix++) {
          const idx = iy * this.cols + ix;
          if (this.blocked[idx]) continue;
          if (closestPointOnSegment([this.centerX(ix), cy], a, b).dist <= r) this.blocked[idx] = 1;
        }
      }
    }
  }

  blockDisc(c: Point, r: number): void {
    const range = this.cellRange(c[0] - r, c[1] - r, c[0] + r, c[1] + r);
    if (!range) return;
    const [ix0, iy0, ix1, iy1] = range;
    for (let iy = iy0; iy <= iy1; iy++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        if (Math.hypot(this.centerX(ix) - c[0], this.centerY(iy) - c[1]) <= r) this.blocked[iy * this.cols + ix] = 1;
      }
    }
  }

  isFree(ix: number, iy: number): boolean {
    return ix >= 0 && iy >= 0 && ix < this.cols && iy < this.rows && this.blocked[iy * this.cols + ix] === 0;
  }
}

function rasterise(level: BundleLevel, booths: BundleBooth[], grid: Grid, clearance: number): void {
  for (const b of booths) grid.blockPolygon(b.polygon, clearance);
  for (const el of level.elements ?? []) {
    if (!elementBlocksRouting(el)) continue;
    const g = el.geometry;
    if (!g) continue;
    const strokeWidth = typeof el.props?.strokeWidth === "number" && el.props.strokeWidth > 0 ? el.props.strokeWidth : DEFAULT_WALL_WIDTH;
    if (g.type === "polygon") grid.blockPolygon(g.points, clearance);
    else if (g.type === "polyline") grid.blockPolyline(g.points, strokeWidth / 2 + clearance);
    else if (g.type === "point") grid.blockDisc(g.point, strokeWidth / 2 + clearance);
  }
}

/** Is n strictly between u and w on a straight line? */
function isCollinearThrough(ux: number, uy: number, nx: number, ny: number, wx: number, wy: number): boolean {
  const d1x = nx - ux, d1y = ny - uy;
  const d2x = wx - nx, d2y = wy - ny;
  const cross = d1x * d2y - d1y * d2x;
  const dot = d1x * d2x + d1y * d2y;
  return dot > 0 && Math.abs(cross) <= 1e-9 * Math.max(1, Math.abs(dot));
}

function replaceNeighbour(list: number[], oldN: number, newN: number): void {
  const i = list.indexOf(oldN);
  if (i < 0) return;
  if (list.includes(newN)) list.splice(i, 1);
  else list[i] = newN;
}

// Forward directions so each undirected edge is created exactly once: E, S, SE, SW.
const FORWARD: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [-1, 1],
];

export function generateWayfindingGraph(level: BundleLevel, booths: BundleBooth[], opts: AutoGraphOptions = {}): AutoGraphResult {
  const cellSize = opts.cellSize !== undefined && opts.cellSize > 0 ? opts.cellSize : DEFAULT_CELL_SIZE;
  const clearance = opts.clearance !== undefined && opts.clearance >= 0 ? opts.clearance : DEFAULT_CLEARANCE;
  const minComponent = opts.minComponentSize ?? DEFAULT_MIN_COMPONENT;
  const maxCells = opts.maxCells ?? DEFAULT_MAX_CELLS;

  const levelBooths = booths.filter((b) => b.levelId === level.id && Array.isArray(b.polygon) && b.polygon.length >= 3);
  const empty: AutoGraphResult = {
    nodes: [],
    edges: [],
    stats: { cols: 0, rows: 0, blockedCells: 0, rawNodes: 0, rawEdges: 0, nodes: 0, edges: 0 },
  };
  const bounds = resolveBounds(level, levelBooths, opts.bounds);
  if (!bounds) return empty;

  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cellSize - 1e-9));
  const rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / cellSize - 1e-9));
  if (cols * rows > maxCells) {
    throw new Error(`generateWayfindingGraph: grid of ${cols}x${rows} cells exceeds the limit of ${maxCells}; increase cellSize`);
  }
  const grid = new Grid(bounds.minX, bounds.minY, cols, rows, cellSize);
  rasterise(level, levelBooths, grid, clearance);

  // Nodes over free cells (row-major so ids/indices are deterministic).
  const nodeAt = new Int32Array(cols * rows).fill(-1);
  const nodeIx: number[] = [];
  const nodeIy: number[] = [];
  let blockedCells = 0;
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const idx = iy * cols + ix;
      if (grid.blocked[idx]) {
        blockedCells++;
        continue;
      }
      nodeAt[idx] = nodeIx.length;
      nodeIx.push(ix);
      nodeIy.push(iy);
    }
  }
  const rawNodes = nodeIx.length;

  // 8-connected adjacency without corner cutting.
  const adj: number[][] = new Array(rawNodes);
  for (let n = 0; n < rawNodes; n++) adj[n] = [];
  let rawEdges = 0;
  for (let n = 0; n < rawNodes; n++) {
    const ix = nodeIx[n];
    const iy = nodeIy[n];
    for (const [dx, dy] of FORWARD) {
      const jx = ix + dx;
      const jy = iy + dy;
      if (!grid.isFree(jx, jy)) continue;
      if (dx !== 0 && dy !== 0 && (!grid.isFree(ix + dx, iy) || !grid.isFree(ix, iy + dy))) continue;
      const m = nodeAt[jy * cols + jx];
      adj[n].push(m);
      adj[m].push(n);
      rawEdges++;
    }
  }

  // Simplify: merge away degree-2 nodes lying on a straight line between their neighbours.
  const removed = new Uint8Array(rawNodes);
  for (let n = 0; n < rawNodes; n++) {
    const nb = adj[n];
    if (nb.length !== 2) continue;
    const u = nb[0];
    const w = nb[1];
    if (!isCollinearThrough(nodeIx[u], nodeIy[u], nodeIx[n], nodeIy[n], nodeIx[w], nodeIy[w])) continue;
    removed[n] = 1;
    adj[n] = [];
    replaceNeighbour(adj[u], n, w);
    replaceNeighbour(adj[w], n, u);
  }

  // Drop small islands.
  const component = new Int32Array(rawNodes).fill(-1);
  const keep = new Uint8Array(rawNodes);
  const stack: number[] = [];
  let compId = 0;
  for (let s = 0; s < rawNodes; s++) {
    if (removed[s] || component[s] >= 0) continue;
    const members: number[] = [];
    component[s] = compId;
    stack.push(s);
    while (stack.length > 0) {
      const n = stack.pop() as number;
      members.push(n);
      for (const m of adj[n]) {
        if (component[m] >= 0) continue;
        component[m] = compId;
        stack.push(m);
      }
    }
    if (members.length >= minComponent) for (const n of members) keep[n] = 1;
    compId++;
  }

  const nodeId = (n: number): string => `auto_${level.id}_${nodeIx[n]}_${nodeIy[n]}`;
  const nodes: BundleWayNode[] = [];
  const edges: BundleWayEdge[] = [];
  for (let n = 0; n < rawNodes; n++) {
    if (!keep[n]) continue;
    nodes.push({ id: nodeId(n), levelId: level.id, x: round(grid.centerX(nodeIx[n]), 3), y: round(grid.centerY(nodeIy[n]), 3) });
    for (const m of adj[n]) {
      if (m <= n || !keep[m]) continue;
      edges.push({
        id: `autoe_${level.id}_${nodeIx[n]}_${nodeIy[n]}_${nodeIx[m]}_${nodeIy[m]}`,
        from: nodeId(n),
        to: nodeId(m),
        accessible: true,
        oneWay: false,
        virtual: false,
        weight: 1,
      });
    }
  }

  return {
    nodes,
    edges,
    stats: { cols, rows, blockedCells, rawNodes, rawEdges, nodes: nodes.length, edges: edges.length },
  };
}
