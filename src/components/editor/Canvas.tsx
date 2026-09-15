"use client";
/**
 * The SVG editing surface. Plan coordinates (metres, y down) live inside one transformed <g>;
 * rulers and the scale bar are drawn in screen space. All document changes go through `dispatch`;
 * drags keep a local preview and commit a single action on release.
 */
import * as React from "react";
import type { EventBranding, Geometry, Point, PoiType } from "@/lib/domain/types";
import { bbox, distance, rectPolygon, round, type BBox } from "@/lib/domain/geometry";
import {
  buildSnapTargets,
  clientId,
  emptyDocument,
  geometryPoints,
  nextBoothLabel,
  rotateSelection,
  scaleSelection,
  snapDelta,
  snapPathPoint,
  snapPoint,
  type EditorAction,
  type EditorBooth,
  type EditorDocument,
  type EditorEdge,
  type EditorElement,
  type EditorLevel,
  type EditorNode,
  type PathTarget,
  type SnapGuide,
  type SnapOptions,
} from "@/lib/editor/document";
import { BoothLayer, ElementLayer, LevelFrame, NetworkLayer, RULER, Rulers, ScaleBar, ZONE_KINDS, labelModeFor, pts } from "./layers";
import { layerOfElementKind, type LayerStates, type Tool } from "./tools";
import type { useViewport } from "./useViewport";

export interface ToolOptions {
  poiType: PoiType;
  boothW: number;
  boothD: number;
  edgeFlags: { accessible: boolean; oneWay: boolean; virtual: boolean };
  testRoute: boolean;
}

export interface RoutePreview { steps: Point[][]; from: Point; to: Point; error?: string }

export interface CanvasProps {
  doc: EditorDocument;
  level: EditorLevel;
  selection: string[];
  tool: Tool;
  layers: LayerStates;
  showGrid: boolean;
  gridSize: number;
  snapGrid: boolean;
  snapObjects: boolean;
  colors: EventBranding["boothColors"];
  exhibitorNames: Map<string, string>;
  options: ToolOptions;
  viewport: ReturnType<typeof useViewport>;
  dispatch: React.Dispatch<EditorAction>;
  onArrayRect: (box: BBox) => void;
  transitionDraft: string[];
  onTransitionPick: (nodeId: string) => void;
  routePreview: RoutePreview | null;
  onTestRoute: (from: Point, to: Point) => void;
  generatedPreview: { nodes: EditorNode[]; edges: EditorEdge[] } | null;
  calibrate: boolean;
  onCalibrate: (a: Point, b: Point) => void;
  onCursor: (p: Point | null) => void;
  onSize: (w: number, h: number) => void;
}

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type Drag =
  | { kind: "pan"; sx: number; sy: number; x0: number; y0: number }
  | { kind: "marquee"; start: Point; cur: Point; additive: boolean }
  | { kind: "move"; ids: string[]; start: Point; box: BBox; dx: number; dy: number; moved: boolean; clickedId: string | null }
  | { kind: "resize"; ids: string[]; handle: HandleId; box0: BBox; box: BBox }
  | { kind: "rotate"; ids: string[]; center: Point; a0: number; deg: number }
  | { kind: "rect"; start: Point; cur: Point }
  | { kind: "vertex"; id: string; index: number; pt: Point }
  | { kind: "node"; id: string; pt: Point; moved: boolean };

const DRAW_TOOLS = new Set<Tool>(["booth", "polygon", "array", "wall", "zone", "text", "poi", "entrance", "path", "measure"]);

function boxIntersects(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function Canvas(props: CanvasProps) {
  const { doc, level, selection, tool, layers, showGrid, gridSize, snapGrid, snapObjects, colors, exhibitorNames, options, viewport, dispatch, onCursor, onSize } = props;
  const { vp, toPlan, zoomAt, panBy, setVp } = viewport;
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [size, setSize] = React.useState({ w: 800, h: 600 });
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const dragRef = React.useRef<Drag | null>(null);
  const [draft, setDraft] = React.useState<Point[]>([]);
  const [pathFrom, setPathFrom] = React.useState<string | null>(null);
  const [cursor, setCursor] = React.useState<Point | null>(null);
  const [guides, setGuides] = React.useState<SnapGuide[]>([]);
  const [pathTarget, setPathTarget] = React.useState<PathTarget | null>(null);
  const [measure, setMeasure] = React.useState<Point[]>([]);
  const [routePts, setRoutePts] = React.useState<Point[]>([]);
  const [calib, setCalib] = React.useState<Point[]>([]);
  const [space, setSpace] = React.useState(false);
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const pinch = React.useRef<{ d: number; mx: number; my: number } | null>(null);

  const setDragBoth = (d: Drag | null) => { dragRef.current = d; setDrag(d); };

  /* ---------- derived data ---------- */
  const levelBooths = React.useMemo(() => doc.booths.filter((b) => b.levelId === level.id), [doc.booths, level.id]);
  const levelElements = React.useMemo(() => doc.elements.filter((e) => e.levelId === level.id && layers[layerOfElementKind(e.kind)].visible).sort((a, b) => a.sortIndex - b.sortIndex), [doc.elements, level.id, layers]);
  const zoneElements = React.useMemo(() => levelElements.filter((e) => ZONE_KINDS.has(e.kind)), [levelElements]);
  const lineElements = React.useMemo(() => levelElements.filter((e) => e.kind === "wall" || e.kind === "line"), [levelElements]);
  const pointElements = React.useMemo(() => levelElements.filter((e) => !ZONE_KINDS.has(e.kind) && e.kind !== "wall" && e.kind !== "line"), [levelElements]);
  const levelNodes = React.useMemo(() => doc.nodes.filter((n) => n.levelId === level.id), [doc.nodes, level.id]);
  const levelEdges = React.useMemo(() => doc.edges.filter((e) => e.levelId === level.id), [doc.edges, level.id]);
  const nodeById = React.useMemo(() => new Map(levelNodes.map((n) => [n.id, n])), [levelNodes]);
  const boothById = React.useMemo(() => new Map(doc.booths.map((b) => [b.id, b])), [doc.booths]);
  const elById = React.useMemo(() => new Map(doc.elements.map((e) => [e.id, e])), [doc.elements]);
  const selSet = React.useMemo(() => new Set(selection), [selection]);
  const selected = React.useMemo(() => ({
    booths: levelBooths.filter((b) => selSet.has(b.id)),
    elements: levelElements.filter((e) => selSet.has(e.id)),
    nodes: levelNodes.filter((n) => selSet.has(n.id)),
    edges: levelEdges.filter((e) => selSet.has(e.id)),
  }), [levelBooths, levelElements, levelNodes, levelEdges, selSet]);
  const selDoc = React.useMemo<EditorDocument>(() => ({ ...emptyDocument(), booths: selected.booths, elements: selected.elements, nodes: selected.nodes }), [selected]);
  const selBox = React.useMemo<BBox | null>(() => {
    const p: Point[] = [];
    for (const b of selected.booths) p.push(...b.polygon);
    for (const e of selected.elements) p.push(...geometryPoints(e.geometry));
    for (const n of selected.nodes) p.push([n.x, n.y]);
    return p.length ? bbox(p) : null;
  }, [selected]);
  const labelMode = labelModeFor(vp.scale);
  const snapOpts = React.useMemo<SnapOptions>(() => ({ grid: snapGrid, gridSize, objects: snapObjects, tolerance: 8 / vp.scale }), [snapGrid, gridSize, snapObjects, vp.scale]);
  const tol = 8 / vp.scale;

  const layerOfId = React.useCallback((id: string): keyof LayerStates | null => {
    if (boothById.has(id)) return "booths";
    const el = elById.get(id);
    if (el) return layerOfElementKind(el.kind);
    if (nodeById.has(id) || levelEdges.some((e) => e.id === id)) return "network";
    return null;
  }, [boothById, elById, nodeById, levelEdges]);
  const isLocked = React.useCallback((id: string) => { const l = layerOfId(id); return l ? layers[l].locked : false; }, [layerOfId, layers]);

  /* ---------- size + wheel ---------- */
  React.useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setSize({ w: r.width, h: r.height }); onSize(r.width, r.height); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onSize]);

  React.useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || !e.shiftKey) zoomAt(Math.exp(-e.deltaY * 0.0018), e.clientX - r.left, e.clientY - r.top);
      else panBy(-e.deltaY, 0);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, panBy]);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.code === "Space") { setSpace(true); e.preventDefault(); }
      if (e.key === "Enter") finishDraft();
      if (e.key === "Escape") cancelAll();
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpace(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, tool, level.id, pathFrom]);

  // Reset transient drawing state when the tool or level changes.
  React.useEffect(() => { setDraft([]); setPathFrom(null); setMeasure([]); setRoutePts([]); setCalib([]); setPathTarget(null); setGuides([]); }, [tool, level.id]);
  React.useEffect(() => { if (!props.calibrate) setCalib([]); }, [props.calibrate]);
  React.useEffect(() => { if (!options.testRoute) setRoutePts([]); }, [options.testRoute]);

  /* ---------- helpers ---------- */
  const planFromEvent = (e: { clientX: number; clientY: number }): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return toPlan(e.clientX - r.left, e.clientY - r.top);
  };
  const screenFromEvent = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };
  const targetsRef = React.useRef<ReturnType<typeof buildSnapTargets> | null>(null);
  const snapDraw = (p: Point) => {
    if (!targetsRef.current) targetsRef.current = buildSnapTargets(doc, level.id);
    const r = snapPoint(p, targetsRef.current, snapOpts);
    setGuides(r.guides);
    return r.point;
  };
  React.useEffect(() => { targetsRef.current = null; }, [doc, level.id]);

  const finishDraft = () => {
    if (tool === "polygon" && draft.length >= 3) {
      dispatch({ type: "addBooth", booth: newBooth(draft) });
    } else if (tool === "zone" && draft.length >= 3) {
      dispatch({ type: "addElement", element: { id: clientId("el"), levelId: level.id, kind: "zone", geometry: { type: "polygon", points: draft }, props: { name: "Zone" }, sortIndex: 0 } });
    } else if (tool === "wall" && draft.length >= 2) {
      dispatch({ type: "addElement", element: { id: clientId("el"), levelId: level.id, kind: "wall", geometry: { type: "polyline", points: draft }, props: {}, sortIndex: 0 } });
    }
    setDraft([]);
    setPathFrom(null);
  };
  const cancelAll = () => {
    setDraft([]); setPathFrom(null); setMeasure([]); setRoutePts([]); setCalib([]); setGuides([]);
    if (dragRef.current) setDragBoth(null);
    if (!draft.length && !pathFrom && !measure.length && !routePts.length) dispatch({ type: "select", ids: [] });
  };

  const newBooth = (polygon: Point[]): EditorBooth => ({
    id: clientId("bo"), levelId: level.id, label: nextBoothLabel(doc.booths.map((b) => b.label)), externalId: null, polygon, boothType: "standard", status: "available", priceCents: null, colors: null, labelHidden: false, height3d: null, notes: null, metadata: {}, exhibitorIds: [], sortIndex: doc.booths.length,
  });

  const addPointElement = (kind: "text" | "poi" | "entrance", p: Point) => {
    const props = kind === "text" ? { text: "Text", fontSize: 1.5 } : kind === "poi" ? { poiType: options.poiType, name: options.poiType.replace(/_/g, " ") } : { name: "Entrance", isDefaultStart: !doc.elements.some((e) => e.kind === "entrance" && e.props.isDefaultStart) };
    dispatch({ type: "addElement", element: { id: clientId("el"), levelId: level.id, kind, geometry: { type: "point", point: p }, props, sortIndex: 0 } });
  };

  /* ---------- pointer handlers ---------- */
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const el = e.currentTarget;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      setDragBoth(null);
      return;
    }
    el.setPointerCapture(e.pointerId);
    const { sx, sy } = screenFromEvent(e);
    if (e.button === 1 || space || (e.button === 0 && e.altKey && tool === "select")) {
      setDragBoth({ kind: "pan", sx, sy, x0: vp.x, y0: vp.y });
      e.preventDefault();
      return;
    }
    if (e.button === 2) { // right click ends chains
      if (tool === "path") setPathFrom(null);
      if (draft.length) finishDraft();
      return;
    }
    if (e.button !== 0) return;
    const p = planFromEvent(e);
    const hit = (e.target as Element).closest?.("[data-id]") as Element | null;
    const hitId = hit?.getAttribute("data-id") ?? null;
    const hitKind = hit?.getAttribute("data-kind") ?? null;
    const handle = (e.target as Element).getAttribute?.("data-handle") as HandleId | "rotate" | null;
    const vertex = (e.target as Element).getAttribute?.("data-vertex");

    if (props.calibrate) {
      const next = [...calib, p];
      setCalib(next);
      if (next.length === 2) { props.onCalibrate(next[0], next[1]); setCalib([]); }
      return;
    }

    if (tool === "select") {
      if (handle === "rotate" && selBox) {
        const center: Point = [(selBox.minX + selBox.maxX) / 2, (selBox.minY + selBox.maxY) / 2];
        setDragBoth({ kind: "rotate", ids: selection, center, a0: Math.atan2(p[1] - center[1], p[0] - center[0]), deg: 0 });
        return;
      }
      if (handle && selBox) { setDragBoth({ kind: "resize", ids: selection, handle, box0: selBox, box: selBox }); return; }
      if (vertex && hitId) { setDragBoth({ kind: "vertex", id: hitId, index: Number(vertex), pt: p }); return; }
      if (hitId && !isLocked(hitId)) {
        if (hitKind === "node") {
          if (!selSet.has(hitId)) dispatch({ type: "select", ids: [hitId], mode: e.shiftKey ? "add" : "replace" });
          setDragBoth({ kind: "node", id: hitId, pt: [nodeById.get(hitId)!.x, nodeById.get(hitId)!.y], moved: false });
          return;
        }
        if (hitKind === "edge") { dispatch({ type: "select", ids: [hitId], mode: e.shiftKey ? "toggle" : "replace" }); return; }
        if (e.shiftKey) { dispatch({ type: "select", ids: [hitId], mode: "toggle" }); return; }
        const ids = selSet.has(hitId) ? selection : [hitId];
        if (!selSet.has(hitId)) dispatch({ type: "select", ids });
        const moving = ids.filter((id) => boothById.has(id) || elById.has(id) || nodeById.has(id));
        const p0: Point[] = [];
        for (const id of moving) { const b = boothById.get(id); if (b) p0.push(...b.polygon); const el2 = elById.get(id); if (el2) p0.push(...geometryPoints(el2.geometry)); const n = nodeById.get(id); if (n) p0.push([n.x, n.y]); }
        targetsRef.current = null;
        setDragBoth({ kind: "move", ids: moving, start: p, box: p0.length ? bbox(p0) : { minX: p[0], minY: p[1], maxX: p[0], maxY: p[1] }, dx: 0, dy: 0, moved: false, clickedId: hitId });
        return;
      }
      setDragBoth({ kind: "marquee", start: p, cur: p, additive: e.shiftKey });
      return;
    }

    if (options.testRoute && tool === "path") {
      const next = routePts.length >= 2 ? [p] : [...routePts, p];
      setRoutePts(next);
      if (next.length === 2) props.onTestRoute(next[0], next[1]);
      return;
    }

    const sp = snapDraw(p);
    switch (tool) {
      case "booth":
      case "array":
        setDragBoth({ kind: "rect", start: sp, cur: sp });
        return;
      case "polygon":
      case "zone": {
        if (draft.length >= 3 && distance(sp, draft[0]) <= tol * 1.5) { finishDraft(); return; }
        setDraft([...draft, sp]);
        return;
      }
      case "wall":
        setDraft([...draft, sp]);
        return;
      case "text": case "poi": case "entrance":
        addPointElement(tool, sp);
        return;
      case "path": {
        const target = snapPathPoint(doc, level.id, p, tol);
        const finalTarget: PathTarget = target.kind === "free" ? { kind: "free", point: sp } : target;
        if (finalTarget.kind === "node" && finalTarget.id === pathFrom) { setPathFrom(null); return; }
        const newNodeId = clientId("wn");
        dispatch({ type: "pathConnect", levelId: level.id, target: finalTarget, fromNodeId: pathFrom, newNodeId, select: false });
        const nodeId = finalTarget.kind === "node" ? finalTarget.id : newNodeId;
        if (pathFrom && !(options.edgeFlags.accessible && !options.edgeFlags.oneWay && !options.edgeFlags.virtual)) {
          // Apply the tool's default flags to the edge we just created (found by endpoints on next render via dispatch).
          dispatch({ type: "updateEdgesByEndpoints" as never, ids: [], patch: {} });
        }
        setPathFrom(nodeId);
        return;
      }
      case "transition":
        if (hitKind === "node" && hitId) props.onTransitionPick(hitId);
        return;
      case "measure":
        setMeasure(measure.length >= 2 ? [sp] : [...measure, sp]);
        return;
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const r = svgRef.current!.getBoundingClientRect();
      zoomAt(d / pinch.current.d, mx - r.left, my - r.top);
      panBy(mx - pinch.current.mx, my - pinch.current.my);
      pinch.current = { d, mx, my };
      return;
    }
    const p = planFromEvent(e);
    onCursor(p);
    const d = dragRef.current;
    if (!d) {
      if (DRAW_TOOLS.has(tool) && !options.testRoute) {
        if (tool === "path") {
          const t = snapPathPoint(doc, level.id, p, tol);
          setPathTarget(t);
          setCursor(t.kind === "free" ? snapDraw(p) : t.point);
        } else setCursor(snapDraw(p));
      } else setCursor(p);
      return;
    }
    switch (d.kind) {
      case "pan": {
        const { sx, sy } = screenFromEvent(e);
        setVp((v) => ({ ...v, x: d.x0 + (sx - d.sx), y: d.y0 + (sy - d.sy) }));
        return;
      }
      case "marquee": setDragBoth({ ...d, cur: p }); return;
      case "move": {
        const rawDx = p[0] - d.start[0], rawDy = p[1] - d.start[1];
        if (!d.moved && Math.hypot(rawDx, rawDy) * vp.scale < 3) return;
        if (!targetsRef.current) targetsRef.current = buildSnapTargets(doc, level.id, d.ids);
        const r = snapDelta(d.box, rawDx, rawDy, targetsRef.current, snapOpts);
        setGuides(r.guides);
        setDragBoth({ ...d, dx: r.dx, dy: r.dy, moved: true });
        return;
      }
      case "resize": {
        const sp = snapDraw(p);
        const b = { ...d.box0 };
        if (d.handle.includes("w")) b.minX = Math.min(sp[0], d.box0.maxX - 0.2);
        if (d.handle.includes("e")) b.maxX = Math.max(sp[0], d.box0.minX + 0.2);
        if (d.handle.includes("n")) b.minY = Math.min(sp[1], d.box0.maxY - 0.2);
        if (d.handle.includes("s")) b.maxY = Math.max(sp[1], d.box0.minY + 0.2);
        if (e.shiftKey) { // keep aspect ratio
          const ar = (d.box0.maxX - d.box0.minX) / Math.max(0.001, d.box0.maxY - d.box0.minY);
          const w = b.maxX - b.minX, h = b.maxY - b.minY;
          if (w / Math.max(0.001, h) > ar) { const nh = w / ar; if (d.handle.includes("n")) b.minY = b.maxY - nh; else b.maxY = b.minY + nh; }
          else { const nw = h * ar; if (d.handle.includes("w")) b.minX = b.maxX - nw; else b.maxX = b.minX + nw; }
        }
        setDragBoth({ ...d, box: b });
        return;
      }
      case "rotate": {
        let deg = ((Math.atan2(p[1] - d.center[1], p[0] - d.center[0]) - d.a0) * 180) / Math.PI;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        setDragBoth({ ...d, deg: round(deg, 1) });
        return;
      }
      case "rect": setDragBoth({ ...d, cur: snapDraw(p) }); return;
      case "vertex": setDragBoth({ ...d, pt: snapDraw(p) }); return;
      case "node": {
        const t = snapPathPoint(doc, level.id, p, tol, d.id);
        setDragBoth({ ...d, pt: t.kind === "free" ? snapDraw(p) : t.point, moved: true });
        return;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = dragRef.current;
    setGuides([]);
    if (!d) return;
    setDragBoth(null);
    switch (d.kind) {
      case "marquee": {
        const box = bbox([d.start, d.cur]);
        if ((box.maxX - box.minX) * vp.scale < 3 && (box.maxY - box.minY) * vp.scale < 3) { if (!d.additive) dispatch({ type: "select", ids: [] }); return; }
        const ids: string[] = [];
        if (layers.booths.visible && !layers.booths.locked) for (const b of levelBooths) if (boxIntersects(box, bbox(b.polygon))) ids.push(b.id);
        for (const el of levelElements) if (!layers[layerOfElementKind(el.kind)].locked && boxIntersects(box, bbox(geometryPoints(el.geometry)))) ids.push(el.id);
        if (layers.network.visible && !layers.network.locked) for (const n of levelNodes) if (n.x >= box.minX && n.x <= box.maxX && n.y >= box.minY && n.y <= box.maxY) ids.push(n.id);
        dispatch({ type: "select", ids, mode: d.additive ? "add" : "replace" });
        return;
      }
      case "move":
        if (d.moved) dispatch({ type: "move", ids: d.ids, dx: d.dx, dy: d.dy });
        else if (d.clickedId && selection.length > 1) dispatch({ type: "select", ids: [d.clickedId] });
        return;
      case "resize":
        dispatch({ type: "scale", ids: d.ids, from: d.box0, to: d.box });
        return;
      case "rotate":
        if (d.deg) dispatch({ type: "rotate", ids: d.ids, deg: d.deg, center: d.center });
        return;
      case "rect": {
        const box = bbox([d.start, d.cur]);
        const w = box.maxX - box.minX, h = box.maxY - box.minY;
        if (tool === "booth") {
          const poly = w < 0.3 || h < 0.3 ? rectPolygon(d.start[0], d.start[1], options.boothW, options.boothD) : rectPolygon(box.minX, box.minY, w, h);
          dispatch({ type: "addBooth", booth: newBooth(poly) });
        } else {
          props.onArrayRect(w < 1 || h < 1 ? { minX: d.start[0], minY: d.start[1], maxX: d.start[0] + 30, maxY: d.start[1] + 12 } : box);
        }
        return;
      }
      case "vertex": {
        const b = boothById.get(d.id);
        if (b) { const poly = b.polygon.map((q, i) => (i === d.index ? d.pt : q)); dispatch({ type: "setGeometry", booths: { [b.id]: poly } }); return; }
        const el = elById.get(d.id);
        if (el && el.geometry.type !== "point") {
          const g: Geometry = { type: el.geometry.type, points: el.geometry.points.map((q, i) => (i === d.index ? d.pt : q)) } as Geometry;
          dispatch({ type: "setGeometry", elements: { [el.id]: g } });
        }
        return;
      }
      case "node":
        if (d.moved) dispatch({ type: "setGeometry", nodes: { [d.id]: d.pt } });
        return;
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool === "polygon" || tool === "zone" || tool === "wall") {
      // pointerdown already added the duplicate point; drop it and finish.
      const pts2 = draft.slice(0, -1);
      setDraft(pts2);
      if (tool === "wall" ? pts2.length >= 2 : pts2.length >= 3) {
        if (tool === "polygon") dispatch({ type: "addBooth", booth: newBooth(pts2) });
        else if (tool === "zone") dispatch({ type: "addElement", element: { id: clientId("el"), levelId: level.id, kind: "zone", geometry: { type: "polygon", points: pts2 }, props: { name: "Zone" }, sortIndex: 0 } });
        else dispatch({ type: "addElement", element: { id: clientId("el"), levelId: level.id, kind: "wall", geometry: { type: "polyline", points: pts2 }, props: {}, sortIndex: 0 } });
      }
      setDraft([]);
      e.preventDefault();
    } else if (tool === "path") setPathFrom(null);
  };

  /* ---------- overlay pieces ---------- */
  const hs = 8 / vp.scale; // handle size
  const sw = 1.5 / vp.scale; // 1.5 px stroke
  const previewDoc = React.useMemo<EditorDocument | null>(() => {
    if (!drag) return null;
    if (drag.kind === "move") return drag.moved ? { ...selDoc, booths: selDoc.booths.map((b) => ({ ...b, polygon: b.polygon.map((q) => [q[0] + drag.dx, q[1] + drag.dy] as Point) })), elements: selDoc.elements.map((el) => ({ ...el, geometry: shift(el.geometry, drag.dx, drag.dy) })), nodes: selDoc.nodes.map((n) => ({ ...n, x: n.x + drag.dx, y: n.y + drag.dy })) } : null;
    if (drag.kind === "resize") return scaleSelection(selDoc, drag.ids, drag.box0, drag.box);
    if (drag.kind === "rotate") return rotateSelection(selDoc, drag.ids, drag.deg, drag.center);
    return null;
  }, [drag, selDoc]);

  const singlePoly = selection.length === 1 && tool === "select" && !drag ? (boothById.get(selection[0])?.polygon ?? (() => { const el = elById.get(selection[0]); return el && el.geometry.type !== "point" ? el.geometry.points : null; })()) : null;
  const cursorText = (p: Point, text: string, key?: string) => (
    <g key={key} style={{ pointerEvents: "none" }}>
      <rect x={p[0] + 10 / vp.scale} y={p[1] - 22 / vp.scale} width={(text.length * 7 + 10) / vp.scale} height={18 / vp.scale} rx={3 / vp.scale} fill="#111827" opacity={0.85} />
      <text x={p[0] + 15 / vp.scale} y={p[1] - 9 / vp.scale} fontSize={11 / vp.scale} fill="#fff" fontFamily="ui-monospace, monospace">{text}</text>
    </g>
  );
  const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

  const viewBox = { minX: (RULER - vp.x) / vp.scale, minY: (RULER - vp.y) / vp.scale, maxX: (size.w - vp.x) / vp.scale, maxY: (size.h - vp.y) / vp.scale };
  const cursorStyle = drag?.kind === "pan" ? "grabbing" : space ? "grab" : tool === "select" ? "default" : "crosshair";

  return (
    <svg
      ref={svgRef}
      className="block h-full w-full touch-none select-none"
      style={{ cursor: cursorStyle, background: "#eef0f3" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => onCursor(null)}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <g transform={`translate(${vp.x} ${vp.y}) scale(${vp.scale})`}>
        <LevelFrame level={level} scale={vp.scale} showGrid={showGrid && layers.grid.visible} gridSize={gridSize} showBackground={layers.background.visible} />
        <ElementLayer elements={zoneElements} labelMode={labelMode} />
        <BoothLayer booths={levelBooths} colors={colors} exhibitorNames={exhibitorNames} labelMode={labelMode} hidden={!layers.booths.visible} />
        <ElementLayer elements={lineElements} labelMode={labelMode} />
        <NetworkLayer nodes={levelNodes} edges={levelEdges} scale={vp.scale} emphasis={tool === "path" || tool === "transition"} hidden={!layers.network.visible} />
        <ElementLayer elements={pointElements} labelMode={labelMode} />

        {/* ----- overlay ----- */}
        <g style={{ pointerEvents: "none" }}>
          {props.generatedPreview && (
            <g opacity={0.9}>
              {props.generatedPreview.edges.map((e) => { const a = props.generatedPreview!.nodes.find((n) => n.id === e.from), b = props.generatedPreview!.nodes.find((n) => n.id === e.to); return a && b ? <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f97316" strokeWidth={0.15} strokeDasharray="0.4 0.3" /> : null; })}
              {props.generatedPreview.nodes.map((n) => <circle key={n.id} cx={n.x} cy={n.y} r={0.2} fill="#f97316" />)}
            </g>
          )}
          {guides.map((g, i) => (g.axis === "x" ? <line key={i} x1={g.value} y1={viewBox.minY} x2={g.value} y2={viewBox.maxY} stroke="#ec4899" strokeWidth={sw} strokeDasharray={`${4 / vp.scale} ${3 / vp.scale}`} /> : <line key={i} x1={viewBox.minX} y1={g.value} x2={viewBox.maxX} y2={g.value} stroke="#ec4899" strokeWidth={sw} strokeDasharray={`${4 / vp.scale} ${3 / vp.scale}`} />))}

          {/* selection outlines */}
          {!previewDoc && selected.booths.map((b) => <polygon key={b.id} points={pts(b.polygon)} fill="none" stroke="#2563eb" strokeWidth={sw * 1.4} />)}
          {!previewDoc && selected.elements.map((el) => el.geometry.type === "point" ? <circle key={el.id} cx={el.geometry.point[0]} cy={el.geometry.point[1]} r={1.3} fill="none" stroke="#2563eb" strokeWidth={sw * 1.4} /> : el.geometry.type === "polygon" ? <polygon key={el.id} points={pts(el.geometry.points)} fill="none" stroke="#2563eb" strokeWidth={sw * 1.4} /> : <polyline key={el.id} points={pts(el.geometry.points)} fill="none" stroke="#2563eb" strokeWidth={sw * 2.5} opacity={0.6} />)}
          {!previewDoc && selected.nodes.map((n) => <circle key={n.id} cx={n.x} cy={n.y} r={Math.max(0.3, 8 / vp.scale)} fill="none" stroke="#2563eb" strokeWidth={sw * 1.4} />)}
          {selected.edges.map((e) => { const a = nodeById.get(e.from), b = nodeById.get(e.to); return a && b ? <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2563eb" strokeWidth={sw * 4} opacity={0.5} /> : null; })}
          {props.transitionDraft.map((id) => { const n = nodeById.get(id); return n ? <circle key={id} cx={n.x} cy={n.y} r={Math.max(0.5, 10 / vp.scale)} fill="#a855f7" fillOpacity={0.3} stroke="#7e22ce" strokeWidth={sw * 1.5} /> : null; })}

          {/* drag previews */}
          {previewDoc && previewDoc.booths.map((b) => <polygon key={b.id} points={pts(b.polygon)} fill="#3b82f6" fillOpacity={0.25} stroke="#1d4ed8" strokeWidth={sw * 1.4} />)}
          {previewDoc && previewDoc.elements.map((el) => el.geometry.type === "point" ? <circle key={el.id} cx={el.geometry.point[0]} cy={el.geometry.point[1]} r={1} fill="#3b82f6" fillOpacity={0.4} /> : <polyline key={el.id} points={pts(el.geometry.type === "polygon" ? [...el.geometry.points, el.geometry.points[0]] : el.geometry.points)} fill={el.geometry.type === "polygon" ? "#3b82f6" : "none"} fillOpacity={0.25} stroke="#1d4ed8" strokeWidth={sw * 1.4} />)}
          {previewDoc && previewDoc.nodes.map((n) => <circle key={n.id} cx={n.x} cy={n.y} r={Math.max(0.25, 5 / vp.scale)} fill="#3b82f6" />)}
          {drag?.kind === "move" && drag.moved && cursorText(cursor ?? drag.start, `Δ ${fmt(drag.dx)}, ${fmt(drag.dy)} m`)}
          {drag?.kind === "resize" && cursorText([drag.box.maxX, drag.box.maxY], `${fmt(drag.box.maxX - drag.box.minX)} × ${fmt(drag.box.maxY - drag.box.minY)} m`)}
          {drag?.kind === "rotate" && cursorText(cursor ?? drag.center, `${drag.deg}°`)}
          {drag?.kind === "vertex" && <circle cx={drag.pt[0]} cy={drag.pt[1]} r={hs * 0.7} fill="#2563eb" />}
          {drag?.kind === "node" && <circle cx={drag.pt[0]} cy={drag.pt[1]} r={Math.max(0.3, 6 / vp.scale)} fill="#2563eb" />}

          {/* bbox + handles */}
          {tool === "select" && selBox && !drag && (selected.booths.length + selected.elements.length > 0) && (
            <g>
              <rect x={selBox.minX} y={selBox.minY} width={selBox.maxX - selBox.minX} height={selBox.maxY - selBox.minY} fill="none" stroke="#2563eb" strokeWidth={sw} strokeDasharray={`${4 / vp.scale} ${3 / vp.scale}`} />
              {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as HandleId[]).map((h) => {
                const cx = h.includes("w") ? selBox.minX : h.includes("e") ? selBox.maxX : (selBox.minX + selBox.maxX) / 2;
                const cy = h.includes("n") ? selBox.minY : h.includes("s") ? selBox.maxY : (selBox.minY + selBox.maxY) / 2;
                const cur = h === "n" || h === "s" ? "ns-resize" : h === "e" || h === "w" ? "ew-resize" : h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize";
                return <rect key={h} data-handle={h} x={cx - hs / 2} y={cy - hs / 2} width={hs} height={hs} fill="#fff" stroke="#2563eb" strokeWidth={sw} style={{ pointerEvents: "all", cursor: cur }} />;
              })}
              <line x1={(selBox.minX + selBox.maxX) / 2} y1={selBox.minY} x2={(selBox.minX + selBox.maxX) / 2} y2={selBox.minY - 24 / vp.scale} stroke="#2563eb" strokeWidth={sw} />
              <circle data-handle="rotate" cx={(selBox.minX + selBox.maxX) / 2} cy={selBox.minY - 24 / vp.scale} r={hs * 0.6} fill="#fff" stroke="#2563eb" strokeWidth={sw} style={{ pointerEvents: "all", cursor: "grab" }} />
              {singlePoly && singlePoly.map((q, i) => <rect key={i} data-id={selection[0]} data-vertex={i} x={q[0] - hs * 0.35} y={q[1] - hs * 0.35} width={hs * 0.7} height={hs * 0.7} fill="#2563eb" stroke="#fff" strokeWidth={sw} style={{ pointerEvents: "all", cursor: "move" }} />)}
            </g>
          )}

          {/* marquee */}
          {drag?.kind === "marquee" && (() => { const b = bbox([drag.start, drag.cur]); return <rect x={b.minX} y={b.minY} width={b.maxX - b.minX} height={b.maxY - b.minY} fill="#3b82f6" fillOpacity={0.1} stroke="#2563eb" strokeWidth={sw} />; })()}

          {/* drawing rect */}
          {drag?.kind === "rect" && (() => { const b = bbox([drag.start, drag.cur]); const w = b.maxX - b.minX, h = b.maxY - b.minY; return (<g><rect x={b.minX} y={b.minY} width={w} height={h} fill={tool === "array" ? "#f97316" : "#3b82f6"} fillOpacity={0.2} stroke={tool === "array" ? "#ea580c" : "#1d4ed8"} strokeWidth={sw * 1.4} />{cursorText(drag.cur, `${fmt(w)} × ${fmt(h)} m`)}</g>); })()}

          {/* polygon / wall drafts */}
          {draft.length > 0 && (
            <g>
              <polyline points={pts(cursor ? [...draft, cursor] : draft)} fill={tool === "wall" ? "none" : "#3b82f6"} fillOpacity={0.15} stroke="#1d4ed8" strokeWidth={sw * 1.4} strokeLinejoin="round" />
              {tool !== "wall" && draft.length >= 2 && cursor && <line x1={cursor[0]} y1={cursor[1]} x2={draft[0][0]} y2={draft[0][1]} stroke="#1d4ed8" strokeWidth={sw} strokeDasharray={`${3 / vp.scale} ${3 / vp.scale}`} />}
              {draft.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={hs * (i === 0 ? 0.7 : 0.45)} fill={i === 0 ? "#fff" : "#1d4ed8"} stroke="#1d4ed8" strokeWidth={sw} />)}
              {cursor && draft.length > 0 && cursorText(cursor, `${fmt(distance(draft[draft.length - 1], cursor))} m`)}
            </g>
          )}

          {/* path tool */}
          {tool === "path" && !options.testRoute && (
            <g>
              {pathFrom && nodeById.get(pathFrom) && cursor && <line x1={nodeById.get(pathFrom)!.x} y1={nodeById.get(pathFrom)!.y} x2={cursor[0]} y2={cursor[1]} stroke="#0284c7" strokeWidth={sw * 1.5} strokeDasharray={`${4 / vp.scale} ${3 / vp.scale}`} />}
              {pathTarget && pathTarget.kind !== "free" && <circle cx={pathTarget.point[0]} cy={pathTarget.point[1]} r={Math.max(0.35, 7 / vp.scale)} fill={pathTarget.kind === "edge" ? "#f59e0b" : "#0ea5e9"} fillOpacity={0.5} stroke="#0369a1" strokeWidth={sw} />}
              {pathTarget?.kind === "free" && cursor && <circle cx={cursor[0]} cy={cursor[1]} r={Math.max(0.25, 5 / vp.scale)} fill="#0ea5e9" fillOpacity={0.4} />}
              {pathFrom && nodeById.get(pathFrom) && cursor && cursorText(cursor, `${fmt(distance([nodeById.get(pathFrom)!.x, nodeById.get(pathFrom)!.y], cursor))} m`)}
            </g>
          )}

          {/* route test */}
          {routePts.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={Math.max(0.4, 7 / vp.scale)} fill={i === 0 ? "#16a34a" : "#dc2626"} stroke="#fff" strokeWidth={sw} />)}
          {props.routePreview && props.routePreview.steps.map((s, i) => <polyline key={i} points={pts(s)} fill="none" stroke="#16a34a" strokeWidth={Math.max(0.3, 4 / vp.scale)} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />)}

          {/* measure */}
          {measure.length > 0 && (() => { const b = measure[1] ?? cursor; if (!b) return null; const a = measure[0]; return (<g><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#111827" strokeWidth={sw * 1.5} /><circle cx={a[0]} cy={a[1]} r={hs * 0.5} fill="#111827" /><circle cx={b[0]} cy={b[1]} r={hs * 0.5} fill="#111827" />{cursorText(b, `${fmt(distance(a, b))} m  (Δx ${fmt(b[0] - a[0])}, Δy ${fmt(b[1] - a[1])})`)}</g>); })()}

          {/* calibration */}
          {props.calibrate && calib.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={hs * 0.6} fill="#f59e0b" stroke="#fff" strokeWidth={sw} />)}
          {props.calibrate && calib.length === 1 && cursor && <line x1={calib[0][0]} y1={calib[0][1]} x2={cursor[0]} y2={cursor[1]} stroke="#f59e0b" strokeWidth={sw * 1.5} strokeDasharray={`${4 / vp.scale} ${3 / vp.scale}`} />}

          {/* snapped cursor for drawing tools */}
          {DRAW_TOOLS.has(tool) && !drag && cursor && tool !== "path" && !options.testRoute && <g><line x1={cursor[0] - hs} y1={cursor[1]} x2={cursor[0] + hs} y2={cursor[1]} stroke="#1d4ed8" strokeWidth={sw} /><line x1={cursor[0]} y1={cursor[1] - hs} x2={cursor[0]} y2={cursor[1] + hs} stroke="#1d4ed8" strokeWidth={sw} /></g>}
        </g>
      </g>
      <Rulers vp={vp} width={size.w} height={size.h} />
      <ScaleBar vp={vp} height={size.h} />
    </svg>
  );
}

function shift(g: Geometry, dx: number, dy: number): Geometry {
  if (g.type === "point") return { type: "point", point: [g.point[0] + dx, g.point[1] + dy] };
  return { type: g.type, points: g.points.map((p) => [p[0] + dx, p[1] + dy] as Point) } as Geometry;
}

export type { EditorElement as CanvasElement };
