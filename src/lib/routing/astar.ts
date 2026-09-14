/**
 * A* shortest path over a {@link RoutingGraph} (plus an optional per-query {@link GraphOverlay}).
 *
 * Heuristic: Euclidean distance to the goal while on the goal's level, 0 on any other level.
 * That heuristic is admissible but not necessarily consistent across level changes, so nodes are
 * allowed to be re-expanded when a cheaper path to them is discovered (lazy deletion + reopen).
 */

import type { GraphOverlay, RoutingGraph } from "./graph";
import { getNode } from "./graph";

export interface AStarOptions {
  /** Exclude edges and transitions flagged as not accessible. */
  accessible?: boolean;
}

export interface AStarResult {
  /** Node indices from start to goal inclusive. */
  nodes: number[];
  /** Edge indices; edges[i] connects nodes[i] -> nodes[i + 1]. */
  edges: number[];
  /** Total cost in meter equivalents. */
  cost: number;
  /** Number of node expansions (diagnostics). */
  expanded: number;
}

/** Binary min-heap keyed by a float, holding int payloads. Backed by growable typed arrays. */
export class MinHeap {
  private keys: Float64Array;
  private vals: Int32Array;
  size = 0;

  constructor(capacity = 1024) {
    this.keys = new Float64Array(capacity);
    this.vals = new Int32Array(capacity);
  }

  push(key: number, val: number): void {
    if (this.size === this.keys.length) this.grow();
    let i = this.size++;
    const keys = this.keys;
    const vals = this.vals;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent];
      vals[i] = vals[parent];
      i = parent;
    }
    keys[i] = key;
    vals[i] = val;
  }

  peekKey(): number {
    return this.keys[0];
  }

  /** Remove and return the payload with the smallest key. Caller must check `size > 0`. */
  pop(): number {
    const keys = this.keys;
    const vals = this.vals;
    const top = vals[0];
    const n = --this.size;
    if (n > 0) {
      const key = keys[n];
      const val = vals[n];
      let i = 0;
      const half = n >> 1;
      while (i < half) {
        let child = 2 * i + 1;
        if (child + 1 < n && keys[child + 1] < keys[child]) child++;
        if (keys[child] >= key) break;
        keys[i] = keys[child];
        vals[i] = vals[child];
        i = child;
      }
      keys[i] = key;
      vals[i] = val;
    }
    return top;
  }

  private grow(): void {
    const keys = new Float64Array(this.keys.length * 2);
    const vals = new Int32Array(this.vals.length * 2);
    keys.set(this.keys);
    vals.set(this.vals);
    this.keys = keys;
    this.vals = vals;
  }
}

export function astar(
  graph: RoutingGraph,
  start: number,
  goal: number,
  opts: AStarOptions = {},
  overlay?: GraphOverlay,
): AStarResult | null {
  const baseN = graph.nodes.length;
  const baseE = graph.edges.length;
  const N = baseN + (overlay?.nodes.length ?? 0);
  if (start < 0 || start >= N || goal < 0 || goal >= N) return null;
  if (start === goal) return { nodes: [start], edges: [], cost: 0, expanded: 0 };

  const accessibleOnly = opts.accessible === true;
  const { nodeLevel, nodeX, nodeY, outStart, outEdges, edgeTo, edgeCost, edgeAccessible } = graph;
  const overlayNodes = overlay?.nodes;
  const overlayEdges = overlay?.edges;
  const overlayOut = overlay?.outgoing;

  const goalNode = getNode(graph, overlay, goal);
  const gx = goalNode.x;
  const gy = goalNode.y;
  const goalLevel = graph.levelIndexById.get(goalNode.levelId) ?? -2;
  const goalLevelId = goalNode.levelId;
  const hScale = Math.min(1, graph.minWeight);

  const heuristic = (n: number): number => {
    if (n < baseN) {
      if (nodeLevel[n] !== goalLevel) return 0;
      const dx = nodeX[n] - gx;
      const dy = nodeY[n] - gy;
      return Math.sqrt(dx * dx + dy * dy) * hScale;
    }
    const on = overlayNodes![n - baseN];
    if (on.levelId !== goalLevelId) return 0;
    const dx = on.x - gx;
    const dy = on.y - gy;
    return Math.sqrt(dx * dx + dy * dy) * hScale;
  };

  const g = new Float64Array(N).fill(Infinity);
  const expandedAt = new Float64Array(N).fill(Infinity);
  const cameFrom = new Int32Array(N).fill(-1);
  const heap = new MinHeap(Math.min(1 << 16, Math.max(64, N)));

  g[start] = 0;
  heap.push(heuristic(start), start);
  let expanded = 0;

  while (heap.size > 0) {
    const u = heap.pop();
    if (u === goal) break;
    const gu = g[u];
    // Skip stale entries (already expanded with this g); re-expand if g improved since.
    if (gu >= expandedAt[u]) continue;
    expandedAt[u] = gu;
    expanded++;

    if (u < baseN) {
      const end = outStart[u + 1];
      for (let k = outStart[u]; k < end; k++) {
        const e = outEdges[k];
        if (accessibleOnly && edgeAccessible[e] === 0) continue;
        const v = edgeTo[e];
        const ng = gu + edgeCost[e];
        if (ng < g[v]) {
          g[v] = ng;
          cameFrom[v] = e;
          heap.push(ng + heuristic(v), v);
        }
      }
    }
    const extra = overlayOut?.get(u);
    if (extra && overlayEdges) {
      for (const e of extra) {
        const oe = overlayEdges[e - baseE];
        if (accessibleOnly && !oe.accessible) continue;
        const v = oe.to;
        const ng = gu + oe.cost;
        if (ng < g[v]) {
          g[v] = ng;
          cameFrom[v] = e;
          heap.push(ng + heuristic(v), v);
        }
      }
    }
  }

  if (!Number.isFinite(g[goal])) return null;

  const nodes: number[] = [];
  const edges: number[] = [];
  let cur = goal;
  let guard = 0;
  while (cur !== start) {
    const e = cameFrom[cur];
    if (e < 0 || ++guard > N + 1) return null;
    nodes.push(cur);
    edges.push(e);
    cur = e < baseE ? graph.edgeFrom[e] : overlayEdges![e - baseE].from;
  }
  nodes.push(start);
  nodes.reverse();
  edges.reverse();
  return { nodes, edges, cost: g[goal], expanded };
}
