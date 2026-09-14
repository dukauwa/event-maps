import type { Point } from "@/lib/domain/types";
import { round } from "@/lib/domain/geometry";

export interface GraphLine {
  points: Point[];
  accessible?: boolean;
  oneWay?: boolean;
  virtual?: boolean;
  weight?: number;
}

export interface SimpleGraph {
  nodes: { key: string; x: number; y: number }[];
  edges: { from: string; to: string; accessible: boolean; oneWay: boolean; virtual: boolean; weight: number }[];
}

interface Seg { a: Point; b: Point; line: GraphLine }

const EPS = 1e-6;

function pointOnSegment(p: Point, a: Point, b: Point): number | null {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const len2 = abx * abx + aby * aby;
  if (len2 < EPS) return null;
  const t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2;
  if (t < -EPS || t > 1 + EPS) return null;
  const px = a[0] + abx * t, py = a[1] + aby * t;
  if (Math.hypot(px - p[0], py - p[1]) > 1e-3) return null;
  return Math.max(0, Math.min(1, t));
}

function crossing(p1: Point, p2: Point, p3: Point, p4: Point): { t: number; point: Point } | null {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-12) return null;
  const u = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const v = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  if (u < -EPS || u > 1 + EPS || v < -EPS || v > 1 + EPS) return null;
  return { t: u, point: [p1[0] + (p2[0] - p1[0]) * u, p1[1] + (p2[1] - p1[1]) * u] };
}

export function nodeKey(x: number, y: number): string {
  return `${round(x, 2)},${round(y, 2)}`;
}

/**
 * Turn hand-drawn polylines (aisle centerlines) into a node/edge graph, splitting segments at every
 * crossing and T-junction so the network is properly connected.
 */
export function polylinesToGraph(lines: GraphLine[]): SimpleGraph {
  const segs: Seg[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.points.length - 1; i++) segs.push({ a: line.points[i], b: line.points[i + 1], line });
  }
  const endpoints: Point[] = segs.flatMap((s) => [s.a, s.b]);
  const nodes = new Map<string, { key: string; x: number; y: number }>();
  const edgeSet = new Set<string>();
  const edges: SimpleGraph["edges"] = [];

  const addNode = (p: Point) => {
    const key = nodeKey(p[0], p[1]);
    if (!nodes.has(key)) nodes.set(key, { key, x: round(p[0], 2), y: round(p[1], 2) });
    return key;
  };

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const splits: { t: number; p: Point }[] = [{ t: 0, p: s.a }, { t: 1, p: s.b }];
    for (const p of endpoints) {
      const t = pointOnSegment(p, s.a, s.b);
      if (t !== null && t > EPS && t < 1 - EPS) splits.push({ t, p });
    }
    for (let j = 0; j < segs.length; j++) {
      if (i === j) continue;
      const c = crossing(s.a, s.b, segs[j].a, segs[j].b);
      if (c && c.t > EPS && c.t < 1 - EPS) splits.push({ t: c.t, p: c.point });
    }
    splits.sort((x, y) => x.t - y.t);
    for (let k = 0; k < splits.length - 1; k++) {
      const from = addNode(splits[k].p);
      const to = addNode(splits[k + 1].p);
      if (from === to) continue;
      const id = from < to ? `${from}|${to}` : `${to}|${from}`;
      if (edgeSet.has(id)) continue;
      edgeSet.add(id);
      edges.push({
        from, to,
        accessible: s.line.accessible ?? true,
        oneWay: s.line.oneWay ?? false,
        virtual: s.line.virtual ?? false,
        weight: s.line.weight ?? 1,
      });
    }
  }
  return { nodes: [...nodes.values()], edges };
}
