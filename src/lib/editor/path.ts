/**
 * Path (aisle network) editing: snapping clicks to existing nodes/edges and connecting nodes,
 * splitting an edge when a new node lands on it (T-junctions).
 */
import type { Point } from "@/lib/domain/types";
import { closestPointOnSegment, distance } from "@/lib/domain/geometry";
import { clientId, type EditorDocument, type EditorEdge, type EditorNode } from "./types";
import { roundPoint } from "./geometry-ops";

export type PathTarget =
  | { kind: "node"; id: string; point: Point }
  | { kind: "edge"; edgeId: string; point: Point; t: number }
  | { kind: "free"; point: Point };

/** Where would a click at `p` land? Existing node within `tol` wins, then an edge, else free space. */
export function snapPathPoint(doc: EditorDocument, levelId: string, p: Point, tol: number, excludeNodeId?: string): PathTarget {
  let bestNode: EditorNode | null = null, bestD = tol;
  for (const n of doc.nodes) {
    if (n.levelId !== levelId || n.id === excludeNodeId) continue;
    const d = distance([n.x, n.y], p);
    if (d <= bestD) { bestD = d; bestNode = n; }
  }
  if (bestNode) return { kind: "node", id: bestNode.id, point: [bestNode.x, bestNode.y] };
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  let bestEdge: { e: EditorEdge; point: Point; t: number } | null = null;
  bestD = tol;
  for (const e of doc.edges) {
    if (e.levelId !== levelId) continue;
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) continue;
    const c = closestPointOnSegment(p, [a.x, a.y], [b.x, b.y]);
    if (c.dist <= bestD && c.t > 0.02 && c.t < 0.98) { bestD = c.dist; bestEdge = { e, point: roundPoint(c.point), t: c.t }; }
  }
  if (bestEdge) return { kind: "edge", edgeId: bestEdge.e.id, point: bestEdge.point, t: bestEdge.t };
  return { kind: "free", point: p };
}

export interface ConnectResult { doc: EditorDocument; nodeId: string; edgeId: string | null }

const DEFAULT_EDGE = { accessible: true, oneWay: false, virtual: false, weight: 1 };

/** Insert a node on an edge, replacing it with two edges that keep its flags. */
export function splitEdge(doc: EditorDocument, edgeId: string, point: Point, newNodeId = clientId("wn")): { doc: EditorDocument; nodeId: string } {
  const edge = doc.edges.find((e) => e.id === edgeId);
  if (!edge) return { doc, nodeId: newNodeId };
  const node: EditorNode = { id: newNodeId, levelId: edge.levelId, x: point[0], y: point[1] };
  const flags = { accessible: edge.accessible, oneWay: edge.oneWay, virtual: edge.virtual, weight: edge.weight };
  const a: EditorEdge = { id: clientId("we"), levelId: edge.levelId, from: edge.from, to: node.id, ...flags };
  const b: EditorEdge = { id: clientId("we"), levelId: edge.levelId, from: node.id, to: edge.to, ...flags };
  return { doc: { ...doc, nodes: [...doc.nodes, node], edges: [...doc.edges.filter((e) => e.id !== edgeId), a, b] }, nodeId: node.id };
}

/**
 * Resolve `target` to a node (creating it, splitting an edge if needed) and, when `fromNodeId` is
 * given, connect the two with an edge (no duplicates, no self loops).
 */
export function connectPath(doc: EditorDocument, levelId: string, target: PathTarget, fromNodeId: string | null, newNodeId = clientId("wn"), flags: Partial<typeof DEFAULT_EDGE> = {}): ConnectResult {
  let out = doc;
  let nodeId: string;
  if (target.kind === "node") nodeId = target.id;
  else if (target.kind === "edge") { const r = splitEdge(out, target.edgeId, target.point, newNodeId); out = r.doc; nodeId = r.nodeId; }
  else { nodeId = newNodeId; out = { ...out, nodes: [...out.nodes, { id: nodeId, levelId, x: target.point[0], y: target.point[1] }] }; }
  let edgeId: string | null = null;
  if (fromNodeId && fromNodeId !== nodeId) {
    const existing = out.edges.find((e) => (e.from === fromNodeId && e.to === nodeId) || (e.from === nodeId && e.to === fromNodeId));
    if (existing) edgeId = existing.id;
    else {
      edgeId = clientId("we");
      out = { ...out, edges: [...out.edges, { id: edgeId, levelId, from: fromNodeId, to: nodeId, ...DEFAULT_EDGE, ...flags }] };
    }
  }
  return { doc: out, nodeId, edgeId };
}

/** Remove nodes (and their edges) and edges; transitions drop references to removed nodes. */
export function removeFromNetwork(doc: EditorDocument, ids: Iterable<string>): EditorDocument {
  const set = new Set(ids);
  const nodes = doc.nodes.filter((n) => !set.has(n.id));
  const kept = new Set(nodes.map((n) => n.id));
  const edges = doc.edges.filter((e) => !set.has(e.id) && kept.has(e.from) && kept.has(e.to));
  const transitions = doc.transitions.map((t) => (t.nodeIds.some((n) => !kept.has(n)) ? { ...t, nodeIds: t.nodeIds.filter((n) => kept.has(n)) } : t)).filter((t) => !set.has(t.id));
  if (nodes.length === doc.nodes.length && edges.length === doc.edges.length && transitions.length === doc.transitions.length && !transitions.some((t, i) => t !== doc.transitions[i])) return doc;
  return { ...doc, nodes, edges, transitions };
}

/** Degree-2 nodes lying (almost) on the straight line between their neighbours are redundant. */
export function nodeDegree(doc: EditorDocument, nodeId: string): number {
  let d = 0;
  for (const e of doc.edges) if (e.from === nodeId || e.to === nodeId) d++;
  return d;
}
