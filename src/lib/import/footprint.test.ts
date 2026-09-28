import { describe, expect, it } from "vitest";
import { lngLatToPlan, planToLngLat } from "@/lib/domain/geometry";
import { footprintBounds, footprintGeoref, footprintPlanOutline, footprintRing, insertVertex, isRectangle, localToLngLat, lngLatToLocal, moveEdge, moveVertex, rectFootprint, removeVertex, resizeFootprint } from "./footprint";

describe("footprint", () => {
  const f = rectFootprint(51.508, 0.029, 8, 200, 120);

  it("starts as a rectangle centred on the pin", () => {
    expect(isRectangle(f)).toBe(true);
    expect(footprintBounds(f)).toMatchObject({ width: 200, height: 120 });
    const [lng, lat] = localToLngLat(f, [0, 0]);
    expect(lat).toBeCloseTo(51.508, 9);
    expect(lng).toBeCloseTo(0.029, 9);
  });

  it("maps the bounding box's top-left to plan (0,0), with the pin at the plan centre", () => {
    const g = footprintGeoref(f);
    const [lng, lat] = planToLngLat([100, 60], g);
    expect(lat).toBeCloseTo(51.508, 6);
    expect(lng).toBeCloseTo(0.029, 6);
    const back = lngLatToPlan([0.029, 51.508], g);
    expect(back[0]).toBeCloseTo(100, 2);
    expect(back[1]).toBeCloseTo(60, 2);
    expect(footprintPlanOutline(f)).toEqual([[0, 0], [200, 0], [200, 120], [0, 120]]);
  });

  it("returns a closed ring and round-trips lng/lat ↔ local metres", () => {
    const ring = footprintRing(f);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    expect(lngLatToLocal(f, ring[2])).toEqual([100, 60]);
  });

  it("drags a side parallel to itself, ignoring the along-edge component", () => {
    // Side 1 runs from the top-right to the bottom-right corner; pushing it 30 m east widens the hall to 230 m.
    const g = moveEdge(f, 1, [30, 17]);
    expect(footprintBounds(g)).toMatchObject({ width: 230, height: 120 });
    expect(g.points[1]).toEqual([130, -60]);
    expect(g.points[2]).toEqual([130, 60]);
    expect(isRectangle(g)).toBe(true);
  });

  it("adds, moves and removes nodes (never below three)", () => {
    let g = insertVertex(f, 0, [0, -60]); // on the top side
    expect(g.points).toHaveLength(5);
    g = moveVertex(g, 1, [0, -90]); // pull it out: a gable
    expect(isRectangle(g)).toBe(false);
    expect(footprintBounds(g)).toMatchObject({ width: 200, height: 150 });
    expect(footprintPlanOutline(g)[1]).toEqual([100, 0]);
    g = removeVertex(removeVertex(g, 1), 0);
    expect(g.points).toHaveLength(3);
    expect(removeVertex(g, 0).points).toHaveLength(3);
  });

  it("resizes the bounding box, keeping the shape", () => {
    const g = resizeFootprint(moveVertex(f, 0, [-100, -40]), 400, 240);
    expect(footprintBounds(g)).toMatchObject({ width: 400, height: 240 });
    expect(g.points[0]).toEqual([-200, -80]);
  });
});
