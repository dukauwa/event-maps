/**
 * Tessera embed SDK. Drop-in replacement for ExpoFP's `new ExpoFP.FloorPlan({...})` / `load({...})`.
 *
 *   <div id="floorplan" style="height:100vh"></div>
 *   <script src="https://YOUR-HOST/sdk/tessera.js"></script>
 *   <script>
 *     const fp = new Tessera.FloorPlan({ element: "#floorplan", eventId: "grip-connect-2026", baseUrl: "https://YOUR-HOST",
 *       onBoothClick: (e) => console.log(e), onInit: (fp) => fp.selectBooth("A101") });
 *   </script>
 *
 * The viewer runs in an iframe; every method is proxied over postMessage and returns a Promise.
 */
import { SDK_MARK, SDK_METHODS, SDK_EVENTS, SDK_PROTOCOL_VERSION, isSdkMessage, type SdkMethod, type SdkEvent, type SdkCallMessage, type SdkMessage, type ViewerParams, type SdkMarker, type SdkCamera } from "../../../src/lib/sdk-protocol";

export type { ViewerParams, SdkMarker, SdkCamera, SdkMethod, SdkEvent };

export type EventHandler = (payload: unknown) => void;
type HandlerMap = Partial<Record<`on${Capitalize<SdkEvent>}`, EventHandler>>;

export interface FloorPlanOptions extends HandlerMap {
  /** Container element or CSS selector. Defaults to `#floorplan`, else a full-screen fixed div. */
  element?: HTMLElement | string;
  /** Event slug or id (as in /e/{eventId}). */
  eventId?: string;
  /** Origin of the Tessera server, e.g. https://maps.grip.events. Defaults to the origin the SDK script was loaded from. */
  baseUrl?: string;
  /** Full viewer URL (overrides baseUrl + eventId). */
  viewerUrl?: string;
  /** Initial viewer parameters / deep link (booth, exhibitor, route, level, lang, kiosk, theme...). */
  params?: ViewerParams;
  /** Hide the viewer's own panels (map only; host drives via methods). */
  noOverlay?: boolean;
  /** Do not write selection state into the iframe URL/history. */
  offHistory?: boolean;
  /** Ignore the host page's query string (otherwise `?booth=`, `?exhibitor=`, `?route=`, `?lang=` etc. are forwarded). */
  ignoreQuery?: boolean;
  kiosk?: boolean;
  language?: string;
  consent?: "ask" | "granted" | "denied";
  theme?: "light" | "dark";
  /** Called when the API is live (viewer loaded, data applied). ExpoFP: onInit / onFpConfigured. */
  onInit?: (fp: FloorPlan) => void;
  /** Catch-all for every event. */
  onEvent?: (name: SdkEvent, payload: unknown) => void;
  /** Milliseconds before a method call rejects. Default 30000. */
  timeoutMs?: number;
  /** Extra iframe attributes (e.g. { title: "Floor plan" }). */
  iframeAttributes?: Record<string, string>;
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

const FORWARDED_QUERY = ["booth", "exhibitor", "category", "level", "route", "from", "to", "accessible", "search", "lang", "kiosk", "plan", "position", "view", "theme", "session", "hide", "tab"];

let counter = 0;

/** Ready-state helper so `fp.ready.then(...)` works like ExpoFP. */
export class FloorPlan {
  readonly element: HTMLElement;
  readonly iframe: HTMLIFrameElement;
  readonly ready: Promise<FloorPlan>;
  private resolveReady!: (fp: FloorPlan) => void;
  private rejectReady!: (e: Error) => void;
  private pending = new Map<string, Pending>();
  private listeners = new Map<SdkEvent, Set<EventHandler>>();
  private queue: SdkCallMessage[] = [];
  private isReady = false;
  private destroyed = false;
  private readonly origin: string;
  private readonly options: FloorPlanOptions;
  private readonly onMessage = (ev: MessageEvent) => this.handleMessage(ev);

  constructor(options: FloorPlanOptions = {}) {
    this.options = options;
    this.element = resolveElement(options.element);
    if ((this.element as HTMLElement & { __tessera?: FloorPlan }).__tessera) throw new Error("Element already hosts a floor plan");
    (this.element as HTMLElement & { __tessera?: FloorPlan }).__tessera = this;
    const url = this.buildUrl();
    this.origin = new URL(url).origin;
    this.ready = new Promise<FloorPlan>((res, rej) => { this.resolveReady = res; this.rejectReady = rej; });
    this.iframe = document.createElement("iframe");
    this.iframe.src = url;
    this.iframe.setAttribute("allow", "geolocation; clipboard-read; clipboard-write; web-share; fullscreen");
    this.iframe.setAttribute("title", options.iframeAttributes?.title ?? "Interactive floor plan");
    this.iframe.style.cssText = "border:0;width:100%;height:100%;display:block;background:transparent";
    for (const [k, v] of Object.entries(options.iframeAttributes ?? {})) this.iframe.setAttribute(k, v);
    if (!this.element.style.height && !this.element.getAttribute("style")?.includes("height")) this.element.style.minHeight = "480px";
    this.element.appendChild(this.iframe);
    window.addEventListener("message", this.onMessage);
    // Wire on* handlers from options.
    for (const name of SDK_EVENTS) {
      const key = `on${name[0].toUpperCase()}${name.slice(1)}` as keyof HandlerMap;
      const h = options[key];
      if (typeof h === "function") this.on(name, h as EventHandler);
    }
    this.ready.then((fp) => options.onInit?.(fp)).catch(() => undefined);
  }

  private buildUrl(): string {
    const o = this.options;
    if (o.viewerUrl) {
      const u = new URL(o.viewerUrl, location.href);
      this.applyParams(u);
      return u.toString();
    }
    const base = (o.baseUrl ?? scriptOrigin() ?? location.origin).replace(/\/$/, "");
    const id = o.eventId ?? this.element.getAttribute("data-event-id") ?? this.element.getAttribute("data-event") ?? this.element.getAttribute("data-tessera-event");
    if (!id) throw new Error("Tessera.FloorPlan: eventId is required");
    const u = new URL(`${base}/e/${encodeURIComponent(id)}/embed`);
    this.applyParams(u);
    return u.toString();
  }

  private applyParams(u: URL) {
    const o = this.options;
    u.searchParams.set("embed", "1");
    if (!o.ignoreQuery) {
      const host = new URLSearchParams(location.search);
      for (const k of FORWARDED_QUERY) { const v = host.get(k); if (v != null && !u.searchParams.has(k)) u.searchParams.set(k, v); }
    }
    for (const [k, v] of Object.entries(o.params ?? {})) if (v != null) u.searchParams.set(k, String(v));
    if (o.noOverlay) u.searchParams.set("noOverlay", "1");
    if (o.offHistory) u.searchParams.set("offHistory", "1");
    if (o.kiosk) u.searchParams.set("kiosk", "1");
    if (o.language) u.searchParams.set("lang", o.language);
    if (o.consent) u.searchParams.set("consent", o.consent);
    if (o.theme) u.searchParams.set("theme", o.theme);
  }

  private handleMessage(ev: MessageEvent) {
    if (ev.source !== this.iframe.contentWindow) return;
    if (ev.origin !== this.origin && this.origin !== "null") return;
    const data: unknown = ev.data;
    if (!isSdkMessage(data)) return;
    const msg = data as SdkMessage;
    if (msg.type === "result") {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.value); else p.reject(new Error(msg.error ?? "Floor plan call failed"));
      return;
    }
    if (msg.type === "event") {
      if (msg.name === "ready" && !this.isReady) {
        this.isReady = true;
        for (const q of this.queue) this.post(q);
        this.queue = [];
        this.resolveReady(this);
      }
      this.options.onEvent?.(msg.name, msg.payload);
      this.listeners.get(msg.name)?.forEach((h) => { try { h(msg.payload); } catch (e) { console.error("[tessera] handler error", e); } });
    }
  }

  private post(msg: SdkCallMessage) {
    this.iframe.contentWindow?.postMessage(msg, this.origin === "null" ? "*" : this.origin);
  }

  /** Call any viewer method by name. Prefer the typed wrappers below. */
  call<T = unknown>(method: SdkMethod, ...args: unknown[]): Promise<T> {
    if (this.destroyed) return Promise.reject(new Error("Floor plan destroyed"));
    const id = `c${++counter}`;
    const msg: SdkCallMessage = { [SDK_MARK]: true, v: SDK_PROTOCOL_VERSION, type: "call", id, method, args };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timed out calling ${method}`)); }, this.options.timeoutMs ?? 30000);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      if (this.isReady) this.post(msg); else this.queue.push(msg);
    });
  }

  on(event: SdkEvent, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => this.off(event, handler);
  }
  off(event: SdkEvent, handler: EventHandler) { this.listeners.get(event)?.delete(handler); }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener("message", this.onMessage);
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error("Floor plan destroyed")); }
    this.pending.clear();
    this.iframe.remove();
    delete (this.element as HTMLElement & { __tessera?: FloorPlan }).__tessera;
    if (!this.isReady) this.rejectReady(new Error("FloorPlan destroyed before it finished loading"));
  }
  /** ExpoFP alias. */
  unstable_destroy() { this.destroy(); }

  /* ---- Typed wrappers (ExpoFP-compatible names) ---- */
  selectBooth(nameOrId: string | string[]) { return this.call<void>("selectBooth", nameOrId); }
  selectExhibitor(idOrSlug: string | string[]) { return this.call<void>("selectExhibitor", idOrSlug); }
  select(slugOrExternalId: string) { return this.call<void>("select", slugOrExternalId); }
  selectCategory(idOrName?: string) { return this.call<void>("selectCategory", idOrName); }
  clearCategory() { return this.call<void>("clearCategory"); }
  selectRoute(from: string | string[], to?: string, accessible?: boolean) { return this.call<unknown>("selectRoute", from, to, accessible); }
  selectAccessibleRoute(waypoints: string[]) { return this.call<unknown>("selectAccessibleRoute", waypoints); }
  clearRoute() { return this.call<void>("clearRoute"); }
  deselectRoute() { return this.call<void>("deselectRoute"); }
  getRoute() { return this.call<unknown>("getRoute"); }
  getOptimizedRoutes(labels: string[]) { return this.call<unknown>("getOptimizedRoutes", labels); }
  openPlanner(opts?: { items?: string[]; from?: string }) { return this.call<void>("openPlanner", opts); }
  selectCurrentPosition(x: number, y: number, focus = true, levelId?: string) { return this.call<void>("selectCurrentPosition", x, y, focus, levelId); }
  deselectCurrentPosition() { return this.call<void>("deselectCurrentPosition"); }
  clearCurrentPosition() { return this.call<void>("clearCurrentPosition"); }
  findLocation() { return this.call<void>("findLocation"); }
  isGpsTrackingEnabled() { return this.call<boolean>("isGpsTrackingEnabled"); }
  setGpsTrackingEnabled(v: boolean) { return this.call<void>("setGpsTrackingEnabled", v); }
  setBookmarks(ids: string[]) { return this.call<void>("setBookmarks", ids); }
  getBookmarks() { return this.call<string[]>("getBookmarks"); }
  setEntitiesBookmarks(items: { type: string; name?: string; externalId?: string; id?: string; bookmarked: boolean }[]) { return this.call<void>("setEntitiesBookmarks", items); }
  setEntitiesVisited(items: { type: string; name?: string; externalId?: string; id?: string; visited: boolean }[]) { return this.call<void>("setEntitiesVisited", items); }
  setMarkers(markers: SdkMarker[]) { return this.call<void>("setMarkers", markers); }
  clearMarkers() { return this.call<void>("clearMarkers"); }
  selectMarker(id: string, focus?: boolean) { return this.call<void>("selectMarker", id, focus); }
  drawCircles(circles: { x: number; y: number; radius: number; color?: string; levelId?: string }[]) { return this.call<void>("drawCircles", circles); }
  clearCircles() { return this.call<void>("clearCircles"); }
  highlightBooths(labels: string[]) { return this.call<void>("highlightBooths", labels); }
  highlightExhibitors(ids: string[]) { return this.call<void>("highlightExhibitors", ids); }
  clearHighlights() { return this.call<void>("clearHighlights"); }
  updateLayerVisibility(layer: string, visible: boolean) { return this.call<void>("updateLayerVisibility", layer, visible); }
  getVisibility() { return this.call<Record<string, boolean>>("getVisibility"); }
  setVisibility(v: { controls?: boolean; levels?: boolean; header?: boolean; overlay?: boolean; searchButtons?: boolean }) { return this.call<void>("setVisibility", v); }
  zoomIn() { return this.call<void>("zoomIn"); }
  zoomOut() { return this.call<void>("zoomOut"); }
  switchView() { return this.call<void>("switchView"); }
  fitBounds(bounds?: unknown) { return this.call<void>("fitBounds", bounds); }
  getBounds(selectors?: unknown) { return this.call<unknown>("getBounds", selectors); }
  zoomTo(selectors: { booths?: string[]; exhibitors?: string[] }, opts?: { padding?: number }) { return this.call<void>("zoomTo", selectors, opts); }
  setCamera(camera: SdkCamera) { return this.call<void>("setCamera", camera); }
  getCamera() { return this.call<SdkCamera>("getCamera"); }
  flyTo(camera: SdkCamera) { return this.call<void>("flyTo", camera); }
  getCenterCoordinates() { return this.call<{ x: number; y: number; levelId: string }>("getCenterCoordinates"); }
  getBoothRect(label: string) { return this.call<unknown>("getBoothRect", label); }
  getBoothsGeometry() { return this.call<unknown>("getBoothsGeometry"); }
  convertToGeo(x: number, y: number, levelId?: string) { return this.call<[number, number]>("convertToGeo", x, y, levelId); }
  convertFromGeo(lng: number, lat: number, levelId?: string) { return this.call<[number, number]>("convertFromGeo", lng, lat, levelId); }
  getGeoConfig() { return this.call<unknown>("getGeoConfig"); }
  getFloors() { return this.call<unknown[]>("getFloors"); }
  activateFloor(idOrShortName: string | number) { return this.call<void>("activateFloor", idOrShortName); }
  exhibitorsList() { return this.call<unknown[]>("exhibitorsList"); }
  boothsList() { return this.call<unknown[]>("boothsList"); }
  categoriesList() { return this.call<unknown[]>("categoriesList"); }
  sessionsList() { return this.call<unknown[]>("sessionsList"); }
  search(q: string) { return this.call<unknown[]>("search", q); }
  showSearch() { return this.call<void>("showSearch"); }
  hideSearch() { return this.call<void>("hideSearch"); }
  showList(list: "bookmarks" | "exhibitors" | "sessions" | "language" | "visited" | "categories") { return this.call<void>("showList", list); }
  openExhibitor(idOrSlug: string) { return this.call<void>("openExhibitor", idOrSlug); }
  closePanel() { return this.call<void>("closePanel"); }
  applyParameters(params: ViewerParams | string) { return this.call<void>("applyParameters", params); }
  setLanguage(lang: string) { return this.call<void>("setLanguage", lang); }
  changeLanguage(lang: string) { return this.call<void>("changeLanguage", lang); }
  getLanguage() { return this.call<string>("getLanguage"); }
  setKiosk(on: boolean) { return this.call<void>("setKiosk", on); }
  setTheme(theme: "light" | "dark") { return this.call<void>("setTheme", theme); }
  getState() { return this.call<unknown>("getState"); }
  getVersion() { return this.call<{ version: number; sdk: number }>("getVersion"); }
  reset() { return this.call<void>("reset"); }
}

function resolveElement(el?: HTMLElement | string): HTMLElement {
  if (el instanceof HTMLElement) return el;
  if (typeof el === "string") { const found = document.querySelector<HTMLElement>(el); if (!found) throw new Error(`Tessera: element '${el}' not found`); return found; }
  const dflt = document.getElementById("floorplan");
  if (dflt) return dflt;
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;inset:0;height:100dvh;width:100vw;z-index:1";
  document.body.appendChild(div);
  return div;
}

function scriptOrigin(): string | null {
  try {
    const s = (document.currentScript as HTMLScriptElement | null)?.src || Array.from(document.scripts).map((x) => x.src).find((src) => /\/sdk\/tessera(\.esm)?\.js/.test(src));
    return s ? new URL(s, location.href).origin : null;
  } catch { return null; }
}

/** ExpoFP v3-style entry point: `load({ $ref: "https://host/e/slug" })` or `load("slug", { baseUrl })`. */
export function load(ref: string | { $ref: string }, options: FloorPlanOptions = {}): Promise<FloorPlan> {
  if (typeof ref === "string") return new FloorPlan({ ...options, eventId: ref }).ready;
  const u = new URL(ref.$ref, location.href);
  const m = u.pathname.match(/\/e\/([^/]+)/);
  if (m) return new FloorPlan({ ...options, baseUrl: u.origin, eventId: decodeURIComponent(m[1]) }).ready;
  return new FloorPlan({ ...options, viewerUrl: ref.$ref }).ready;
}

/** Auto-initialise `<div data-tessera-event="slug" data-base-url="https://host">` elements. */
export function autoInit(): FloorPlan[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-tessera-event]")).filter((el) => !(el as HTMLElement & { __tessera?: FloorPlan }).__tessera).map((el) => new FloorPlan({ element: el, eventId: el.dataset.tesseraEvent, baseUrl: el.dataset.baseUrl, noOverlay: el.dataset.noOverlay === "1", language: el.dataset.lang, kiosk: el.dataset.kiosk === "1" }));
}

export const version = SDK_PROTOCOL_VERSION;
export const methods = SDK_METHODS;
export const events = SDK_EVENTS;

if (typeof document !== "undefined") {
  const run = () => autoInit();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else queueMicrotask(run);
}
