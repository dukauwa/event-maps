/**
 * Plan (metres, y down) → GeoJSON (lng/lat) builders for the MapLibre viewer.
 * One FeatureCollection per feature class per level; the map swaps them with `setData` on level change.
 */
import type { Feature, FeatureCollection, LineString, Point as GeoPoint, Polygon as GeoPolygon } from "geojson";
import type { BoothStatus, BundleBooth, BundleElement, BundleLevel, Georef, PlanBundle, Point, RouteResult } from "@/lib/domain/types";
import { bbox, planToLngLat, polygonCentroid, syntheticGeoref, type BBox } from "@/lib/domain/geometry";
import type { SdkMarker } from "@/lib/sdk-protocol";

export type LngLat = [number, number];

/** Metres per pixel at zoom 0 on the equator for 512px tiles (2πR / 512). */
export const MPP_Z0 = 78271.51696402048;

export function levelGeoref(level: Pick<BundleLevel, "georef">): Georef {
  return level.georef ?? syntheticGeoref();
}

export function toLngLat(g: Georef, p: Point): LngLat {
  return planToLngLat(p, g);
}

export function ringToLngLat(g: Georef, poly: Point[]): LngLat[] {
  const ring = poly.map((p) => toLngLat(g, p));
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push([fx, fy]);
  return ring;
}

/** Bounding box of a level in plan metres: the declared size, grown to include any content outside it. */
export function levelPlanBBox(level: BundleLevel, booths: BundleBooth[]): BBox {
  const pts: Point[] = [];
  if (level.widthM > 0 && level.heightM > 0) pts.push([0, 0], [level.widthM, level.heightM]);
  for (const b of booths) if (b.levelId === level.id) pts.push(...b.polygon);
  for (const el of level.elements) {
    if (el.geometry.type === "point") pts.push(el.geometry.point);
    else pts.push(...el.geometry.points);
  }
  if (level.background) {
    const bg = level.background;
    pts.push([bg.x, bg.y], [bg.x + bg.width, bg.y + bg.height]);
  }
  if (!pts.length) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  return bbox(pts);
}

/** The four corners of a plan bbox in lng/lat (NW, NE, SE, SW in plan orientation). */
export function bboxCornersLngLat(g: Georef, b: BBox): [LngLat, LngLat, LngLat, LngLat] {
  return [toLngLat(g, [b.minX, b.minY]), toLngLat(g, [b.maxX, b.minY]), toLngLat(g, [b.maxX, b.maxY]), toLngLat(g, [b.minX, b.maxY])];
}

/** Axis-aligned lng/lat bounds around a plan bbox, padded by `padFraction` of its size. */
export function lngLatBounds(g: Georef, b: BBox, padFraction = 0): [LngLat, LngLat] {
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const padded: BBox = { minX: b.minX - w * padFraction, minY: b.minY - h * padFraction, maxX: b.maxX + w * padFraction, maxY: b.maxY + h * padFraction };
  const corners = bboxCornersLngLat(g, padded);
  const lngs = corners.map((c) => c[0]), lats = corners.map((c) => c[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}

/**
 * Camera that shows a plan bbox upright (bearing = -rotation) and as large as the viewport allows.
 * `width`/`height` are the map container size in CSS pixels; padding in pixels.
 */
export function cameraForPlanBBox(
  g: Georef,
  b: BBox,
  viewport: { width: number; height: number },
  padding: { top: number; right: number; bottom: number; left: number } | number = 24,
  maxZoom = 22,
): { center: LngLat; zoom: number; bearing: number } {
  const pad = typeof padding === "number" ? { top: padding, right: padding, bottom: padding, left: padding } : padding;
  const wM = Math.max(1, (b.maxX - b.minX) * g.metersPerUnit);
  const hM = Math.max(1, (b.maxY - b.minY) * g.metersPerUnit);
  const availW = Math.max(50, viewport.width - pad.left - pad.right);
  const availH = Math.max(50, viewport.height - pad.top - pad.bottom);
  const mpp = Math.max(wM / availW, hM / availH);
  const cosLat = Math.cos((g.originLat * Math.PI) / 180);
  const zoom = Math.min(maxZoom, Math.log2((MPP_Z0 * cosLat) / mpp));
  // Shift the centre so asymmetric padding (e.g. a side panel) is respected: move in screen space then rotate into plan space.
  const centerPlan: Point = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  const mppFinal = (MPP_Z0 * cosLat) / 2 ** zoom;
  const dxPx = (pad.right - pad.left) / 2;
  const dyPx = (pad.bottom - pad.top) / 2;
  // Screen x → plan +x, screen y → plan +y when the plan is shown upright.
  const shifted: Point = [centerPlan[0] + (dxPx * mppFinal) / g.metersPerUnit, centerPlan[1] + (dyPx * mppFinal) / g.metersPerUnit];
  return { center: toLngLat(g, shifted), zoom, bearing: planBearing(g) };
}

/** Map bearing that renders the plan with +x to the right and +y down. */
export function planBearing(g: Georef): number {
  return -g.rotationDeg;
}

/** Zoom offset so that pixel-size thresholds designed for the equator match at this latitude. */
export function zoomBias(g: Georef): number {
  return Math.log2(Math.max(0.01, Math.cos((g.originLat * Math.PI) / 180)));
}

/** Pixels per plan unit at zoom 0 (multiply by 2^zoom). */
export function pxPerUnitAtZ0(g: Georef): number {
  const cosLat = Math.cos((g.originLat * Math.PI) / 180);
  return g.metersPerUnit / (MPP_Z0 * cosLat);
}

/* ------------------------------------------------------------------ */
/* Feature builders                                                     */
/* ------------------------------------------------------------------ */

export interface BoothStyleInput {
  showAvailability: boolean;
  statusColors: Record<BoothStatus, string>;
  neutralColor: string;
  sponsorColor: string;
  borderColor: string;
  labelColor: string;
}

export interface BoothProps {
  id: string;
  levelId: string;
  label: string;
  name: string;
  status: BoothStatus;
  color: string;
  border: string;
  labelColor: string;
  height: number;
  labelHidden: 0 | 1;
  hasExhibitor: 0 | 1;
  sponsor: 0 | 1;
  areaM2: number;
  [key: string]: unknown;
}

export function boothBaseColor(b: BundleBooth, s: BoothStyleInput, sponsor: boolean): string {
  if (b.colors?.fill) return b.colors.fill;
  if (b.status === "unavailable") return b.colors?.unavailable ?? s.statusColors.unavailable;
  if (s.showAvailability) return b.colors?.[b.status] ?? s.statusColors[b.status];
  if (sponsor) return s.sponsorColor;
  return s.neutralColor;
}

export function buildBoothFeatures(bundle: PlanBundle, levelId: string, style: BoothStyleInput): FeatureCollection<GeoPolygon, BoothProps> {
  const level = bundle.levels.find((l) => l.id === levelId);
  const g = level ? levelGeoref(level) : syntheticGeoref();
  const exById = new Map(bundle.exhibitors.map((e) => [e.id, e]));
  const features: Feature<GeoPolygon, BoothProps>[] = [];
  for (const b of bundle.booths) {
    if (b.levelId !== levelId || b.polygon.length < 3) continue;
    const exs = b.exhibitorIds.map((id) => exById.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
    const sponsor = exs.some((e) => !!e.sponsorLevel) || b.boothType === "sponsor" || b.boothType === "island";
    features.push({
      type: "Feature",
      id: b.id,
      geometry: { type: "Polygon", coordinates: [ringToLngLat(g, b.polygon)] },
      properties: {
        id: b.id,
        levelId: b.levelId,
        label: b.label,
        name: exs.map((e) => e.name).join(" · "),
        status: b.status,
        color: boothBaseColor(b, style, sponsor),
        border: b.colors?.border ?? style.borderColor,
        labelColor: b.colors?.label ?? style.labelColor,
        height: b.height3d ?? (b.boothType === "island" ? 4 : b.boothType === "table" ? 1 : 2.5),
        labelHidden: b.labelHidden ? 1 : 0,
        hasExhibitor: exs.length ? 1 : 0,
        sponsor: sponsor ? 1 : 0,
        areaM2: b.areaM2,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export interface BoothLabelProps { id: string; label: string; name: string; labelColor: string; areaM2: number; sponsor: 0 | 1; [key: string]: unknown }

export function buildBoothLabelFeatures(bundle: PlanBundle, levelId: string, labelColor: string): FeatureCollection<GeoPoint, BoothLabelProps> {
  const level = bundle.levels.find((l) => l.id === levelId);
  const g = level ? levelGeoref(level) : syntheticGeoref();
  const exById = new Map(bundle.exhibitors.map((e) => [e.id, e]));
  const features: Feature<GeoPoint, BoothLabelProps>[] = [];
  for (const b of bundle.booths) {
    if (b.levelId !== levelId || b.labelHidden) continue;
    const exs = b.exhibitorIds.map((id) => exById.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
    features.push({
      type: "Feature",
      id: b.id,
      geometry: { type: "Point", coordinates: toLngLat(g, b.center ?? polygonCentroid(b.polygon)) },
      properties: {
        id: b.id, label: b.label, name: exs[0]?.name ?? "", labelColor: b.colors?.label ?? labelColor, areaM2: b.areaM2, sponsor: exs.some((e) => !!e.sponsorLevel) ? 1 : 0,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export interface ZoneProps { id: string; kind: string; name: string; fill: string; opacity: number; stroke: string; height: number; poiType: string; [key: string]: unknown }
export interface LineProps { id: string; kind: string; color: string; width: number; opacity: number; [key: string]: unknown }
export interface PoiProps { id: string; name: string; poiType: string; icon: string; kind: string; description: string; [key: string]: unknown }
export interface TextProps { id: string; text: string; size: number; color: string; rotation: number; [key: string]: unknown }

export interface LevelElementFeatures {
  zones: FeatureCollection<GeoPolygon, ZoneProps>;
  zoneLabels: FeatureCollection<GeoPoint, ZoneProps>;
  lines: FeatureCollection<LineString, LineProps>;
  pois: FeatureCollection<GeoPoint, PoiProps>;
  texts: FeatureCollection<GeoPoint, TextProps>;
}

const ZONE_KINDS = new Set(["zone", "room", "stage", "shape"]);
const DEFAULT_ZONE_FILL: Record<string, string> = { zone: "#e0e7ff", room: "#dbeafe", stage: "#fecaca", shape: "#e5e7eb" };

export function buildElementFeatures(level: BundleLevel): LevelElementFeatures {
  const g = levelGeoref(level);
  const zones: Feature<GeoPolygon, ZoneProps>[] = [];
  const zoneLabels: Feature<GeoPoint, ZoneProps>[] = [];
  const lines: Feature<LineString, LineProps>[] = [];
  const pois: Feature<GeoPoint, PoiProps>[] = [];
  const texts: Feature<GeoPoint, TextProps>[] = [];
  const sorted = [...level.elements].sort((a, b) => a.sortIndex - b.sortIndex);
  for (const el of sorted) {
    const p = el.props ?? {};
    const name = typeof p.name === "string" ? p.name : "";
    if (el.kind === "poi" || el.kind === "entrance") {
      const pt = elementAnchor(el);
      if (!pt) continue;
      const poiType = typeof p.poiType === "string" ? p.poiType : el.kind === "entrance" ? "entrance" : "other";
      pois.push({
        type: "Feature", id: el.id, geometry: { type: "Point", coordinates: toLngLat(g, pt) },
        properties: { id: el.id, name, poiType, icon: `poi-${poiType}`, kind: el.kind, description: typeof p.description === "string" ? p.description : "" },
      });
      continue;
    }
    if (el.kind === "text") {
      const pt = elementAnchor(el);
      if (!pt) continue;
      texts.push({
        type: "Feature", id: el.id, geometry: { type: "Point", coordinates: toLngLat(g, pt) },
        properties: { id: el.id, text: typeof p.text === "string" ? p.text : name, size: typeof p.fontSize === "number" ? p.fontSize : 2, color: typeof p.color === "string" ? p.color : "#374151", rotation: typeof p.rotationDeg === "number" ? p.rotationDeg : 0 },
      });
      continue;
    }
    if (ZONE_KINDS.has(el.kind) && el.geometry.type === "polygon" && el.geometry.points.length >= 3) {
      const props: ZoneProps = {
        id: el.id, kind: el.kind, name,
        fill: typeof p.fill === "string" ? p.fill : DEFAULT_ZONE_FILL[el.kind] ?? "#e5e7eb",
        opacity: typeof p.opacity === "number" ? p.opacity : 0.4,
        stroke: typeof p.stroke === "string" ? p.stroke : "#9ca3af",
        height: typeof p.height3d === "number" ? p.height3d : 0,
        poiType: typeof p.poiType === "string" ? p.poiType : "",
      };
      zones.push({ type: "Feature", id: el.id, geometry: { type: "Polygon", coordinates: [ringToLngLat(g, el.geometry.points)] }, properties: props });
      if (name) zoneLabels.push({ type: "Feature", id: el.id, geometry: { type: "Point", coordinates: toLngLat(g, polygonCentroid(el.geometry.points)) }, properties: props });
      continue;
    }
    if (el.geometry.type === "polyline" && el.geometry.points.length >= 2) {
      lines.push({
        type: "Feature", id: el.id, geometry: { type: "LineString", coordinates: el.geometry.points.map((pt) => toLngLat(g, pt)) },
        properties: { id: el.id, kind: el.kind, color: typeof p.color === "string" ? p.color : typeof p.stroke === "string" ? p.stroke : "#374151", width: typeof p.strokeWidth === "number" ? p.strokeWidth : 0.2, opacity: typeof p.opacity === "number" ? p.opacity : 1 },
      });
      continue;
    }
    if (el.geometry.type === "polygon" && el.geometry.points.length >= 3) {
      // Walls drawn as closed polygons: outline only.
      const ring = [...el.geometry.points, el.geometry.points[0]];
      lines.push({
        type: "Feature", id: el.id, geometry: { type: "LineString", coordinates: ring.map((pt) => toLngLat(g, pt)) },
        properties: { id: el.id, kind: el.kind, color: typeof p.color === "string" ? p.color : "#374151", width: typeof p.strokeWidth === "number" ? p.strokeWidth : 0.2, opacity: typeof p.opacity === "number" ? p.opacity : 1 },
      });
    }
  }
  return {
    zones: { type: "FeatureCollection", features: zones },
    zoneLabels: { type: "FeatureCollection", features: zoneLabels },
    lines: { type: "FeatureCollection", features: lines },
    pois: { type: "FeatureCollection", features: pois },
    texts: { type: "FeatureCollection", features: texts },
  };
}

export function elementAnchor(el: BundleElement): Point | null {
  if (el.geometry.type === "point") return el.geometry.point;
  if (el.geometry.type === "polygon") return polygonCentroid(el.geometry.points);
  const pts = el.geometry.points;
  return pts.length ? pts[Math.floor(pts.length / 2)] : null;
}

/** Corner coordinates for a raster `image` source: top-left, top-right, bottom-right, bottom-left. */
export function backgroundCoordinates(level: BundleLevel): [LngLat, LngLat, LngLat, LngLat] | null {
  const bg = level.background;
  if (!bg) return null;
  const g = levelGeoref(level);
  const corners: Point[] = [[bg.x, bg.y], [bg.x + bg.width, bg.y], [bg.x + bg.width, bg.y + bg.height], [bg.x, bg.y + bg.height]];
  if (bg.rotationDeg) {
    const cx = bg.x + bg.width / 2, cy = bg.y + bg.height / 2;
    const r = (bg.rotationDeg * Math.PI) / 180;
    for (let i = 0; i < 4; i++) {
      const [x, y] = corners[i];
      const dx = x - cx, dy = y - cy;
      corners[i] = [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
    }
  }
  return corners.map((c) => toLngLat(g, c)) as [LngLat, LngLat, LngLat, LngLat];
}

/* ---------------- Dynamic overlays ---------------- */

export interface RouteLineProps { levelId: string; index: number; distanceM: number; [key: string]: unknown }
export interface RoutePointProps { levelId: string; role: "start" | "end" | "transition" | "arrival"; kind: string; label: string; toLevelId: string; icon: string; [key: string]: unknown }

export function buildRouteFeatures(bundle: PlanBundle, route: RouteResult | null): { lines: FeatureCollection<LineString, RouteLineProps>; points: FeatureCollection<GeoPoint, RoutePointProps> } {
  const lines: Feature<LineString, RouteLineProps>[] = [];
  const points: Feature<GeoPoint, RoutePointProps>[] = [];
  if (route) {
    const georefs = new Map(bundle.levels.map((l) => [l.id, levelGeoref(l)]));
    const levelNames = new Map(bundle.levels.map((l) => [l.id, l.shortName]));
    route.steps.forEach((step, i) => {
      const g = georefs.get(step.levelId) ?? syntheticGeoref();
      if (step.points.length >= 2) {
        lines.push({ type: "Feature", id: i, geometry: { type: "LineString", coordinates: step.points.map((p) => toLngLat(g, p)) }, properties: { levelId: step.levelId, index: i, distanceM: step.distanceM } });
      }
      if (step.transition && step.points.length) {
        const last = step.points[step.points.length - 1];
        points.push({
          type: "Feature", geometry: { type: "Point", coordinates: toLngLat(g, last) },
          properties: { levelId: step.levelId, role: "transition", kind: step.transition.kind, label: levelNames.get(step.transition.toLevelId) ?? "", toLevelId: step.transition.toLevelId, icon: `poi-${step.transition.kind}` },
        });
        const next = route.steps[i + 1];
        if (next && next.points.length) {
          const ng = georefs.get(next.levelId) ?? syntheticGeoref();
          points.push({ type: "Feature", geometry: { type: "Point", coordinates: toLngLat(ng, next.points[0]) }, properties: { levelId: next.levelId, role: "arrival", kind: step.transition.kind, label: levelNames.get(step.levelId) ?? "", toLevelId: step.levelId, icon: `poi-${step.transition.kind}` } });
        }
      }
    });
    const first = route.steps.find((s) => s.points.length);
    const lastStep = [...route.steps].reverse().find((s) => s.points.length);
    if (first) points.push({ type: "Feature", geometry: { type: "Point", coordinates: toLngLat(georefs.get(first.levelId) ?? syntheticGeoref(), first.points[0]) }, properties: { levelId: first.levelId, role: "start", kind: "", label: "", toLevelId: "", icon: "route-start" } });
    if (lastStep) points.push({ type: "Feature", geometry: { type: "Point", coordinates: toLngLat(georefs.get(lastStep.levelId) ?? syntheticGeoref(), lastStep.points[lastStep.points.length - 1]) }, properties: { levelId: lastStep.levelId, role: "end", kind: "", label: "", toLevelId: "", icon: "route-end" } });
  }
  return { lines: { type: "FeatureCollection", features: lines }, points: { type: "FeatureCollection", features: points } };
}

export interface MarkerProps { id: string; levelId: string; label: string; color: string; icon: string; [key: string]: unknown }

export function buildMarkerFeatures(bundle: PlanBundle, markers: SdkMarker[], fallbackLevelId: string): FeatureCollection<GeoPoint, MarkerProps> {
  const georefs = new Map(bundle.levels.map((l) => [l.id, levelGeoref(l)]));
  const features: Feature<GeoPoint, MarkerProps>[] = [];
  for (const m of markers) {
    const levelId = m.levelId ?? fallbackLevelId;
    const g = georefs.get(levelId);
    if (!g || !Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    features.push({ type: "Feature", id: m.id, geometry: { type: "Point", coordinates: toLngLat(g, [m.x, m.y]) }, properties: { id: m.id, levelId, label: m.label ?? "", color: m.color ?? "#ef4444", icon: m.icon ? `poi-${m.icon}` : "marker-pin" } });
  }
  return { type: "FeatureCollection", features };
}

export interface CircleSpec { x: number; y: number; radius: number; color?: string; levelId?: string; id?: string }
export interface CircleProps { id: string; levelId: string; color: string; [key: string]: unknown }

export function buildCircleFeatures(bundle: PlanBundle, circles: CircleSpec[], fallbackLevelId: string, segments = 48): FeatureCollection<GeoPolygon, CircleProps> {
  const georefs = new Map(bundle.levels.map((l) => [l.id, levelGeoref(l)]));
  const features: Feature<GeoPolygon, CircleProps>[] = [];
  circles.forEach((c, i) => {
    const levelId = c.levelId ?? fallbackLevelId;
    const g = georefs.get(levelId);
    if (!g || !(c.radius > 0)) return;
    const ring: Point[] = [];
    for (let k = 0; k < segments; k++) {
      const a = (k / segments) * Math.PI * 2;
      ring.push([c.x + Math.cos(a) * c.radius, c.y + Math.sin(a) * c.radius]);
    }
    features.push({ type: "Feature", id: c.id ?? `circle-${i}`, geometry: { type: "Polygon", coordinates: [ringToLngLat(g, ring)] }, properties: { id: c.id ?? `circle-${i}`, levelId, color: c.color ?? "#3b82f6" } });
  });
  return { type: "FeatureCollection", features };
}

export interface PositionProps { levelId: string; [key: string]: unknown }

export function buildPositionFeature(bundle: PlanBundle, pos: { levelId: string; x: number; y: number } | null): FeatureCollection<GeoPoint, PositionProps> {
  if (!pos) return { type: "FeatureCollection", features: [] };
  const level = bundle.levels.find((l) => l.id === pos.levelId);
  if (!level) return { type: "FeatureCollection", features: [] };
  return { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: toLngLat(levelGeoref(level), [pos.x, pos.y]) }, properties: { levelId: pos.levelId } }] };
}

export const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Plan-space rectangle + centre of a booth (SDK `getBoothRect`). */
export function boothRect(b: BundleBooth): { x: number; y: number; width: number; height: number; centerX: number; centerY: number; levelId: string } {
  const bb = bbox(b.polygon);
  return { x: bb.minX, y: bb.minY, width: bb.maxX - bb.minX, height: bb.maxY - bb.minY, centerX: b.center[0], centerY: b.center[1], levelId: b.levelId };
}
