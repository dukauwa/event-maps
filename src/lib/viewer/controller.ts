/**
 * ViewerController: the single source of truth for the public viewer.
 *
 * Holds the bundle + all interaction state as an immutable snapshot (React reads it through
 * `useSyncExternalStore`), pushes changes into the imperative {@link PlanMap}, writes deep-link state into the URL,
 * records analytics and implements EVERY method in `SDK_METHODS` (ExpoFP semantics) so the embed bridge can simply
 * dispatch by name. Emits every `SDK_EVENTS` name via `on()`.
 *
 * Map-dependent calls made before the map is ready are queued and replayed once it is.
 */
import type {
  BundleBooth, BundleCategory, BundleElement, BundleExhibitor, BundleLevel, BundleSession, PlanBundle, Point, RouteEndpoint, RouteResult, RouteStep,
} from "@/lib/domain/types";
import { bbox, lngLatToPlan, planToLngLat, type BBox } from "@/lib/domain/geometry";
import { buildGraph, findRoute, optimizeRoute, resolveEndpoint, type OptimizedRoute, type RoutingGraph } from "@/lib/routing";
import { SDK_METHODS, SDK_PROTOCOL_VERSION, type SdkCamera, type SdkEvent, type SdkMarker, type SdkMethod, type ViewerParams } from "@/lib/sdk-protocol";
import { boothRect, levelGeoref, type CircleSpec } from "@/lib/map/geojson";
import type { PlanMap, PlanMapCamera } from "@/lib/map/plan-map";
import { isLocale, resolveLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/domain/types";
import type { AnalyticsClient } from "./analytics";
import { bookmarkKey, loadBookmarkState, saveBookmarkState, splitBookmarkKey, toggleIn, type BookmarkKind } from "./bookmarks";
import { buildSearchIndex, defaultStartElement, findBooth, findCategory, findElementById, findExhibitor, findLevel, findSession, type SearchIndex, type SearchResult } from "./search";
import { HIDE_TARGETS, mergeViewerParams, parseHide, parseList, parseNumber, parsePosition, parseRouteParam, parseViewerParams, writeUrl, type HideTarget } from "./url-state";

/* ------------------------------------------------------------------ */
/* State                                                                */
/* ------------------------------------------------------------------ */

export type ViewerTab = "exhibitors" | "categories" | "sessions" | "plan";

export type PanelView =
  | { kind: "list" }
  | { kind: "exhibitor"; id: string }
  | { kind: "booth"; id: string }
  | { kind: "session"; id: string }
  | { kind: "poi"; id: string }
  | { kind: "directions" };

export type ViewerDialog =
  | null
  | { kind: "share"; url: string; title: string }
  | { kind: "qr"; url: string; title: string }
  | { kind: "language" };

export interface ViewerVisibility { controls: boolean; levels: boolean; header: boolean; overlay: boolean; searchButtons: boolean }

export interface RouteRequest { from: RouteEndpoint | null; to: RouteEndpoint; via: RouteEndpoint[]; accessible: boolean }

export interface ViewerPosition { levelId: string; x: number; y: number }

export interface ViewerState {
  bundle: PlanBundle;
  locale: Locale;
  theme: "light" | "dark";
  view: "2d" | "3d";
  kiosk: boolean;
  embed: boolean;
  noOverlay: boolean;
  offHistory: boolean;
  preview: boolean;
  debugCoords: boolean;
  visibility: ViewerVisibility;
  tab: ViewerTab;
  panel: PanelView;
  /** Mobile: sheet expanded; desktop: panel shown. */
  panelOpen: boolean;
  searchQuery: string;
  searchFocused: boolean;
  levelId: string;
  selectedBoothIds: string[];
  selectedExhibitorId: string | null;
  categoryIds: string[];
  routeRequest: RouteRequest | null;
  route: RouteResult | null;
  routeError: string | null;
  optimized: OptimizedRoute | null;
  position: ViewerPosition | null;
  gpsTracking: boolean;
  bookmarks: string[];
  visited: string[];
  markers: SdkMarker[];
  circles: CircleSpec[];
  highlightedBoothIds: string[];
  layerVisibility: Record<string, boolean>;
  camera: PlanMapCamera | null;
  mapReady: boolean;
  mapError: string | null;
  dialog: ViewerDialog;
  notice: string | null;
  /** Bumps whenever the bundle object is replaced (search index, graph, memoised lists). */
  bundleRevision: number;
}

export interface ControllerOptions {
  bundle: PlanBundle;
  params?: ViewerParams;
  /** Event slug used in URLs (`/e/{slug}`). */
  slug: string;
  analytics?: AnalyticsClient | null;
  browserLanguages?: readonly string[];
  /** Absolute origin for share links (defaults to `window.location.origin`). */
  origin?: string;
  isEmbedded?: boolean;
}

type Listener = () => void;
type EventHandler = (payload: unknown) => void;
type Unsub = () => void;

const DEFAULT_VISIBILITY: ViewerVisibility = { controls: true, levels: true, header: true, overlay: true, searchButtons: true };
const MAX_ROUTE_WAYPOINTS = 10;

function endpointFromBooth(b: BundleBooth): RouteEndpoint { return { type: "booth", id: b.id }; }

/* ------------------------------------------------------------------ */
/* Controller                                                           */
/* ------------------------------------------------------------------ */

export class ViewerController {
  private state: ViewerState;
  private listeners = new Set<Listener>();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private map: PlanMap | null = null;
  private mapQueue: (() => void)[] = [];
  private mapUnsubs: Unsub[] = [];
  private searchIndex: SearchIndex | null = null;
  private graph: RoutingGraph | null = null;
  private analytics: AnalyticsClient | null;
  private urlTimer: ReturnType<typeof setTimeout> | null = null;
  private stateTimer: ReturnType<typeof setTimeout> | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private gpsWatch: number | null = null;
  private lastSynced: Partial<ViewerState> = {};
  private syncing = false;
  private resyncQueued = false;
  private lastNotice = 0;
  readonly slug: string;
  readonly origin: string;
  readonly initialParams: ViewerParams;
  private readonly initialLocale: Locale;
  private readonly initialCamera: { bearing?: number; zoom?: number; center?: Point };
  private destroyed = false;

  constructor(opts: ControllerOptions) {
    const params = opts.params ?? {};
    const bundle = opts.bundle;
    const s = bundle.event.settings;
    this.slug = opts.slug;
    this.origin = opts.origin ?? (typeof window !== "undefined" ? window.location.origin : "");
    this.analytics = opts.analytics ?? null;
    this.initialParams = params;
    const locale = resolveLocale({ requested: params.lang, eventLocale: s.locale, eventLanguages: s.languages, browserLanguages: opts.browserLanguages });
    this.initialLocale = resolveLocale({ eventLocale: s.locale, eventLanguages: s.languages });
    const hide = parseHide(params.hide);
    const noOverlay = params.noOverlay === "1" || hide.has("overlay");
    const level = (params.level && findLevel(bundle, params.level)) || bundle.levels[0];
    const saved = loadBookmarkState(bundle.event.id);
    const kiosk = params.kiosk === "1";
    const prefersDark = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    this.initialCamera = { bearing: parseNumber(params.bearing), zoom: parseNumber(params.zoom), center: parsePlanPoint(params.center) };
    this.state = {
      bundle,
      locale,
      theme: params.theme ?? (prefersDark && !params.embed ? "dark" : "light"),
      view: params.view === "3d" && s.features.threeD ? "3d" : "2d",
      kiosk,
      embed: params.embed === "1" || !!opts.isEmbedded,
      noOverlay,
      offHistory: params.offHistory === "1",
      preview: params.preview === "1",
      debugCoords: typeof window !== "undefined" && /[?&]debug=coords/.test(window.location.search),
      visibility: { ...DEFAULT_VISIBILITY, controls: !hide.has("controls"), levels: !hide.has("levels"), header: !hide.has("header"), overlay: !noOverlay, searchButtons: !hide.has("searchButtons") },
      tab: params.tab ?? "exhibitors",
      panel: { kind: "list" },
      panelOpen: !noOverlay,
      searchQuery: params.search ?? "",
      searchFocused: false,
      levelId: level?.id ?? "",
      selectedBoothIds: [],
      selectedExhibitorId: null,
      categoryIds: [],
      routeRequest: null,
      route: null,
      routeError: null,
      optimized: null,
      position: null,
      gpsTracking: false,
      bookmarks: saved.bookmarks,
      visited: saved.visited,
      markers: [],
      circles: [],
      highlightedBoothIds: [],
      layerVisibility: {},
      camera: null,
      mapReady: false,
      mapError: null,
      dialog: null,
      notice: null,
      bundleRevision: 0,
    };
    this.applyParameters(params, { initial: true });
    this.analytics?.track("view", { levelId: this.state.levelId, meta: { kiosk, embed: this.state.embed, lang: locale } });
  }

  /* ---------------- store ---------------- */

  /** Current immutable snapshot (stable identity between changes; safe for `useSyncExternalStore`). */
  snapshot = (): ViewerState => this.state;

  subscribe = (fn: Listener): Unsub => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  private setState(patch: Partial<ViewerState>): void {
    if (this.destroyed) return;
    let changed = false;
    for (const k of Object.keys(patch) as (keyof ViewerState)[]) if (patch[k] !== this.state[k]) { changed = true; break; }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => { try { l(); } catch (e) { console.error(e); } });
    this.syncMap();
    this.scheduleUrl();
    this.scheduleStateChanged();
  }

  get bundle(): PlanBundle { return this.state.bundle; }

  destroy(): void {
    this.destroyed = true;
    this.detachMap();
    if (this.urlTimer) clearTimeout(this.urlTimer);
    if (this.stateTimer) clearTimeout(this.stateTimer);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.stopGps();
    this.listeners.clear();
    this.eventHandlers.clear();
  }

  /* ---------------- SDK events ---------------- */

  on(name: SdkEvent | "*", fn: EventHandler): Unsub {
    let set = this.eventHandlers.get(name);
    if (!set) { set = new Set(); this.eventHandlers.set(name, set); }
    set.add(fn);
    return () => { set?.delete(fn); };
  }

  emit(name: SdkEvent, payload: unknown): void {
    this.eventHandlers.get(name)?.forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } });
    this.eventHandlers.get("*")?.forEach((fn) => { try { fn({ name, payload }); } catch (e) { console.error(e); } });
  }

  private scheduleStateChanged() {
    if (this.stateTimer) return;
    this.stateTimer = setTimeout(() => { this.stateTimer = null; if (!this.destroyed) this.emit("stateChanged", this.getState()); }, 50);
  }

  /* ---------------- map binding ---------------- */

  /** Camera hints from `?bearing=&zoom=&center=` for map creation. */
  getInitialCamera() { return this.initialCamera; }

  attachMap(map: PlanMap): void {
    this.detachMap();
    this.map = map;
    this.mapUnsubs.push(
      map.on("ready", () => {
        this.lastSynced = {};
        this.setState({ mapReady: true, mapError: null });
        this.syncMap(true);
        const q = this.mapQueue.splice(0);
        for (const fn of q) { try { fn(); } catch (e) { console.error(e); } }
        this.emit("init", { version: this.state.bundle.version });
        this.emit("fpConfigured", this.fpConfiguredPayload());
        this.emit("ready", { version: this.state.bundle.version });
      }),
      map.on("error", (message) => { this.setState({ mapError: message }); this.emit("error", { message }); }),
      map.on("boothClick", (id, lngLat, plan) => this.handleBoothClick(id, plan, lngLat)),
      map.on("poiClick", (id) => this.openPoi(id)),
      map.on("zoneClick", (id) => this.openPoi(id)),
      map.on("markerClick", (id) => this.selectMarker(id, false)),
      map.on("routePointClick", (toLevelId) => this.activateFloor(toLevelId)),
      map.on("mapClick", (plan, lngLat) => {
        if (this.state.debugCoords) this.emit("getCoordsClick", { x: round2(plan[0]), y: round2(plan[1]), levelId: this.state.levelId, lng: lngLat[0], lat: lngLat[1] });
        if (this.state.panel.kind !== "list" && this.state.panel.kind !== "directions" && !this.state.kiosk) this.closePanel();
      }),
      map.on("cameraChanged", (camera) => { this.setState({ camera }); this.emit("cameraChanged", camera); }),
    );
    if (map.isReady()) {
      this.setState({ mapReady: true });
      this.syncMap(true);
      const q = this.mapQueue.splice(0);
      for (const fn of q) fn();
    }
  }

  detachMap(): void {
    for (const u of this.mapUnsubs) u();
    this.mapUnsubs = [];
    this.map = null;
    this.lastSynced = {};
    if (!this.destroyed) this.setState({ mapReady: false });
  }

  private withMap(fn: (map: PlanMap) => void): void {
    if (this.map && this.state.mapReady) fn(this.map);
    else this.mapQueue.push(() => { if (this.map) fn(this.map); });
  }

  /** Push the parts of the snapshot the map cares about (diffed by identity). */
  private syncMap(force = false): void {
    const map = this.map;
    if (!map || !this.state.mapReady) return;
    // Map calls below can emit events synchronously (a fit emits "cameraChanged"), which call
    // setState, which calls back into here. Guard against re-entry and coalesce into one re-run.
    if (this.syncing) { this.resyncQueued = true; return; }
    this.syncing = true;
    const s = this.state, p = this.lastSynced;
    const changed = <K extends keyof ViewerState>(k: K) => force || s[k] !== p[k];
    // Record what we are about to apply *before* applying it, so a re-entrant sync sees the work
    // as already done rather than repeating it.
    this.lastSynced = { bundle: s.bundle, levelId: s.levelId, selectedBoothIds: s.selectedBoothIds, highlightedBoothIds: s.highlightedBoothIds, categoryIds: s.categoryIds, route: s.route, markers: s.markers, circles: s.circles, position: s.position, view: s.view, theme: s.theme, layerVisibility: s.layerVisibility };
    try {
      if (changed("bundle")) map.setBundle(s.bundle);
      if (changed("levelId")) map.setLevel(s.levelId, { fit: !force || !this.initialCamera.center });
      if (changed("selectedBoothIds")) map.setSelected(s.selectedBoothIds);
      if (changed("highlightedBoothIds")) map.setHighlighted(s.highlightedBoothIds);
      if (changed("categoryIds") || changed("bundle")) map.setCategoryColors(this.categoryColorMap());
      if (changed("route")) map.setRoute(s.route);
      if (changed("markers")) void map.setMarkers(s.markers);
      if (changed("circles")) map.setCircles(s.circles);
      if (changed("position")) map.setPosition(s.position);
      if (changed("view")) map.set3D(s.view === "3d");
      if (changed("theme")) map.setTheme(s.theme);
      if (changed("layerVisibility")) for (const [g, v] of Object.entries(s.layerVisibility)) map.setLayerGroupVisibility(g, v);
    } finally {
      this.syncing = false;
      if (this.resyncQueued) { this.resyncQueued = false; this.syncMap(); }
    }
  }

  getMap(): PlanMap | null { return this.map; }

  /* ---------------- URL ---------------- */

  private scheduleUrl() {
    if (this.urlTimer || typeof window === "undefined") return;
    this.urlTimer = setTimeout(() => { this.urlTimer = null; if (!this.destroyed) writeUrl(this.urlParams(), { offHistory: this.state.offHistory }); }, 120);
  }

  /** The deep-link parameters describing the current state. */
  urlParams(): ViewerParams {
    const s = this.state, b = s.bundle, init = this.initialParams;
    const out: ViewerParams = {};
    if (s.panel.kind === "exhibitor") { const ex = this.exhibitorById(s.panel.id); if (ex) out.exhibitor = ex.slug; }
    else if (s.panel.kind === "booth") { const bo = this.boothById(s.panel.id); if (bo) out.booth = bo.label; }
    else if (s.panel.kind === "session") out.session = s.panel.id;
    if (s.categoryIds.length) out.category = s.categoryIds.map((id) => b.categories.find((c) => c.id === id)?.name ?? id).join(",");
    if (s.levelId && b.levels.length > 1 && s.levelId !== b.levels[0]?.id) out.level = this.levelById(s.levelId)?.shortName ?? s.levelId;
    if (s.routeRequest && !s.optimized) {
      const r = s.routeRequest;
      const keys = [r.from ? this.endpointKey(r.from) : null, ...r.via.map((v) => this.endpointKey(v)), this.endpointKey(r.to)];
      if (keys[0]) out.route = keys.filter((k): k is string => !!k).join(",");
      else out.to = this.endpointKey(r.to) ?? undefined;
      if (r.accessible) out.accessible = "1";
    }
    if (s.searchQuery && s.panel.kind === "list") out.search = s.searchQuery;
    if (s.locale !== this.initialLocale) out.lang = s.locale;
    if (s.kiosk) out.kiosk = "1";
    if (s.view === "3d") out.view = "3d";
    if (s.theme === "dark") out.theme = "dark";
    if (s.tab !== "exhibitors" && s.panel.kind === "list") out.tab = s.tab;
    if (s.position && (s.kiosk || init.position)) out.position = `${round2(s.position.x)},${round2(s.position.y)},${this.levelById(s.position.levelId)?.shortName ?? s.position.levelId}`;
    const hidden = HIDE_TARGETS.filter((h) => !s.visibility[h]);
    if (hidden.length) out.hide = hidden.join(",");
    if (s.noOverlay) out.noOverlay = "1";
    if (s.offHistory) out.offHistory = "1";
    if (s.preview) out.preview = "1";
    if (init.embed) out.embed = init.embed;
    if (init.consent) out.consent = init.consent;
    if (init.plan && !/^[^,]+,/.test(init.plan) && init.plan.startsWith("sp_")) out.plan = init.plan;
    return out;
  }

  /** Absolute URL for the current state (share links). */
  shareUrl(overrides: Partial<ViewerParams> = {}): string {
    const params = mergeViewerParams(this.urlParams(), { kiosk: undefined, embed: undefined, noOverlay: undefined, offHistory: undefined, hide: undefined, preview: undefined, position: undefined, ...overrides });
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, String(v));
    const q = qs.toString();
    return `${this.origin}/e/${encodeURIComponent(this.slug)}${q ? `?${q}` : ""}`;
  }

  /* ---------------- lookups ---------------- */

  boothById(id: string): BundleBooth | undefined { return this.state.bundle.booths.find((b) => b.id === id); }
  exhibitorById(id: string): BundleExhibitor | undefined { return this.state.bundle.exhibitors.find((e) => e.id === id); }
  levelById(id: string): BundleLevel | undefined { return this.state.bundle.levels.find((l) => l.id === id); }
  sessionById(id: string): BundleSession | undefined { return this.state.bundle.sessions.find((s) => s.id === id); }
  elementById(id: string): BundleElement | undefined { return findElementById(this.state.bundle, id); }
  categoryById(id: string): BundleCategory | undefined { return this.state.bundle.categories.find((c) => c.id === id); }

  resolveBooth(key: string): BundleBooth | undefined { return findBooth(this.state.bundle, key); }
  resolveExhibitor(key: string): BundleExhibitor | undefined { return findExhibitor(this.state.bundle, key); }

  private getSearchIndex(): SearchIndex {
    if (!this.searchIndex) this.searchIndex = buildSearchIndex(this.state.bundle);
    return this.searchIndex;
  }

  private getGraph(): RoutingGraph {
    if (!this.graph) this.graph = buildGraph(this.state.bundle);
    return this.graph;
  }

  /** Resolve a free-form key (`booth label`, exhibitor slug, element id/name, `@x,y[,level]`, `me`) to a route endpoint. */
  resolveEndpointKey(key: string | RouteEndpoint | null | undefined): RouteEndpoint | null {
    if (!key) return null;
    if (typeof key === "object") return key;
    const k = key.trim();
    if (!k) return null;
    if (/^(me|here|current|position)$/i.test(k)) return this.state.position ? { type: "point", ...this.state.position } : null;
    if (k.startsWith("@")) {
      const p = parsePosition(k.slice(1));
      if (!p) return null;
      const level = (p.level && findLevel(this.state.bundle, p.level)) || this.levelById(this.state.levelId);
      return level ? { type: "point", levelId: level.id, x: p.x, y: p.y } : null;
    }
    const b = this.resolveBooth(k);
    if (b) return endpointFromBooth(b);
    const ex = this.resolveExhibitor(k);
    if (ex) return { type: "exhibitor", id: ex.id };
    const el = this.elementById(k) ?? this.elementByName(k);
    if (el) return { type: "element", id: el.id };
    const se = findSession(this.state.bundle, k);
    if (se) return this.sessionEndpoint(se);
    return null;
  }

  private elementByName(name: string): BundleElement | undefined {
    const n = name.trim().toLowerCase();
    for (const l of this.state.bundle.levels) for (const el of l.elements) if (typeof el.props.name === "string" && el.props.name.toLowerCase() === n) return el;
    return undefined;
  }

  private sessionEndpoint(se: BundleSession): RouteEndpoint | null {
    if (se.boothId) return { type: "booth", id: se.boothId };
    if (se.elementId) return { type: "element", id: se.elementId };
    return null;
  }

  /** Human-readable name of a route endpoint. */
  endpointLabel(ep: RouteEndpoint | null): string {
    if (!ep) return "";
    if (ep.type === "point" && this.state.position && ep.levelId === this.state.position.levelId && ep.x === this.state.position.x && ep.y === this.state.position.y) return "";
    return resolveEndpoint(this.state.bundle, ep)?.label ?? "";
  }

  /** URL key for an endpoint. */
  endpointKey(ep: RouteEndpoint): string | null {
    switch (ep.type) {
      case "booth": return this.boothById(ep.id)?.label ?? ep.id;
      case "exhibitor": return this.exhibitorById(ep.id)?.slug ?? ep.id;
      case "element": return ep.id;
      case "node": return ep.id;
      case "point": return `@${round2(ep.x)},${round2(ep.y)},${this.levelById(ep.levelId)?.shortName ?? ep.levelId}`;
    }
  }

  /** Where routes start when nothing else is known: the visitor's position, else the default entrance. */
  defaultStart(): RouteEndpoint | null {
    if (this.state.position) return { type: "point", ...this.state.position };
    const el = defaultStartElement(this.state.bundle);
    return el ? { type: "element", id: el.id } : null;
  }

  /* ---------------- UI actions (used by components) ---------------- */

  setTab(tab: ViewerTab): void { this.setState({ tab, panel: { kind: "list" }, panelOpen: true }); }

  setPanelOpen(open: boolean): void { this.setState({ panelOpen: open }); }

  setSearchQuery(q: string): void {
    this.setState({ searchQuery: q, panel: { kind: "list" }, tab: q ? "exhibitors" : this.state.tab, panelOpen: true });
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      if (this.destroyed || !q.trim()) return;
      const results = this.search(q);
      this.analytics?.track("search", { query: q, meta: { results: results.length } });
      this.emit("search", { query: q, results: results.length });
    }, 350);
  }

  setSearchFocused(v: boolean): void { this.setState({ searchFocused: v }); }

  /** Ranked search results for the current query (cheap; memoised by React). */
  search(q: string, opts: { limit?: number } = {}): SearchResult[] {
    return this.getSearchIndex().search(q, { limit: opts.limit ?? 60, categoryIds: this.state.categoryIds.length ? this.state.categoryIds : undefined });
  }

  /** Open whatever a search result points at. */
  openSearchResult(r: SearchResult): void {
    switch (r.type) {
      case "exhibitor": return this.openExhibitor(r.id);
      case "booth": return this.openBooth(r.id);
      case "category": return void this.selectCategory(r.id);
      case "session": return this.openSession(r.id);
      case "poi": return this.openPoi(r.id, { fly: true });
    }
  }

  private handleBoothClick(id: string, plan: Point, lngLat: [number, number]) {
    const b = this.boothById(id);
    if (!b) return;
    this.analytics?.track("booth_click", { targetType: "booth", targetId: b.id, levelId: b.levelId, x: round2(plan[0]), y: round2(plan[1]) });
    this.emit("boothClick", { ...this.boothPayload(b), x: round2(plan[0]), y: round2(plan[1]), lng: lngLat[0], lat: lngLat[1] });
    if (this.state.panel.kind === "directions" && this.state.routeRequest && !this.state.route && !this.state.routeRequest.from) {
      // Picking a start point on the map.
      this.setRouteFrom(endpointFromBooth(b));
      return;
    }
    const ex = b.exhibitorIds.length === 1 ? this.exhibitorById(b.exhibitorIds[0]) : undefined;
    if (ex) this.openExhibitor(ex.id, { fromBooth: b.id, zoom: false });
    else this.openBooth(b.id, { zoom: false });
  }

  /** Zoom the map to one booth (and select it) without changing the open panel. */
  focusBooth(id: string): void {
    const b = this.boothById(id);
    if (!b) return;
    this.setState({ levelId: b.levelId, selectedBoothIds: this.state.selectedBoothIds.includes(b.id) ? this.state.selectedBoothIds : [b.id] });
    this.withMap((m) => m.zoomToBooths([b]));
  }

  openBooth(id: string, opts: { zoom?: boolean } = {}): void {
    const b = this.boothById(id);
    if (!b) return;
    this.setState({ panel: { kind: "booth", id: b.id }, panelOpen: true, selectedBoothIds: [b.id], selectedExhibitorId: null, levelId: b.levelId, dialog: null });
    if (opts.zoom !== false) this.withMap((m) => m.zoomToBooths([b]));
    this.emit("details", { type: "booth", ...this.boothPayload(b) });
  }

  openExhibitor(idOrSlug: string, opts: { fromBooth?: string; zoom?: boolean } = {}): void {
    const ex = this.resolveExhibitor(idOrSlug);
    if (!ex) return;
    const booths = ex.boothIds.map((id) => this.boothById(id)).filter((b): b is BundleBooth => !!b);
    const primary = (opts.fromBooth && booths.find((b) => b.id === opts.fromBooth)) || booths[0];
    this.setState({
      panel: { kind: "exhibitor", id: ex.id }, panelOpen: true, selectedBoothIds: booths.map((b) => b.id), selectedExhibitorId: ex.id,
      levelId: primary?.levelId ?? this.state.levelId, dialog: null,
    });
    if (opts.zoom !== false && booths.length) this.withMap((m) => m.zoomToBooths(primary ? [primary, ...booths.filter((b) => b.levelId === primary.levelId && b.id !== primary.id)] : booths));
    this.analytics?.track("exhibitor_view", { targetType: "exhibitor", targetId: ex.id });
    const payload = this.exhibitorPayload(ex);
    this.emit("exhibitorClick", payload);
    this.emit("details", { type: "exhibitor", ...payload });
  }

  openSession(id: string, opts: { show?: boolean } = {}): void {
    const se = this.sessionById(id);
    if (!se) return;
    this.setState({ panel: { kind: "session", id: se.id }, panelOpen: true, dialog: null });
    this.emit("sessionClick", { id: se.id, title: se.title, externalId: se.externalId ?? null, startsAt: se.startsAt, endsAt: se.endsAt });
    if (opts.show !== false) this.showSessionLocation(se);
  }

  showSessionLocation(se: BundleSession): void {
    if (se.boothId) {
      const b = this.boothById(se.boothId);
      if (b) { this.setState({ selectedBoothIds: [b.id], levelId: b.levelId }); this.withMap((m) => m.zoomToBooths([b])); }
      return;
    }
    if (se.elementId) this.flyToElement(se.elementId);
  }

  openPoi(elementId: string, opts: { fly?: boolean } = {}): void {
    const el = this.elementById(elementId);
    if (!el) return;
    this.setState({ panel: { kind: "poi", id: el.id }, panelOpen: true, levelId: el.levelId, selectedBoothIds: [], selectedExhibitorId: null });
    if (opts.fly) this.flyToElement(el.id);
  }

  private flyToElement(id: string) {
    const el = this.elementById(id);
    if (!el) return;
    const r = resolveEndpoint(this.state.bundle, { type: "element", id });
    if (!r) return;
    this.setState({ levelId: r.levelId });
    this.withMap((m) => {
      if (el.geometry.type === "polygon") m.fitPlanBBox(bbox(el.geometry.points), 80);
      else m.flyToPlan(r.levelId, r.point, { minZoom: 19.5 });
    });
  }

  back(): void {
    const s = this.state;
    if (s.panel.kind === "directions") {
      const to = s.routeRequest?.to;
      this.clearRoute();
      if (to?.type === "booth") return this.openBooth(to.id, { zoom: false });
      if (to?.type === "exhibitor") return this.openExhibitor(to.id, { zoom: false });
    }
    this.closePanel();
  }

  closePanel(): void {
    this.setState({ panel: { kind: "list" }, selectedBoothIds: [], selectedExhibitorId: null, dialog: null, panelOpen: !this.state.noOverlay && this.state.panelOpen });
    this.withMap((m) => m.hidePopup());
  }

  /** Open the directions panel towards `to`. */
  startDirections(to: RouteEndpoint | string, opts: { from?: RouteEndpoint | string | null; accessible?: boolean } = {}): RouteResult | null {
    const toEp = this.resolveEndpointKey(to);
    if (!toEp) return null;
    const fromEp = opts.from === undefined ? this.defaultStart() : this.resolveEndpointKey(opts.from);
    const accessible = opts.accessible ?? this.state.routeRequest?.accessible ?? false;
    return this.requestRoute({ from: fromEp, to: toEp, via: [], accessible });
  }

  setRouteFrom(from: RouteEndpoint | string | null): void {
    if (!this.state.routeRequest) return;
    this.requestRoute({ ...this.state.routeRequest, from: this.resolveEndpointKey(from) });
  }

  setRouteTo(to: RouteEndpoint | string): void {
    const ep = this.resolveEndpointKey(to);
    if (!ep) return;
    if (!this.state.routeRequest) { this.startDirections(ep); return; }
    this.requestRoute({ ...this.state.routeRequest, to: ep });
  }

  setRouteAccessible(accessible: boolean): void {
    if (!this.state.routeRequest) return;
    this.requestRoute({ ...this.state.routeRequest, accessible });
  }

  swapRoute(): void {
    const r = this.state.routeRequest;
    if (!r || !r.from) return;
    this.requestRoute({ ...r, from: r.to, to: r.from, via: [...r.via].reverse() });
  }

  private requestRoute(req: RouteRequest): RouteResult | null {
    const bundle = this.state.bundle;
    let route: RouteResult | null = null;
    let routeError: string | null = null;
    if (!req.from) routeError = "chooseStart";
    else if (!bundle.event.settings.features.wayfinding) routeError = "routeNotFound";
    else {
      const res = findRoute(bundle, this.getGraph(), req.from, req.to, { accessible: req.accessible, via: req.via });
      if (res.ok) route = res; else routeError = res.error;
    }
    const firstLevel = route?.steps.find((s) => s.points.length)?.levelId ?? (req.to && resolveEndpoint(bundle, req.to)?.levelId) ?? this.state.levelId;
    const toBooth = req.to.type === "booth" ? this.boothById(req.to.id) : req.to.type === "exhibitor" ? this.exhibitorById(req.to.id)?.boothIds.map((id) => this.boothById(id)).find(Boolean) : undefined;
    this.setState({
      routeRequest: req, route, routeError, optimized: null, panel: { kind: "directions" }, panelOpen: true, levelId: firstLevel,
      selectedBoothIds: toBooth ? [toBooth.id] : this.state.selectedBoothIds, dialog: null,
    });
    if (route) {
      this.fitRouteLevel(route, firstLevel);
      this.analytics?.track("route", { targetType: req.to.type === "point" ? undefined : (req.to.type as "booth" | "exhibitor" | "element"), targetId: req.to.type === "point" ? undefined : req.to.id, levelId: firstLevel, meta: { accessible: req.accessible, distanceM: route.distanceM } });
      this.emit("direction", this.routePayload(route));
    } else {
      this.emit("direction", null);
    }
    return route;
  }

  private fitRouteLevel(route: RouteResult, levelId: string) {
    const pts = route.steps.filter((s) => s.levelId === levelId).flatMap((s) => s.points);
    if (!pts.length) return;
    this.withMap((m) => m.fitPlanBBox(growBBox(bbox(pts), 8), 70, 20.5));
  }

  /** Show the part of the current route on `levelId` (multi-level step tap). */
  showRouteLevel(levelId: string): void {
    this.setState({ levelId });
    if (this.state.route) this.fitRouteLevel(this.state.route, levelId);
  }

  toggleBookmark(kind: BookmarkKind, id: string, force?: boolean): boolean {
    const key = bookmarkKey(kind, id);
    const bookmarks = toggleIn(this.state.bookmarks, key, force);
    const bookmarked = bookmarks.includes(key);
    this.setState({ bookmarks });
    saveBookmarkState(this.state.bundle.event.id, { bookmarks, visited: this.state.visited });
    this.analytics?.track("bookmark", { targetType: kind, targetId: id, meta: { bookmarked } });
    this.emit("bookmarkClick", { type: kind, id, name: this.entityName(kind, id), bookmarked });
    this.emit("bookmarksChanged", { bookmarks: this.getBookmarks() });
    return bookmarked;
  }

  isBookmarked(kind: BookmarkKind, id: string): boolean { return this.state.bookmarks.includes(bookmarkKey(kind, id)); }

  toggleVisited(kind: BookmarkKind, id: string, force?: boolean): boolean {
    const key = bookmarkKey(kind, id);
    const visited = toggleIn(this.state.visited, key, force);
    this.setState({ visited });
    saveBookmarkState(this.state.bundle.event.id, { bookmarks: this.state.bookmarks, visited });
    this.emit("visitedClick", { type: kind, id, name: this.entityName(kind, id), visited: visited.includes(key) });
    return visited.includes(key);
  }

  isVisited(kind: BookmarkKind, id: string): boolean { return this.state.visited.includes(bookmarkKey(kind, id)); }

  private entityName(kind: BookmarkKind, id: string): string {
    if (kind === "exhibitor") return this.exhibitorById(id)?.name ?? id;
    if (kind === "booth") return this.boothById(id)?.label ?? id;
    return this.sessionById(id)?.title ?? id;
  }

  /** Bookmarked exhibitors/booths/sessions resolved to objects. */
  plannerItems(): { key: string; kind: BookmarkKind; exhibitor?: BundleExhibitor; booth?: BundleBooth; session?: BundleSession }[] {
    const out: { key: string; kind: BookmarkKind; exhibitor?: BundleExhibitor; booth?: BundleBooth; session?: BundleSession }[] = [];
    for (const key of this.state.bookmarks) {
      const p = splitBookmarkKey(key);
      if (!p) continue;
      if (p.kind === "exhibitor") { const ex = this.exhibitorById(p.id); if (ex) out.push({ key, kind: "exhibitor", exhibitor: ex, booth: ex.boothIds.map((id) => this.boothById(id)).find(Boolean) ?? undefined }); }
      else if (p.kind === "booth") { const b = this.boothById(p.id); if (b) out.push({ key, kind: "booth", booth: b }); }
      else { const se = this.sessionById(p.id); if (se) out.push({ key, kind: "session", session: se, booth: se.boothId ? this.boothById(se.boothId) : undefined }); }
    }
    return out;
  }

  /** "Optimise my route": visit every bookmarked booth in the best order from the default start. */
  optimisePlan(opts: { accessible?: boolean; returnToStart?: boolean } = {}): OptimizedRoute | null {
    const stops: RouteEndpoint[] = [];
    const seen = new Set<string>();
    for (const item of this.plannerItems()) {
      const ep = item.kind === "exhibitor" && item.exhibitor ? { type: "exhibitor" as const, id: item.exhibitor.id } : item.booth ? endpointFromBooth(item.booth) : item.session ? this.sessionEndpoint(item.session) : null;
      if (!ep) continue;
      const key = ep.type === "point" ? `point:${ep.levelId}:${ep.x}:${ep.y}` : `${ep.type}:${ep.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      stops.push(ep);
    }
    return this.runOptimise(stops, opts);
  }

  private runOptimise(stops: RouteEndpoint[], opts: { accessible?: boolean; returnToStart?: boolean } = {}): OptimizedRoute | null {
    const start = this.defaultStart();
    if (!start || !stops.length) { this.setState({ optimized: null, route: null, routeRequest: null, routeError: stops.length ? "chooseStart" : null }); return null; }
    const accessible = opts.accessible ?? this.state.routeRequest?.accessible ?? false;
    const res = optimizeRoute(this.state.bundle, this.getGraph(), start, stops, { accessible, returnToStart: opts.returnToStart });
    if ("ok" in res) { this.setState({ optimized: null, route: null, routeError: res.error, tab: "plan", panel: { kind: "list" } }); return null; }
    const merged = mergeLegs(res.legs, start, stops[stops.length - 1], accessible);
    const firstLevel = merged?.steps.find((s) => s.points.length)?.levelId ?? this.state.levelId;
    this.setState({ optimized: res, route: merged, routeRequest: { from: start, to: res.order[res.order.length - 1] ?? stops[0], via: res.order.slice(0, -1), accessible }, routeError: null, tab: "plan", panel: { kind: "list" }, panelOpen: true, levelId: firstLevel, selectedBoothIds: [] });
    if (merged) { this.fitRouteLevel(merged, firstLevel); this.emit("direction", { ...this.routePayload(merged), optimized: true, order: res.order.map((o) => this.endpointKey(o)) }); }
    this.analytics?.track("route", { meta: { optimized: true, stops: stops.length } });
    return res;
  }

  /** Open an external link: kiosks show a QR code instead of navigating away. */
  openExternal(url: string, title = ""): void {
    if (!url) return;
    this.emit("leaveEvent", { url });
    if (this.state.kiosk) { this.setState({ dialog: { kind: "qr", url, title } }); return; }
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  }

  customButtonClick(ex: BundleExhibitor): void {
    if (!ex.customButtonUrl) return;
    this.analytics?.track("custom_button", { targetType: "exhibitor", targetId: ex.id });
    this.emit("exhibitorCustomButtonClick", { id: ex.id, name: ex.name, url: ex.customButtonUrl, title: ex.customButtonTitle ?? "" });
    this.openExternal(ex.customButtonUrl, ex.customButtonTitle ?? ex.name);
  }

  reserveUrl(b: BundleBooth): string | null {
    const s = this.state.bundle.event.settings;
    if (!(s.sales.enabled && s.features.allowReservation && b.status === "available")) return null;
    return `/e/${encodeURIComponent(this.slug)}/reserve/${encodeURIComponent(b.id)}`;
  }

  reserveClick(b: BundleBooth): void {
    const url = this.reserveUrl(b);
    if (!url) return;
    this.emit("reserveClick", { boothId: b.id, label: b.label, url });
    if (this.state.kiosk) return this.openExternal(`${this.origin}${url}`, b.label);
    if (typeof window !== "undefined") window.location.assign(url);
  }

  trackBanner(id: string, kind: "impression" | "click"): void {
    this.analytics?.track(kind === "click" ? "banner_click" : "banner_impression", { targetType: "banner", targetId: id });
  }

  /** Share the current view (or a specific entity). Resolves to the URL and opens the share dialog unless `silent`. */
  async share(kind: "view" | "exhibitor" | "booth" | "route" | "plan" = "view", opts: { silent?: boolean; title?: string } = {}): Promise<string> {
    let url = this.shareUrl();
    if (kind === "plan") {
      const items = this.plannerItems();
      const body = { boothIds: items.filter((i) => i.kind === "booth").map((i) => i.booth!.id), exhibitorIds: items.filter((i) => i.kind === "exhibitor").map((i) => i.exhibitor!.id), sessionIds: items.filter((i) => i.kind === "session").map((i) => i.session!.id) };
      try {
        const res = await fetch(`/e/${encodeURIComponent(this.slug)}/share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const json = (await res.json()) as { data?: { id: string } };
        if (json.data?.id) url = this.shareUrl({ plan: json.data.id, booth: undefined, exhibitor: undefined, route: undefined, to: undefined, tab: "plan" });
      } catch { /* fall back to the plain URL */ }
    }
    this.analytics?.track("share", { meta: { kind } });
    this.emit("share", { url, kind });
    if (!opts.silent) this.setState({ dialog: { kind: "share", url, title: opts.title ?? this.state.bundle.event.name } });
    return url;
  }

  openDialog(dialog: ViewerDialog): void { this.setState({ dialog }); }
  closeDialog(): void { this.setState({ dialog: null }); }

  notify(message: string | null): void {
    this.lastNotice = Date.now();
    this.setState({ notice: message });
    if (message) { const at = this.lastNotice; setTimeout(() => { if (this.lastNotice === at && !this.destroyed) this.setState({ notice: null }); }, 4000); }
  }

  /** Replace the bundle (live update after a new publish). Keeps selection where ids still exist. */
  setBundle(bundle: PlanBundle): void {
    this.searchIndex = null;
    this.graph = null;
    const s = this.state;
    const levelId = bundle.levels.some((l) => l.id === s.levelId) ? s.levelId : bundle.levels[0]?.id ?? "";
    const boothIds = new Set(bundle.booths.map((b) => b.id));
    const panel: PanelView = s.panel.kind === "exhibitor" && !bundle.exhibitors.some((e) => e.id === (s.panel as { id: string }).id) ? { kind: "list" }
      : s.panel.kind === "booth" && !boothIds.has((s.panel as { id: string }).id) ? { kind: "list" } : s.panel;
    this.setState({ bundle, levelId, panel, selectedBoothIds: s.selectedBoothIds.filter((id) => boothIds.has(id)), highlightedBoothIds: s.highlightedBoothIds.filter((id) => boothIds.has(id)), bundleRevision: s.bundleRevision + 1 });
    if (s.routeRequest) this.requestRoute(s.routeRequest);
  }

  /** Apply a shared plan id (`?plan=sp_…`): fetch it and load its items as bookmarks. */
  async loadSharedPlan(id: string): Promise<void> {
    try {
      const res = await fetch(`/e/${encodeURIComponent(this.slug)}/share?id=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const json = (await res.json()) as { data?: { items: { boothIds: string[]; exhibitorIds: string[]; sessionIds: string[] } } };
      const items = json.data?.items;
      if (!items) return;
      const bookmarks = [...items.exhibitorIds.map((i) => bookmarkKey("exhibitor", i)), ...items.boothIds.map((i) => bookmarkKey("booth", i)), ...items.sessionIds.map((i) => bookmarkKey("session", i))];
      this.setState({ bookmarks, tab: "plan", panel: { kind: "list" }, highlightedBoothIds: [...items.boothIds, ...items.exhibitorIds.flatMap((i) => this.exhibitorById(i)?.boothIds ?? [])] });
      saveBookmarkState(this.state.bundle.event.id, { bookmarks, visited: this.state.visited });
      this.emit("bookmarksChanged", { bookmarks: this.getBookmarks() });
    } catch { /* ignore */ }
  }

  /* ---------------- category colouring ---------------- */

  private categoryColorMap(): Map<string, string> | null {
    const ids = this.state.categoryIds;
    if (!ids.length) return null;
    const b = this.state.bundle;
    const colors = new Map<string, string>();
    const catColor = new Map(b.categories.map((c) => [c.id, c.color || b.event.settings.branding.primaryColor]));
    for (const ex of b.exhibitors) {
      const hit = ids.find((id) => ex.categoryIds.includes(id));
      if (!hit) continue;
      for (const bid of ex.boothIds) if (!colors.has(bid)) colors.set(bid, catColor.get(hit) ?? b.event.settings.branding.primaryColor);
    }
    return colors;
  }

  /* ---------------- geolocation ---------------- */

  private geoToPosition(coords: { latitude: number; longitude: number }): ViewerPosition | null {
    const level = this.levelById(this.state.levelId);
    if (!level?.georef) return null;
    const map = this.map;
    const [x, y] = map ? map.convertFromGeo(coords.longitude, coords.latitude, level.id) : [NaN, NaN];
    if (!Number.isFinite(x)) return null;
    return { levelId: level.id, x, y };
  }

  private stopGps() {
    if (this.gpsWatch !== null && typeof navigator !== "undefined") navigator.geolocation?.clearWatch(this.gpsWatch);
    this.gpsWatch = null;
  }

  /* ---------------- payload helpers ---------------- */

  private boothPayload(b: BundleBooth) {
    return { id: b.id, name: b.label, label: b.label, externalId: b.externalId ?? null, levelId: b.levelId, level: this.levelById(b.levelId)?.shortName ?? null, status: b.status, exhibitors: b.exhibitorIds, areaM2: b.areaM2, x: b.center[0], y: b.center[1] };
  }

  private exhibitorPayload(ex: BundleExhibitor) {
    return { id: ex.id, externalId: ex.externalId ?? null, name: ex.name, slug: ex.slug, booths: ex.boothLabels, boothIds: ex.boothIds, categories: ex.categoryIds, featured: ex.featured, sponsorLevel: ex.sponsorLevel ?? null };
  }

  private routePayload(r: RouteResult) {
    return {
      from: this.endpointKey(r.from), to: this.endpointKey(r.to), fromLabel: this.endpointLabel(r.from), toLabel: this.endpointLabel(r.to), accessible: r.accessible,
      distanceM: r.distanceM, durationSeconds: r.durationSeconds, levelIds: r.levelIds, steps: r.steps.map((s) => ({ levelId: s.levelId, instruction: s.instruction ?? "", distanceM: s.distanceM, points: s.points, transition: s.transition ?? null })),
    };
  }

  private fpConfiguredPayload() {
    const b = this.state.bundle;
    return { event: { id: b.event.id, slug: b.event.slug, name: b.event.name, version: b.version }, levels: this.getFloors(), counts: { booths: b.booths.length, exhibitors: b.exhibitors.length, categories: b.categories.length, sessions: b.sessions.length } };
  }

  /* ================================================================== */
  /* SDK methods (every name in SDK_METHODS)                             */
  /* ================================================================== */

  selectBooth(nameOrId: string | string[] | null | undefined): unknown {
    if (nameOrId == null || (Array.isArray(nameOrId) && !nameOrId.length) || nameOrId === "") { this.closePanel(); return null; }
    const keys = Array.isArray(nameOrId) ? nameOrId : [nameOrId];
    const booths = keys.map((k) => this.resolveBooth(String(k))).filter((b): b is BundleBooth => !!b);
    if (!booths.length) throw new Error(`Booth not found: ${keys.join(", ")}`);
    if (booths.length === 1) {
      const b = booths[0];
      const ex = b.exhibitorIds.length === 1 ? this.exhibitorById(b.exhibitorIds[0]) : undefined;
      if (ex) this.openExhibitor(ex.id, { fromBooth: b.id }); else this.openBooth(b.id);
      return this.boothPayload(b);
    }
    this.setState({ selectedBoothIds: booths.map((b) => b.id), selectedExhibitorId: null, levelId: booths[0].levelId, panel: { kind: "list" } });
    this.withMap((m) => m.zoomToBooths(booths));
    return booths.map((b) => this.boothPayload(b));
  }

  selectExhibitor(idOrSlug: string | string[] | null | undefined): unknown {
    if (idOrSlug == null || idOrSlug === "" || (Array.isArray(idOrSlug) && !idOrSlug.length)) { this.closePanel(); return null; }
    const keys = Array.isArray(idOrSlug) ? idOrSlug : [idOrSlug];
    const exs = keys.map((k) => this.resolveExhibitor(String(k))).filter((e): e is BundleExhibitor => !!e);
    if (!exs.length) throw new Error(`Exhibitor not found: ${keys.join(", ")}`);
    if (exs.length === 1) { this.openExhibitor(exs[0].id); return this.exhibitorPayload(exs[0]); }
    const booths = exs.flatMap((e) => e.boothIds).map((id) => this.boothById(id)).filter((b): b is BundleBooth => !!b);
    this.setState({ selectedBoothIds: booths.map((b) => b.id), selectedExhibitorId: null, levelId: booths[0]?.levelId ?? this.state.levelId, panel: { kind: "list" } });
    if (booths.length) this.withMap((m) => m.zoomToBooths(booths));
    return exs.map((e) => this.exhibitorPayload(e));
  }

  /** ExpoFP v3 `select`: booth → exhibitor → category → session. */
  select(key: string | null | undefined): unknown {
    if (!key) { this.closePanel(); return null; }
    if (this.resolveBooth(key)) return this.selectBooth(key);
    if (this.resolveExhibitor(key)) return this.selectExhibitor(key);
    if (findCategory(this.state.bundle, key)) return this.selectCategory(key);
    const se = findSession(this.state.bundle, key);
    if (se) { this.openSession(se.id); return { id: se.id, title: se.title }; }
    throw new Error(`Nothing matches "${key}"`);
  }

  selectRoute(from: string | string[] | RouteEndpoint | null | undefined, to?: string | RouteEndpoint | boolean | null, accessible?: boolean): unknown {
    let waypoints: (string | RouteEndpoint)[] = [];
    let acc = accessible === true;
    if (Array.isArray(from)) { waypoints = from; if (typeof to === "boolean") acc = to; }
    else if (from != null && to != null && typeof to !== "boolean") waypoints = [from, to];
    else if (from != null && (to == null || typeof to === "boolean")) { waypoints = [from]; if (typeof to === "boolean") acc = to; }
    if (!waypoints.length) { this.clearRoute(); return null; }
    if (waypoints.length > MAX_ROUTE_WAYPOINTS) throw new Error(`At most ${MAX_ROUTE_WAYPOINTS} waypoints`);
    const eps = waypoints.map((w) => this.resolveEndpointKey(w));
    const missing = eps.findIndex((e) => !e);
    if (missing >= 0) throw new Error(`Unknown route point: ${JSON.stringify(waypoints[missing])}`);
    const resolved = eps as RouteEndpoint[];
    const route = resolved.length === 1
      ? this.startDirections(resolved[0], { accessible: acc })
      : this.requestRoute({ from: resolved[0], to: resolved[resolved.length - 1], via: resolved.slice(1, -1), accessible: acc });
    if (!route) throw new Error(this.state.routeError === "chooseStart" ? "No starting point: set a position or add a default entrance" : this.state.routeError ?? "No route");
    return this.routePayload(route);
  }

  selectAccessibleRoute(from: string | string[] | RouteEndpoint, to?: string | RouteEndpoint): unknown {
    return this.selectRoute(from, typeof to === "undefined" ? true : to, true);
  }

  clearRoute(): void {
    const had = !!this.state.route || !!this.state.routeRequest;
    this.setState({ route: null, routeRequest: null, routeError: null, optimized: null, panel: this.state.panel.kind === "directions" ? { kind: "list" } : this.state.panel });
    if (had) { this.emit("direction", null); this.emit("routeCleared", null); }
  }

  deselectRoute(): void { this.clearRoute(); }

  getRoute(): unknown { return this.state.route ? this.routePayload(this.state.route) : null; }

  getOptimizedRoutes(labels: string[] | { items?: string[]; accessible?: boolean; returnToStart?: boolean } | undefined): unknown {
    const items = Array.isArray(labels) ? labels : labels?.items ?? [];
    const opts = Array.isArray(labels) ? {} : { accessible: labels?.accessible, returnToStart: labels?.returnToStart };
    const stops = items.map((k) => this.resolveEndpointKey(k)).filter((e): e is RouteEndpoint => !!e);
    if (!stops.length) throw new Error("No valid stops");
    const res = this.runOptimise(stops, opts);
    if (!res) throw new Error(this.state.routeError ?? "Could not optimise");
    return { order: res.order.map((o) => this.endpointKey(o)), distanceM: res.distanceM, durationSeconds: res.durationSeconds, legs: res.legs.map((l) => this.routePayload(l)) };
  }

  openPlanner(opts?: { items?: string[]; from?: string; optimize?: boolean }): void {
    if (opts?.items?.length) this.setBookmarks(opts.items);
    this.setState({ tab: "plan", panel: { kind: "list" }, panelOpen: true });
    if (opts?.optimize) this.optimisePlan();
  }

  selectCurrentPosition(x: number, y: number, focus = true, levelId?: string): void {
    const level = (levelId && findLevel(this.state.bundle, levelId)) || this.levelById(this.state.levelId);
    if (!level || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Invalid position");
    const position = { levelId: level.id, x, y };
    this.setState({ position, levelId: focus ? level.id : this.state.levelId });
    if (focus) this.withMap((m) => m.flyToPlan(level.id, [x, y], { minZoom: 19 }));
    this.analytics?.track("position", { levelId: level.id, x, y });
    this.emit("currentPositionChanged", position);
  }

  deselectCurrentPosition(): void { this.clearCurrentPosition(); }

  clearCurrentPosition(): void {
    if (!this.state.position) return;
    this.setState({ position: null });
    this.emit("currentPositionChanged", null);
  }

  findLocation(): Promise<ViewerPosition | null> {
    if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = this.geoToPosition(pos.coords);
          if (p) this.selectCurrentPosition(p.x, p.y, true, p.levelId);
          resolve(p);
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
      );
    });
  }

  isGpsTrackingEnabled(): boolean { return this.state.gpsTracking; }

  setGpsTrackingEnabled(enabled: boolean): void {
    if (enabled === this.state.gpsTracking) return;
    if (!enabled) { this.stopGps(); this.setState({ gpsTracking: false }); return; }
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    this.gpsWatch = navigator.geolocation.watchPosition(
      (pos) => { const p = this.geoToPosition(pos.coords); if (p) { this.setState({ position: p }); this.emit("currentPositionChanged", p); } },
      () => { this.stopGps(); this.setState({ gpsTracking: false }); },
      { enableHighAccuracy: true, maximumAge: 2000 },
    );
    this.setState({ gpsTracking: true });
  }

  /** Replace bookmarks with a list of booth labels / exhibitor ids / session ids. */
  setBookmarks(items: string[] | null | undefined): void {
    const bookmarks: string[] = [];
    for (const k of items ?? []) {
      const ex = this.resolveExhibitor(k);
      if (ex) { bookmarks.push(bookmarkKey("exhibitor", ex.id)); continue; }
      const b = this.resolveBooth(k);
      if (b) { bookmarks.push(bookmarkKey("booth", b.id)); continue; }
      const se = findSession(this.state.bundle, k);
      if (se) bookmarks.push(bookmarkKey("session", se.id));
    }
    this.setState({ bookmarks: [...new Set(bookmarks)] });
    saveBookmarkState(this.state.bundle.event.id, { bookmarks: this.state.bookmarks, visited: this.state.visited });
    this.emit("bookmarksChanged", { bookmarks: this.getBookmarks() });
  }

  getBookmarks(): { type: BookmarkKind; id: string; name: string; externalId: string | null }[] {
    return this.state.bookmarks.map((key) => splitBookmarkKey(key)).filter((p): p is { kind: BookmarkKind; id: string } => !!p).map((p) => {
      const ext = p.kind === "exhibitor" ? this.exhibitorById(p.id)?.externalId : p.kind === "booth" ? this.boothById(p.id)?.externalId : this.sessionById(p.id)?.externalId;
      return { type: p.kind, id: p.id, name: this.entityName(p.kind, p.id), externalId: ext ?? null };
    });
  }

  setEntitiesBookmarks(items: { type: string; name?: string; externalId?: string; id?: string; bookmarked: boolean }[]): void {
    for (const it of items ?? []) {
      const target = this.resolveEntity(it);
      if (target) this.toggleBookmark(target.kind, target.id, it.bookmarked);
    }
  }

  setEntitiesVisited(items: { type: string; name?: string; externalId?: string; id?: string; visited: boolean }[]): void {
    for (const it of items ?? []) {
      const target = this.resolveEntity(it);
      if (target) this.toggleVisited(target.kind, target.id, it.visited);
    }
  }

  private resolveEntity(it: { type: string; name?: string; externalId?: string; id?: string }): { kind: BookmarkKind; id: string } | null {
    const key = it.id ?? it.externalId ?? it.name ?? "";
    const type = it.type.toLowerCase();
    if (type.startsWith("exhib")) { const ex = this.resolveExhibitor(key); return ex ? { kind: "exhibitor", id: ex.id } : null; }
    if (type.startsWith("booth") || type === "stand") { const b = this.resolveBooth(key); return b ? { kind: "booth", id: b.id } : null; }
    if (type.startsWith("sess")) { const s = findSession(this.state.bundle, key); return s ? { kind: "session", id: s.id } : null; }
    return null;
  }

  setMarkers(markers: SdkMarker[] | null | undefined): void {
    const clean = (markers ?? []).filter((m) => m && Number.isFinite(m.x) && Number.isFinite(m.y)).map((m, i) => ({ ...m, id: String(m.id ?? `m${i}`) }));
    this.setState({ markers: clean });
  }

  clearMarkers(): void { this.setState({ markers: [] }); }

  selectMarker(id: string, focus = true): unknown {
    const m = this.state.markers.find((x) => x.id === id);
    if (!m) throw new Error(`Marker not found: ${id}`);
    const levelId = m.levelId ?? this.state.levelId;
    if (focus) { this.setState({ levelId }); this.withMap((map) => map.flyToPlan(levelId, [m.x, m.y], { minZoom: 19.5 })); }
    this.emit("markerClick", { id: m.id, marker: m });
    return m;
  }

  drawCircles(circles: CircleSpec[] | null | undefined): void {
    const clean = (circles ?? []).filter((c) => c && Number.isFinite(c.x) && Number.isFinite(c.y) && c.radius > 0);
    this.setState({ circles: clean });
  }

  clearCircles(): void { this.setState({ circles: [] }); }

  highlightBooths(labels: string[] | null | undefined): void {
    const ids = (labels ?? []).map((l) => this.resolveBooth(l)?.id).filter((x): x is string => !!x);
    this.setState({ highlightedBoothIds: ids });
  }

  highlightExhibitors(keys: string[] | null | undefined): void {
    const ids = (keys ?? []).flatMap((k) => this.resolveExhibitor(k)?.boothIds ?? []);
    this.setState({ highlightedBoothIds: [...new Set(ids)] });
  }

  clearHighlights(): void { this.setState({ highlightedBoothIds: [] }); }

  updateLayerVisibility(layer: string, visible: boolean): void {
    this.setState({ layerVisibility: { ...this.state.layerVisibility, [layer]: !!visible } });
  }

  getVisibility(): ViewerVisibility { return { ...this.state.visibility }; }

  setVisibility(v: Partial<ViewerVisibility> | null | undefined): void {
    const visibility = { ...this.state.visibility, ...(v ?? {}) };
    this.setState({ visibility, noOverlay: !visibility.overlay, panelOpen: visibility.overlay ? this.state.panelOpen : false });
  }

  zoomIn(): void { this.withMap((m) => m.zoomIn()); }
  zoomOut(): void { this.withMap((m) => m.zoomOut()); }

  switchView(view?: "2d" | "3d"): "2d" | "3d" {
    const next = view ?? (this.state.view === "3d" ? "2d" : "3d");
    if (next === "3d" && !this.state.bundle.event.settings.features.threeD) return this.state.view;
    this.setState({ view: next });
    return next;
  }

  fitBounds(bounds?: BBox | [Point, Point] | null): void {
    const b = normaliseBBox(bounds);
    this.withMap((m) => (b ? m.fitPlanBBox(b, 40) : m.fitLevel()));
  }

  getBounds(selectors?: { booths?: string[]; exhibitors?: string[]; level?: string } | null): unknown {
    const booths = this.selectBooths(selectors);
    if (booths.length) { const b = bbox(booths.flatMap((x) => x.polygon)); return { ...b, levelId: booths[0].levelId }; }
    const vp = this.map?.getViewportPlanBounds();
    return vp ? { ...vp, levelId: this.state.levelId } : null;
  }

  zoomTo(selectors: { booths?: string[]; exhibitors?: string[] } | string | string[], opts?: { padding?: number }): void {
    const sel = typeof selectors === "string" ? { booths: [selectors], exhibitors: [selectors] } : Array.isArray(selectors) ? { booths: selectors, exhibitors: selectors } : selectors;
    const booths = this.selectBooths(sel);
    if (!booths.length) throw new Error("Nothing to zoom to");
    this.setState({ levelId: booths[0].levelId });
    this.withMap((m) => m.zoomToBooths(booths, opts?.padding ?? 80));
  }

  private selectBooths(sel?: { booths?: string[]; exhibitors?: string[] } | null): BundleBooth[] {
    if (!sel) return [];
    const out = new Map<string, BundleBooth>();
    for (const k of sel.booths ?? []) { const b = this.resolveBooth(k); if (b) out.set(b.id, b); }
    for (const k of sel.exhibitors ?? []) for (const id of this.resolveExhibitor(k)?.boothIds ?? []) { const b = this.boothById(id); if (b) out.set(b.id, b); }
    return [...out.values()];
  }

  setCamera(cam: SdkCamera): void {
    if (cam?.levelId) { const l = findLevel(this.state.bundle, cam.levelId); if (l) { cam = { ...cam, levelId: l.id }; this.setState({ levelId: l.id }); } }
    this.withMap((m) => m.setCamera(cam ?? {}));
  }

  getCamera(): SdkCamera & { levelId: string } {
    const c = this.map?.getCamera();
    if (!c) return { levelId: this.state.levelId, ...(this.initialCamera.center ? { x: this.initialCamera.center[0], y: this.initialCamera.center[1] } : {}), zoom: this.initialCamera.zoom, bearing: this.initialCamera.bearing };
    return { x: round2(c.x), y: round2(c.y), lng: c.lng, lat: c.lat, zoom: c.zoom, bearing: c.bearing, pitch: c.pitch, levelId: c.levelId };
  }

  flyTo(cam: SdkCamera): void { this.setCamera({ durationMs: 1200, ...cam }); }

  getCenterCoordinates(): { x: number; y: number; levelId: string } {
    const c = this.getCamera();
    return { x: c.x ?? 0, y: c.y ?? 0, levelId: c.levelId };
  }

  getBoothRect(label: string): unknown {
    const b = this.resolveBooth(label);
    if (!b) throw new Error(`Booth not found: ${label}`);
    return boothRect(b);
  }

  getBoothsGeometry(): unknown {
    return this.state.bundle.booths.map((b) => ({ id: b.id, name: b.label, label: b.label, externalId: b.externalId ?? null, polygon: b.polygon, center: b.center, ...boothRect(b) }));
  }

  convertToGeo(x: number, y: number, levelId?: string): [number, number] {
    const level = (levelId && findLevel(this.state.bundle, levelId)) || this.levelById(this.state.levelId);
    if (!level) throw new Error("No level");
    return this.map ? this.map.convertToGeo(x, y, level.id) : planToLngLat([x, y], levelGeoref(level));
  }

  convertFromGeo(lng: number, lat: number, levelId?: string): [number, number] {
    const level = (levelId && findLevel(this.state.bundle, levelId)) || this.levelById(this.state.levelId);
    if (!level) throw new Error("No level");
    const p = this.map ? this.map.convertFromGeo(lng, lat, level.id) : lngLatToPlan([lng, lat], levelGeoref(level));
    return [round2(p[0]), round2(p[1])];
  }

  getGeoConfig(): unknown {
    return { levels: this.state.bundle.levels.map((l) => ({ id: l.id, shortName: l.shortName, georef: l.georef, width: l.widthM, height: l.heightM })), venue: this.state.bundle.event.venue };
  }

  getFloors(): { id: string; name: string; shortName: string; index: number; active: boolean; width: number; height: number; georeferenced: boolean }[] {
    return this.state.bundle.levels.map((l, index) => ({ id: l.id, name: l.name, shortName: l.shortName, index, active: l.id === this.state.levelId, width: l.widthM, height: l.heightM, georeferenced: !!l.georef }));
  }

  activateFloor(idOrShortName: string | number): unknown {
    const level = findLevel(this.state.bundle, idOrShortName);
    if (!level) throw new Error(`Level not found: ${idOrShortName}`);
    const changed = level.id !== this.state.levelId;
    this.setState({ levelId: level.id });
    if (!changed) this.withMap((m) => m.fitLevel());
    const index = this.state.bundle.levels.findIndex((l) => l.id === level.id);
    if (changed) { this.analytics?.track("level_switch", { targetType: "level", targetId: level.id, levelId: level.id }); this.emit("floorActivated", { id: level.id, name: level.name, shortName: level.shortName, index }); }
    return { id: level.id, name: level.name, shortName: level.shortName, index };
  }

  exhibitorsList(): unknown[] {
    const b = this.state.bundle;
    const catName = new Map(b.categories.map((c) => [c.id, c.name]));
    return b.exhibitors.map((e) => ({
      id: e.id, externalId: e.externalId ?? null, gripId: e.gripId ?? null, name: e.name, slug: e.slug, booths: e.boothLabels, boothIds: e.boothIds, categories: e.categoryIds, categoryNames: e.categoryIds.map((c) => catName.get(c) ?? c),
      featured: e.featured, sponsorLevel: e.sponsorLevel ?? null, logo: e.logoUrl ?? null, website: e.website ?? null, country: e.country ?? null, city: e.city ?? null, tags: e.tags, bookmarked: this.isBookmarked("exhibitor", e.id), visited: this.isVisited("exhibitor", e.id),
    }));
  }

  boothsList(): unknown[] {
    const s = this.state.bundle.event.settings;
    return this.state.bundle.booths.map((b) => ({
      id: b.id, name: b.label, label: b.label, externalId: b.externalId ?? null, levelId: b.levelId, level: this.levelById(b.levelId)?.shortName ?? null, status: b.status, type: b.boothType,
      exhibitors: b.exhibitorIds, areaM2: b.areaM2, widthM: b.widthM ?? null, heightM: b.heightM ?? null, price: s.features.showPrices && b.priceCents != null ? { cents: b.priceCents, currency: b.currency ?? s.sales.currency } : null, x: b.center[0], y: b.center[1], polygon: b.polygon,
    }));
  }

  categoriesList(): unknown[] {
    const counts = new Map<string, number>();
    for (const e of this.state.bundle.exhibitors) for (const c of e.categoryIds) counts.set(c, (counts.get(c) ?? 0) + 1);
    return this.state.bundle.categories.map((c) => ({ id: c.id, name: c.name, color: c.color ?? null, parentId: c.parentId ?? null, count: counts.get(c.id) ?? 0, selected: this.state.categoryIds.includes(c.id) }));
  }

  sessionsList(): unknown[] {
    return this.state.bundle.sessions.map((s) => ({ id: s.id, externalId: s.externalId ?? null, title: s.title, startsAt: s.startsAt, endsAt: s.endsAt, boothId: s.boothId ?? null, booth: s.boothId ? this.boothById(s.boothId)?.label ?? null : null, elementId: s.elementId ?? null, location: this.sessionLocationName(s), track: s.track ?? null, speakers: s.speakers, url: s.url ?? null, bookmarked: this.isBookmarked("session", s.id) }));
  }

  sessionLocationName(s: BundleSession): string {
    if (s.boothId) { const b = this.boothById(s.boothId); if (b) return `${this.state.bundle.event.settings.terms.booth} ${b.label}`; }
    if (s.elementId) { const el = this.elementById(s.elementId); if (el && typeof el.props.name === "string") return el.props.name; }
    return "";
  }

  selectCategory(idOrName?: string | string[] | null, opts: { toggle?: boolean } = {}): unknown {
    if (idOrName == null || idOrName === "" || (Array.isArray(idOrName) && !idOrName.length)) { this.clearCategory(); return []; }
    const keys = Array.isArray(idOrName) ? idOrName : String(idOrName).split(",");
    const cats = keys.map((k) => findCategory(this.state.bundle, k.trim())).filter((c): c is BundleCategory => !!c);
    if (!cats.length) throw new Error(`Category not found: ${keys.join(", ")}`);
    let ids = cats.map((c) => c.id);
    if (opts.toggle) {
      const cur = new Set(this.state.categoryIds);
      for (const id of ids) { if (cur.has(id)) cur.delete(id); else cur.add(id); }
      ids = [...cur];
    }
    this.setState({ categoryIds: ids, panel: { kind: "list" }, panelOpen: true, tab: this.state.tab === "categories" ? "categories" : "exhibitors" });
    for (const c of cats) this.analytics?.track("category_select", { targetType: "category", targetId: c.id });
    this.emit("categoryClick", { id: cats[0].id, name: cats[0].name, selected: ids });
    return ids;
  }

  clearCategory(): void {
    if (!this.state.categoryIds.length) return;
    this.setState({ categoryIds: [] });
    this.emit("categoryClick", { id: null, name: null, selected: [] });
  }

  showSearch(): void { this.setState({ panel: { kind: "list" }, tab: "exhibitors", panelOpen: true, searchFocused: true }); }
  hideSearch(): void { this.setState({ searchFocused: false, searchQuery: "" }); }

  showList(list: "bookmarks" | "exhibitors" | "sessions" | "language" | "visited" | "categories" | "plan"): void {
    if (list === "language") { this.setState({ dialog: { kind: "language" } }); return; }
    const tab: ViewerTab = list === "bookmarks" || list === "visited" || list === "plan" ? "plan" : list;
    this.setTab(tab);
  }

  applyParameters(params: ViewerParams | string | null | undefined, opts: { initial?: boolean } = {}): void {
    const p = typeof params === "string" ? parseViewerParams(params) : (params ?? {});
    const b = this.state.bundle;
    const patch: Partial<ViewerState> = {};
    if (p.lang && isLocale(p.lang)) patch.locale = p.lang;
    if (p.theme) patch.theme = p.theme;
    if (p.view) patch.view = p.view === "3d" && b.event.settings.features.threeD ? "3d" : "2d";
    if (p.kiosk) patch.kiosk = p.kiosk === "1";
    if (p.tab) patch.tab = p.tab;
    if (p.hide !== undefined || p.noOverlay) {
      const hide = parseHide(p.hide);
      const noOverlay = p.noOverlay === "1" || hide.has("overlay");
      patch.visibility = { controls: !hide.has("controls"), levels: !hide.has("levels"), header: !hide.has("header"), overlay: !noOverlay, searchButtons: !hide.has("searchButtons") };
      patch.noOverlay = noOverlay;
      if (noOverlay) patch.panelOpen = false;
    }
    if (p.level) { const l = findLevel(b, p.level); if (l) patch.levelId = l.id; }
    if (p.search !== undefined) patch.searchQuery = p.search;
    if (Object.keys(patch).length) this.setState(patch);
    if (p.position) {
      const pos = parsePosition(p.position);
      if (pos) { const l = (pos.level && findLevel(b, pos.level)) || this.levelById(patch.levelId ?? this.state.levelId); if (l) this.selectCurrentPosition(pos.x, pos.y, !opts.initial, l.id); }
    }
    if (p.category) { try { this.selectCategory(p.category); } catch { /* ignore */ } }
    if (p.exhibitor) this.openExhibitor(p.exhibitor);
    else if (p.booth) { try { this.selectBooth(p.booth); } catch { /* ignore */ } }
    else if (p.session) { const se = findSession(b, p.session); if (se) this.openSession(se.id); }
    const waypoints = parseRouteParam(p.route);
    if (waypoints.length) { try { this.selectRoute(waypoints, p.accessible === "1"); } catch { /* keep the panel with the error */ } }
    else if (p.to) { try { this.selectRoute(p.from ?? null, p.to, p.accessible === "1"); } catch { /* keep the error visible */ } }
    if (p.plan) {
      if (p.plan.startsWith("sp_")) void this.loadSharedPlan(p.plan);
      else { const labels = parseList(p.plan); if (labels.length) { this.setBookmarks(labels); this.setState({ tab: "plan", highlightedBoothIds: labels.map((l) => this.resolveBooth(l)?.id).filter((x): x is string => !!x) }); } }
    }
    if (!opts.initial && (p.bearing || p.zoom || p.center)) {
      const center = parsePlanPoint(p.center);
      this.setCamera({ bearing: parseNumber(p.bearing), zoom: parseNumber(p.zoom), ...(center ? { x: center[0], y: center[1] } : {}) });
    }
  }

  setLanguage(lang: string): Locale {
    const locale = resolveLocale({ requested: lang, eventLocale: this.state.bundle.event.settings.locale, eventLanguages: this.state.bundle.event.settings.languages });
    this.setState({ locale, dialog: this.state.dialog?.kind === "language" ? null : this.state.dialog });
    return locale;
  }

  changeLanguage(lang: string): Locale { return this.setLanguage(lang); }

  getLanguage(): Locale { return this.state.locale; }

  setKiosk(on: boolean): void { this.setState({ kiosk: !!on }); }

  setTheme(theme: "light" | "dark" | "toggle"): "light" | "dark" {
    const next = theme === "toggle" ? (this.state.theme === "dark" ? "light" : "dark") : theme === "dark" ? "dark" : "light";
    this.setState({ theme: next });
    return next;
  }

  /** Serialisable summary of the viewer state (SDK `getState`, `stateChanged`). */
  getState(): unknown {
    const s = this.state;
    return {
      version: s.bundle.version, levelId: s.levelId, level: this.levelById(s.levelId)?.shortName ?? null,
      selectedBooths: s.selectedBoothIds.map((id) => this.boothById(id)?.label ?? id), selectedExhibitor: s.selectedExhibitorId,
      panel: s.panel, tab: s.tab, categories: s.categoryIds, route: s.route ? this.routePayload(s.route) : null, position: s.position, gpsTracking: s.gpsTracking,
      bookmarks: this.getBookmarks(), markers: s.markers.length, circles: s.circles.length, highlighted: s.highlightedBoothIds.length,
      language: s.locale, theme: s.theme, view: s.view, kiosk: s.kiosk, visibility: s.visibility, search: s.searchQuery, camera: s.camera,
    };
  }

  getVersion(): { version: number; sdk: number; generatedAt: string } {
    return { version: this.state.bundle.version, sdk: SDK_PROTOCOL_VERSION, generatedAt: this.state.bundle.generatedAt };
  }

  /** Back to the initial view: clears selection, route, filters, search, markers; keeps kiosk position/config. */
  reset(): void {
    const s = this.state;
    const hadRoute = !!s.route || !!s.routeRequest;
    this.setState({
      panel: { kind: "list" }, tab: "exhibitors", searchQuery: "", searchFocused: false, selectedBoothIds: [], selectedExhibitorId: null, categoryIds: [],
      routeRequest: null, route: null, routeError: null, optimized: null, markers: [], circles: [], highlightedBoothIds: [], dialog: null, notice: null,
      levelId: s.position?.levelId ?? s.bundle.levels[0]?.id ?? s.levelId, panelOpen: !s.noOverlay, view: "2d", locale: this.initialLocale,
    });
    this.withMap((m) => { m.hidePopup(); m.fitLevel(); });
    if (hadRoute) { this.emit("direction", null); this.emit("routeCleared", null); }
  }

  /** Dispatch an SDK call by name (used by the embed bridge and `window.__tesseraViewer`). */
  async call(method: SdkMethod, args: unknown[] = []): Promise<unknown> {
    if (!(SDK_METHODS as readonly string[]).includes(method)) throw new Error(`Unknown method: ${method}`);
    const fn = (this as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
    if (typeof fn !== "function") throw new Error(`Method not implemented: ${method}`);
    const out = await fn.apply(this, args);
    return out === undefined ? null : out;
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                              */
/* ------------------------------------------------------------------ */

function round2(n: number): number { return Math.round(n * 100) / 100 + 0; }

function parsePlanPoint(v: string | undefined): Point | undefined {
  const p = parsePosition(v);
  return p ? [p.x, p.y] : undefined;
}

function growBBox(b: BBox, m: number): BBox {
  return { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m };
}

function normaliseBBox(v: unknown): BBox | null {
  if (!v) return null;
  if (Array.isArray(v) && v.length === 2 && Array.isArray(v[0]) && Array.isArray(v[1])) {
    const [[x1, y1], [x2, y2]] = v as [Point, Point];
    return { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2) };
  }
  const o = v as Partial<BBox>;
  if ([o.minX, o.minY, o.maxX, o.maxY].every((n) => typeof n === "number")) return o as BBox;
  return null;
}

/** Concatenate optimiser legs into one drawable route. */
function mergeLegs(legs: RouteResult[], from: RouteEndpoint, to: RouteEndpoint, accessible: boolean): RouteResult | null {
  if (!legs.length) return null;
  const steps: RouteStep[] = [];
  const levelIds: string[] = [];
  let distanceM = 0, durationSeconds = 0;
  for (const l of legs) {
    steps.push(...l.steps);
    distanceM += l.distanceM;
    durationSeconds += l.durationSeconds;
    for (const id of l.levelIds) if (levelIds[levelIds.length - 1] !== id) levelIds.push(id);
  }
  return { ok: true, from, to, accessible, distanceM: Math.round(distanceM * 100) / 100, durationSeconds, steps, levelIds };
}
