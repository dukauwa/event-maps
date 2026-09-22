/**
 * Auto-draft booths from a rendered floor plan (a PDF page, a PNG/JPG scan, or a rasterised SVG).
 *
 * Floor plans draw booths as closed cells: dark outlines around white or lightly-coloured fills. So instead of
 * hunting for line segments we flood-fill every non-ink region, keep the ones that look like a stand
 * (bounded, roughly rectangular, plausibly sized) and turn their bounding boxes into booth rectangles.
 * Labels come from PDF text that sits inside a cell, or from a row/sequential numbering scheme.
 *
 * Pure functions over RGBA pixel data, so this runs in node tests and in the browser.
 */
import type { Polygon } from "@/lib/domain/types";
import { round } from "@/lib/domain/geometry";

export interface RasterImage { width: number; height: number; data: Uint8ClampedArray | Uint8Array }

export interface DetectOptions {
  /** Luminance (0–255) below which a low-saturation pixel counts as ink (an outline). Default 150. */
  inkThreshold?: number;
  /** Cells smaller than this many pixels are noise. Default 150. */
  minAreaPx?: number;
  /** Cells covering more than this fraction of the image are halls/aisles, not booths. Default 0.1. */
  maxAreaFraction?: number;
  /** Pixels in the cell ÷ its bounding-box area. Rectangles with a label inside still score > 0.8. Default 0.72. */
  minFill?: number;
  /** Longest side ÷ shortest side. Aisles and corridors are far more elongated than stands. Default 6. */
  maxAspect?: number;
  /** Shortest side in pixels. Default 6. */
  minSidePx?: number;
}

export interface DetectedCell {
  x: number; y: number; w: number; h: number;
  cx: number; cy: number;
  areaPx: number;
  /** Fill ratio (1 = a perfect rectangle). */
  fill: number;
}

export interface TextItem { text: string; x: number; y: number; w: number; h: number }

export interface DraftBooth {
  label: string;
  /** Pixel-space rectangle. */
  rect: { x: number; y: number; w: number; h: number };
  labelSource: "text" | "auto";
}

const DEFAULTS: Required<DetectOptions> = { inkThreshold: 150, minAreaPx: 150, maxAreaFraction: 0.1, minFill: 0.72, maxAspect: 6, minSidePx: 6 };

/** Ink = dark and grey-ish. Dark saturated colours are booth fills (sold/sponsor stands), not outlines. */
export function isInk(r: number, g: number, b: number, a: number, threshold: number): boolean {
  if (a < 96) return false;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum >= threshold) return false;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  return chroma < 80;
}

/** Find enclosed cells (candidate booths) in an RGBA image. */
export function detectCells(img: RasterImage, options: DetectOptions = {}): DetectedCell[] {
  const o = { ...DEFAULTS, ...options };
  const { width: W, height: H, data } = img;
  const N = W * H;
  const ink = new Uint8Array(N);
  for (let i = 0, p = 0; i < N; i++, p += 4) ink[i] = isInk(data[p], data[p + 1], data[p + 2], data[p + 3], o.inkThreshold) ? 1 : 0;

  const label = new Int32Array(N).fill(-1);
  const stack = new Int32Array(N);
  const maxArea = Math.max(o.minAreaPx, Math.floor(N * o.maxAreaFraction));
  const cells: DetectedCell[] = [];
  let next = 0;

  for (let seed = 0; seed < N; seed++) {
    if (ink[seed] || label[seed] !== -1) continue;
    const id = next++;
    let sp = 0;
    stack[sp++] = seed;
    label[seed] = id;
    let minX = W, maxX = -1, minY = H, maxY = -1, count = 0, touchesBorder = false;
    while (sp > 0) {
      const i = stack[--sp];
      const x = i % W, y = (i - x) / W;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touchesBorder = true;
      if (x > 0) { const j = i - 1; if (!ink[j] && label[j] === -1) { label[j] = id; stack[sp++] = j; } }
      if (x < W - 1) { const j = i + 1; if (!ink[j] && label[j] === -1) { label[j] = id; stack[sp++] = j; } }
      if (y > 0) { const j = i - W; if (!ink[j] && label[j] === -1) { label[j] = id; stack[sp++] = j; } }
      if (y < H - 1) { const j = i + W; if (!ink[j] && label[j] === -1) { label[j] = id; stack[sp++] = j; } }
    }
    if (touchesBorder || count < o.minAreaPx || count > maxArea) continue;
    const w = maxX - minX + 1, h = maxY - minY + 1;
    if (Math.min(w, h) < o.minSidePx) continue;
    if (Math.max(w, h) / Math.min(w, h) > o.maxAspect) continue;
    const fill = count / (w * h);
    if (fill < o.minFill) continue;
    cells.push({ x: minX, y: minY, w, h, cx: minX + w / 2, cy: minY + h / 2, areaPx: count, fill });
  }
  return cells;
}

/** Group cells into rows (top to bottom) and sort each row left to right, like reading a hall plan. */
export function orderCells<T extends { cx: number; cy: number; h: number }>(cells: T[]): T[][] {
  if (!cells.length) return [];
  const heights = cells.map((c) => c.h).sort((a, b) => a - b);
  const tol = Math.max(2, heights[Math.floor(heights.length / 2)] * 0.5);
  const sorted = [...cells].sort((a, b) => a.cy - b.cy);
  const rows: T[][] = [];
  let row: T[] = [];
  let rowY = 0;
  for (const c of sorted) {
    if (row.length && Math.abs(c.cy - rowY) > tol) { rows.push(row); row = []; }
    row.push(c);
    rowY = row.reduce((s, x) => s + x.cy, 0) / row.length;
  }
  if (row.length) rows.push(row);
  for (const r of rows) r.sort((a, b) => a.cx - b.cx);
  return rows;
}

export interface LabelOptions {
  /** `rows`: A1, A2 … B1, B2 (a letter per row). `sequential`: prefix + running number. Default `rows`. */
  scheme?: "rows" | "sequential";
  prefix?: string;
  start?: number;
}

const BOOTH_LABEL = /^[A-Z]{0,3}[-\s.]?\d{1,4}[A-Z]?$/i;

function looksLikeLabel(t: string): boolean {
  const s = t.trim();
  return s.length > 0 && s.length <= 12 && BOOTH_LABEL.test(s);
}

function rowLetter(i: number): string {
  let s = "";
  let n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

/**
 * Turn detected cells into labelled draft booths. Text items (PDF text runs, in the same pixel space) whose
 * centre lies inside a cell name it; the rest get generated labels. Labels are made unique.
 */
export function labelCells(cells: DetectedCell[], texts: TextItem[] = [], options: LabelOptions = {}): DraftBooth[] {
  const scheme = options.scheme ?? "rows";
  const prefix = options.prefix ?? "";
  const start = options.start ?? 1;
  const rows = orderCells(cells);
  const used = new Map<string, number>();
  const unique = (raw: string) => {
    const base = raw.trim();
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  };
  const out: DraftBooth[] = [];
  let seq = start;
  rows.forEach((row, ri) => {
    row.forEach((cell, ci) => {
      const inside = texts.filter((t) => {
        const tx = t.x + t.w / 2, ty = t.y + t.h / 2;
        return tx >= cell.x && tx <= cell.x + cell.w && ty >= cell.y && ty <= cell.y + cell.h;
      });
      const best = inside.find((t) => looksLikeLabel(t.text)) ?? inside.filter((t) => t.text.trim().length <= 12).sort((a, b) => a.text.trim().length - b.text.trim().length)[0];
      const rect = { x: cell.x, y: cell.y, w: cell.w, h: cell.h };
      if (best) { out.push({ label: unique(best.text.replace(/\s+/g, " ")), rect, labelSource: "text" }); return; }
      const auto = scheme === "rows" ? `${prefix}${rowLetter(ri)}${ci + start}` : `${prefix}${seq++}`;
      out.push({ label: unique(auto), rect, labelSource: "auto" });
    });
  });
  return out;
}

export interface PlanTransform {
  /** Metres per pixel. */
  scale: number;
  offsetX?: number;
  offsetY?: number;
}

/** Convert pixel rectangles to plan polygons (metres, y down), snapped to centimetres. */
export function toPlanPolygon(rect: { x: number; y: number; w: number; h: number }, t: PlanTransform): Polygon {
  const ox = t.offsetX ?? 0, oy = t.offsetY ?? 0;
  const x0 = round(ox + rect.x * t.scale, 2), y0 = round(oy + rect.y * t.scale, 2);
  const x1 = round(ox + (rect.x + rect.w) * t.scale, 2), y1 = round(oy + (rect.y + rect.h) * t.scale, 2);
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

/** One-shot helper: detect, label and scale. `scale` is metres per pixel. */
export function draftBooths(img: RasterImage, transform: PlanTransform, opts: { detect?: DetectOptions; texts?: TextItem[]; labels?: LabelOptions } = {}): { label: string; polygon: Polygon; labelSource: "text" | "auto"; areaM2: number }[] {
  const cells = detectCells(img, opts.detect);
  return labelCells(cells, opts.texts, opts.labels).map((b) => {
    const polygon = toPlanPolygon(b.rect, transform);
    return { label: b.label, polygon, labelSource: b.labelSource, areaM2: round(b.rect.w * b.rect.h * transform.scale * transform.scale, 2) };
  });
}

/** Suggest a minimum cell size in pixels from a minimum booth area in m². */
export function minAreaPxFor(minAreaM2: number, metersPerPixel: number): number {
  return Math.max(20, Math.round(minAreaM2 / (metersPerPixel * metersPerPixel)));
}
