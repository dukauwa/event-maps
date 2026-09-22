/**
 * The hall footprint the wizard places on the basemap: a rectangle of `widthM` × `heightM` metres centred on a
 * lng/lat point and rotated `rotationDeg` clockwise from east. Its top-left corner becomes the level's georef origin.
 */
import { planToLngLat } from "@/lib/domain/geometry";
import type { Georef } from "@/lib/domain/types";

export interface Footprint { lat: number; lng: number; rotationDeg: number; widthM: number; heightM: number }

/** Georef whose plan origin (0,0) is the footprint's top-left corner. */
export function footprintGeoref(f: Footprint): Georef {
  const centred: Georef = { originLat: f.lat, originLng: f.lng, rotationDeg: f.rotationDeg, metersPerUnit: 1 };
  // Where the plan centre would land if the origin sat on the marker; shift the origin back by that offset.
  const [cLng, cLat] = planToLngLat([f.widthM / 2, f.heightM / 2], centred);
  return { originLat: f.lat - (cLat - f.lat), originLng: f.lng - (cLng - f.lng), rotationDeg: f.rotationDeg, metersPerUnit: 1 };
}

/** Footprint corners as a closed GeoJSON ring (lng/lat). */
export function footprintRing(f: Footprint): [number, number][] {
  const g = footprintGeoref(f);
  const corners: [number, number][] = [[0, 0], [f.widthM, 0], [f.widthM, f.heightM], [0, f.heightM]];
  const ring = corners.map((c) => planToLngLat(c, g));
  ring.push(ring[0]);
  return ring;
}
