/**
 * The hall footprint the wizard places on the basemap: an outline in metres around a pin (lng/lat), in a frame rotated
 * `rotationDeg` clockwise from east (x right, y down, like plan coordinates). A rectangle to start with; the organiser
 * drags corners and sides and adds nodes until it matches the building.
 *
 * When the event is created, the outline's bounding box becomes the level: its top-left corner is the georef origin,
 * its size is the level's width/depth, and the outline itself is saved as the hall's walls.
 */
import { lngLatToPlan, planToLngLat } from "@/lib/domain/geometry";
import type { Georef, Point } from "@/lib/domain/types";

export interface Footprint { lat: number; lng: number; rotationDeg: number; points: Point[] }

const r2 = (v: number) => Math.round(v * 100) / 100;

export function rectFootprint(lat: number, lng: number, rotationDeg: number, widthM: number, heightM: number): Footprint {
  const w = widthM / 2, h = heightM / 2;
  return { lat, lng, rotationDeg, points: [[-w, -h], [w, -h], [w, h], [-w, h]] };
}

function centred(f: Footprint): Georef {
  return { originLat: f.lat, originLng: f.lng, rotationDeg: f.rotationDeg, metersPerUnit: 1 };
}

export function localToLngLat(f: Footprint, p: Point): [number, number] {
  return planToLngLat(p, centred(f));
}

export function lngLatToLocal(f: Footprint, lngLat: [number, number]): Point {
  const [x, y] = lngLatToPlan(lngLat, centred(f));
  return [r2(x), r2(y)];
}

export function footprintBounds(f: Footprint): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  const xs = f.points.map((p) => p[0]), ys = f.points.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: r2(maxX - minX), height: r2(maxY - minY) };
}

/** Georef whose plan origin (0,0) is the top-left corner of the footprint's bounding box. */
export function footprintGeoref(f: Footprint): Georef {
  const b = footprintBounds(f);
  const [originLng, originLat] = localToLngLat(f, [b.minX, b.minY]);
  return { originLat, originLng, rotationDeg: f.rotationDeg, metersPerUnit: 1 };
}

/** The outline in plan coordinates (metres from the level's top-left corner). */
export function footprintPlanOutline(f: Footprint): Point[] {
  const b = footprintBounds(f);
  return f.points.map(([x, y]) => [r2(x - b.minX), r2(y - b.minY)]);
}

/** Outline as a closed GeoJSON ring (lng/lat). */
export function footprintRing(f: Footprint): [number, number][] {
  const ring = f.points.map((p) => localToLngLat(f, p));
  ring.push(ring[0]);
  return ring;
}

export function isRectangle(f: Footprint): boolean {
  if (f.points.length !== 4) return false;
  const [a, b, c, d] = f.points;
  return a[1] === b[1] && c[1] === d[1] && a[0] === d[0] && b[0] === c[0];
}

/** Stretch the outline so its bounding box is `width` × `height` metres, keeping the pin where it is. */
export function resizeFootprint(f: Footprint, width: number, height: number): Footprint {
  const b = footprintBounds(f);
  const sx = b.width > 0 ? width / b.width : 1, sy = b.height > 0 ? height / b.height : 1;
  return { ...f, points: f.points.map(([x, y]) => [r2(x * sx), r2(y * sy)]) };
}

export function moveVertex(f: Footprint, index: number, to: Point): Footprint {
  return { ...f, points: f.points.map((p, i) => (i === index ? to : p)) };
}

/** Insert a node after `index` (on the side from `index` to `index + 1`). */
export function insertVertex(f: Footprint, index: number, at: Point): Footprint {
  const points = [...f.points];
  points.splice(index + 1, 0, at);
  return { ...f, points };
}

/** Remove a node; an outline keeps at least three. */
export function removeVertex(f: Footprint, index: number): Footprint {
  if (f.points.length <= 3) return f;
  return { ...f, points: f.points.filter((_, i) => i !== index) };
}

/**
 * Push the side from `index` to `index + 1` along its normal by the component of `delta` perpendicular to it, so the
 * side stays parallel to itself (the way you drag a wall outwards).
 */
export function moveEdge(f: Footprint, index: number, delta: Point): Footprint {
  const n = f.points.length;
  const a = f.points[index], b = f.points[(index + 1) % n];
  const ex = b[0] - a[0], ey = b[1] - a[1];
  const len = Math.hypot(ex, ey) || 1;
  const nx = -ey / len, ny = ex / len;
  const d = delta[0] * nx + delta[1] * ny;
  const shift = (p: Point): Point => [r2(p[0] + nx * d), r2(p[1] + ny * d)];
  return { ...f, points: f.points.map((p, i) => (i === index || i === (index + 1) % n ? shift(p) : p)) };
}

export function midpoint(f: Footprint, index: number): Point {
  const a = f.points[index], b = f.points[(index + 1) % f.points.length];
  return [r2((a[0] + b[0]) / 2), r2((a[1] + b[1]) / 2)];
}
