/**
 * Import booths from an SVG drawing. `<rect>`, `<polygon>`, `<polyline>` and simple `<path>`
 * elements become booth polygons; the label comes from `data-label`, `id`, `inkscape:label`
 * or a child `<title>`. Group/element `transform`s (translate, scale, rotate, matrix) are honoured.
 *
 * Implemented with a small tag scanner (no DOMParser) so it works in node and the browser.
 */
import type { Point, Polygon } from "@/lib/domain/types";
import { polygonArea, round } from "@/lib/domain/geometry";

export interface SvgImportOptions {
  /** Multiply SVG units by this to get metres (default 1). */
  scale?: number;
  /** Offset added after scaling. */
  offsetX?: number;
  offsetY?: number;
  /** Skip shapes smaller than this (m²). Default 0.25. */
  minArea?: number;
  /** Only import shapes whose label matches (e.g. /^[A-Z]\d+$/). */
  labelPattern?: RegExp;
  /** Import unlabeled shapes, naming them `prefix + n`. Default false. */
  unlabeledPrefix?: string | null;
}

export interface SvgImportedBooth { label: string; polygon: Polygon; source: "rect" | "polygon" | "polyline" | "path" }

export interface SvgImportResult {
  booths: SvgImportedBooth[];
  warnings: string[];
  viewBox: { x: number; y: number; width: number; height: number } | null;
  /** Bounds of the imported booths in metres. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

type Matrix = [number, number, number, number, number, number]; // a b c d e f
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m: Matrix, p: Point): Point {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

/** Parse an SVG `transform` attribute into a matrix. */
export function parseTransform(src: string | undefined): Matrix {
  if (!src) return IDENTITY;
  let m: Matrix = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) {
    const args = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let t: Matrix = IDENTITY;
    switch (match[1]) {
      case "matrix": if (args.length === 6) t = args as Matrix; break;
      case "translate": t = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0]; break;
      case "scale": t = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0]; break;
      case "rotate": {
        const r = ((args[0] ?? 0) * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
        const rot: Matrix = [cos, sin, -sin, cos, 0, 0];
        if (args.length >= 3) t = multiply(multiply([1, 0, 0, 1, args[1], args[2]], rot), [1, 0, 0, 1, -args[1], -args[2]]);
        else t = rot;
        break;
      }
      case "skewX": t = [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0]; break;
      case "skewY": t = [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]; break;
    }
    m = multiply(m, t);
  }
  return m;
}

function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out[m[1]] = m[3] ?? m[4] ?? "";
  return out;
}

function num(v: string | undefined, d = 0): number {
  if (v === undefined) return d;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
}

function parsePoints(src: string): Point[] {
  const nums = src.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));
  const pts: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

/** Path data → list of subpaths (polylines). Curves are flattened to their end points (control points ignored). */
export function parsePathData(d: string): Point[][] {
  const tokens = d.match(/[MmLlHhVvZzCcSsQqTtAa]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const subpaths: Point[][] = [];
  let cur: Point[] = [];
  let cmd = "";
  let x = 0, y = 0, startX = 0, startY = 0;
  let i = 0;
  const next = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) { cmd = t; i++; if (cmd === "Z" || cmd === "z") { if (cur.length) subpaths.push(cur); cur = []; x = startX; y = startY; continue; } }
    if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case "M": { const nx = next(), ny = next(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; if (cur.length) subpaths.push(cur); cur = [[x, y]]; startX = x; startY = y; cmd = rel ? "l" : "L"; break; }
      case "L": { const nx = next(), ny = next(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; cur.push([x, y]); break; }
      case "H": { const nx = next(); x = rel ? x + nx : nx; cur.push([x, y]); break; }
      case "V": { const ny = next(); y = rel ? y + ny : ny; cur.push([x, y]); break; }
      case "C": { next(); next(); next(); next(); const nx = next(), ny = next(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; cur.push([x, y]); break; }
      case "S": case "Q": { next(); next(); const nx = next(), ny = next(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; cur.push([x, y]); break; }
      case "T": { const nx = next(), ny = next(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; cur.push([x, y]); break; }
      case "A": { next(); next(); next(); next(); next(); const nx = next(), ny = next(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; cur.push([x, y]); break; }
      default: i++;
    }
    if (Number.isNaN(x) || Number.isNaN(y)) break;
  }
  if (cur.length) subpaths.push(cur);
  return subpaths;
}

function dedupe(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-9 || Math.abs(last[1] - p[1]) > 1e-9) out.push(p);
  }
  if (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) < 1e-9 && Math.abs(out[0][1] - out[out.length - 1][1]) < 1e-9) out.pop();
  return out;
}

interface Shape { tag: "rect" | "polygon" | "polyline" | "path"; attrs: Record<string, string>; matrix: Matrix; title: string | null; groupLabel: string | null }

/** Walk the SVG and collect shapes with their accumulated transform. */
function collectShapes(svg: string): { shapes: Shape[]; viewBox: SvgImportResult["viewBox"] } {
  const shapes: Shape[] = [];
  let viewBox: SvgImportResult["viewBox"] = null;
  const stack: { matrix: Matrix; label: string | null; tag: string }[] = [{ matrix: IDENTITY, label: null, tag: "root" }];
  const re = /<(\/?)([A-Za-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/g;
  let m: RegExpExecArray | null;
  let pendingShape: Shape | null = null;
  let skipDepth = 0;
  while ((m = re.exec(svg))) {
    const closing = m[1] === "/", tag = m[2], selfClosing = m[4] === "/" || /\/\s*$/.test(m[3]);
    const lower = tag.toLowerCase();
    if (skipDepth) { if (closing) skipDepth--; else if (!selfClosing) skipDepth++; continue; }
    if (closing) {
      if (lower === "g" || lower === "svg" || lower === "a") { if (stack.length > 1) stack.pop(); }
      else if (pendingShape && (lower === pendingShape.tag)) { shapes.push(pendingShape); pendingShape = null; }
      else if (lower === "title" && pendingShape) { /* handled below */ }
      continue;
    }
    if (lower === "defs" || lower === "clippath" || lower === "mask" || lower === "symbol" || lower === "pattern" || lower === "marker" || lower === "metadata" || lower === "style") { if (!selfClosing) skipDepth = 1; continue; }
    const attrs = parseAttrs(m[3]);
    const top = stack[stack.length - 1];
    if (lower === "svg") {
      const vb = attrs.viewBox?.split(/[\s,]+/).map(Number);
      if (vb && vb.length === 4 && vb.every((n) => Number.isFinite(n))) viewBox = { x: vb[0], y: vb[1], width: vb[2], height: vb[3] };
      if (!selfClosing) stack.push({ matrix: multiply(top.matrix, parseTransform(attrs.transform)), label: top.label, tag: "svg" });
      continue;
    }
    if (lower === "g" || lower === "a") {
      // Only explicit labels cascade from groups; a group's `id` is not a booth label.
      const label = attrs["data-label"] ?? attrs["inkscape:label"] ?? top.label;
      if (!selfClosing) stack.push({ matrix: multiply(top.matrix, parseTransform(attrs.transform)), label, tag: lower });
      continue;
    }
    if (lower === "title" && pendingShape) {
      const end = svg.indexOf("</title>", re.lastIndex);
      if (end > 0) { pendingShape.title = svg.slice(re.lastIndex, end).trim(); re.lastIndex = end; }
      continue;
    }
    if (lower === "rect" || lower === "polygon" || lower === "polyline" || lower === "path") {
      const shape: Shape = { tag: lower, attrs, matrix: multiply(top.matrix, parseTransform(attrs.transform)), title: null, groupLabel: top.label };
      if (selfClosing) shapes.push(shape);
      else pendingShape = shape;
    }
  }
  if (pendingShape) shapes.push(pendingShape);
  return { shapes, viewBox };
}

export function importSvgBooths(svg: string, opts: SvgImportOptions = {}): SvgImportResult {
  const scale = opts.scale ?? 1, ox = opts.offsetX ?? 0, oy = opts.offsetY ?? 0, minArea = opts.minArea ?? 0.25;
  const { shapes, viewBox } = collectShapes(svg);
  const booths: SvgImportedBooth[] = [];
  const warnings: string[] = [];
  const taken = new Set<string>();
  let unlabeled = 0;
  const toPlan = (m: Matrix) => (p: Point): Point => { const q = apply(m, p); return [round(q[0] * scale + ox, 3), round(q[1] * scale + oy, 3)]; };
  for (const s of shapes) {
    let raw: Point[] = [];
    if (s.tag === "rect") {
      const x = num(s.attrs.x), y = num(s.attrs.y), w = num(s.attrs.width), h = num(s.attrs.height);
      if (w <= 0 || h <= 0) continue;
      raw = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    } else if (s.tag === "polygon" || s.tag === "polyline") {
      raw = parsePoints(s.attrs.points ?? "");
    } else {
      const subs = parsePathData(s.attrs.d ?? "").map(dedupe).filter((p) => p.length >= 3);
      if (subs.length > 1) warnings.push(`Path ${s.attrs.id ?? "(no id)"} has ${subs.length} subpaths; using the largest`);
      raw = subs.sort((a, b) => polygonArea(b) - polygonArea(a))[0] ?? [];
    }
    const polygon = dedupe(raw.map(toPlan(s.matrix)));
    if (polygon.length < 3) continue;
    const area = polygonArea(polygon);
    if (area < minArea) continue;
    let label = s.attrs["data-label"] ?? s.title ?? s.attrs["inkscape:label"] ?? s.attrs.id ?? s.groupLabel ?? null;
    if (label) label = label.trim();
    if (opts.labelPattern && (!label || !opts.labelPattern.test(label))) continue;
    if (!label) {
      if (opts.unlabeledPrefix == null) { warnings.push(`Skipped unlabeled ${s.tag}`); continue; }
      unlabeled += 1;
      label = `${opts.unlabeledPrefix}${unlabeled}`;
    }
    if (taken.has(label)) {
      let n = 2;
      while (taken.has(`${label}-${n}`)) n++;
      warnings.push(`Duplicate label ${label}; renamed to ${label}-${n}`);
      label = `${label}-${n}`;
    }
    taken.add(label);
    // Ensure consistent (clockwise in y-down) winding so downstream ops behave.
    booths.push({ label, polygon: signedArea(polygon) < 0 ? [...polygon].reverse() : polygon, source: s.tag });
  }
  let bounds: SvgImportResult["bounds"] = null;
  for (const b of booths) for (const [x, y] of b.polygon) {
    if (!bounds) bounds = { minX: x, minY: y, maxX: x, maxY: y };
    else { bounds.minX = Math.min(bounds.minX, x); bounds.minY = Math.min(bounds.minY, y); bounds.maxX = Math.max(bounds.maxX, x); bounds.maxY = Math.max(bounds.maxY, y); }
  }
  return { booths, warnings, viewBox, bounds };
}

function signedArea(p: Point[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}
