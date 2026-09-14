/**
 * Wayfinding / routing engine public API.
 *
 * Typical use:
 *   const graph = buildGraph(bundle);              // cache per bundle version
 *   const route = findRoute(bundle, graph, from, to, { accessible: true, via: [stop] });
 *   const tour  = optimizeRoute(bundle, graph, start, stops);
 *   const auto  = generateWayfindingGraph(level, bundle.booths);
 */

export {
  WALKING_SPEED_MPS,
  buildGraph,
  createOverlay,
  getEdge,
  getNode,
  levelHasNetwork,
  nearestEdges,
  nodeCount,
  overlayAddEdge,
  overlayAddNode,
} from "./graph";
export type {
  GraphEdge,
  GraphNode,
  GraphOverlay,
  IndexedSegment,
  LevelSpatialIndex,
  NearestEdgeHit,
  OverlayEdgeInit,
  RoutingGraph,
  TransitionInfo,
} from "./graph";

export { MinHeap, astar } from "./astar";
export type { AStarOptions, AStarResult } from "./astar";

export {
  MAX_VIA_POINTS,
  bundleIndex,
  endpointKey,
  findBooth,
  findExhibitor,
  findRoute,
  levelName,
  polylineLength,
  resolveEndpoint,
  simplifyPolyline,
  turnInstruction,
} from "./route";
export type { BundleIndex, FindRouteOptions, ResolvedEndpoint } from "./route";

export { MAX_OPTIMIZE_STOPS, optimizeRoute } from "./optimize";
export type { OptimizeOptions, OptimizedRoute } from "./optimize";

export { elementBlocksRouting, generateWayfindingGraph } from "./autograph";
export type { AutoGraphBounds, AutoGraphOptions, AutoGraphResult, AutoGraphStats } from "./autograph";
