"use client";
/**
 * Venue picker and hall-outline editor for the event wizard. A basemap (streets or satellite) with the footprint on
 * top; the organiser shapes it to the building:
 *   - drag a corner node to move it; double-click a node to remove it
 *   - drag a side to push the whole wall in or out (it stays parallel)
 *   - drag the small dot in the middle of a side to add a node there
 *   - drag inside the outline to move the whole hall
 */
import * as React from "react";
import type { GeoJSONSource, Map as MlMap, MapMouseEvent, MapTouchEvent, Marker as MlMarker, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Point } from "@/lib/domain/types";
import { configureWorker } from "@/lib/map/plan-map";
import { fetchBasemapStyle, glyphsUrl } from "@/lib/map/style";
import { footprintRing, insertVertex, lngLatToLocal, localToLngLat, midpoint, moveEdge, moveVertex, removeVertex, type Footprint } from "@/lib/import/footprint";

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

const SRC = { outline: "fp-outline", edges: "fp-edges", handles: "fp-handles" } as const;
const LAYER = { fill: "fp-fill", line: "fp-line", edgeHit: "fp-edge-hit", mid: "fp-mid", vertex: "fp-vertex" } as const;
const ACCENT = "#1d4ed8";

type Drag =
  | { kind: "vertex"; index: number }
  | { kind: "edge"; index: number; start: Footprint; startLocal: Point }
  | { kind: "body"; start: Footprint; startLngLat: [number, number] };

function outlineData(f: Footprint) {
  const ring = footprintRing(f);
  const n = f.points.length;
  const edges = f.points.map((_, i) => ({ type: "Feature" as const, properties: { i }, geometry: { type: "LineString" as const, coordinates: [ring[i], ring[(i + 1) % n]] } }));
  const vertices = f.points.map((p, i) => ({ type: "Feature" as const, properties: { kind: "vertex", i }, geometry: { type: "Point" as const, coordinates: localToLngLat(f, p) } }));
  const mids = f.points.map((_, i) => ({ type: "Feature" as const, properties: { kind: "mid", i }, geometry: { type: "Point" as const, coordinates: localToLngLat(f, midpoint(f, i)) } }));
  return {
    outline: { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring] } },
    edges: { type: "FeatureCollection" as const, features: edges },
    handles: { type: "FeatureCollection" as const, features: [...mids, ...vertices] },
  };
}

function ensureLayers(map: MlMap, f: Footprint) {
  const d = outlineData(f);
  const set = (id: string, data: unknown) => {
    const src = map.getSource(id) as GeoJSONSource | undefined;
    if (src) src.setData(data as Parameters<GeoJSONSource["setData"]>[0]);
    else map.addSource(id, { type: "geojson", data: data as Parameters<GeoJSONSource["setData"]>[0] });
  };
  set(SRC.outline, d.outline);
  set(SRC.edges, d.edges);
  set(SRC.handles, d.handles);
  if (!map.getLayer(LAYER.fill)) map.addLayer({ id: LAYER.fill, type: "fill", source: SRC.outline, paint: { "fill-color": ACCENT, "fill-opacity": 0.16 } });
  if (!map.getLayer(LAYER.line)) map.addLayer({ id: LAYER.line, type: "line", source: SRC.outline, paint: { "line-color": ACCENT, "line-width": 2.5 } });
  // A wide, nearly invisible line per side: the grab area for dragging a wall.
  if (!map.getLayer(LAYER.edgeHit)) map.addLayer({ id: LAYER.edgeHit, type: "line", source: SRC.edges, paint: { "line-color": ACCENT, "line-width": 16, "line-opacity": 0.01 } });
  if (!map.getLayer(LAYER.mid)) map.addLayer({ id: LAYER.mid, type: "circle", source: SRC.handles, filter: ["==", ["get", "kind"], "mid"], paint: { "circle-radius": 5, "circle-color": "#ffffff", "circle-opacity": 0.9, "circle-stroke-color": ACCENT, "circle-stroke-width": 1.5, "circle-stroke-opacity": 0.8 } });
  if (!map.getLayer(LAYER.vertex)) map.addLayer({ id: LAYER.vertex, type: "circle", source: SRC.handles, filter: ["==", ["get", "kind"], "vertex"], paint: { "circle-radius": 7, "circle-color": "#ffffff", "circle-stroke-color": ACCENT, "circle-stroke-width": 2.5 } });
}

export interface VenueMapProps {
  footprint: Footprint;
  basemap: VenueBasemap;
  /** False until the organiser has searched or clicked: until then a click on the map places the hall. */
  placed: boolean;
  onChange: (f: Footprint) => void;
  onPlace: (lng: number, lat: number) => void;
  className?: string;
}

export function VenueMap({ footprint, basemap, placed, onChange, onPlace, className }: VenueMapProps) {
  const el = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MlMap | null>(null);
  const markerRef = React.useRef<MlMarker | null>(null);
  const latest = React.useRef({ footprint, placed, onChange, onPlace });
  React.useEffect(() => { latest.current = { footprint, placed, onChange, onPlace }; }, [footprint, placed, onChange, onPlace]);
  const drag = React.useRef<Drag | null>(null);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);

  // Create the map once and wire the editing gestures.
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
        const f0 = latest.current.footprint;
        map = new ml.Map({ container: el.current, style, center: [f0.lng, f0.lat], zoom: 16, attributionControl: { compact: true } });
        map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        const marker = new ml.Marker({ color: ACCENT }).setLngLat([f0.lng, f0.lat]).addTo(map);
        marker.getElement().style.pointerEvents = "none"; // the outline underneath takes the gestures

        const m = map;
        const hit = (point: MapMouseEvent["point"]) => m.queryRenderedFeatures(point, { layers: [LAYER.vertex, LAYER.mid, LAYER.edgeHit, LAYER.fill].filter((id) => m.getLayer(id)) });
        const start = (e: MapMouseEvent | MapTouchEvent) => {
          if (!latest.current.placed) return;
          if ("originalEvent" in e && "touches" in e.originalEvent && e.originalEvent.touches.length > 1) return; // pinch zoom
          const feats = hit(e.point);
          if (!feats.length) return;
          const f = latest.current.footprint;
          const top = (layer: string) => feats.find((x) => x.layer.id === layer);
          const v = top(LAYER.vertex), mid = top(LAYER.mid), edge = top(LAYER.edgeHit), body = top(LAYER.fill);
          const here: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          if (v) drag.current = { kind: "vertex", index: Number(v.properties.i) };
          else if (mid) {
            const i = Number(mid.properties.i);
            latest.current.onChange(insertVertex(f, i, midpoint(f, i)));
            drag.current = { kind: "vertex", index: i + 1 };
          } else if (edge) drag.current = { kind: "edge", index: Number(edge.properties.i), start: f, startLocal: lngLatToLocal(f, here) };
          else if (body) drag.current = { kind: "body", start: f, startLngLat: here };
          else return;
          e.preventDefault(); // keep the map from panning while shaping the outline
          m.getCanvas().style.cursor = "grabbing";
        };
        const move = (e: MapMouseEvent | MapTouchEvent) => {
          const d = drag.current;
          const here: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          if (!d) {
            if (!latest.current.placed || "touches" in (e.originalEvent as TouchEvent)) return;
            const feats = hit(e.point);
            const layer = feats[0]?.layer.id;
            m.getCanvas().style.cursor = layer === LAYER.vertex || layer === LAYER.mid ? "grab" : layer === LAYER.edgeHit ? "col-resize" : layer === LAYER.fill ? "move" : "";
            return;
          }
          const f = latest.current.footprint;
          if (d.kind === "vertex") latest.current.onChange(moveVertex(f, d.index, lngLatToLocal(f, here)));
          else if (d.kind === "edge") {
            const now = lngLatToLocal(d.start, here);
            latest.current.onChange(moveEdge(d.start, d.index, [now[0] - d.startLocal[0], now[1] - d.startLocal[1]]));
          } else {
            const lat = Math.round((d.start.lat + here[1] - d.startLngLat[1]) * 1e7) / 1e7;
            const lng = Math.round((d.start.lng + here[0] - d.startLngLat[0]) * 1e7) / 1e7;
            latest.current.onChange({ ...d.start, lat, lng });
          }
        };
        const end = () => { if (drag.current) { drag.current = null; m.getCanvas().style.cursor = ""; } };
        m.on("mousedown", start);
        m.on("touchstart", start);
        m.on("mousemove", move);
        m.on("touchmove", move);
        m.on("mouseup", end);
        m.on("touchend", end);
        m.on("mouseout", end);
        m.on("dblclick", (e) => {
          const v = hit(e.point).find((x) => x.layer.id === LAYER.vertex);
          if (!v) return;
          e.preventDefault(); // no double-click zoom
          latest.current.onChange(removeVertex(latest.current.footprint, Number(v.properties.i)));
        });
        m.on("click", (e) => { if (!latest.current.placed) latest.current.onPlace(e.lngLat.lng, e.lngLat.lat); });
        m.on("load", () => { if (!cancelled) { mapRef.current = m; markerRef.current = marker; setReady(true); } });
        // Tile or imagery failures (offline, blocked host) are not fatal: the outline still draws. Only a style that never loads is.
        const fatal = setTimeout(() => { if (!cancelled && !mapRef.current) setFailed("the basemap did not load"); }, 20000);
        m.on("load", () => clearTimeout(fatal));
      } catch (e) {
        if (!cancelled) setFailed(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; mapRef.current = null; map?.remove(); };
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

  // Outline, handles and pin follow the props (re-added after every style change).
  React.useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const sync = () => { if (map.isStyleLoaded()) ensureLayers(map, footprint); };
    sync();
    map.on("styledata", sync);
    markerRef.current?.setLngLat([footprint.lng, footprint.lat]);
    return () => { map.off("styledata", sync); };
  }, [footprint, ready]);

  // Fly when the hall jumps (a search result picked), not while it is being dragged.
  const lastJump = React.useRef<[number, number]>([footprint.lng, footprint.lat]);
  React.useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const [plng, plat] = lastJump.current;
    lastJump.current = [footprint.lng, footprint.lat];
    if (Math.abs(plng - footprint.lng) > 0.01 || Math.abs(plat - footprint.lat) > 0.01) map.flyTo({ center: [footprint.lng, footprint.lat], zoom: 16.5, duration: 600 });
  }, [footprint.lng, footprint.lat, ready]);

  return (
    <div className={className}>
      <div ref={el} className="h-full w-full" />
      {!ready && !failed && <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-gray-500">Loading map…</div>}
      {failed && <div className="absolute inset-0 grid place-items-center bg-gray-50 p-4 text-center text-sm text-gray-600">Map unavailable ({failed}). Enter coordinates by hand.</div>}
    </div>
  );
}
