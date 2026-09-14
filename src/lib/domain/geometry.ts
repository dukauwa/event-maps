import type { Georef, Point, Polygon } from "./types";

export function polygonArea(points: Polygon): number {
  let a = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function polygonCentroid(points: Polygon): Point {
  const n = points.length;
  if (n === 0) return [0, 0];
  if (n < 3) {
    const sx = points.reduce((s, p) => s + p[0], 0);
    const sy = points.reduce((s, p) => s + p[1], 0);
    return [sx / n, sy / n];
  }
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % n];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const sx = points.reduce((s, p) => s + p[0], 0);
    const sy = points.reduce((s, p) => s + p[1], 0);
    return [sx / n, sy / n];
  }
  a *= 0.5;
  return [cx / (6 * a), cy / (6 * a)];
}

export interface BBox { minX: number; minY: number; maxX: number; maxY: number }

export function bbox(points: Point[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function pointInPolygon([px, py]: Point, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Closest point on segment ab to p, and its distance. */
export function closestPointOnSegment(p: Point, a: Point, b: Point): { point: Point; t: number; dist: number } {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const len2 = abx * abx + aby * aby;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const point: Point = [a[0] + abx * t, a[1] + aby * t];
  return { point, t, dist: distance(p, point) };
}

export function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-12) return false;
  const u = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const v = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return u > 0 && u < 1 && v > 0 && v < 1;
}

export function rectPolygon(x: number, y: number, w: number, h: number, rotationDeg = 0): Polygon {
  const pts: Polygon = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  if (!rotationDeg) return pts;
  const cx = x + w / 2, cy = y + h / 2;
  return pts.map((p) => rotatePoint(p, [cx, cy], rotationDeg));
}

export function rotatePoint([x, y]: Point, [cx, cy]: Point, deg: number): Point {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  const dx = x - cx, dy = y - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

/** Is polygon an axis-aligned or rotated rectangle? Returns its params if so. */
export function asRect(poly: Polygon): { x: number; y: number; w: number; h: number; rotationDeg: number } | null {
  if (poly.length !== 4) return null;
  const [a, b, c, d] = poly;
  const ab = distance(a, b), bc = distance(b, c), cd = distance(c, d), da = distance(d, a);
  if (Math.abs(ab - cd) > 1e-6 || Math.abs(bc - da) > 1e-6) return null;
  const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
  if (Math.abs(dot) > 1e-6 * Math.max(1, ab * bc)) return null;
  const rotationDeg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  const cx = (a[0] + c[0]) / 2, cy = (a[1] + c[1]) / 2;
  return { x: cx - ab / 2, y: cy - bc / 2, w: ab, h: bc, rotationDeg: Math.round(rotationDeg * 1000) / 1000 };
}

export function round(n: number, decimals = 3): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/* ---------------- Plan <-> geographic transforms ---------------- */

const EARTH_RADIUS = 6378137;

/** Convert a plan point (meters, y-down) to [lng, lat] using a georef. */
export function planToLngLat(p: Point, g: Georef): [number, number] {
  const r = (g.rotationDeg * Math.PI) / 180;
  const x = p[0] * g.metersPerUnit;
  const y = -p[1] * g.metersPerUnit; // flip to y-up (north)
  const east = x * Math.cos(r) - y * Math.sin(r);
  const north = x * Math.sin(r) + y * Math.cos(r);
  const lat0 = (g.originLat * Math.PI) / 180;
  const dLat = north / EARTH_RADIUS;
  const dLng = east / (EARTH_RADIUS * Math.cos(lat0));
  return [g.originLng + (dLng * 180) / Math.PI, g.originLat + (dLat * 180) / Math.PI];
}

/** Inverse of planToLngLat. */
export function lngLatToPlan(lngLat: [number, number], g: Georef): Point {
  const lat0 = (g.originLat * Math.PI) / 180;
  const north = ((lngLat[1] - g.originLat) * Math.PI / 180) * EARTH_RADIUS;
  const east = ((lngLat[0] - g.originLng) * Math.PI / 180) * EARTH_RADIUS * Math.cos(lat0);
  const r = (-g.rotationDeg * Math.PI) / 180;
  const x = east * Math.cos(r) - north * Math.sin(r);
  const y = east * Math.sin(r) + north * Math.cos(r);
  return [x / g.metersPerUnit, -y / g.metersPerUnit];
}

/**
 * A synthetic georef for plans without a real location: places the plan near lng/lat 0,0 on a
 * blank basemap so MapLibre can still render it. Keeps 1 plan unit == 1 meter.
 */
export function syntheticGeoref(): Georef {
  return { originLat: 0, originLng: 0, rotationDeg: 0, metersPerUnit: 1 };
}
