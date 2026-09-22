import { describe, expect, it } from "vitest";
import { lngLatToPlan, planToLngLat } from "@/lib/domain/geometry";
import { footprintGeoref, footprintRing } from "./footprint";

describe("footprint", () => {
  const f = { lat: 51.508, lng: 0.029, rotationDeg: 8, widthM: 200, heightM: 120 };
  it("puts the plan centre on the marker", () => {
    const g = footprintGeoref(f);
    const [lng, lat] = planToLngLat([100, 60], g);
    expect(lat).toBeCloseTo(f.lat, 6);
    expect(lng).toBeCloseTo(f.lng, 6);
    const back = lngLatToPlan([f.lng, f.lat], g);
    expect(back[0]).toBeCloseTo(100, 2);
    expect(back[1]).toBeCloseTo(60, 2);
  });
  it("returns a closed 5-point ring 200 m wide", () => {
    const ring = footprintRing(f);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    const g = footprintGeoref(f);
    const p1 = lngLatToPlan(ring[1], g);
    expect(p1[0]).toBeCloseTo(200, 1);
    expect(p1[1]).toBeCloseTo(0, 1);
  });
});
