/**
 * Inline SVG icon set for POIs, markers and route ends, rasterised to ImageData for `map.addImage`.
 * Icons are 24×24 stroke paths drawn white on a coloured disc.
 */
import type { PoiType } from "@/lib/domain/types";

export const ICON_PATHS: Record<string, string> = {
  entrance: "M4 21V3h10v18M14 12h7M18 9l3 3-3 3",
  exit: "M4 21V3h10v18M21 12h-7M17 9l-3 3 3 3",
  registration: "M9 3h6v3H9zM6 5H5v16h14V5h-1M9 11h6M9 15h6",
  info: "M12 8v.01M12 11v5",
  restroom: "M12 5a1.5 1.5 0 1 0 .01 0M9 21v-7H7l1.5-6h7L17 14h-2v7",
  accessible_restroom: "M12 4a1.5 1.5 0 1 0 .01 0M12 7v6h5l2 5M12 13h-2a4 4 0 1 0 4 4",
  food: "M7 3v18M5 3v5a2 2 0 0 0 4 0V3M17 3c-2 0-3 3-3 6s1 3 3 3v9",
  cafe: "M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM16 9h2a2 2 0 0 1 0 4h-2M6 21h10",
  bar: "M5 4h14l-7 8zM12 12v7M8 19h8",
  first_aid: "M12 6v12M6 12h12",
  stage: "M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9L6.7 19.5l1.1-6L3.4 9.3l6-.8z",
  escalator: "M3 17h4l7-9h7M18 8l3 0",
  elevator: "M5 3h14v18H5zM9 10l2-3 2 3M9 14l2 3 2-3",
  stairs: "M4 20h4v-4h4v-4h4V8h4",
  wifi: "M5 12.5a10 10 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0M12 19h.01",
  charging: "M13 2L4 14h7l-1 8 9-12h-7z",
  coat_check: "M12 4a2 2 0 0 1 2 2c0 1-2 2-2 3v1M3 19l9-7 9 7z",
  atm: "M3 6h18v12H3zM3 10h18M7 15h4",
  press: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4M8 21h8",
  lounge: "M4 12V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 12h18v6H3zM6 18v2M18 18v2",
  quiet_room: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  meeting_point: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 20a5 5 0 0 1 10 0M13 20a4 4 0 0 1 8 0",
  parking: "M8 20V4h5a4 4 0 0 1 0 8H8",
  security: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  taxi: "M5 16l1.5-5h11L19 16M3 16h18v3H3zM7 19v2M17 19v2",
  shuttle: "M4 5h16v11H4zM4 16l-1 3h18l-1-3M8 19v2M16 19v2M4 10h16",
  hotel: "M3 18V8M3 12h18v6M7 12V9h5v3",
  photo: "M4 8h3l2-2h6l2 2h3v11H4zM12 16a3 3 0 1 0 0-.01",
  water: "M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z",
  smoking: "M3 16h14v3H3zM19 16v3M17 8a3 3 0 0 0 3 3M20 6a4 4 0 0 1 2 4",
  storage: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  vip: "M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9L6.7 19.5l1.1-6L3.4 9.3l6-.8z",
  nursing_room: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  prayer_room: "M12 3c4 4 6 7 6 11a6 6 0 0 1-12 0c0-4 2-7 6-11zM12 21v-3",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 10h.01",
  other: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 10h.01",
  ramp: "M3 18L21 8M3 18h18",
  door: "M6 3h12v18H6zM15 12h.01",
  bridge: "M3 12c4-6 14-6 18 0M3 12v6M21 12v6M8 10v8M16 10v8",
};

export const ICON_COLORS: Record<string, string> = {
  entrance: "#16a34a", exit: "#dc2626", registration: "#2563eb", info: "#0ea5e9", restroom: "#6366f1", accessible_restroom: "#6366f1",
  food: "#f59e0b", cafe: "#b45309", bar: "#9333ea", first_aid: "#dc2626", stage: "#db2777", escalator: "#475569", elevator: "#475569",
  stairs: "#475569", wifi: "#0891b2", charging: "#eab308", coat_check: "#78716c", atm: "#059669", press: "#7c3aed", lounge: "#0d9488",
  quiet_room: "#4f46e5", meeting_point: "#ea580c", parking: "#1d4ed8", security: "#334155", taxi: "#facc15", shuttle: "#facc15",
  hotel: "#0f766e", photo: "#be185d", water: "#0284c7", smoking: "#6b7280", storage: "#78716c", vip: "#ca8a04", nursing_room: "#ec4899",
  prayer_room: "#7c3aed", pin: "#ef4444", other: "#64748b", ramp: "#475569", door: "#475569", bridge: "#475569",
};

export const ICON_NAMES = Object.keys(ICON_PATHS);

export function iconForPoiType(type: PoiType | string): string {
  return ICON_PATHS[type] ? type : "other";
}

/** Coloured disc with a white glyph. */
export function poiIconSvg(type: string, size = 48, color?: string): string {
  const key = iconForPoiType(type);
  const path = ICON_PATHS[key];
  const fill = color ?? ICON_COLORS[key] ?? ICON_COLORS.other;
  const filled = key === "charging" || key === "stage" || key === "vip";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="${fill}" stroke="#ffffff" stroke-width="2"/><g transform="translate(6.5 6.5) scale(0.79)"><path d="${path}" fill="${filled ? "#fff" : "none"}" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
}

/** Teardrop marker pin (SDK markers, route end). */
export function markerPinSvg(color: string, size = 56, inner = "#ffffff"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><path d="M16 31s-11-10.3-11-18a11 11 0 0 1 22 0c0 7.7-11 18-11 18z" fill="${color}" stroke="#ffffff" stroke-width="2"/><circle cx="16" cy="13" r="4.2" fill="${inner}"/></svg>`;
}

export function routeStartSvg(color: string, size = 40): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="#ffffff" stroke="${color}" stroke-width="4"/><circle cx="16" cy="16" r="4" fill="${color}"/></svg>`;
}

export interface RasterIcon { id: string; data: ImageData; pixelRatio: number }

/** Rasterise an SVG string to ImageData. Resolves to null when the DOM is unavailable. */
export function rasterizeSvg(svg: string, size: number): Promise<ImageData | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image(size, size);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        resolve(ctx.getImageData(0, 0, size, size));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** All icons the base style references: `poi-*`, `marker-pin`, `route-start`, `route-end`. */
export async function buildIconSet(colors: { primary: string; accent: string }): Promise<RasterIcon[]> {
  const jobs: Promise<RasterIcon | null>[] = [];
  const push = (id: string, svg: string, size: number) => jobs.push(rasterizeSvg(svg, size).then((data) => (data ? { id, data, pixelRatio: 2 } : null)));
  for (const name of ICON_NAMES) push(`poi-${name}`, poiIconSvg(name, 48), 48);
  push("marker-pin", markerPinSvg("#ef4444", 56), 56);
  push("marker-primary", markerPinSvg(colors.primary, 56), 56);
  push("route-start", routeStartSvg(colors.accent, 40), 40);
  push("route-end", markerPinSvg(colors.accent, 56), 56);
  const out = await Promise.all(jobs);
  return out.filter((x): x is RasterIcon => !!x);
}

export function markerImageId(color: string): string {
  return `marker-${color.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
}
