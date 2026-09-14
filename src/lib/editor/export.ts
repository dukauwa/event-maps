/**
 * Export a level of the editor document as a standalone SVG string (also used for PNG rasterising).
 */
import type { EventBranding } from "@/lib/domain/types";
import { polygonCentroid } from "@/lib/domain/geometry";
import type { EditorDocument, EditorLevel } from "./types";
import { geometryPoints } from "./geometry-ops";

export interface ExportOptions {
  colors: EventBranding["boothColors"];
  /** Pixels per metre. */
  scale?: number;
  showLabels?: boolean;
  showNetwork?: boolean;
  background?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function boothFill(status: string, boothType: string, colors: EventBranding["boothColors"], custom?: { fill?: string } | null): string {
  if (custom?.fill) return custom.fill;
  if (boothType === "sponsor" && status !== "sold") return colors.sponsor;
  return (colors as Record<string, string>)[status] ?? colors.available;
}

export function levelToSvg(doc: EditorDocument, level: EditorLevel, opts: ExportOptions): string {
  const scale = opts.scale ?? 10;
  const W = level.widthM * scale, H = level.heightM * scale;
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${level.widthM} ${level.heightM}" font-family="Inter, Arial, sans-serif">`);
  parts.push(`<rect width="${level.widthM}" height="${level.heightM}" fill="${opts.background ?? "#ffffff"}"/>`);
  if (level.background) {
    const b = level.background;
    parts.push(`<image href="${esc(b.url)}" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" opacity="${b.opacity}" preserveAspectRatio="none"${b.rotationDeg ? ` transform="rotate(${b.rotationDeg} ${b.x + b.width / 2} ${b.y + b.height / 2})"` : ""}/>`);
  }
  const elements = doc.elements.filter((e) => e.levelId === level.id).sort((a, b) => a.sortIndex - b.sortIndex);
  for (const e of elements) {
    if (e.kind === "zone" || e.kind === "room" || e.kind === "stage" || e.kind === "shape") {
      if (e.geometry.type !== "polygon") continue;
      parts.push(`<polygon points="${e.geometry.points.map((p) => p.join(",")).join(" ")}" fill="${e.props.fill ?? "#e0e7ff"}" fill-opacity="${e.props.opacity ?? 0.6}" stroke="${e.props.stroke ?? "#6366f1"}" stroke-width="0.1"/>`);
      if (e.props.name) { const c = polygonCentroid(e.geometry.points); parts.push(`<text x="${c[0]}" y="${c[1]}" font-size="${e.props.fontSize ?? 1.2}" text-anchor="middle" fill="${e.props.color ?? "#3730a3"}">${esc(String(e.props.name))}</text>`); }
    }
  }
  for (const b of doc.booths.filter((b) => b.levelId === level.id)) {
    const fill = boothFill(b.status, b.boothType, opts.colors, b.colors);
    parts.push(`<polygon points="${b.polygon.map((p) => p.join(",")).join(" ")}" fill="${fill}" stroke="${b.colors?.border ?? opts.colors.border}" stroke-width="0.15"/>`);
    if (opts.showLabels !== false && !b.labelHidden) {
      const c = polygonCentroid(b.polygon);
      parts.push(`<text x="${c[0]}" y="${c[1] + 0.3}" font-size="0.9" text-anchor="middle" fill="${b.colors?.label ?? opts.colors.label}">${esc(b.label)}</text>`);
    }
  }
  for (const e of elements) {
    if (e.kind === "wall" || e.kind === "line") {
      const pts = geometryPoints(e.geometry);
      parts.push(`<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${e.props.stroke ?? "#1f2937"}" stroke-width="${e.props.strokeWidth ?? (e.kind === "wall" ? 0.3 : 0.1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else if (e.kind === "text" && e.geometry.type === "point") {
      parts.push(`<text x="${e.geometry.point[0]}" y="${e.geometry.point[1]}" font-size="${e.props.fontSize ?? 1.5}" text-anchor="middle" fill="${e.props.color ?? "#111827"}"${e.props.rotationDeg ? ` transform="rotate(${e.props.rotationDeg} ${e.geometry.point[0]} ${e.geometry.point[1]})"` : ""}>${esc(String(e.props.text ?? ""))}</text>`);
    } else if ((e.kind === "poi" || e.kind === "entrance") && e.geometry.type === "point") {
      const [x, y] = e.geometry.point;
      parts.push(`<circle cx="${x}" cy="${y}" r="0.8" fill="${e.kind === "entrance" ? "#16a34a" : "#0ea5e9"}" stroke="#fff" stroke-width="0.15"/>`);
      if (e.props.name) parts.push(`<text x="${x}" y="${y + 1.8}" font-size="0.8" text-anchor="middle" fill="#374151">${esc(String(e.props.name))}</text>`);
    }
  }
  if (opts.showNetwork) {
    const nodes = new Map(doc.nodes.filter((n) => n.levelId === level.id).map((n) => [n.id, n]));
    for (const e of doc.edges.filter((e) => e.levelId === level.id)) {
      const a = nodes.get(e.from), b = nodes.get(e.to);
      if (!a || !b) continue;
      parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${e.accessible ? "#0ea5e9" : "#ef4444"}" stroke-width="0.12"${e.virtual ? ' stroke-dasharray="0.2 0.3"' : e.accessible ? "" : ' stroke-dasharray="0.6 0.4"'}/>`);
    }
  }
  parts.push("</svg>");
  return parts.join("\n");
}
