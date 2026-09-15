"use client";
/** Memoised static map layers rendered inside the plan-space <g>. */
import * as React from "react";
import type { EventBranding, Point } from "@/lib/domain/types";
import { polygonCentroid } from "@/lib/domain/geometry";
import type { EditorBooth, EditorEdge, EditorElement, EditorLevel, EditorNode } from "@/lib/editor/document";
import { boothFill } from "@/lib/editor/export";
import { PoiGlyph } from "./icons";
import { niceScaleBar, rulerStep, type Viewport } from "./useViewport";

export type LabelMode = "none" | "label" | "full";

export function labelModeFor(scale: number): LabelMode {
  if (scale < 4.5) return "none";
  if (scale < 9) return "label";
  return "full";
}

export const pts = (points: Point[]) => points.map((p) => `${p[0]},${p[1]}`).join(" ");

/* ---------------- Booths ---------------- */

const BoothShape = React.memo(function BoothShape({ booth, colors, exhibitor, labelMode, dim }: { booth: EditorBooth; colors: EventBranding["boothColors"]; exhibitor: string | undefined; labelMode: LabelMode; dim: boolean }) {
  const fill = boothFill(booth.status, booth.boothType, colors, booth.colors);
  const c = polygonCentroid(booth.polygon);
  const showLabel = labelMode !== "none" && !booth.labelHidden;
  return (
    <g data-id={booth.id} data-kind="booth" opacity={dim ? 0.35 : 1} style={{ cursor: "pointer" }}>
      <polygon points={pts(booth.polygon)} fill={fill} stroke={booth.colors?.border ?? colors.border} strokeWidth={0.12} strokeLinejoin="round" />
      {showLabel && (
        <text x={c[0]} y={c[1] + (labelMode === "full" && exhibitor ? 0.05 : 0.3)} fontSize={0.85} textAnchor="middle" fill={booth.colors?.label ?? colors.label} fontWeight={600} style={{ pointerEvents: "none", userSelect: "none" }}>
          {booth.label}
        </text>
      )}
      {labelMode === "full" && exhibitor && !booth.labelHidden && (
        <text x={c[0]} y={c[1] + 0.85} fontSize={0.5} textAnchor="middle" fill={booth.colors?.label ?? colors.label} opacity={0.8} style={{ pointerEvents: "none", userSelect: "none" }}>
          {exhibitor.length > 22 ? `${exhibitor.slice(0, 21)}…` : exhibitor}
        </text>
      )}
    </g>
  );
});

export const BoothLayer = React.memo(function BoothLayer({ booths, colors, exhibitorNames, labelMode, hidden }: { booths: EditorBooth[]; colors: EventBranding["boothColors"]; exhibitorNames: Map<string, string>; labelMode: LabelMode; hidden: boolean }) {
  if (hidden) return null;
  return (
    <g data-layer="booths">
      {booths.map((b) => (
        <BoothShape key={b.id} booth={b} colors={colors} exhibitor={exhibitorNames.get(b.id)} labelMode={labelMode} dim={false} />
      ))}
    </g>
  );
});

/* ---------------- Elements ---------------- */

export const ZONE_KINDS = new Set(["zone", "room", "stage", "shape", "image"]);
const ZONE_DEFAULTS: Record<string, { fill: string; stroke: string; color: string }> = {
  zone: { fill: "#c7d2fe", stroke: "#6366f1", color: "#3730a3" },
  room: { fill: "#e5e7eb", stroke: "#6b7280", color: "#374151" },
  stage: { fill: "#fecaca", stroke: "#ef4444", color: "#7f1d1d" },
  shape: { fill: "#e0f2fe", stroke: "#0ea5e9", color: "#0c4a6e" },
  image: { fill: "#f3f4f6", stroke: "#9ca3af", color: "#374151" },
};

export const ElementShape = React.memo(function ElementShape({ el, labelMode }: { el: EditorElement; labelMode: LabelMode }) {
  const g = el.geometry;
  const p = el.props;
  if (ZONE_KINDS.has(el.kind) && g.type === "polygon") {
    const d = ZONE_DEFAULTS[el.kind] ?? ZONE_DEFAULTS.zone;
    const c = polygonCentroid(g.points);
    return (
      <g data-id={el.id} data-kind="element" style={{ cursor: "pointer" }}>
        <polygon points={pts(g.points)} fill={p.fill ?? d.fill} fillOpacity={p.opacity ?? 0.55} stroke={p.stroke ?? d.stroke} strokeWidth={p.strokeWidth ?? 0.15} strokeDasharray={el.kind === "zone" ? "0.6 0.4" : undefined} strokeLinejoin="round" />
        {p.name && labelMode !== "none" && (
          <text x={c[0]} y={c[1]} fontSize={p.fontSize ?? 1.4} textAnchor="middle" fill={p.color ?? d.color} fontWeight={600} opacity={0.9} style={{ pointerEvents: "none", userSelect: "none" }}>
            {String(p.name)}
          </text>
        )}
      </g>
    );
  }
  if ((el.kind === "wall" || el.kind === "line") && g.type !== "point") {
    const width = p.strokeWidth ?? (el.kind === "wall" ? 0.3 : 0.1);
    return (
      <g data-id={el.id} data-kind="element" style={{ cursor: "pointer" }}>
        <polyline points={pts(g.points)} fill="none" stroke="transparent" strokeWidth={Math.max(width, 0.8)} />
        <polyline points={pts(g.points)} fill="none" stroke={p.stroke ?? (el.kind === "wall" ? "#1f2937" : "#6b7280")} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={el.kind === "line" ? "0.5 0.3" : undefined} />
      </g>
    );
  }
  if (el.kind === "text" && g.type === "point") {
    const size = p.fontSize ?? 1.5;
    const text = String(p.text ?? "Text");
    return (
      <g data-id={el.id} data-kind="element" style={{ cursor: "pointer" }} transform={p.rotationDeg ? `rotate(${p.rotationDeg} ${g.point[0]} ${g.point[1]})` : undefined}>
        <rect x={g.point[0] - (text.length * size * 0.3)} y={g.point[1] - size * 0.9} width={text.length * size * 0.6} height={size * 1.2} fill="transparent" />
        <text x={g.point[0]} y={g.point[1]} fontSize={size} textAnchor="middle" fill={p.color ?? "#111827"} fontWeight={600} style={{ userSelect: "none" }}>
          {text}
        </text>
      </g>
    );
  }
  if ((el.kind === "poi" || el.kind === "entrance") && g.type === "point") {
    const [x, y] = g.point;
    const isEntrance = el.kind === "entrance";
    const r = 1;
    const fill = isEntrance ? (p.isDefaultStart ? "#15803d" : "#22c55e") : (p.color ?? "#0284c7");
    return (
      <g data-id={el.id} data-kind="element" style={{ cursor: "pointer" }}>
        <circle cx={x} cy={y} r={r} fill={fill} stroke="#fff" strokeWidth={0.15} />
        <g transform={`translate(${x - r * 0.65} ${y - r * 0.65}) scale(${(r * 1.3) / 24})`} fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }}>
          {isEntrance ? <path d="M7 5h8v14H7zM15 12h4m-2-2l2 2-2 2" /> : <PoiGlyph type={p.poiType} />}
        </g>
        {p.name && labelMode === "full" && (
          <text x={x} y={y + r + 0.7} fontSize={0.55} textAnchor="middle" fill="#374151" style={{ pointerEvents: "none", userSelect: "none" }}>
            {String(p.name)}
          </text>
        )}
      </g>
    );
  }
  return null;
});

export const ElementLayer = React.memo(function ElementLayer({ elements, labelMode }: { elements: EditorElement[]; labelMode: LabelMode }) {
  return (
    <g>
      {elements.map((e) => (
        <ElementShape key={e.id} el={e} labelMode={labelMode} />
      ))}
    </g>
  );
});

/* ---------------- Path network ---------------- */

export const NetworkLayer = React.memo(function NetworkLayer({ nodes, edges, scale, emphasis, hidden }: { nodes: EditorNode[]; edges: EditorEdge[]; scale: number; emphasis: boolean; hidden: boolean }) {
  if (hidden) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const w = emphasis ? 0.18 : 0.12;
  const r = Math.max(0.18, Math.min(0.45, 5 / scale));
  return (
    <g data-layer="network" opacity={emphasis ? 1 : 0.75}>
      <defs>
        <marker id="oneway" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M1 1l7 4-7 4z" fill="#0369a1" />
        </marker>
      </defs>
      {edges.map((e) => {
        const a = byId.get(e.from), b = byId.get(e.to);
        if (!a || !b) return null;
        const stroke = e.accessible ? (e.virtual ? "#7c3aed" : "#0ea5e9") : "#ef4444";
        const dash = e.virtual ? "0.25 0.35" : e.accessible ? undefined : "0.7 0.4";
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        return (
          <g key={e.id} data-id={e.id} data-kind="edge" style={{ cursor: "pointer" }}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={Math.max(0.8, w * 5)} />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={w} strokeDasharray={dash} strokeLinecap="round" />
            {e.oneWay && <line x1={mx - (b.x - a.x) * 0.01} y1={my - (b.y - a.y) * 0.01} x2={mx + (b.x - a.x) * 0.01} y2={my + (b.y - a.y) * 0.01} stroke="none" markerEnd="url(#oneway)" />}
          </g>
        );
      })}
      {nodes.map((n) => (
        <circle key={n.id} data-id={n.id} data-kind="node" cx={n.x} cy={n.y} r={r} fill="#fff" stroke="#0369a1" strokeWidth={0.1} style={{ cursor: "pointer" }} />
      ))}
    </g>
  );
});

/* ---------------- Level frame, background, grid ---------------- */

export function LevelFrame({ level, scale, showGrid, gridSize, showBackground }: { level: EditorLevel; scale: number; showGrid: boolean; gridSize: number; showBackground: boolean }) {
  const minor = gridSize, major = 5;
  const showMinor = showGrid && scale * minor >= 7;
  const bg = level.background;
  return (
    <g>
      <rect x={0} y={0} width={level.widthM} height={level.heightM} fill="#ffffff" stroke="#9ca3af" strokeWidth={2 / scale} />
      {showBackground && bg && (
        <image href={bg.url} x={bg.x} y={bg.y} width={bg.width} height={bg.height} opacity={bg.opacity} preserveAspectRatio="none" transform={bg.rotationDeg ? `rotate(${bg.rotationDeg} ${bg.x + bg.width / 2} ${bg.y + bg.height / 2})` : undefined} style={{ pointerEvents: "none" }} />
      )}
      {showGrid && (
        <>
          <defs>
            {showMinor && (
              <pattern id="grid-minor" width={minor} height={minor} patternUnits="userSpaceOnUse">
                <path d={`M ${minor} 0 L 0 0 0 ${minor}`} fill="none" stroke="#e5e7eb" strokeWidth={1 / scale} />
              </pattern>
            )}
            <pattern id="grid-major" width={major} height={major} patternUnits="userSpaceOnUse">
              {showMinor && <rect width={major} height={major} fill="url(#grid-minor)" />}
              <path d={`M ${major} 0 L 0 0 0 ${major}`} fill="none" stroke="#d1d5db" strokeWidth={1 / scale} />
            </pattern>
          </defs>
          <rect x={0} y={0} width={level.widthM} height={level.heightM} fill="url(#grid-major)" style={{ pointerEvents: "none" }} />
        </>
      )}
    </g>
  );
}

/* ---------------- Screen-space chrome: rulers + scale bar ---------------- */

export const RULER = 22;

export function Rulers({ vp, width, height }: { vp: Viewport; width: number; height: number }) {
  const step = rulerStep(vp.scale);
  const ticksX: number[] = [], ticksY: number[] = [];
  const x0 = Math.floor((RULER - vp.x) / vp.scale / step) * step, x1 = (width - vp.x) / vp.scale;
  for (let x = x0; x <= x1; x += step) ticksX.push(Math.round(x * 1000) / 1000);
  const y0 = Math.floor((RULER - vp.y) / vp.scale / step) * step, y1 = (height - vp.y) / vp.scale;
  for (let y = y0; y <= y1; y += step) ticksY.push(Math.round(y * 1000) / 1000);
  const fmt = (n: number) => (Math.abs(n) >= 1000 ? `${n / 1000}k` : String(n));
  return (
    <g style={{ pointerEvents: "none" }} fontSize={9} fill="#6b7280" fontFamily="ui-monospace, monospace">
      <rect x={0} y={0} width={width} height={RULER} fill="#f9fafb" />
      <rect x={0} y={0} width={RULER} height={height} fill="#f9fafb" />
      {ticksX.map((x) => {
        const sx = x * vp.scale + vp.x;
        if (sx < RULER) return null;
        return (
          <g key={`x${x}`}>
            <line x1={sx} y1={RULER - 6} x2={sx} y2={RULER} stroke="#9ca3af" />
            <text x={sx + 3} y={10}>{fmt(x)}</text>
          </g>
        );
      })}
      {ticksY.map((y) => {
        const sy = y * vp.scale + vp.y;
        if (sy < RULER) return null;
        return (
          <g key={`y${y}`}>
            <line x1={RULER - 6} y1={sy} x2={RULER} y2={sy} stroke="#9ca3af" />
            <text x={3} y={sy - 3} transform={`rotate(-90 3 ${sy - 3})`} textAnchor="start">{fmt(y)}</text>
          </g>
        );
      })}
      <line x1={RULER} y1={RULER} x2={width} y2={RULER} stroke="#e5e7eb" />
      <line x1={RULER} y1={RULER} x2={RULER} y2={height} stroke="#e5e7eb" />
      <rect x={0} y={0} width={RULER} height={RULER} fill="#f3f4f6" />
      <text x={4} y={14} fontSize={8}>m</text>
    </g>
  );
}

export function ScaleBar({ vp, height }: { vp: Viewport; height: number }) {
  const { metres, px } = niceScaleBar(vp.scale);
  const x = RULER + 14, y = height - 18;
  return (
    <g style={{ pointerEvents: "none" }} fontSize={10} fill="#374151" fontFamily="ui-monospace, monospace">
      <rect x={x - 6} y={y - 16} width={px + 12} height={26} rx={4} fill="#ffffffcc" />
      <line x1={x} y1={y} x2={x + px} y2={y} stroke="#111827" strokeWidth={2} />
      <line x1={x} y1={y - 5} x2={x} y2={y + 4} stroke="#111827" strokeWidth={2} />
      <line x1={x + px} y1={y - 5} x2={x + px} y2={y + 4} stroke="#111827" strokeWidth={2} />
      <text x={x + px / 2} y={y - 5} textAnchor="middle">{metres >= 1 ? `${metres} m` : `${metres * 100} cm`}</text>
    </g>
  );
}
