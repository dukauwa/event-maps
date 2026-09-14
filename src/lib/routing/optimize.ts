/**
 * Multi-stop route optimisation ("visit these booths in the best order").
 *
 * Pairwise legs are computed with {@link findRoute} (cached per endpoint pair), then the visiting
 * order is built with nearest-neighbour and improved with 2-opt and or-opt local search. Costs are
 * durations (seconds), so level transitions and edge weights are taken into account. Up to 25
 * stops are supported (26 x 25 = 650 leg computations worst case).
 */

import type { PlanBundle, RouteEndpoint, RouteError, RouteResult } from "@/lib/domain/types";
import { round } from "@/lib/domain/geometry";
import type { RoutingGraph } from "./graph";
import { endpointKey, findRoute } from "./route";

export const MAX_OPTIMIZE_STOPS = 25;

export interface OptimizeOptions {
  accessible?: boolean;
  /** Add a final leg from the last stop back to the start. */
  returnToStart?: boolean;
  /** Maximum local-search passes (default 200). */
  maxPasses?: number;
}

export interface OptimizedRoute {
  /** The stops in visiting order (the start is not included). */
  order: RouteEndpoint[];
  /** legs[i] goes from the previous point (start for i = 0) to order[i]; one extra leg when returning to start. */
  legs: RouteResult[];
  distanceM: number;
  durationSeconds: number;
}

type LegCache = Map<string, RouteResult | RouteError>;

function leg(
  cache: LegCache,
  bundle: PlanBundle,
  graph: RoutingGraph,
  points: RouteEndpoint[],
  i: number,
  j: number,
  accessible: boolean,
): RouteResult | RouteError {
  const key = `${endpointKey(points[i])}=>${endpointKey(points[j])}`;
  let r = cache.get(key);
  if (!r) {
    r = findRoute(bundle, graph, points[i], points[j], { accessible });
    cache.set(key, r);
  }
  return r;
}

function pathCost(cost: number[][], seq: number[], closed: boolean): number {
  let total = 0;
  for (let i = 1; i < seq.length; i++) total += cost[seq[i - 1]][seq[i]];
  if (closed && seq.length > 1) total += cost[seq[seq.length - 1]][seq[0]];
  return total;
}

/** Nearest-neighbour construction from index 0. */
function nearestNeighbour(cost: number[][], n: number): number[] {
  const seq = [0];
  const visited = new Uint8Array(n);
  visited[0] = 1;
  for (let step = 1; step < n; step++) {
    const last = seq[seq.length - 1];
    let best = -1;
    let bestCost = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      const c = cost[last][j];
      if (c < bestCost) {
        bestCost = c;
        best = j;
      }
    }
    if (best < 0) {
      // Everything left is unreachable; append in input order so the caller can report it.
      for (let j = 0; j < n; j++) if (!visited[j]) { visited[j] = 1; seq.push(j); }
      break;
    }
    visited[best] = 1;
    seq.push(best);
  }
  return seq;
}

/** 2-opt segment reversal + or-opt segment relocation, keeping index 0 fixed at the front. */
function improve(cost: number[][], seq: number[], closed: boolean, maxPasses: number): number[] {
  const n = seq.length;
  if (n < 3) return seq;
  let best = seq.slice();
  let bestCost = pathCost(cost, best, closed);
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    // 2-opt: reverse best[i..j]
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const cand = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
        const c = pathCost(cost, cand, closed);
        if (c < bestCost - 1e-9) {
          best = cand;
          bestCost = c;
          improved = true;
        }
      }
    }
    // or-opt: move a run of 1..3 stops to another position
    for (let len = 1; len <= 3; len++) {
      for (let i = 1; i + len <= n; i++) {
        const run = best.slice(i, i + len);
        const rest = best.slice(0, i).concat(best.slice(i + len));
        for (let k = 1; k <= rest.length; k++) {
          if (k === i) continue;
          const cand = rest.slice(0, k).concat(run, rest.slice(k));
          const c = pathCost(cost, cand, closed);
          if (c < bestCost - 1e-9) {
            best = cand;
            bestCost = c;
            improved = true;
          }
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

export function optimizeRoute(
  bundle: PlanBundle,
  graph: RoutingGraph,
  start: RouteEndpoint,
  stops: RouteEndpoint[],
  opts: OptimizeOptions = {},
): OptimizedRoute | RouteError {
  const accessible = opts.accessible === true;
  const closed = opts.returnToStart === true;
  if (stops.length === 0) return { order: [], legs: [], distanceM: 0, durationSeconds: 0 };
  if (stops.length > MAX_OPTIMIZE_STOPS) {
    return { ok: false, error: `Too many stops (${stops.length}); the maximum is ${MAX_OPTIMIZE_STOPS}` };
  }

  const points = [start, ...stops];
  const n = points.length;
  const cache: LegCache = new Map();
  const cost: number[][] = [];
  for (let i = 0; i < n; i++) {
    cost.push(new Array<number>(n).fill(0));
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      // Only the legs that can appear in a solution are needed: from the start (row 0) and between
      // stops; legs back to the start only when the tour is closed.
      if (j === 0 && !closed) {
        cost[i][j] = Infinity;
        continue;
      }
      const r = leg(cache, bundle, graph, points, i, j, accessible);
      cost[i][j] = r.ok ? r.durationSeconds : Infinity;
    }
  }

  // A stop that cannot be reached from anywhere (or reach anything) makes the problem infeasible.
  for (let j = 1; j < n; j++) {
    let reachable = false;
    for (let i = 0; i < n; i++) if (i !== j && Number.isFinite(cost[i][j])) { reachable = true; break; }
    if (!reachable) {
      const r = leg(cache, bundle, graph, points, 0, j, accessible);
      return { ok: false, error: r.ok ? `Stop ${j} is unreachable` : `Stop ${j}: ${r.error}` };
    }
  }

  let seq = nearestNeighbour(cost, n);
  seq = improve(cost, seq, closed, opts.maxPasses ?? 200);

  const legs: RouteResult[] = [];
  const order: RouteEndpoint[] = [];
  let distanceM = 0;
  let durationSeconds = 0;
  const pushLeg = (i: number, j: number): RouteError | null => {
    const r = leg(cache, bundle, graph, points, i, j, accessible);
    if (!r.ok) return { ok: false, error: `No route between stops ${i} and ${j}: ${r.error}` };
    legs.push(r);
    distanceM += r.distanceM;
    durationSeconds += r.durationSeconds;
    return null;
  };
  for (let s = 1; s < seq.length; s++) {
    const err = pushLeg(seq[s - 1], seq[s]);
    if (err) return err;
    order.push(points[seq[s]]);
  }
  if (closed) {
    const err = pushLeg(seq[seq.length - 1], seq[0]);
    if (err) return err;
  }
  return { order, legs, distanceM: round(distanceM, 2), durationSeconds: Math.round(durationSeconds) };
}
