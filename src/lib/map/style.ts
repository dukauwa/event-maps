/**
 * MapLibre style factory: blank style (plan only) or an OpenFreeMap basemap with the plan layers appended.
 */
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";

export const SRC = {
  bg: "tessera-bg",
  zones: "tessera-zones",
  zoneLabels: "tessera-zone-labels",
  lines: "tessera-lines",
  booths: "tessera-booths",
  boothLabels: "tessera-booth-labels",
  pois: "tessera-pois",
  texts: "tessera-texts",
  route: "tessera-route",
  routePoints: "tessera-route-points",
  markers: "tessera-markers",
  circles: "tessera-circles",
  position: "tessera-position",
} as const;

export const LAYER = {
  bg: "tessera-bg",
  zonesFill: "tessera-zones-fill",
  zonesOutline: "tessera-zones-outline",
  zones3d: "tessera-zones-3d",
  lines: "tessera-lines",
  boothsFill: "tessera-booths-fill",
  booths3d: "tessera-booths-3d",
  boothsOutline: "tessera-booths-outline",
  boothsSelected: "tessera-booths-selected",
  circlesFill: "tessera-circles-fill",
  circlesOutline: "tessera-circles-outline",
  routeCasing: "tessera-route-casing",
  routeLine: "tessera-route-line",
  routeDash: "tessera-route-dash",
  zoneLabels: "tessera-zone-labels",
  texts: "tessera-texts",
  boothLabels: "tessera-booth-labels",
  boothLabelsName: "tessera-booth-labels-name",
  pois: "tessera-pois",
  routePoints: "tessera-route-points",
  markers: "tessera-markers",
  positionHalo: "tessera-position-halo",
  positionDot: "tessera-position-dot",
} as const;

/** Friendly layer groups exposed via the SDK's `updateLayerVisibility`. */
export const LAYER_GROUPS: Record<string, string[]> = {
  background: [LAYER.bg],
  zones: [LAYER.zonesFill, LAYER.zonesOutline, LAYER.zones3d, LAYER.zoneLabels],
  walls: [LAYER.lines],
  lines: [LAYER.lines],
  booths: [LAYER.boothsFill, LAYER.booths3d, LAYER.boothsOutline, LAYER.boothsSelected],
  labels: [LAYER.boothLabels, LAYER.boothLabelsName, LAYER.zoneLabels, LAYER.texts],
  boothLabels: [LAYER.boothLabels, LAYER.boothLabelsName],
  texts: [LAYER.texts],
  pois: [LAYER.pois],
  route: [LAYER.routeCasing, LAYER.routeLine, LAYER.routeDash, LAYER.routePoints],
  markers: [LAYER.markers],
  circles: [LAYER.circlesFill, LAYER.circlesOutline],
  position: [LAYER.positionHalo, LAYER.positionDot],
};

export const FONT_REGULAR = "Noto Sans Regular";
export const FONT_BOLD = "Noto Sans Bold";

export type BasemapKind = "light" | "dark" | "streets";
export const BASEMAP_URLS: Record<BasemapKind, string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
  streets: "https://tiles.openfreemap.org/styles/liberty",
};

export function glyphsUrl(origin: string): string {
  return `${origin}/fonts/{fontstack}/{range}.pbf`;
}

export function blankStyle(backgroundColor: string, origin: string): StyleSpecification {
  return {
    version: 8,
    name: "tessera-blank",
    glyphs: glyphsUrl(origin),
    sources: {},
    layers: [{ id: "tessera-background", type: "background", paint: { "background-color": backgroundColor } }],
  };
}

/** Fetch an OpenFreeMap style and point it at our glyph server (the local fonts only cover Noto Sans Regular/Bold). */
export async function fetchBasemapStyle(kind: BasemapKind, origin: string, timeoutMs = 4000): Promise<StyleSpecification | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(BASEMAP_URLS[kind], { signal: ctrl.signal, mode: "cors" });
    clearTimeout(timer);
    if (!res.ok) return null;
    const style = (await res.json()) as StyleSpecification;
    style.glyphs = glyphsUrl(origin);
    for (const layer of style.layers) {
      if (layer.type !== "symbol" || !layer.layout) continue;
      const font = layer.layout["text-font"];
      if (Array.isArray(font)) {
        const wantsBold = JSON.stringify(font).toLowerCase().includes("bold");
        (layer.layout as Record<string, unknown>)["text-font"] = [wantsBold ? FONT_BOLD : FONT_REGULAR];
      }
    }
    return style;
  } catch {
    return null;
  }
}

export interface PlanLayerOptions {
  /** log2(cos(lat)) — shifts pixel-based zoom thresholds designed at the equator. */
  zoomBias: number;
  /** Pixels per plan unit at zoom 0 (scale by 2^zoom). */
  pxPerUnitZ0: number;
  accent: string;
  primary: string;
  labelColor: string;
  dimColor: string;
  dark: boolean;
  levelId: string;
  threeD: boolean;
}

const fs = (name: string): ExpressionSpecification => ["boolean", ["feature-state", name], false];

/** Fill colour for booths: dimmed → grey, else feature-state category colour, else base colour. */
export function boothFillExpression(dimColor: string): ExpressionSpecification {
  return ["case", fs("dimmed"), dimColor, ["to-color", ["coalesce", ["feature-state", "catColor"], ["get", "color"]]]];
}

/** Line/text size in plan units → pixels, scaling with zoom (exponential base 2 keeps it constant in world space). */
export function unitsToPx(units: ExpressionSpecification | number, pxPerUnitZ0: number, minPx = 0): ExpressionSpecification {
  const u = typeof units === "number" ? units : units;
  const expr: ExpressionSpecification = ["interpolate", ["exponential", 2], ["zoom"], 0, ["*", u, pxPerUnitZ0], 24, ["*", u, pxPerUnitZ0 * 2 ** 24]];
  return minPx > 0 ? ["max", minPx, expr] : expr;
}

export function levelFilter(levelId: string): ExpressionSpecification {
  return ["==", ["get", "levelId"], levelId];
}

export function planLayers(o: PlanLayerOptions): LayerSpecification[] {
  const z = (base: number) => base + o.zoomBias;
  const px = (units: ExpressionSpecification | number, min = 0) => unitsToPx(units, o.pxPerUnitZ0, min);
  const halo = o.dark ? "#111827" : "#ffffff";
  const lf = levelFilter(o.levelId);
  const threeDVis = o.threeD ? "visible" : "none";
  const boothFill = boothFillExpression(o.dimColor);

  return [
    { id: LAYER.zonesFill, type: "fill", source: SRC.zones, paint: { "fill-color": ["get", "fill"], "fill-opacity": ["get", "opacity"] } },
    { id: LAYER.zonesOutline, type: "line", source: SRC.zones, paint: { "line-color": ["get", "stroke"], "line-width": 1, "line-opacity": 0.7 } },
    {
      id: LAYER.zones3d, type: "fill-extrusion", source: SRC.zones, filter: [">", ["get", "height"], 0], layout: { visibility: threeDVis },
      paint: { "fill-extrusion-color": ["get", "fill"], "fill-extrusion-height": ["get", "height"], "fill-extrusion-opacity": 0.75 },
    },
    { id: LAYER.lines, type: "line", source: SRC.lines, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": px(["get", "width"], 1), "line-opacity": ["get", "opacity"] } },
    {
      id: LAYER.boothsFill, type: "fill", source: SRC.booths,
      paint: { "fill-color": boothFill, "fill-opacity": ["case", fs("selected"), 1, fs("dimmed"), 0.45, fs("hover"), 1, 0.92] },
    },
    {
      id: LAYER.booths3d, type: "fill-extrusion", source: SRC.booths, layout: { visibility: threeDVis },
      paint: { "fill-extrusion-color": boothFill, "fill-extrusion-height": ["get", "height"], "fill-extrusion-opacity": 0.9, "fill-extrusion-vertical-gradient": true },
    },
    { id: LAYER.boothsOutline, type: "line", source: SRC.booths, paint: { "line-color": ["get", "border"], "line-width": ["interpolate", ["linear"], ["zoom"], z(16), 0.3, z(20), 1.2, z(23), 2.5] } },
    {
      id: LAYER.boothsSelected, type: "line", source: SRC.booths, layout: { "line-join": "round" },
      paint: {
        "line-color": ["case", fs("selected"), o.accent, fs("highlighted"), o.primary, o.primary],
        "line-width": ["case", fs("selected"), 4, fs("highlighted"), 3, fs("hover"), 2, 0],
        "line-opacity": ["case", fs("selected"), 1, fs("highlighted"), 1, fs("hover"), 0.8, 0],
      },
    },
    { id: LAYER.circlesFill, type: "fill", source: SRC.circles, filter: lf, paint: { "fill-color": ["get", "color"], "fill-opacity": 0.22 } },
    { id: LAYER.circlesOutline, type: "line", source: SRC.circles, filter: lf, paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": 0.8 } },
    { id: LAYER.routeCasing, type: "line", source: SRC.route, filter: lf, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": halo, "line-width": ["interpolate", ["linear"], ["zoom"], z(16), 4, z(20), 10], "line-opacity": 0.9 } },
    { id: LAYER.routeLine, type: "line", source: SRC.route, filter: lf, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": o.accent, "line-width": ["interpolate", ["linear"], ["zoom"], z(16), 2.5, z(20), 6] } },
    { id: LAYER.routeDash, type: "line", source: SRC.route, filter: lf, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], z(16), 1, z(20), 2.5], "line-dasharray": [0, 3], "line-opacity": 0.9 } },
    {
      id: LAYER.zoneLabels, type: "symbol", source: SRC.zoneLabels, minzoom: z(16.5),
      layout: { "text-field": ["get", "name"], "text-font": [FONT_BOLD], "text-size": ["interpolate", ["linear"], ["zoom"], z(16.5), 10, z(20), 15], "text-max-width": 10, "text-letter-spacing": 0.04, "text-transform": "uppercase", "symbol-sort-key": 1 },
      paint: { "text-color": o.dark ? "#e5e7eb" : "#374151", "text-halo-color": halo, "text-halo-width": 1.2, "text-opacity": 0.9 },
    },
    {
      id: LAYER.texts, type: "symbol", source: SRC.texts,
      layout: { "text-field": ["get", "text"], "text-font": [FONT_BOLD], "text-size": px(["get", "size"], 6), "text-rotate": ["get", "rotation"], "text-rotation-alignment": "map", "text-pitch-alignment": "map", "text-allow-overlap": true, "text-ignore-placement": true, "text-max-width": 30 },
      paint: { "text-color": ["get", "color"], "text-halo-color": halo, "text-halo-width": 1 },
    },
    {
      id: LAYER.boothLabels, type: "symbol", source: SRC.boothLabels, minzoom: z(17.5), maxzoom: z(19.6),
      layout: { "text-field": ["get", "label"], "text-font": [FONT_BOLD], "text-size": ["interpolate", ["linear"], ["zoom"], z(17.5), 8, z(19.6), 12], "text-padding": 1, "symbol-sort-key": ["-", 0, ["get", "areaM2"]], "text-allow-overlap": false },
      paint: { "text-color": ["get", "labelColor"], "text-halo-color": halo, "text-halo-width": 0.8 },
    },
    {
      id: LAYER.boothLabelsName, type: "symbol", source: SRC.boothLabels, minzoom: z(19.6),
      layout: {
        "text-field": ["case", ["==", ["get", "name"], ""], ["format", ["get", "label"], {}], ["format", ["get", "label"], { "font-scale": 1 }, "\n", {}, ["get", "name"], { "font-scale": 0.82, "text-font": ["literal", [FONT_REGULAR]] }]],
        "text-font": [FONT_BOLD], "text-size": ["interpolate", ["linear"], ["zoom"], z(19.6), 12, z(22), 18], "text-max-width": 7, "text-line-height": 1.15, "text-padding": 1, "symbol-sort-key": ["-", 0, ["get", "areaM2"]],
      },
      paint: { "text-color": ["get", "labelColor"], "text-halo-color": halo, "text-halo-width": 1 },
    },
    {
      id: LAYER.pois, type: "symbol", source: SRC.pois, minzoom: z(15),
      layout: {
        "icon-image": ["get", "icon"], "icon-size": ["interpolate", ["linear"], ["zoom"], z(15), 0.45, z(18), 0.7, z(21), 1], "icon-allow-overlap": true, "icon-ignore-placement": false,
        "text-field": ["step", ["zoom"], "", z(18.5), ["get", "name"]], "text-font": [FONT_REGULAR], "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true, "text-max-width": 8,
      },
      paint: { "text-color": o.dark ? "#f3f4f6" : "#1f2937", "text-halo-color": halo, "text-halo-width": 1.2 },
    },
    {
      id: LAYER.routePoints, type: "symbol", source: SRC.routePoints, filter: lf,
      layout: {
        "icon-image": ["get", "icon"], "icon-size": ["match", ["get", "role"], "end", 0.7, "start", 0.7, 0.75], "icon-anchor": ["match", ["get", "role"], "end", "bottom", "center"], "icon-allow-overlap": true, "icon-ignore-placement": true,
        "text-field": ["match", ["get", "role"], "transition", ["concat", "→ ", ["get", "label"]], "arrival", ["concat", "← ", ["get", "label"]], ""], "text-font": [FONT_BOLD], "text-size": 12, "text-offset": [0, 1.3], "text-anchor": "top", "text-allow-overlap": true,
      },
      paint: { "text-color": o.accent, "text-halo-color": halo, "text-halo-width": 1.5 },
    },
    {
      id: LAYER.markers, type: "symbol", source: SRC.markers, filter: lf,
      layout: { "icon-image": ["get", "icon"], "icon-size": 0.7, "icon-anchor": "bottom", "icon-allow-overlap": true, "text-field": ["get", "label"], "text-font": [FONT_BOLD], "text-size": 12, "text-offset": [0, 0.4], "text-anchor": "top", "text-optional": true },
      paint: { "text-color": o.dark ? "#f3f4f6" : "#111827", "text-halo-color": halo, "text-halo-width": 1.5 },
    },
    { id: LAYER.positionHalo, type: "circle", source: SRC.position, filter: lf, paint: { "circle-radius": 18, "circle-color": o.primary, "circle-opacity": 0.25, "circle-pitch-alignment": "map" } },
    { id: LAYER.positionDot, type: "circle", source: SRC.position, filter: lf, paint: { "circle-radius": 7, "circle-color": o.primary, "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } },
  ];
}

export const INTERACTIVE_LAYERS = [LAYER.markers, LAYER.routePoints, LAYER.pois, LAYER.boothsFill, LAYER.zonesFill];
