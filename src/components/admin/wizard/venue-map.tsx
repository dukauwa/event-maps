"use client";
/**
 * Venue picker for the event wizard: a basemap (streets or satellite) with a draggable pin and the hall footprint
 * drawn on top, so the organiser sees exactly where the plan will sit before drawing a single booth.
 */
import * as React from "react";
import type { Map as MlMap, Marker as MlMarker, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { configureWorker } from "@/lib/map/plan-map";
import { fetchBasemapStyle, glyphsUrl } from "@/lib/map/style";
import { footprintRing, type Footprint } from "@/lib/import/footprint";

export type VenueBasemap = "streets" | "satellite";

const SAT_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function satelliteStyle(origin: string): StyleSpecification {
  return {
    version: 8,
    glyphs: glyphsUrl(origin),
    sources: { sat: { type: "raster", tiles: [SAT_TILES], tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" } },
    layers: [{ id: "sat", type: "raster", source: "sat" }],
  };
}

const SRC = "wizard-footprint";

export function VenueMap({ footprint, basemap, onMove, className }: { footprint: Footprint; basemap: VenueBasemap; onMove: (lng: number, lat: number) => void; className?: string }) {
  const el = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MlMap | null>(null);
  const markerRef = React.useRef<MlMarker | null>(null);
  const onMoveRef = React.useRef(onMove);
  React.useEffect(() => { onMoveRef.current = onMove; }, [onMove]);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);

  // Create the map once.
  React.useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (cancelled || !el.current) return;
        configureWorker(ml, window.location.origin);
        const style = (await fetchBasemapStyle("streets", window.location.origin)) ?? satelliteStyle(window.location.origin);
        if (cancelled || !el.current) return;
        map = new ml.Map({ container: el.current, style, center: [footprint.lng, footprint.lat], zoom: 16, attributionControl: { compact: true } });
        map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        const marker = new ml.Marker({ draggable: true, color: "#1d4ed8" }).setLngLat([footprint.lng, footprint.lat]).addTo(map);
        marker.on("dragend", () => { const p = marker.getLngLat(); onMoveRef.current(p.lng, p.lat); });
        map.on("click", (e) => { marker.setLngLat(e.lngLat); onMoveRef.current(e.lngLat.lng, e.lngLat.lat); });
        map.on("load", () => { if (!cancelled) { mapRef.current = map; markerRef.current = marker; setReady(true); } });
        // Tile / source fetch failures (offline, blocked imagery host) are not fatal: the footprint still draws. Only a
        // style that never loads is.
        const fatal = setTimeout(() => { if (!cancelled && !mapRef.current) setFailed("the basemap did not load"); }, 20000);
        map.on("load", () => clearTimeout(fatal));
      } catch (e) {
        if (!cancelled) setFailed(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; mapRef.current = null; map?.remove(); };
    // Mount-only: the map is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Basemap switch.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    let cancelled = false;
    (async () => {
      const style = basemap === "satellite" ? satelliteStyle(window.location.origin) : (await fetchBasemapStyle("streets", window.location.origin)) ?? satelliteStyle(window.location.origin);
      if (!cancelled) map.setStyle(style);
    })();
    return () => { cancelled = true; };
  }, [basemap, ready]);

  // Footprint overlay + marker follow the props (re-added after every style change).
  React.useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const data = { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [footprintRing(footprint)] } };
    const sync = () => {
      const src = map.getSource(SRC) as { setData: (d: unknown) => void } | undefined;
      if (src) { src.setData(data); return; }
      map.addSource(SRC, { type: "geojson", data });
      map.addLayer({ id: `${SRC}-fill`, type: "fill", source: SRC, paint: { "fill-color": "#1d4ed8", "fill-opacity": 0.18 } });
      map.addLayer({ id: `${SRC}-line`, type: "line", source: SRC, paint: { "line-color": "#1d4ed8", "line-width": 2 } });
    };
    if (map.isStyleLoaded()) sync();
    map.on("styledata", sync);
    markerRef.current?.setLngLat([footprint.lng, footprint.lat]);
    return () => { map.off("styledata", sync); };
  }, [footprint, ready]);

  const recenter = React.useCallback(() => { mapRef.current?.flyTo({ center: [footprint.lng, footprint.lat], zoom: 16.5, duration: 600 }); }, [footprint.lng, footprint.lat]);
  // Fly when the pin jumps (search result picked), not on every drag.
  const lastJump = React.useRef<[number, number]>([footprint.lng, footprint.lat]);
  React.useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const [plng, plat] = lastJump.current;
    lastJump.current = [footprint.lng, footprint.lat];
    if (Math.abs(plng - footprint.lng) > 0.01 || Math.abs(plat - footprint.lat) > 0.01) recenter();
  }, [footprint.lng, footprint.lat, ready, recenter]);

  return (
    <div className={className}>
      <div ref={el} className="h-full w-full" />
      {!ready && !failed && <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-gray-500">Loading map…</div>}
      {failed && <div className="absolute inset-0 grid place-items-center bg-gray-50 p-4 text-center text-sm text-gray-600">Map unavailable ({failed}). Enter coordinates by hand below.</div>}
    </div>
  );
}
