"use client";
/** Inline SVG icon set for the designer (tools, actions) and POI glyphs drawn on the map. */
import * as React from "react";
import type { PoiType } from "@/lib/domain/types";

const P: Record<string, React.ReactNode> = {
  select: <path d="M5 3l14 8-6 1.5L16 19l-2.5 1-3-6.5L6 18z" />,
  booth: <><rect x="4" y="5" width="16" height="14" rx="1" /><path d="M4 11h16" /></>,
  polygon: <path d="M6 4l12 3-2 13-10-3z" />,
  array: <><rect x="3" y="4" width="7" height="7" /><rect x="14" y="4" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  wall: <path d="M3 18L9 6l5 8 7-10" />,
  zone: <path d="M4 5h16v14H4z M4 12h16 M12 5v14" strokeDasharray="3 2" />,
  text: <path d="M5 6h14M12 6v13M9 19h6" />,
  poi: <><path d="M12 22s7-7 7-13a7 7 0 0 0-14 0c0 6 7 13 7 13z" /><circle cx="12" cy="9" r="2.5" /></>,
  entrance: <><path d="M5 4h9v16H5z" /><path d="M14 12h6m-3-3l3 3-3 3" /></>,
  path: <><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="14" cy="14" r="2" /><path d="M6.5 17.5l6-2m3-3l2.5-6" /></>,
  transition: <><path d="M4 20h6v-5h4v-5h4V5" /><path d="M14 5h4v4" /></>,
  measure: <><path d="M3 17L17 3l4 4L7 21z" /><path d="M8 12l2 2M11 9l2 2M14 6l2 2" /></>,
  undo: <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  redo: <path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />,
  zoomIn: <><circle cx="11" cy="11" r="7" /><path d="M11 8v6M8 11h6M20 20l-4-4" /></>,
  zoomOut: <><circle cx="11" cy="11" r="7" /><path d="M8 11h6M20 20l-4-4" /></>,
  fit: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  grid: <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />,
  magnet: <path d="M6 3v8a6 6 0 0 0 12 0V3M6 3h4v8a2 2 0 0 0 4 0V3h4" />,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18M10.5 5.2A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6A16 16 0 0 0 2 12s4 7 10 7c1.6 0 3-.4 4.3-1" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  unlock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></>,
  layers: <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />,
  sliders: <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h6M14 18h6M14 4v4M6 10v4M10 16v4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="1" /><path d="M5 15V5h10" /></>,
  merge: <path d="M4 5h7v14H4zM13 5h7v14h-7zM9 12h6" />,
  splitV: <path d="M4 5h16v14H4zM12 5v14" />,
  splitH: <path d="M4 5h16v14H4zM4 12h16" />,
  rotate: <path d="M20 11A8 8 0 1 0 17.5 17M20 4v7h-7" />,
  flipH: <path d="M12 3v18M4 7l5 5-5 5zM20 7l-5 5 5 5z" />,
  flipV: <path d="M3 12h18M7 4l5 5 5-5zM7 20l5-5 5 5z" />,
  alignLeft: <path d="M4 3v18M8 7h12M8 15h7" />,
  alignRight: <path d="M20 3v18M4 7h12M9 15h7" />,
  alignTop: <path d="M3 4h18M7 8v12M15 8v7" />,
  alignBottom: <path d="M3 20h18M7 4v12M15 9v7" />,
  alignCenterX: <path d="M12 3v18M6 8h12M8 16h8" />,
  alignCenterY: <path d="M3 12h18M8 6v12M16 8v8" />,
  distributeX: <path d="M3 3v18M21 3v18M9 8h6v8H9z" />,
  distributeY: <path d="M3 3h18M3 21h18M8 9h8v6H8z" />,
  front: <path d="M8 8h12v12H8zM4 4h12v4H8v8H4z" />,
  back: <path d="M4 4h12v12H4zM8 8h12v12H8z" />,
  publish: <path d="M12 3v12M6 9l6-6 6 6M4 17v3h16v-3" />,
  preview: <path d="M14 4h6v6M20 4l-9 9M18 13v6H5V6h6" />,
  download: <path d="M12 3v12M6 11l6 6 6-6M4 20h16" />,
  upload: <path d="M12 21V9M6 13l6-6 6 6M4 4h16" />,
  check: <path d="M4 12l5 5L20 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  more: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
  route: <><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8 16c4 0 2-8 8-8" /></>,
  wand: <path d="M15 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM4 20L14 10M18 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01" /></>,
  back_arrow: <path d="M15 5l-7 7 7 7" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  pointer: <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />,
  number: <path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16" />,
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, className }: { name: IconName | string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {P[name] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}

/* ---------------- POI glyphs (drawn in plan units on the map) ---------------- */

const POI_GLYPHS: Partial<Record<PoiType, React.ReactNode>> = {
  entrance: <path d="M7 5h8v14H7zM15 12h4m-2-2l2 2-2 2" />,
  exit: <path d="M9 5h8v14H9zM9 12H4m2-2l-2 2 2 2" />,
  registration: <path d="M5 6h14v12H5zM8 10h8M8 14h5" />,
  info: <path d="M12 8h.01M11 11h1v5h1" />,
  restroom: <><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><path d="M7.5 9h3v5h-1v5h-1v-5h-1zM13.5 9h3l1 5h-1v5h-2v-5h-1z" /></>,
  accessible_restroom: <><circle cx="12" cy="5" r="1.6" /><path d="M10 8h4l1 6h3m-4-3l1 3M8 13a4 4 0 1 0 7 3" /></>,
  food: <path d="M7 4v7a2 2 0 0 0 4 0V4M9 4v16M16 4c-2 0-3 3-3 6h3v10" />,
  cafe: <path d="M6 8h10v6a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4zM16 9h2a2 2 0 0 1 0 4h-2M5 20h12" />,
  bar: <path d="M6 5h12l-6 8v5M9 18h6" />,
  first_aid: <path d="M12 6v12M6 12h12" />,
  stage: <path d="M4 18h16M6 18V9l6-4 6 4v9M12 5v13" />,
  elevator: <path d="M5 4h14v16H5zM9 8l1.5-2L12 8M12 16l1.5 2L15 16" />,
  stairs: <path d="M4 20h4v-4h4v-4h4V8h4" />,
  escalator: <path d="M4 18h5l7-9h4M8 9l4 0" />,
  atm: <path d="M5 6h14v12H5zM8 10h8M8 14h4" />,
  coat_check: <path d="M12 4a2 2 0 0 0-2 2c0 1 2 1 2 3l-8 5v2h16v-2l-8-5" />,
  parking: <path d="M8 19V5h5a4 4 0 0 1 0 8H8" />,
  charging: <path d="M13 3L6 13h5l-1 8 8-11h-5z" />,
  quiet_room: <path d="M12 4a4 4 0 0 1 4 4v5H8V8a4 4 0 0 1 4-4zM9 17h6M11 20h2" />,
  prayer_room: <path d="M12 4l6 6v10H6V10zM12 20v-6" />,
  nursing_room: <><circle cx="12" cy="6" r="2" /><path d="M8 20v-7a4 4 0 0 1 8 0v7" /></>,
  meeting_point: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>,
  press: <path d="M5 6h14v12H5zM8 9h8M8 12h8M8 15h5" />,
  vip: <path d="M4 18h16L18 8l-4 4-2-6-2 6-4-4z" />,
  lounge: <path d="M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5H5zM7 11V8h10v3M5 18v2M19 18v2" />,
  wifi: <path d="M3 9a13 13 0 0 1 18 0M6 12.5a8 8 0 0 1 12 0M9 16a4 4 0 0 1 6 0M12 19h.01" />,
  smoking: <path d="M4 15h13v3H4zM19 15v3M17 8c2 0 3 1 3 3M15 8c-1 0-2-1-2-2" />,
  taxi: <path d="M5 16h14l-1-6H6zM7 16v2M17 16v2M9 10l1-3h4l1 3" />,
  shuttle: <path d="M5 6h14v10H5zM5 12h14M8 16v2M16 16v2" />,
  hotel: <path d="M4 18V8h16v10M4 13h16M8 13V10h4v3" />,
  photo: <><path d="M4 8h4l2-2h4l2 2h4v10H4z" /><circle cx="12" cy="13" r="3" /></>,
  water: <path d="M12 4s6 6 6 10a6 6 0 0 1-12 0c0-4 6-10 6-10z" />,
  storage: <path d="M4 8h16v10H4zM4 8l2-3h12l2 3M10 12h4" />,
  security: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  other: <><circle cx="12" cy="12" r="7" /><path d="M12 9v.01M12 12v4" /></>,
};

/** Glyph for a POI type rendered inside a 24×24 box (caller scales it). */
export function PoiGlyph({ type }: { type: PoiType | undefined }) {
  return <>{(type && POI_GLYPHS[type]) ?? POI_GLYPHS.other}</>;
}
