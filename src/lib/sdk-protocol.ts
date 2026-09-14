/**
 * postMessage protocol between the embed SDK (parent page) and the viewer (iframe).
 * Both sides import this file so method names and event names stay in sync.
 */
export const SDK_PROTOCOL_VERSION = 1;
export const SDK_MARK = "tessera" as const;

/** Methods callable on the viewer. Mirrors (and extends) ExpoFP's FloorPlan JS API. */
export const SDK_METHODS = [
  "selectBooth", "selectExhibitor", "selectRoute", "clearRoute", "getOptimizedRoutes",
  "selectCurrentPosition", "clearCurrentPosition", "setBookmarks", "getBookmarks", "setMarkers", "clearMarkers",
  "updateLayerVisibility", "getCenterCoordinates", "applyParameters", "exhibitorsList", "boothsList", "categoriesList",
  "sessionsList", "selectCategory", "clearCategory", "getVisibility", "setVisibility", "findLocation", "zoomIn", "zoomOut",
  "switchView", "fitBounds", "getBoothRect", "convertToGeo", "convertFromGeo", "highlightExhibitors", "highlightBooths",
  "clearHighlights", "search", "getFloors", "activateFloor", "showSearch", "hideSearch", "setLanguage", "getLanguage",
  "setKiosk", "getState", "getVersion", "flyTo", "setTheme", "openExhibitor", "closePanel",
] as const;
export type SdkMethod = (typeof SDK_METHODS)[number];

/** Events emitted by the viewer. Names match ExpoFP's on* callbacks without the prefix. */
export const SDK_EVENTS = [
  "init", "ready", "fpConfigured", "boothClick", "exhibitorClick", "details", "direction", "routeCleared",
  "bookmarkClick", "bookmarksChanged", "visitedClick", "categoryClick", "floorActivated", "currentPositionChanged",
  "markerClick", "exhibitorCustomButtonClick", "getCoordsClick", "search", "share", "reserveClick", "error",
] as const;
export type SdkEvent = (typeof SDK_EVENTS)[number];

export interface SdkCallMessage { [SDK_MARK]: true; v: number; type: "call"; id: string; method: SdkMethod; args: unknown[] }
export interface SdkResultMessage { [SDK_MARK]: true; v: number; type: "result"; id: string; ok: boolean; value?: unknown; error?: string }
export interface SdkEventMessage { [SDK_MARK]: true; v: number; type: "event"; name: SdkEvent; payload: unknown }
export type SdkMessage = SdkCallMessage | SdkResultMessage | SdkEventMessage;

export function isSdkMessage(data: unknown): data is SdkMessage {
  return !!data && typeof data === "object" && (data as Record<string, unknown>)[SDK_MARK] === true;
}

/** URL parameters the viewer understands (deep links, kiosk, embed). Kept compatible with ExpoFP where it had one. */
export interface ViewerParams {
  booth?: string; // label or id
  exhibitor?: string; // id, slug or externalId
  category?: string; // id or name
  level?: string; // id or shortName
  route?: string; // "A101,B205"
  from?: string;
  to?: string;
  accessible?: "1" | "0";
  search?: string;
  lang?: string;
  kiosk?: "1" | "0";
  noOverlay?: "1" | "0"; // hide panels, map only
  offHistory?: "1" | "0"; // do not touch browser history
  plan?: string; // shared plan id or comma-separated booth labels
  position?: string; // "x,y[,levelShortName]" you-are-here
  view?: "2d" | "3d";
  theme?: "light" | "dark";
  preview?: "1" | "0";
  session?: string;
}

export interface SdkMarker { id: string; levelId?: string; x: number; y: number; label?: string; color?: string; icon?: string }
