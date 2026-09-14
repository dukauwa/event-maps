/* Tessera embed SDK · 2026-09-14 · https://github.com/dukauwa/event-maps */

// src/lib/sdk-protocol.ts
var SDK_PROTOCOL_VERSION = 1;
var SDK_MARK = "tessera";
var SDK_METHODS = [
  "selectBooth",
  "selectExhibitor",
  "selectRoute",
  "clearRoute",
  "getOptimizedRoutes",
  "selectCurrentPosition",
  "clearCurrentPosition",
  "setBookmarks",
  "getBookmarks",
  "setMarkers",
  "clearMarkers",
  "updateLayerVisibility",
  "getCenterCoordinates",
  "applyParameters",
  "exhibitorsList",
  "boothsList",
  "categoriesList",
  "sessionsList",
  "selectCategory",
  "clearCategory",
  "getVisibility",
  "setVisibility",
  "findLocation",
  "zoomIn",
  "zoomOut",
  "switchView",
  "fitBounds",
  "getBoothRect",
  "convertToGeo",
  "convertFromGeo",
  "highlightExhibitors",
  "highlightBooths",
  "clearHighlights",
  "search",
  "getFloors",
  "activateFloor",
  "showSearch",
  "hideSearch",
  "setLanguage",
  "getLanguage",
  "setKiosk",
  "getState",
  "getVersion",
  "flyTo",
  "setTheme",
  "openExhibitor",
  "closePanel",
  // ExpoFP v3 parity
  "select",
  "selectAccessibleRoute",
  "deselectRoute",
  "openPlanner",
  "showList",
  "deselectCurrentPosition",
  "isGpsTrackingEnabled",
  "setGpsTrackingEnabled",
  "setEntitiesBookmarks",
  "setEntitiesVisited",
  "selectMarker",
  "drawCircles",
  "clearCircles",
  "setCamera",
  "getCamera",
  "zoomTo",
  "getBounds",
  "getGeoConfig",
  "changeLanguage",
  "reset",
  "getBoothsGeometry",
  "getRoute"
];
var SDK_EVENTS = [
  "init",
  "ready",
  "fpConfigured",
  "boothClick",
  "exhibitorClick",
  "details",
  "direction",
  "routeCleared",
  "bookmarkClick",
  "bookmarksChanged",
  "visitedClick",
  "categoryClick",
  "floorActivated",
  "currentPositionChanged",
  "markerClick",
  "exhibitorCustomButtonClick",
  "getCoordsClick",
  "search",
  "share",
  "reserveClick",
  "error",
  "leaveEvent",
  "sessionClick",
  "cameraChanged",
  "stateChanged"
];
function isSdkMessage(data) {
  return !!data && typeof data === "object" && data[SDK_MARK] === true;
}

// packages/sdk/src/index.ts
var FORWARDED_QUERY = ["booth", "exhibitor", "category", "level", "route", "from", "to", "accessible", "search", "lang", "kiosk", "plan", "position", "view", "theme", "session", "hide", "tab"];
var counter = 0;
var FloorPlan = class {
  constructor(options = {}) {
    this.pending = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Map();
    this.queue = [];
    this.isReady = false;
    this.destroyed = false;
    this.onMessage = (ev) => this.handleMessage(ev);
    this.options = options;
    this.element = resolveElement(options.element);
    if (this.element.__tessera) throw new Error("Element already hosts a floor plan");
    this.element.__tessera = this;
    const url = this.buildUrl();
    this.origin = new URL(url).origin;
    this.ready = new Promise((res, rej) => {
      this.resolveReady = res;
      this.rejectReady = rej;
    });
    this.iframe = document.createElement("iframe");
    this.iframe.src = url;
    this.iframe.setAttribute("allow", "geolocation; clipboard-read; clipboard-write; web-share; fullscreen");
    this.iframe.setAttribute("title", options.iframeAttributes?.title ?? "Interactive floor plan");
    this.iframe.style.cssText = "border:0;width:100%;height:100%;display:block;background:transparent";
    for (const [k, v] of Object.entries(options.iframeAttributes ?? {})) this.iframe.setAttribute(k, v);
    if (!this.element.style.height && !this.element.getAttribute("style")?.includes("height")) this.element.style.minHeight = "480px";
    this.element.appendChild(this.iframe);
    window.addEventListener("message", this.onMessage);
    for (const name of SDK_EVENTS) {
      const key = `on${name[0].toUpperCase()}${name.slice(1)}`;
      const h = options[key];
      if (typeof h === "function") this.on(name, h);
    }
    this.ready.then((fp) => options.onInit?.(fp)).catch(() => void 0);
  }
  buildUrl() {
    const o = this.options;
    if (o.viewerUrl) {
      const u2 = new URL(o.viewerUrl, location.href);
      this.applyParams(u2);
      return u2.toString();
    }
    const base = (o.baseUrl ?? scriptOrigin() ?? location.origin).replace(/\/$/, "");
    const id = o.eventId ?? this.element.getAttribute("data-event-id") ?? this.element.getAttribute("data-event") ?? this.element.getAttribute("data-tessera-event");
    if (!id) throw new Error("Tessera.FloorPlan: eventId is required");
    const u = new URL(`${base}/e/${encodeURIComponent(id)}/embed`);
    this.applyParams(u);
    return u.toString();
  }
  applyParams(u) {
    const o = this.options;
    u.searchParams.set("embed", "1");
    if (!o.ignoreQuery) {
      const host = new URLSearchParams(location.search);
      for (const k of FORWARDED_QUERY) {
        const v = host.get(k);
        if (v != null && !u.searchParams.has(k)) u.searchParams.set(k, v);
      }
    }
    for (const [k, v] of Object.entries(o.params ?? {})) if (v != null) u.searchParams.set(k, String(v));
    if (o.noOverlay) u.searchParams.set("noOverlay", "1");
    if (o.offHistory) u.searchParams.set("offHistory", "1");
    if (o.kiosk) u.searchParams.set("kiosk", "1");
    if (o.language) u.searchParams.set("lang", o.language);
    if (o.consent) u.searchParams.set("consent", o.consent);
    if (o.theme) u.searchParams.set("theme", o.theme);
  }
  handleMessage(ev) {
    if (ev.source !== this.iframe.contentWindow) return;
    if (ev.origin !== this.origin && this.origin !== "null") return;
    const data = ev.data;
    if (!isSdkMessage(data)) return;
    const msg = data;
    if (msg.type === "result") {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.value);
      else p.reject(new Error(msg.error ?? "Floor plan call failed"));
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
      this.listeners.get(msg.name)?.forEach((h) => {
        try {
          h(msg.payload);
        } catch (e) {
          console.error("[tessera] handler error", e);
        }
      });
    }
  }
  post(msg) {
    this.iframe.contentWindow?.postMessage(msg, this.origin === "null" ? "*" : this.origin);
  }
  /** Call any viewer method by name. Prefer the typed wrappers below. */
  call(method, ...args) {
    if (this.destroyed) return Promise.reject(new Error("Floor plan destroyed"));
    const id = `c${++counter}`;
    const msg = { [SDK_MARK]: true, v: SDK_PROTOCOL_VERSION, type: "call", id, method, args };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out calling ${method}`));
      }, this.options.timeoutMs ?? 3e4);
      this.pending.set(id, { resolve, reject, timer });
      if (this.isReady) this.post(msg);
      else this.queue.push(msg);
    });
  }
  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, /* @__PURE__ */ new Set());
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }
  off(event, handler) {
    this.listeners.get(event)?.delete(handler);
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener("message", this.onMessage);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Floor plan destroyed"));
    }
    this.pending.clear();
    this.iframe.remove();
    delete this.element.__tessera;
    if (!this.isReady) this.rejectReady(new Error("FloorPlan destroyed before it finished loading"));
  }
  /** ExpoFP alias. */
  unstable_destroy() {
    this.destroy();
  }
  /* ---- Typed wrappers (ExpoFP-compatible names) ---- */
  selectBooth(nameOrId) {
    return this.call("selectBooth", nameOrId);
  }
  selectExhibitor(idOrSlug) {
    return this.call("selectExhibitor", idOrSlug);
  }
  select(slugOrExternalId) {
    return this.call("select", slugOrExternalId);
  }
  selectCategory(idOrName) {
    return this.call("selectCategory", idOrName);
  }
  clearCategory() {
    return this.call("clearCategory");
  }
  selectRoute(from, to, accessible) {
    return this.call("selectRoute", from, to, accessible);
  }
  selectAccessibleRoute(waypoints) {
    return this.call("selectAccessibleRoute", waypoints);
  }
  clearRoute() {
    return this.call("clearRoute");
  }
  deselectRoute() {
    return this.call("deselectRoute");
  }
  getRoute() {
    return this.call("getRoute");
  }
  getOptimizedRoutes(labels) {
    return this.call("getOptimizedRoutes", labels);
  }
  openPlanner(opts) {
    return this.call("openPlanner", opts);
  }
  selectCurrentPosition(x, y, focus = true, levelId) {
    return this.call("selectCurrentPosition", x, y, focus, levelId);
  }
  deselectCurrentPosition() {
    return this.call("deselectCurrentPosition");
  }
  clearCurrentPosition() {
    return this.call("clearCurrentPosition");
  }
  findLocation() {
    return this.call("findLocation");
  }
  isGpsTrackingEnabled() {
    return this.call("isGpsTrackingEnabled");
  }
  setGpsTrackingEnabled(v) {
    return this.call("setGpsTrackingEnabled", v);
  }
  setBookmarks(ids) {
    return this.call("setBookmarks", ids);
  }
  getBookmarks() {
    return this.call("getBookmarks");
  }
  setEntitiesBookmarks(items) {
    return this.call("setEntitiesBookmarks", items);
  }
  setEntitiesVisited(items) {
    return this.call("setEntitiesVisited", items);
  }
  setMarkers(markers) {
    return this.call("setMarkers", markers);
  }
  clearMarkers() {
    return this.call("clearMarkers");
  }
  selectMarker(id, focus) {
    return this.call("selectMarker", id, focus);
  }
  drawCircles(circles) {
    return this.call("drawCircles", circles);
  }
  clearCircles() {
    return this.call("clearCircles");
  }
  highlightBooths(labels) {
    return this.call("highlightBooths", labels);
  }
  highlightExhibitors(ids) {
    return this.call("highlightExhibitors", ids);
  }
  clearHighlights() {
    return this.call("clearHighlights");
  }
  updateLayerVisibility(layer, visible) {
    return this.call("updateLayerVisibility", layer, visible);
  }
  getVisibility() {
    return this.call("getVisibility");
  }
  setVisibility(v) {
    return this.call("setVisibility", v);
  }
  zoomIn() {
    return this.call("zoomIn");
  }
  zoomOut() {
    return this.call("zoomOut");
  }
  switchView() {
    return this.call("switchView");
  }
  fitBounds(bounds) {
    return this.call("fitBounds", bounds);
  }
  getBounds(selectors) {
    return this.call("getBounds", selectors);
  }
  zoomTo(selectors, opts) {
    return this.call("zoomTo", selectors, opts);
  }
  setCamera(camera) {
    return this.call("setCamera", camera);
  }
  getCamera() {
    return this.call("getCamera");
  }
  flyTo(camera) {
    return this.call("flyTo", camera);
  }
  getCenterCoordinates() {
    return this.call("getCenterCoordinates");
  }
  getBoothRect(label) {
    return this.call("getBoothRect", label);
  }
  getBoothsGeometry() {
    return this.call("getBoothsGeometry");
  }
  convertToGeo(x, y, levelId) {
    return this.call("convertToGeo", x, y, levelId);
  }
  convertFromGeo(lng, lat, levelId) {
    return this.call("convertFromGeo", lng, lat, levelId);
  }
  getGeoConfig() {
    return this.call("getGeoConfig");
  }
  getFloors() {
    return this.call("getFloors");
  }
  activateFloor(idOrShortName) {
    return this.call("activateFloor", idOrShortName);
  }
  exhibitorsList() {
    return this.call("exhibitorsList");
  }
  boothsList() {
    return this.call("boothsList");
  }
  categoriesList() {
    return this.call("categoriesList");
  }
  sessionsList() {
    return this.call("sessionsList");
  }
  search(q) {
    return this.call("search", q);
  }
  showSearch() {
    return this.call("showSearch");
  }
  hideSearch() {
    return this.call("hideSearch");
  }
  showList(list) {
    return this.call("showList", list);
  }
  openExhibitor(idOrSlug) {
    return this.call("openExhibitor", idOrSlug);
  }
  closePanel() {
    return this.call("closePanel");
  }
  applyParameters(params) {
    return this.call("applyParameters", params);
  }
  setLanguage(lang) {
    return this.call("setLanguage", lang);
  }
  changeLanguage(lang) {
    return this.call("changeLanguage", lang);
  }
  getLanguage() {
    return this.call("getLanguage");
  }
  setKiosk(on) {
    return this.call("setKiosk", on);
  }
  setTheme(theme) {
    return this.call("setTheme", theme);
  }
  getState() {
    return this.call("getState");
  }
  getVersion() {
    return this.call("getVersion");
  }
  reset() {
    return this.call("reset");
  }
};
function resolveElement(el) {
  if (el instanceof HTMLElement) return el;
  if (typeof el === "string") {
    const found = document.querySelector(el);
    if (!found) throw new Error(`Tessera: element '${el}' not found`);
    return found;
  }
  const dflt = document.getElementById("floorplan");
  if (dflt) return dflt;
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;inset:0;height:100dvh;width:100vw;z-index:1";
  document.body.appendChild(div);
  return div;
}
function scriptOrigin() {
  try {
    const s = document.currentScript?.src || Array.from(document.scripts).map((x) => x.src).find((src) => /\/sdk\/tessera(\.esm)?\.js/.test(src));
    return s ? new URL(s, location.href).origin : null;
  } catch {
    return null;
  }
}
function load(ref, options = {}) {
  if (typeof ref === "string") return new FloorPlan({ ...options, eventId: ref }).ready;
  const u = new URL(ref.$ref, location.href);
  const m = u.pathname.match(/\/e\/([^/]+)/);
  if (m) return new FloorPlan({ ...options, baseUrl: u.origin, eventId: decodeURIComponent(m[1]) }).ready;
  return new FloorPlan({ ...options, viewerUrl: ref.$ref }).ready;
}
function autoInit() {
  return Array.from(document.querySelectorAll("[data-tessera-event]")).filter((el) => !el.__tessera).map((el) => new FloorPlan({ element: el, eventId: el.dataset.tesseraEvent, baseUrl: el.dataset.baseUrl, noOverlay: el.dataset.noOverlay === "1", language: el.dataset.lang, kiosk: el.dataset.kiosk === "1" }));
}
var version = SDK_PROTOCOL_VERSION;
var methods = SDK_METHODS;
var events = SDK_EVENTS;
if (typeof document !== "undefined") {
  const run = () => autoInit();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else queueMicrotask(run);
}
export {
  FloorPlan,
  autoInit,
  events,
  load,
  methods,
  version
};
//# sourceMappingURL=tessera.esm.js.map
