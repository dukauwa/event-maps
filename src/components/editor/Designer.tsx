"use client";
/**
 * The floor plan designer shell. Owns the editor state (reducer + history), the active tool and
 * viewport, autosave, keyboard shortcuts and all dialogs; composes the top bar, tool rail, layers
 * panel, SVG canvas, properties panel and status bar.
 */
import * as React from "react";
import { toast, api } from "@/components/ui";
import type { BBox } from "@/lib/domain/geometry";
import type { EventSettings, PlanBundle, Point, RouteResult } from "@/lib/domain/types";
import {
  bundleFromDocument,
  clientId,
  documentFromBundle,
  editorReducer,
  getSelected,
  initialState,
  isDirty,
  mergePolygons,
  selectionBBox,
  type EditorDocument,
  type EditorEdge,
  type EditorLevel,
  type EditorNode,
  type EditorState,
} from "@/lib/editor/document";
import { levelToSvg } from "@/lib/editor/export";
import { buildGraph, findRoute } from "@/lib/routing";
import { Canvas, type RoutePreview, type ToolOptions } from "./Canvas";
import { StatusBar, Toolbar, TopBar, type SaveState } from "./chrome";
import { ConfirmDialog, createStore } from "./designer-ui";
import { ArrayDialog, CalibrateDialog, CsvImportDialog, GenerateDialog, LevelSettingsDialog, PublishDialog, RenumberDialog, ShortcutsDialog, SvgImportDialog } from "./dialogs";
import { LayersPanel } from "./LayersPanel";
import { PropertiesPanel, type PanelActions } from "./PropertiesPanel";
import { saveDocument } from "./save";
import { DEFAULT_LAYERS, TOOLS, type LayerClass, type LayerStates, type Tool } from "./tools";
import { useViewport } from "./useViewport";

export interface DesignerProps {
  bundle: PlanBundle;
  event: { id: string; slug: string; name: string; settings: EventSettings };
  /** Booth notes (omitted from the public bundle). */
  notes?: Record<string, string | null>;
  /** Stored price overrides by booth id (the bundle carries resolved prices). */
  priceOverrides?: Record<string, number | null>;
}

type DialogState =
  | { kind: "none" }
  | { kind: "array"; box: BBox }
  | { kind: "level"; id: string }
  | { kind: "publish" }
  | { kind: "csv" }
  | { kind: "svg" }
  | { kind: "renumber"; ids: string[] }
  | { kind: "generate" }
  | { kind: "shortcuts" }
  | { kind: "confirmDelete"; ids: string[]; withExhibitors: string[] }
  | { kind: "confirmDeleteLevel"; id: string }
  | { kind: "calibrate"; points: [Point, Point] };

const AUTOSAVE_MS = 1500;
const TOOL_BY_KEY = new Map(TOOLS.map((t) => [t.key.toLowerCase(), t.id]));

function newLevel(doc: EditorDocument): EditorLevel {
  const n = doc.levels.length + 1;
  return { id: clientId("lv"), name: `Level ${n}`, shortName: `L${n}`, sortIndex: doc.levels.length, widthM: 200, heightM: 120, background: null, georef: null };
}

export function Designer({ bundle, event, notes = {}, priceOverrides }: DesignerProps) {
  const [state, dispatch] = React.useReducer(editorReducer, undefined, () => initialState(documentFromBundle(bundle, notes, priceOverrides)));
  const { doc, selection, activeLevelId } = state;
  const stateRef = React.useRef<EditorState>(state);
  React.useEffect(() => { stateRef.current = state; }, [state]);

  const viewport = useViewport({ x: 60, y: 60, scale: 5 });
  const sizeRef = React.useRef({ w: 1000, h: 700 });
  const [cursorStore] = React.useState(() => createStore<Point | null>(null));

  const [tool, setToolState] = React.useState<Tool>("select");
  const [layers, setLayers] = React.useState<LayerStates>(DEFAULT_LAYERS);
  const [showGrid, setShowGrid] = React.useState(true);
  const [gridSize, setGridSize] = React.useState(0.5);
  const [snap, setSnap] = React.useState(true);
  const [options, setOptionsState] = React.useState<ToolOptions>({ poiType: "info", boothW: 3, boothD: 3, edgeFlags: { accessible: true, oneWay: false, virtual: false }, testRoute: false });
  const [transitionDraft, setTransitionDraft] = React.useState<string[]>([]);
  const [routePreview, setRoutePreview] = React.useState<RoutePreview | null>(null);
  const [routeInfo, setRouteInfo] = React.useState<{ distanceM: number; durationSeconds: number } | null>(null);
  const [generated, setGenerated] = React.useState<{ levelId: string; nodes: EditorNode[]; edges: EditorEdge[] } | null>(null);
  const [calibrating, setCalibrating] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<DialogState>({ kind: "none" });
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState(false);

  const level = React.useMemo(() => doc.levels.find((l) => l.id === activeLevelId) ?? [...doc.levels].sort((a, b) => a.sortIndex - b.sortIndex)[0] ?? null, [doc.levels, activeLevelId]);
  const colors = event.settings.branding.boothColors;
  const exhibitorNames = React.useMemo(() => {
    const m = new Map<string, string[]>();
    for (const ex of bundle.exhibitors) for (const id of ex.boothIds) m.set(id, [...(m.get(id) ?? []), ex.name]);
    return m;
  }, [bundle.exhibitors]);
  const exhibitorNamesJoined = React.useMemo(() => new Map([...exhibitorNames].map(([k, v]) => [k, v.join(", ")])), [exhibitorNames]);
  const levelBooths = React.useMemo(() => doc.booths.filter((b) => b.levelId === level?.id), [doc.booths, level?.id]);
  const dirty = isDirty(state);
  const saveState: SaveState = saving ? "saving" : saveError ? "error" : dirty ? "unsaved" : "saved";

  /* ---------------- viewport helpers ---------------- */
  const fitLevel = React.useCallback((lv: EditorLevel | null = stateRef.current.doc.levels.find((l) => l.id === stateRef.current.activeLevelId) ?? null) => {
    if (!lv) return;
    viewport.fit({ minX: 0, minY: 0, maxX: lv.widthM, maxY: lv.heightM }, sizeRef.current.w, sizeRef.current.h, 40);
  }, [viewport]);
  const zoomToBox = React.useCallback((box: BBox) => {
    const pad = Math.min(sizeRef.current.w, sizeRef.current.h) * 0.35;
    viewport.fit(box, sizeRef.current.w, sizeRef.current.h, pad);
  }, [viewport]);
  const fittedRef = React.useRef(false);
  const onSize = React.useCallback((w: number, h: number) => {
    sizeRef.current = { w, h };
    if (!fittedRef.current && w > 0 && h > 0) { fittedRef.current = true; fitLevel(); }
  }, [fitLevel]);
  const onCursor = React.useCallback((p: Point | null) => cursorStore.set(p), [cursorStore]);
  const zoomBy = (f: number) => viewport.zoomAt(f, sizeRef.current.w / 2, sizeRef.current.h / 2);

  /* ---------------- save / autosave ---------------- */
  const saveRef = React.useRef({ inFlight: false, queued: false, resolvers: [] as ((ok: boolean) => void)[] });
  const save = React.useCallback((): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const s = saveRef.current;
      s.resolvers.push(resolve);
      if (s.inFlight) { s.queued = true; return; }
      const run = async () => {
        s.inFlight = true;
        let ok = true;
        try {
          const st = stateRef.current;
          if (isDirty(st)) {
            setSaving(true);
            const r = await saveDocument(event.id, st.lastSaved, st.doc);
            dispatch({ type: "reconcileIds", map: r.map });
            dispatch({ type: "markSaved", doc: r.savedDoc });
            for (const w of r.warnings) toast(w, "info");
            if (r.error) { ok = false; setSaveError(true); toast(`Save failed: ${r.error}`, "error"); } else setSaveError(false);
          }
        } finally {
          setSaving(false);
          s.inFlight = false;
        }
        if (s.queued) { s.queued = false; void run(); return; }
        const rs = s.resolvers; s.resolvers = [];
        rs.forEach((f) => f(ok));
      };
      void run();
    });
  }, [event.id]);

  React.useEffect(() => {
    if (!dirty || saveError) return;
    const t = window.setTimeout(() => void save(), AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [dirty, state.doc, saveError, save]);

  React.useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (isDirty(stateRef.current)) { e.preventDefault(); } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  /* ---------------- tool + level switching ---------------- */
  const setTool = React.useCallback((t: Tool) => {
    setToolState(t);
    if (t !== "path") { setOptionsState((o) => (o.testRoute ? { ...o, testRoute: false } : o)); setRoutePreview(null); setRouteInfo(null); }
    if (t !== "transition") setTransitionDraft([]);
  }, []);
  const setOptions = React.useCallback((patch: Partial<ToolOptions>) => {
    setOptionsState((o) => ({ ...o, ...patch }));
    if (patch.testRoute === false) { setRoutePreview(null); setRouteInfo(null); }
  }, []);
  const selectLevel = React.useCallback((id: string) => {
    dispatch({ type: "setActiveLevel", levelId: id });
    setRoutePreview(null);
    setGenerated(null);
    const lv = stateRef.current.doc.levels.find((l) => l.id === id);
    if (lv) fitLevel(lv);
  }, [fitLevel]);
  const setLayer = React.useCallback((c: LayerClass, patch: Partial<{ visible: boolean; locked: boolean }>) => setLayers((ls) => ({ ...ls, [c]: { ...ls[c], ...patch } })), []);

  /* ---------------- editing actions ---------------- */
  const requestDelete = React.useCallback((ids: string[]) => {
    if (!ids.length) return;
    const set = new Set(ids);
    const withEx = stateRef.current.doc.booths.filter((b) => set.has(b.id) && b.exhibitorIds.length).map((b) => b.label);
    if (withEx.length) setDialog({ kind: "confirmDelete", ids, withExhibitors: withEx });
    else dispatch({ type: "delete", ids });
  }, []);
  const merge = React.useCallback((ids: string[]) => {
    const booths = stateRef.current.doc.booths.filter((b) => ids.includes(b.id));
    if (booths.length < 2) { toast("Select at least two booths to merge"); return; }
    if (new Set(booths.map((b) => b.levelId)).size > 1) { toast("Booths must be on the same level", "error"); return; }
    if (!mergePolygons(booths.map((b) => b.polygon))) { toast("Booths must touch or overlap to merge", "error"); return; }
    dispatch({ type: "mergeBooths", ids });
  }, []);
  const split = React.useCallback((ids: string[], axis: "h" | "v") => {
    const booths = stateRef.current.doc.booths.filter((b) => ids.includes(b.id));
    if (!booths.length) return;
    for (const b of booths) dispatch({ type: "splitBooth", id: b.id, axis });
  }, []);
  const renumber = React.useCallback((ids: string[]) => { if (ids.length) setDialog({ kind: "renumber", ids }); }, []);
  const zoomTo = React.useCallback((ids: string[]) => { const box = selectionBBox(stateRef.current.doc, ids); if (box) zoomToBox(box); }, [zoomToBox]);
  const pickBooth = React.useCallback((id: string, additive: boolean) => {
    dispatch({ type: "select", ids: [id], mode: additive ? "toggle" : "replace" });
    if (!additive) zoomTo([id]);
  }, [zoomTo]);

  const addLevel = React.useCallback(() => {
    const lv = newLevel(stateRef.current.doc);
    dispatch({ type: "addLevel", level: lv });
    setDialog({ kind: "level", id: lv.id });
    window.setTimeout(() => fitLevel(lv), 0);
  }, [fitLevel]);

  /* ---------------- wayfinding ---------------- */
  const onTestRoute = React.useCallback((from: Point, to: Point) => {
    const st = stateRef.current;
    const lvId = st.activeLevelId;
    try {
      const b = bundleFromDocument(bundle, st.doc);
      const graph = buildGraph(b);
      const r = findRoute(b, graph, { type: "point", levelId: lvId, x: from[0], y: from[1] }, { type: "point", levelId: lvId, x: to[0], y: to[1] });
      if (r.ok) {
        const res = r as RouteResult;
        setRoutePreview({ steps: res.steps.filter((s) => s.levelId === lvId).map((s) => s.points), from, to });
        setRouteInfo({ distanceM: res.distanceM, durationSeconds: res.durationSeconds });
      } else {
        setRoutePreview({ steps: [], from, to, error: r.error });
        setRouteInfo(null);
      }
    } catch (e) {
      setRoutePreview({ steps: [], from, to, error: e instanceof Error ? e.message : String(e) });
      setRouteInfo(null);
    }
  }, [bundle]);
  const startTestRoute = React.useCallback(() => { setToolState("path"); setOptionsState((o) => ({ ...o, testRoute: true })); setRoutePreview(null); }, []);
  const generate = React.useCallback(async (o: { cellSize: number; clearance: number }) => {
    const lvId = stateRef.current.activeLevelId;
    if (!(await save())) { toast("Save your changes first", "error"); return; }
    try {
      const r = await api<{ nodes: { id: string; x: number; y: number }[]; edges: { id: string; from: string; to: string; accessible: boolean; oneWay: boolean; virtual: boolean; weight: number }[]; stats: { nodes: number; edges: number } }>(`/api/v1/events/${event.id}/wayfinding/generate`, { method: "POST", json: { levelId: lvId, ...o } });
      if (!r.nodes.length) { toast("No walkable area found — add booths or walls first", "error"); return; }
      setGenerated({ levelId: lvId, nodes: r.nodes.map((n) => ({ id: n.id, levelId: lvId, x: n.x, y: n.y })), edges: r.edges.map((e) => ({ ...e, levelId: lvId })) });
      setToolState("path");
      toast(`Generated ${r.nodes.length} nodes and ${r.edges.length} edges — review, then Apply`, "success");
    } catch (e) {
      toast(`Generation failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }, [event.id, save]);
  const applyGenerated = React.useCallback(() => {
    if (!generated) return;
    dispatch({ type: "setLevelGraph", levelId: generated.levelId, nodes: generated.nodes, edges: generated.edges });
    setGenerated(null);
    toast("Path network applied", "success");
  }, [generated]);
  const onTransitionPick = React.useCallback((nodeId: string) => {
    const st = stateRef.current;
    const node = st.doc.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setTransitionDraft((d) => {
      if (!d.length) { toast("Now switch level and click the matching node"); return [nodeId]; }
      const first = st.doc.nodes.find((n) => n.id === d[0]);
      if (!first || first.levelId === node.levelId) { toast("Pick the second node on a different level"); return [nodeId]; }
      const tr = { id: clientId("tr"), name: "", kind: "stairs" as const, accessible: false, nodeIds: [d[0], nodeId], travelSeconds: 30 };
      dispatch({ type: "addTransition", transition: tr });
      toast("Transition created — set its kind and name", "success");
      return [];
    });
  }, []);

  /* ---------------- calibration ---------------- */
  const onCalibrate = React.useCallback((a: Point, b: Point) => setDialog({ kind: "calibrate", points: [a, b] }), []);
  const applyCalibration = React.useCallback((factor: number, anchor: Point) => {
    const lvId = calibrating;
    const lv = stateRef.current.doc.levels.find((l) => l.id === lvId);
    if (!lv?.background) return;
    const bg = lv.background;
    dispatch({ type: "updateLevel", id: lv.id, patch: { background: { ...bg, x: Math.round((anchor[0] - (anchor[0] - bg.x) * factor) * 1000) / 1000, y: Math.round((anchor[1] - (anchor[1] - bg.y) * factor) * 1000) / 1000, width: Math.round(bg.width * factor * 1000) / 1000, height: Math.round(bg.height * factor * 1000) / 1000 } } });
    setCalibrating(null);
    setDialog({ kind: "level", id: lv.id });
    toast("Background rescaled", "success");
  }, [calibrating]);

  /* ---------------- export ---------------- */
  const exportLevel = React.useCallback(async (format: "svg" | "png") => {
    const st = stateRef.current;
    const lv = st.doc.levels.find((l) => l.id === st.activeLevelId);
    if (!lv) return;
    const svg = levelToSvg(st.doc, lv, { colors, scale: 10, showLabels: true, showNetwork: layers.network.visible });
    const name = `${event.slug}-${lv.shortName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    if (format === "svg") { download(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`); return; }
    try {
      const blob = await rasterize(svg, lv.widthM * 10, lv.heightM * 10);
      download(blob, `${name}.png`);
    } catch (e) {
      toast(`PNG export failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }, [colors, event.slug, layers.network.visible]);

  /* ---------------- keyboard shortcuts ---------------- */
  const shortcutsRef = React.useRef({ setTool, requestDelete, merge, split, renumber, fitLevel, zoomBy, save, level, tool, selection });
  React.useEffect(() => { shortcutsRef.current = { setTool, requestDelete, merge, split, renumber, fitLevel, zoomBy, save, level, tool, selection }; });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector("[role=dialog]")) return;
      const h = shortcutsRef.current;
      const st = stateRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const sel = st.selection;
      const geomIds = () => { const s = getSelected(st.doc, sel); return [...s.booths.map((b) => b.id), ...s.elements.map((x) => x.id), ...s.nodes.map((n) => n.id)]; };
      const boothIds = () => getSelected(st.doc, sel).booths.map((b) => b.id);
      const levelIds = () => { const lv = st.activeLevelId; return [...st.doc.booths.filter((b) => b.levelId === lv).map((b) => b.id), ...st.doc.elements.filter((x) => x.levelId === lv).map((x) => x.id)]; };
      if (mod) {
        switch (key) {
          case "s": e.preventDefault(); void h.save(); return;
          case "z": e.preventDefault(); dispatch({ type: e.shiftKey ? "redo" : "undo" }); return;
          case "y": e.preventDefault(); dispatch({ type: "redo" }); return;
          case "a": e.preventDefault(); dispatch({ type: "select", ids: levelIds() }); return;
          case "d": e.preventDefault(); if (sel.length) dispatch({ type: "duplicate", ids: geomIds() }); return;
          case "c": if (sel.length) { e.preventDefault(); dispatch({ type: "copy", ids: sel }); } return;
          case "v": e.preventDefault(); dispatch({ type: "paste", levelId: st.activeLevelId }); return;
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") { if (sel.length) { e.preventDefault(); h.requestDelete(sel); } return; }
      if (e.key === "?" ) { setDialog({ kind: "shortcuts" }); return; }
      if (e.key.startsWith("Arrow")) {
        const ids = geomIds();
        if (!ids.length) return;
        e.preventDefault();
        const d = e.shiftKey ? 1 : 0.1;
        dispatch({ type: "move", ids, dx: e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0, dy: e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0 });
        return;
      }
      if (e.shiftKey && !e.altKey) {
        switch (key) {
          case "m": e.preventDefault(); h.merge(boothIds()); return;
          case "s": e.preventDefault(); h.split(boothIds(), "v"); return;
          case "r": e.preventDefault(); if (sel.length) dispatch({ type: "rotate", ids: geomIds(), deg: 90 }); return;
          case "h": e.preventDefault(); if (sel.length) dispatch({ type: "flip", ids: geomIds(), axis: "h" }); return;
          case "j": e.preventDefault(); if (sel.length) dispatch({ type: "flip", ids: geomIds(), axis: "v" }); return;
          case "n": e.preventDefault(); h.renumber(boothIds()); return;
        }
        return;
      }
      if (e.shiftKey && e.altKey && key === "s") { e.preventDefault(); h.split(boothIds(), "h"); return; }
      if (e.altKey) return;
      if (key === "f") { h.fitLevel(); return; }
      if (key === "1") { viewport.setScaleAt(10, sizeRef.current.w / 2, sizeRef.current.h / 2); return; }
      if (key === "+" || key === "=") { h.zoomBy(1.25); return; }
      if (key === "-") { h.zoomBy(0.8); return; }
      const toolId = TOOL_BY_KEY.get(key);
      if (toolId) { h.setTool(toolId); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewport]);

  /* ---------------- top bar handlers ---------------- */
  const preview = React.useCallback(async () => {
    const ok = await save();
    if (!ok) toast("Preview shows the last saved state", "info");
    window.open(`/e/${event.slug}?preview=1`, "_blank", "noopener");
  }, [save, event.slug]);

  const panelActions = React.useMemo<PanelActions>(() => ({ merge, split, renumber, requestDelete, zoomTo, setActiveLevel: selectLevel, startTestRoute, openGenerate: () => setDialog({ kind: "generate" }) }), [merge, split, renumber, requestDelete, zoomTo, selectLevel, startTestRoute]);
  const closeDialog = React.useCallback(() => setDialog({ kind: "none" }), []);
  const onArrayRect = React.useCallback((box: BBox) => setDialog({ kind: "array", box }), []);
  const existingLabels = React.useMemo(() => new Set(doc.booths.map((b) => b.label)), [doc.booths]);
  const dialogLevel = dialog.kind === "level" ? doc.levels.find((l) => l.id === dialog.id) ?? null : null;
  const hint = TOOLS.find((t) => t.id === tool)?.hint ?? "";

  if (!level) {
    return <div className="grid h-full place-items-center text-sm text-gray-500">This event has no levels. <button type="button" className="ml-2 text-primary underline" onClick={addLevel}>Add one</button></div>;
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-gray-50 text-gray-900">
      <TopBar
        eventId={event.id} eventName={event.name} eventSlug={event.slug}
        levels={doc.levels} activeLevelId={level.id} saveState={saveState}
        onSelectLevel={selectLevel} onAddLevel={addLevel} onLevelSettings={(id) => setDialog({ kind: "level", id })}
        onSave={() => void save()} onPreview={() => void preview()} onPublish={() => setDialog({ kind: "publish" })}
        onImportCsv={() => setDialog({ kind: "csv" })} onImportSvg={() => setDialog({ kind: "svg" })}
        onExportPng={() => void exportLevel("png")} onExportSvg={() => void exportLevel("svg")}
        onGenerate={() => setDialog({ kind: "generate" })} onTestRoute={startTestRoute} onHelp={() => setDialog({ kind: "shortcuts" })}
      />
      <div className="flex min-h-0 flex-1">
        <Toolbar
          tool={tool} setTool={setTool}
          canUndo={state.past.length > 0} canRedo={state.future.length > 0}
          onUndo={() => dispatch({ type: "undo" })} onRedo={() => dispatch({ type: "redo" })}
          showGrid={showGrid} snap={snap} onToggleGrid={() => setShowGrid((g) => !g)} onToggleSnap={() => setSnap((s) => !s)}
          onZoomIn={() => zoomBy(1.25)} onZoomOut={() => zoomBy(0.8)} onFit={() => fitLevel()}
        />
        <LayersPanel layers={layers} setLayer={setLayer} booths={levelBooths} levelName={level.shortName} selection={selection} colors={colors} exhibitorNames={exhibitorNames} onPick={pickBooth} />
        <div className="relative min-w-0 flex-1">
          <Canvas
            doc={doc} level={level} selection={selection} tool={tool} layers={layers}
            showGrid={showGrid} gridSize={gridSize} snapGrid={snap} snapObjects={snap}
            colors={colors} exhibitorNames={exhibitorNamesJoined} options={options} viewport={viewport} dispatch={dispatch}
            onArrayRect={onArrayRect} transitionDraft={transitionDraft} onTransitionPick={onTransitionPick}
            routePreview={routePreview} onTestRoute={onTestRoute}
            generatedPreview={generated && generated.levelId === level.id ? generated : null}
            calibrate={calibrating === level.id} onCalibrate={onCalibrate}
            onCursor={onCursor} onSize={onSize}
          />
          {calibrating === level.id && (
            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white shadow">Calibration: click two points on the background image, then enter the real distance. Esc cancels.</div>
          )}
          {options.testRoute && tool === "path" && (
            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-green-600 px-3 py-1 text-xs font-medium text-white shadow">Test route: click a start point, then a destination.</div>
          )}
        </div>
        <PropertiesPanel
          doc={doc} selection={selection} activeLevelId={level.id} dispatch={dispatch}
          exhibitorNames={exhibitorNames} colors={colors} currency={event.settings.sales.currency}
          tool={tool} options={options} setOptions={setOptions}
          routePreview={routePreview} routeInfo={routeInfo} transitionDraft={transitionDraft}
          generatedPreview={generated && generated.levelId === level.id ? generated : null} onApplyGenerated={applyGenerated} onDiscardGenerated={() => setGenerated(null)}
          actions={panelActions}
        />
      </div>
      <StatusBar cursor={cursorStore} scale={viewport.vp.scale} selectionCount={selection.length} level={level} dirty={dirty} hint={hint} gridSize={gridSize} setGridSize={setGridSize} />

      {/* ---------------- dialogs ---------------- */}
      <ArrayDialog box={dialog.kind === "array" ? dialog.box : null} existingLabels={existingLabels} onClose={() => { closeDialog(); setToolState("select"); }} onApply={(r) => { dispatch({ type: "array", levelId: level.id, opts: r.opts, template: { boothType: r.boothType } }); setToolState("select"); }} />
      <LevelSettingsDialog
        level={dialogLevel} levels={doc.levels} onClose={closeDialog}
        onPatch={(id, patch) => dispatch({ type: "updateLevel", id, patch })}
        onReorder={(ids) => dispatch({ type: "reorderLevels", ids })}
        onDelete={(id) => setDialog({ kind: "confirmDeleteLevel", id })}
        onCalibrate={(id) => { closeDialog(); selectLevel(id); setCalibrating(id); setToolState("select"); }}
      />
      <CalibrateDialog points={dialog.kind === "calibrate" ? dialog.points : null} onClose={() => { closeDialog(); setCalibrating(null); }} onApply={applyCalibration} />
      <PublishDialog open={dialog.kind === "publish"} eventId={event.id} slug={event.slug} onClose={closeDialog} beforePublish={save} />
      <CsvImportDialog open={dialog.kind === "csv"} eventId={event.id} onClose={closeDialog} beforeImport={save} />
      <SvgImportDialog open={dialog.kind === "svg"} level={level} onClose={closeDialog} onApply={(booths) => {
        dispatch({ type: "addBooths", booths: booths.map((b, i) => ({ id: clientId("bo"), levelId: level.id, label: b.label, externalId: null, polygon: b.polygon, boothType: "standard", status: "available", priceCents: null, colors: null, labelHidden: false, height3d: null, notes: null, metadata: {}, exhibitorIds: [], sortIndex: doc.booths.length + i })) });
        toast(`Added ${booths.length} booths`, "success");
      }} />
      <RenumberDialog open={dialog.kind === "renumber"} count={dialog.kind === "renumber" ? dialog.ids.length : 0} onClose={closeDialog} onApply={(opts) => { if (dialog.kind === "renumber") dispatch({ type: "renumber", ids: dialog.ids, opts }); }} />
      <GenerateDialog open={dialog.kind === "generate"} level={level} hasNetwork={doc.nodes.some((n) => n.levelId === level.id)} onClose={closeDialog} onGenerate={generate} />
      <ShortcutsDialog open={dialog.kind === "shortcuts"} onClose={closeDialog} />
      <ConfirmDialog
        open={dialog.kind === "confirmDelete"} title="Delete booths with exhibitors?" danger confirmLabel="Delete" onClose={closeDialog}
        message={dialog.kind === "confirmDelete" ? <p>{dialog.withExhibitors.length === 1 ? `Booth ${dialog.withExhibitors[0]} has` : `${dialog.withExhibitors.length} booths (${dialog.withExhibitors.slice(0, 5).join(", ")}${dialog.withExhibitors.length > 5 ? "…" : ""}) have`} an exhibitor assigned. Deleting removes the assignment and any hold or order on the booth.</p> : null}
        onConfirm={() => { if (dialog.kind === "confirmDelete") dispatch({ type: "delete", ids: dialog.ids }); }}
      />
      <ConfirmDialog
        open={dialog.kind === "confirmDeleteLevel"} title="Delete level?" danger confirmLabel="Delete level" onClose={closeDialog}
        message={dialog.kind === "confirmDeleteLevel" ? (() => { const lv = doc.levels.find((l) => l.id === dialog.id); const n = doc.booths.filter((b) => b.levelId === dialog.id).length; return <p>Delete <strong>{lv?.name}</strong> with its {n} booths, elements and path network? This cannot be undone after saving.</p>; })() : null}
        onConfirm={() => { if (dialog.kind === "confirmDeleteLevel") { dispatch({ type: "deleteLevel", id: dialog.id }); window.setTimeout(() => fitLevel(), 0); } }}
      />
    </div>
  );
}

/* ---------------- helpers ---------------- */

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function rasterize(svg: string, width: number, height: number): Promise<Blob> {
  const MAX = 8192;
  const k = Math.min(1, MAX / Math.max(width, height));
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * k);
      canvas.height = Math.round(height * k);
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Canvas unavailable")); return; }
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode PNG"))), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not render SVG")); };
    img.src = url;
  });
}

