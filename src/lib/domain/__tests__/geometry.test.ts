import { describe, expect, it } from "vitest";
import { asRect, bbox, closestPointOnSegment, lngLatToPlan, planToLngLat, pointInPolygon, polygonArea, polygonCentroid, rectPolygon, rotatePoint, segmentsIntersect } from "@/lib/domain/geometry";

describe("geometry", () => {
  it("computes area and centroid of rectangles and polygons", () => {
    const r = rectPolygon(10, 20, 4, 3);
    expect(polygonArea(r)).toBe(12);
    expect(polygonCentroid(r)).toEqual([12, 21.5]);
    const tri: [number, number][] = [[0, 0], [4, 0], [0, 3]];
    expect(polygonArea(tri)).toBe(6);
  });
  it("recognises rotated rectangles", () => {
    const r = rectPolygon(0, 0, 4, 2, 30);
    const rect = asRect(r)!;
    expect(rect.w).toBeCloseTo(4);
    expect(rect.h).toBeCloseTo(2);
    expect(rect.rotationDeg).toBeCloseTo(30);
    expect(asRect([[0, 0], [4, 0], [4, 2], [1, 2]])).toBeNull();
  });
  it("point in polygon, bbox, segments", () => {
    const r = rectPolygon(0, 0, 10, 10);
    expect(pointInPolygon([5, 5], r)).toBe(true);
    expect(pointInPolygon([15, 5], r)).toBe(false);
    expect(bbox(r)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(segmentsIntersect([0, 0], [10, 10], [0, 10], [10, 0])).toBe(true);
    expect(segmentsIntersect([0, 0], [1, 1], [2, 2], [3, 3])).toBe(false);
    expect(closestPointOnSegment([5, 3], [0, 0], [10, 0]).point).toEqual([5, 0]);
  });
  it("round-trips plan <-> lng/lat with rotation", () => {
    const g = { originLat: 51.509, originLng: 0.026, rotationDeg: 8, metersPerUnit: 1 };
    for (const p of [[0, 0], [100, 50], [200, 120], [-5, 10]] as [number, number][]) {
      const ll = planToLngLat(p, g);
      const back = lngLatToPlan(ll, g);
      expect(back[0]).toBeCloseTo(p[0], 3);
      expect(back[1]).toBeCloseTo(p[1], 3);
    }
    // 100 m east at the origin latitude ≈ 0.00144° longitude
    const g0 = { originLat: 51.509, originLng: 0.026, rotationDeg: 0, metersPerUnit: 1 };
    const east = planToLngLat([100, 0], g0);
    expect(east[0] - 0.026).toBeCloseTo(0.001443, 5);
    expect(east[1]).toBeCloseTo(51.509, 6);
    // y down in plan is south on the map
    const south = planToLngLat([0, 100], g0);
    expect(south[1]).toBeLessThan(51.509);
    expect(rotatePoint([1, 0], [0, 0], 90)[1]).toBeCloseTo(1);
  });
});
