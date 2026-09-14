/**
 * PlanMap: an imperative wrapper around a MapLibre map that renders a PlanBundle.
 * All interaction state (selection, hover, highlights, category colours) uses feature-state; data is only re-set on
 * level switches and bundle updates. Designed for thousands of booths without per-feature React state.
 */
import type { Map as MlMap, GeoJSONSource, ImageSource, MapMouseEvent, StyleSpecification, LngLatBoundsLike, MapGeoJSONFeature, Popup, ErrorEvent as MlErrorEvent } from "maplibre-gl";
import type { BoothStatus, BundleBooth, BundleLevel, PlanBundle, Point, RouteResult } from "@/lib/domain/types";
import { bbox, lngLatToPlan, type BBox } from "@/lib/domain/geometry";
import type { SdkCamera, SdkMarker } from "@/lib/sdk-protocol";
import {
  EMPTY_FC, backgroundCoordinates, buildBoothFeatures, buildBoothLabelFeatures, buildCircleFeatures, buildElementFeatures, buildMarkerFeatures,
  buildPositionFeature, buildRouteFeatures, cameraForPlanBBox, levelGeoref, levelPlanBBox, lngLatBounds, planBearing, pxPerUnitAtZ0, toLngLat, zoomBias,
  type BoothStyleInput, type CircleSpec, type LevelElementFeatures, type LngLat,
} from "./geojson";
import { buildIconSet, markerImageId, markerPinSvg, rasterizeSvg } from "./icons";
import { INTERACTIVE_LAYERS, LAYER, LAYER_GROUPS, SRC, blankStyle, fetchBasemapStyle, levelFilter, planLayers, type BasemapKind } from "./style";

export type Padding = { top: number; right: number; bottom: number; left: number };

export interface PlanMapCamera { lng: number; lat: number; zoom: number; bearing: number; pitch: number; x: number; y: number; levelId: string }

export interface PlanMapEvents {
  ready: () => void;
  error: (message: string) => void;
  boothClick: (boothId: string, lngLat: LngLat, plan: Point) => void;
  poiClick: (elementId: string, lngLat: LngLat) => void;
  zoneClick: (elementId: string, lngLat: LngLat) => void;
  markerClick: (markerId: string) => void;
  routePointClick: (toLevelId: string) => void;
  mapClick: (plan: Point, lngLat: LngLat) => void;
  cameraChanged: (camera: PlanMapCamera) => void;
  hoverBooth: (boothId: string | null) => void;
}

export interface PlanMapOptions {
  bundle: PlanBundle;
  levelId: string;
  theme: "light" | "dark";
  threeD: boolean;
  /** Use an OpenFreeMap basemap when the level is georeferenced. */
  basemap: BasemapKind | "none";
  initial?: { bearing?: number; zoom?: number; center?: Point };
  padding?: Partial<Padding>;
  reducedMotion?: boolean;
}

type Unsub = () => void;

export class PlanMap {
  private map: MlMap | null = null;
  private ml: typeof import("maplibre-gl") | null = null;
  private ready = false;
  private destroyed = false;
  private listeners: { [K in keyof PlanMapEvents]?: Set<PlanMapEvents[K]> } = {};
  private bundle: PlanBundle;
  private levelId: string;
  private theme: "light" | "dark";
  private threeD: boolean;
  private basemapKind: BasemapKind | "none";
  private padding: Padding = { top: 16, right: 16, bottom: 16, left: 16 };
  private reducedMotion: boolean;
  private container: HTMLElement;
  private initial: PlanMapOptions["initial"];

  private elementCache = new Map<string, LevelElementFeatures>();
  private boothCache = new Map<string, ReturnType<typeof buildBoothFeatures>>();
  private labelCache = new Map<string, ReturnType<typeof buildBoothLabelFeatures>>();
  private boothStyle: BoothStyleInput;

  private selected = new Set<string>();
  private highlighted = new Set<string>();
  private dimmed = new Set<string>();
  private catColors: Map<string, string> | null = null;
  private hovered: string | null = null;
  private route: RouteResult | null = null;
  private markers: SdkMarker[] = [];
  private circles: CircleSpec[] = [];
  private position: { levelId: string; x: number; y: number } | null = null;
  private groupVisibility = new Map<string, boolean>();
  private popup: Popup | null = null;
  private haloRaf = 0;
  private cameraTimer: ReturnType<typeof setTimeout> | null = null;
  private markerImages = new Set<string>();
  private hasIcons = false;

  constructor(container: HTMLElement, opts: PlanMapOptions) {
    this.container = container;
    this.bundle = opts.bundle;
    this.levelId = opts.levelId;
    this.theme = opts.theme;
    this.threeD = opts.threeD;
    this.basemapKind = opts.basemap;
    this.initial = opts.initial;
    this.reducedMotion = !!opts.reducedMotion;
    if (opts.padding) this.padding = { ...this.padding, ...opts.padding };
    this.boothStyle = boothStyleFromBundle(opts.bundle);
  }

  /* ---------------- events ---------------- */

  on<K extends keyof PlanMapEvents>(name: K, fn: PlanMapEvents[K]): Unsub {
    const bag = this.listeners as Record<string, Set<unknown> | undefined>;
    const set = (bag[name] ??= new Set<unknown>());
    set.add(fn);
    return () => { set.delete(fn); };
  }

  private emit<K extends keyof PlanMapEvents>(name: K, ...args: Parameters<PlanMapEvents[K]>) {
    const set = this.listeners[name] as Set<(...a: unknown[]) => void> | undefined;
    set?.forEach((fn) => {
      try { fn(...args); } catch (e) { console.error(e); }
    });
  }

  /* ---------------- lifecycle ---------------- */

  static supportsWebGL(): boolean {
    if (typeof document === "undefined") return false;
    try {
      const c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      return false;
    }
  }

  async init(): Promise<void> {
    if (this.destroyed) return;
    const ml = await import("maplibre-gl");
    if (this.destroyed) return;
    this.ml = ml;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const level = this.currentLevel();
    const g = levelGeoref(level);
    const bg = this.bundle.event.settings.branding.backgroundColor;
    let style: StyleSpecification | null = null;
    if (level.georef && this.basemapKind !== "none") style = await fetchBasemapStyle(this.basemapKind, origin);
    if (this.destroyed) return;
    const usingBasemap = !!style;
    if (!style) style = blankStyle(bg, origin);

    const size = this.viewport();
    const cam = cameraForPlanBBox(g, levelPlanBBox(level, this.bundle.booths), size, this.padding, 22);
    const center = this.initial?.center ? toLngLat(g, this.initial.center) : cam.center;
    const zoom = this.initial?.zoom ?? cam.zoom;
    const bearing = this.initial?.bearing ?? cam.bearing;

    const map = new ml.Map({
      container: this.container,
      style,
      center,
      zoom,
      bearing,
      pitch: this.threeD ? 55 : 0,
      minZoom: Math.max(1, cam.zoom - 4),
      maxZoom: 23.5,
      maxPitch: 70,
      attributionControl: usingBasemap ? { compact: true } : false,
      localIdeographFontFamily: "'Noto Sans CJK JP', 'Hiragino Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif",
      maxBounds: this.allLevelsBounds(),
      fadeDuration: 0,
      dragRotate: true,
      pitchWithRotate: true,
      touchPitch: true,
      canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true },
    });
    this.map = map;
    map.touchZoomRotate.disableRotation();

    map.on("error", (e: MlErrorEvent) => {
      const msg = (e as { error?: { message?: string } }).error?.message ?? "map error";
      // Missing glyph ranges / tiles are noisy but harmless.
      if (/glyph|tile|404|sprite/i.test(msg)) return;
      this.emit("error", msg);
    });

    await new Promise<void>((resolve) => {
      if (map.loaded()) resolve();
      else map.once("load", () => resolve());
    });
    if (this.destroyed) return;

    await this.addIcons();
    if (this.destroyed) return;
    this.addSources();
    this.addLayers();
    this.applyLevelData();
    this.applyOverlays();
    this.applyFeatureStates();
    this.wireInteractions();
    this.ready = true;
    this.emit("ready");
    this.emit("cameraChanged", this.getCamera());
  }

  destroy(): void {
    this.destroyed = true;
    if (this.haloRaf) cancelAnimationFrame(this.haloRaf);
    if (this.cameraTimer) clearTimeout(this.cameraTimer);
    this.popup?.remove();
    this.map?.remove();
    this.map = null;
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  resize(): void {
    this.map?.resize();
  }

  getMap(): MlMap | null {
    return this.map;
  }

  /* ---------------- setup ---------------- */

  private viewport() {
    return { width: this.container.clientWidth || 800, height: this.container.clientHeight || 600 };
  }

  private currentLevel(): BundleLevel {
    return this.bundle.levels.find((l) => l.id === this.levelId) ?? this.bundle.levels[0];
  }

  private allLevelsBounds(): LngLatBoundsLike {
    let sw: LngLat = [Infinity, Infinity], ne: LngLat = [-Infinity, -Infinity];
    for (const level of this.bundle.levels) {
      const [a, b] = lngLatBounds(levelGeoref(level), levelPlanBBox(level, this.bundle.booths), 1.0);
      sw = [Math.min(sw[0], a[0]), Math.min(sw[1], a[1])];
      ne = [Math.max(ne[0], b[0]), Math.max(ne[1], b[1])];
    }
    if (!Number.isFinite(sw[0])) return [[-1, -1], [1, 1]];
    return [sw, ne];
  }

  private async addIcons() {
    const map = this.map!;
    const { primaryColor, accentColor } = this.bundle.event.settings.branding;
    const icons = await buildIconSet({ primary: primaryColor, accent: accentColor });
    for (const icon of icons) {
      if (!map.hasImage(icon.id)) map.addImage(icon.id, icon.data, { pixelRatio: icon.pixelRatio });
    }
    this.hasIcons = icons.length > 0;
    map.on("styleimagemissing", (e) => {
      const id = e.id;
      if (map.hasImage(id)) return;
      // Unknown icon → generic pin so symbols still render.
      const fallback = map.hasImage("marker-pin") ? "marker-pin" : null;
      if (!fallback) return;
      void rasterizeSvg(markerPinSvg("#64748b", 56), 56).then((data) => { if (data && !map.hasImage(id)) map.addImage(id, data, { pixelRatio: 2 }); });
    });
  }

  private addSources() {
    const map = this.map!;
    const geo = (promote?: string) => ({ type: "geojson" as const, data: EMPTY_FC, ...(promote ? { promoteId: promote } : {}) });
    map.addSource(SRC.zones, geo("id"));
    map.addSource(SRC.zoneLabels, geo("id"));
    map.addSource(SRC.lines, geo());
    map.addSource(SRC.booths, geo("id"));
    map.addSource(SRC.boothLabels, geo("id"));
    map.addSource(SRC.pois, geo("id"));
    map.addSource(SRC.texts, geo());
    map.addSource(SRC.route, geo());
    map.addSource(SRC.routePoints, geo());
    map.addSource(SRC.markers, geo("id"));
    map.addSource(SRC.circles, geo("id"));
    map.addSource(SRC.position, geo());
  }

  private layerOptions() {
    const g = levelGeoref(this.currentLevel());
    const { primaryColor, accentColor, boothColors } = this.bundle.event.settings.branding;
    const dark = this.theme === "dark";
    return {
      zoomBias: zoomBias(g),
      pxPerUnitZ0: pxPerUnitAtZ0(g),
      accent: accentColor,
      primary: primaryColor,
      labelColor: boothColors.label,
      dimColor: dark ? "#374151" : "#e5e7eb",
      dark,
      levelId: this.levelId,
      threeD: this.threeD,
    };
  }

  private addLayers() {
    const map = this.map!;
    for (const layer of planLayers(this.layerOptions())) {
      if (!map.getLayer(layer.id)) map.addLayer(layer);
    }
    this.applyGroupVisibility();
    this.applyBackgroundColor();
  }

  private removeLayers() {
    const map = this.map!;
    for (const id of Object.values(LAYER)) if (map.getLayer(id)) map.removeLayer(id);
  }

  private applyBackgroundColor() {
    const map = this.map!;
    if (map.getLayer("tessera-background")) {
      const bg = this.theme === "dark" ? "#0b1220" : this.bundle.event.settings.branding.backgroundColor;
      map.setPaintProperty("tessera-background", "background-color", bg);
    }
  }

  /* ---------------- level data ---------------- */

  private levelElements(level: BundleLevel): LevelElementFeatures {
    let cached = this.elementCache.get(level.id);
    if (!cached) {
      cached = buildElementFeatures(level);
      this.elementCache.set(level.id, cached);
    }
    return cached;
  }

  private setSourceData(id: string, data: GeoJSON.FeatureCollection) {
    const src = this.map?.getSource(id) as GeoJSONSource | undefined;
    src?.setData(data);
  }

  private applyLevelData() {
    const map = this.map!;
    const level = this.currentLevel();
    const els = this.levelElements(level);
    let booths = this.boothCache.get(level.id);
    if (!booths) { booths = buildBoothFeatures(this.bundle, level.id, this.boothStyle); this.boothCache.set(level.id, booths); }
    let labels = this.labelCache.get(level.id);
    if (!labels) { labels = buildBoothLabelFeatures(this.bundle, level.id, this.boothStyle.labelColor); this.labelCache.set(level.id, labels); }
    this.setSourceData(SRC.zones, els.zones);
    this.setSourceData(SRC.zoneLabels, els.zoneLabels);
    this.setSourceData(SRC.lines, els.lines);
    this.setSourceData(SRC.pois, els.pois);
    this.setSourceData(SRC.texts, els.texts);
    this.setSourceData(SRC.booths, booths);
    this.setSourceData(SRC.boothLabels, labels);

    // Level-filtered overlay layers.
    const lf = levelFilter(level.id);
    for (const id of [LAYER.circlesFill, LAYER.circlesOutline, LAYER.routeCasing, LAYER.routeLine, LAYER.routeDash, LAYER.routePoints, LAYER.markers, LAYER.positionHalo, LAYER.positionDot]) {
      if (map.getLayer(id)) map.setFilter(id, lf);
    }

    // Background image.
    const coords = backgroundCoordinates(level);
    const existing = map.getSource(SRC.bg) as ImageSource | undefined;
    if (coords && level.background) {
      if (existing) existing.updateImage({ url: level.background.url, coordinates: coords });
      else map.addSource(SRC.bg, { type: "image", url: level.background.url, coordinates: coords });
      if (!map.getLayer(LAYER.bg)) map.addLayer({ id: LAYER.bg, type: "raster", source: SRC.bg, paint: { "raster-opacity": level.background.opacity ?? 1, "raster-fade-duration": 0 } }, LAYER.zonesFill);
      else map.setPaintProperty(LAYER.bg, "raster-opacity", level.background.opacity ?? 1);
    } else if (existing) {
      if (map.getLayer(LAYER.bg)) map.removeLayer(LAYER.bg);
      map.removeSource(SRC.bg);
    }
  }

  private applyOverlays() {
    const r = buildRouteFeatures(this.bundle, this.route);
    this.setSourceData(SRC.route, r.lines);
    this.setSourceData(SRC.routePoints, r.points);
    this.setSourceData(SRC.markers, buildMarkerFeatures(this.bundle, this.markers, this.levelId));
    this.setSourceData(SRC.circles, buildCircleFeatures(this.bundle, this.circles, this.levelId));
    this.setSourceData(SRC.position, buildPositionFeature(this.bundle, this.position));
    this.updateHalo();
  }

  private applyFeatureStates() {
    const map = this.map;
    if (!map) return;
    for (const b of this.bundle.booths) {
      const state: Record<string, unknown> = {
        selected: this.selected.has(b.id),
        highlighted: this.highlighted.has(b.id),
        dimmed: this.dimmed.has(b.id) || (!!this.catColors && !this.catColors.has(b.id)),
        catColor: this.catColors?.get(b.id) ?? null,
        hover: this.hovered === b.id,
      };
      map.setFeatureState({ source: SRC.booths, id: b.id }, state);
    }
  }

  private setBoothState(ids: Iterable<string>, state: Record<string, unknown>) {
    const map = this.map;
    if (!map || !this.ready) return;
    for (const id of ids) map.setFeatureState({ source: SRC.booths, id }, state);
  }

  /* ---------------- public state setters ---------------- */

  setBundle(bundle: PlanBundle): void {
    this.bundle = bundle;
    this.boothStyle = boothStyleFromBundle(bundle);
    this.elementCache.clear();
    this.boothCache.clear();
    this.labelCache.clear();
    if (!bundle.levels.some((l) => l.id === this.levelId)) this.levelId = bundle.levels[0]?.id ?? this.levelId;
    if (!this.ready) return;
    this.applyLevelData();
    this.applyOverlays();
    this.applyFeatureStates();
  }

  getLevelId(): string {
    return this.levelId;
  }

  setLevel(levelId: string, opts: { fit?: boolean } = {}): void {
    if (!this.bundle.levels.some((l) => l.id === levelId)) return;
    const changed = levelId !== this.levelId;
    this.levelId = levelId;
    if (!this.ready) return;
    if (changed) {
      this.popup?.remove();
      this.applyLevelData();
      this.applyOverlays();
      this.applyFeatureStates();
    }
    if (opts.fit) this.fitLevel();
  }

  setSelected(ids: string[]): void {
    const prev = this.selected;
    this.selected = new Set(ids);
    this.setBoothState([...prev].filter((id) => !this.selected.has(id)), { selected: false });
    this.setBoothState(this.selected, { selected: true });
  }

  setHighlighted(ids: string[]): void {
    const prev = this.highlighted;
    this.highlighted = new Set(ids);
    this.setBoothState([...prev].filter((id) => !this.highlighted.has(id)), { highlighted: false });
    this.setBoothState(this.highlighted, { highlighted: true });
  }

  /** Colour booths by category: map boothId → colour; every other booth is dimmed. `null` restores base colours. */
  setCategoryColors(colors: Map<string, string> | null): void {
    this.catColors = colors;
    if (!this.ready) return;
    this.applyFeatureStates();
  }

  setRoute(route: RouteResult | null): void {
    this.route = route;
    if (!this.ready) return;
    const r = buildRouteFeatures(this.bundle, route);
    this.setSourceData(SRC.route, r.lines);
    this.setSourceData(SRC.routePoints, r.points);
  }

  async setMarkers(markers: SdkMarker[]): Promise<void> {
    this.markers = markers;
    if (!this.ready || !this.map) return;
    const map = this.map;
    for (const m of markers) {
      if (m.icon || !m.color) continue;
      const id = markerImageId(m.color);
      if (this.markerImages.has(id) || map.hasImage(id)) continue;
      this.markerImages.add(id);
      const data = await rasterizeSvg(markerPinSvg(m.color, 56), 56);
      if (data && !map.hasImage(id)) map.addImage(id, data, { pixelRatio: 2 });
    }
    const fc = buildMarkerFeatures(this.bundle, markers, this.levelId);
    for (const f of fc.features) if (!f.properties.icon.startsWith("poi-") && f.properties.color) f.properties.icon = markerImageId(f.properties.color);
    this.setSourceData(SRC.markers, fc);
  }

  setCircles(circles: CircleSpec[]): void {
    this.circles = circles;
    if (!this.ready) return;
    this.setSourceData(SRC.circles, buildCircleFeatures(this.bundle, circles, this.levelId));
  }

  setPosition(pos: { levelId: string; x: number; y: number } | null): void {
    this.position = pos;
    if (!this.ready) return;
    this.setSourceData(SRC.position, buildPositionFeature(this.bundle, pos));
    this.updateHalo();
  }

  private updateHalo() {
    if (this.haloRaf) cancelAnimationFrame(this.haloRaf);
    this.haloRaf = 0;
    const map = this.map;
    if (!map || !this.position || this.reducedMotion) return;
    const start = performance.now();
    const tick = (t: number) => {
      if (this.destroyed || !this.position || !map.getLayer(LAYER.positionHalo)) return;
      const phase = ((t - start) % 1800) / 1800;
      map.setPaintProperty(LAYER.positionHalo, "circle-radius", 10 + phase * 18);
      map.setPaintProperty(LAYER.positionHalo, "circle-opacity", 0.45 * (1 - phase));
      this.haloRaf = requestAnimationFrame(tick);
    };
    this.haloRaf = requestAnimationFrame(tick);
  }

  set3D(on: boolean): void {
    this.threeD = on;
    if (!this.map || !this.ready) return;
    this.applyGroupVisibility();
    this.map.easeTo({ pitch: on ? 55 : 0, duration: this.reducedMotion ? 0 : 600 });
  }

  is3D(): boolean {
    return this.threeD;
  }

  setTheme(theme: "light" | "dark"): void {
    if (theme === this.theme) return;
    this.theme = theme;
    if (!this.map || !this.ready) return;
    this.removeLayers();
    this.addLayers();
    this.applyLevelData();
  }

  setLayerGroupVisibility(group: string, visible: boolean): boolean {
    if (!LAYER_GROUPS[group]) return false;
    this.groupVisibility.set(group, visible);
    this.applyGroupVisibility();
    return true;
  }

  getLayerGroups(): string[] {
    return Object.keys(LAYER_GROUPS);
  }

  private applyGroupVisibility() {
    const map = this.map;
    if (!map) return;
    const hidden = new Set<string>();
    for (const [group, visible] of this.groupVisibility) if (!visible) for (const id of LAYER_GROUPS[group] ?? []) hidden.add(id);
    if (!this.threeD) { hidden.add(LAYER.zones3d); hidden.add(LAYER.booths3d); }
    for (const id of Object.values(LAYER)) {
      if (!map.getLayer(id)) continue;
      map.setLayoutProperty(id, "visibility", hidden.has(id) ? "none" : "visible");
    }
  }

  setPadding(p: Partial<Padding>): void {
    this.padding = { ...this.padding, ...p };
  }

  /* ---------------- camera ---------------- */

  private duration(ms: number) {
    return this.reducedMotion ? 0 : ms;
  }

  fitLevel(opts: { animate?: boolean } = {}): void {
    const map = this.map;
    if (!map) return;
    const level = this.currentLevel();
    const cam = cameraForPlanBBox(levelGeoref(level), levelPlanBBox(level, this.bundle.booths), this.viewport(), this.padding, 22);
    const target = { center: cam.center, zoom: cam.zoom, bearing: cam.bearing, pitch: this.threeD ? 55 : 0 };
    if (opts.animate === false || !this.ready) map.jumpTo(target);
    else map.easeTo({ ...target, duration: this.duration(700) });
  }

  /** Fit a plan-space bbox on the current level. */
  fitPlanBBox(b: BBox, padding: number | Padding = 60, maxZoom = 21.5): void {
    const map = this.map;
    if (!map) return;
    const g = levelGeoref(this.currentLevel());
    const pad = typeof padding === "number"
      ? { top: this.padding.top + padding, right: this.padding.right + padding, bottom: this.padding.bottom + padding, left: this.padding.left + padding }
      : padding;
    const cam = cameraForPlanBBox(g, b, this.viewport(), pad, maxZoom + zoomBias(g));
    map.easeTo({ center: cam.center, zoom: cam.zoom, bearing: cam.bearing, duration: this.duration(700) });
  }

  /** Zoom to a set of booths (switches level to the first booth's level). */
  zoomToBooths(booths: BundleBooth[], padding = 80): void {
    if (!booths.length) return;
    const levelId = booths[0].levelId;
    const same = booths.filter((b) => b.levelId === levelId);
    if (levelId !== this.levelId) this.setLevel(levelId);
    const b = bbox(same.flatMap((x) => x.polygon));
    const w = b.maxX - b.minX, h = b.maxY - b.minY;
    // Ensure a minimum extent so a single small booth doesn't zoom to the max.
    const min = 30;
    if (w < min) { const cx = (b.minX + b.maxX) / 2; b.minX = cx - min / 2; b.maxX = cx + min / 2; }
    if (h < min) { const cy = (b.minY + b.maxY) / 2; b.minY = cy - min / 2; b.maxY = cy + min / 2; }
    this.fitPlanBBox(b, padding, 21.5);
  }

  flyToPlan(levelId: string, p: Point, opts: { zoom?: number; minZoom?: number } = {}): void {
    const map = this.map;
    if (!map) return;
    if (levelId !== this.levelId) this.setLevel(levelId);
    const g = levelGeoref(this.currentLevel());
    const zoom = opts.zoom ?? Math.max(map.getZoom(), (opts.minZoom ?? 19.5) + zoomBias(g));
    map.easeTo({ center: toLngLat(g, p), zoom, bearing: planBearing(g), duration: this.duration(700) });
  }

  zoomIn(): void { this.map?.zoomIn({ duration: this.duration(300) }); }
  zoomOut(): void { this.map?.zoomOut({ duration: this.duration(300) }); }

  getCamera(): PlanMapCamera {
    const map = this.map;
    const level = this.currentLevel();
    if (!map) return { lng: 0, lat: 0, zoom: 0, bearing: 0, pitch: 0, x: 0, y: 0, levelId: level.id };
    const c = map.getCenter();
    const [x, y] = lngLatToPlan([c.lng, c.lat], levelGeoref(level));
    return { lng: c.lng, lat: c.lat, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), x, y, levelId: level.id };
  }

  setCamera(cam: SdkCamera): void {
    const map = this.map;
    if (!map) return;
    if (cam.levelId && cam.levelId !== this.levelId) this.setLevel(cam.levelId);
    const g = levelGeoref(this.currentLevel());
    const target: { center?: LngLat; zoom?: number; bearing?: number; pitch?: number; duration: number } = { duration: this.duration(cam.durationMs ?? 600) };
    if (typeof cam.x === "number" && typeof cam.y === "number") target.center = toLngLat(g, [cam.x, cam.y]);
    else if (typeof cam.lng === "number" && typeof cam.lat === "number") target.center = [cam.lng, cam.lat];
    if (typeof cam.zoom === "number") target.zoom = cam.zoom;
    if (typeof cam.bearing === "number") target.bearing = cam.bearing;
    if (typeof cam.pitch === "number") target.pitch = cam.pitch;
    map.easeTo(target);
  }

  planBearing(): number {
    return planBearing(levelGeoref(this.currentLevel()));
  }

  convertToGeo(x: number, y: number, levelId?: string): LngLat {
    const level = (levelId && this.bundle.levels.find((l) => l.id === levelId)) || this.currentLevel();
    return toLngLat(levelGeoref(level), [x, y]);
  }

  convertFromGeo(lng: number, lat: number, levelId?: string): Point {
    const level = (levelId && this.bundle.levels.find((l) => l.id === levelId)) || this.currentLevel();
    return lngLatToPlan([lng, lat], levelGeoref(level));
  }

  /** Plan-space bounds of the current viewport. */
  getViewportPlanBounds(): BBox | null {
    const map = this.map;
    if (!map) return null;
    const b = map.getBounds();
    const g = levelGeoref(this.currentLevel());
    const pts: Point[] = [lngLatToPlan([b.getWest(), b.getNorth()], g), lngLatToPlan([b.getEast(), b.getNorth()], g), lngLatToPlan([b.getEast(), b.getSouth()], g), lngLatToPlan([b.getWest(), b.getSouth()], g)];
    return bbox(pts);
  }

  toDataURL(): string | null {
    try {
      return this.map?.getCanvas().toDataURL("image/png") ?? null;
    } catch {
      return null;
    }
  }

  /* ---------------- popups ---------------- */

  showPopup(lngLat: LngLat, html: string): void {
    const ml = this.ml, map = this.map;
    if (!ml || !map) return;
    this.popup?.remove();
    this.popup = new ml.Popup({ closeButton: true, closeOnClick: true, maxWidth: "260px", className: "tessera-popup" }).setLngLat(lngLat).setHTML(html).addTo(map);
  }

  hidePopup(): void {
    this.popup?.remove();
    this.popup = null;
  }

  /* ---------------- interactions ---------------- */

  private wireInteractions() {
    const map = this.map!;
    const canvas = map.getCanvas();

    map.on("mousemove", (e: MapMouseEvent) => {
      const hits = this.query(e.point);
      const booth = hits.find((f) => f.layer.id === LAYER.boothsFill);
      const id = booth ? String(booth.properties.id) : null;
      canvas.style.cursor = hits.length ? "pointer" : "";
      if (id !== this.hovered) {
        if (this.hovered) this.setBoothState([this.hovered], { hover: false });
        this.hovered = id;
        if (id) this.setBoothState([id], { hover: true });
        this.emit("hoverBooth", id);
      }
    });
    map.on("mouseout", () => {
      if (this.hovered) { this.setBoothState([this.hovered], { hover: false }); this.hovered = null; this.emit("hoverBooth", null); }
    });

    map.on("click", (e: MapMouseEvent) => {
      const hits = this.query(e.point);
      const lngLat: LngLat = [e.lngLat.lng, e.lngLat.lat];
      const plan = this.convertFromGeo(lngLat[0], lngLat[1]);
      const pick = (layer: string) => hits.find((f) => f.layer.id === layer);
      const marker = pick(LAYER.markers);
      if (marker) return this.emit("markerClick", String(marker.properties.id));
      const rp = pick(LAYER.routePoints);
      if (rp && (rp.properties.role === "transition" || rp.properties.role === "arrival")) return this.emit("routePointClick", String(rp.properties.toLevelId));
      const poi = pick(LAYER.pois);
      if (poi) return this.emit("poiClick", String(poi.properties.id), lngLat);
      const booth = pick(LAYER.boothsFill);
      if (booth) return this.emit("boothClick", String(booth.properties.id), lngLat, plan);
      const zone = pick(LAYER.zonesFill);
      if (zone) return this.emit("zoneClick", String(zone.properties.id), lngLat);
      this.emit("mapClick", plan, lngLat);
    });

    const onMove = () => {
      if (this.cameraTimer) return;
      this.cameraTimer = setTimeout(() => { this.cameraTimer = null; if (!this.destroyed) this.emit("cameraChanged", this.getCamera()); }, 150);
    };
    map.on("move", onMove);
    map.on("moveend", () => { if (this.cameraTimer) { clearTimeout(this.cameraTimer); this.cameraTimer = null; } if (!this.destroyed) this.emit("cameraChanged", this.getCamera()); });
  }

  private query(point: { x: number; y: number }): MapGeoJSONFeature[] {
    const map = this.map;
    if (!map) return [];
    const layers = INTERACTIVE_LAYERS.filter((id) => map.getLayer(id));
    try {
      return map.queryRenderedFeatures([[point.x - 3, point.y - 3], [point.x + 3, point.y + 3]], { layers });
    } catch {
      return [];
    }
  }
}

export function boothStyleFromBundle(bundle: PlanBundle): BoothStyleInput {
  const { branding, features } = bundle.event.settings;
  const c = branding.boothColors;
  const statusColors: Record<BoothStatus, string> = { available: c.available, held: c.held, reserved: c.reserved, sold: c.sold, unavailable: c.unavailable };
  return { showAvailability: features.showAvailability, statusColors, neutralColor: c.sold, sponsorColor: c.sponsor, borderColor: c.border, labelColor: c.label };
}
