"use client";
/**
 * Step 3 of the event wizard: upload the existing floor plan (PDF / image / SVG), see it rendered with the
 * auto-detected stands drawn on top, tune the detection and numbering, and carry the draft into the designer.
 */
import * as React from "react";
import { Button, Field, Input, Select, cn } from "@/components/ui";
import { Notice, Switch } from "@/components/admin/primitives";
import { detectCells, labelCells, minAreaPxFor, type DetectedCell, type DraftBooth, type LabelOptions } from "@/lib/import/raster-booths";
import { importSvgBooths } from "@/lib/editor/import-svg";
import type { LoadedPlan } from "@/lib/import/plan-file";
import { boothsFromShapes } from "@/lib/import/pdf-vector";

export interface PlanDraft {
  file: File;
  loaded: LoadedPlan;
  /** The rendered page (PNG, or WebP/JPEG when large), uploaded as the level background. */
  blob: Blob;
  previewUrl: string;
}

export interface PlanImportState {
  draft: PlanDraft | null;
  autoDraft: boolean;
  minAreaM2: number;
  scheme: LabelOptions["scheme"];
  prefix: string;
  start: number;
  /** Prefer the drawing's own outlines (vector PDF / SVG) over detecting cells in the rendered image. */
  useVectors: boolean;
  /** Create exhibitors from the company names printed inside booths, assigned to those booths. */
  createExhibitors: boolean;
}

export const DEFAULT_PLAN_STATE: PlanImportState = { draft: null, autoDraft: true, minAreaM2: 4, scheme: "rows", prefix: "", start: 1, useVectors: true, createExhibitors: true };

export interface PlanBoothsResult { booths: DraftBooth[]; source: "vector" | "raster" | "none"; cells: number }

/** A vector reading counts when it found at least this many numbered outlines; fewer means a scan or a sketch. */
const MIN_VECTOR_BOOTHS = 3;

/** Flood-fill results per (page, min cell size); detection is the slow part, labelling is instant. */
const cellCache = new Map<string, DetectedCell[]>();

/** Booths in image pixel space for the current state. `metersPerPixel` decides the minimum cell size. */
export function computePlanBooths(state: PlanImportState, metersPerPixel: number): PlanBoothsResult {
  const d = state.draft;
  if (!d || !state.autoDraft) return { booths: [], source: "none", cells: 0 };
  if (d.loaded.kind === "pdf" && d.loaded.shapes?.length && state.useVectors) {
    const v = boothsFromShapes(d.loaded.shapes, d.loaded.texts, { pageArea: d.loaded.width * d.loaded.height });
    if (v.labelled >= MIN_VECTOR_BOOTHS) return { booths: v.booths, source: "vector", cells: v.shapes };
  }
  if (d.loaded.kind === "svg" && d.loaded.svg && state.useVectors) {
    const vec = importSvgBooths(d.loaded.svg, { minArea: 0 });
    const vb = vec.viewBox;
    if (vec.booths.length && vb) {
      const k = d.loaded.width / vb.width;
      const booths: DraftBooth[] = vec.booths.map((b) => {
        const xs = b.polygon.map((p) => p[0]), ys = b.polygon.map((p) => p[1]);
        const x = (Math.min(...xs) - vb.x) * k, y = (Math.min(...ys) - vb.y) * k;
        return { label: b.label, rect: { x, y, w: (Math.max(...xs) - Math.min(...xs)) * k, h: (Math.max(...ys) - Math.min(...ys)) * k }, labelSource: "text" };
      });
      return { booths, source: "vector", cells: booths.length };
    }
  }
  const minAreaPx = minAreaPxFor(state.minAreaM2, metersPerPixel);
  const key = `${d.previewUrl}|${minAreaPx}`;
  let cells = cellCache.get(key);
  if (!cells) {
    const ctx = d.loaded.canvas.getContext("2d", { willReadFrequently: true });
    const img = ctx ? ctx.getImageData(0, 0, d.loaded.width, d.loaded.height) : null;
    cells = img ? detectCells({ width: img.width, height: img.height, data: img.data }, { minAreaPx }) : [];
    if (cellCache.size > 12) cellCache.clear();
    cellCache.set(key, cells);
  }
  const booths = labelCells(cells, d.loaded.texts, { scheme: state.scheme, prefix: state.prefix, start: state.start });
  return { booths, source: "raster", cells: cells.length };
}

export function PlanImportStep({ state, onChange, widthM, onWidthM, metersPerPixel, result, busy, error, onFile, onPage }: {
  state: PlanImportState;
  onChange: (patch: Partial<PlanImportState>) => void;
  widthM: number;
  onWidthM: (v: number) => void;
  metersPerPixel: number;
  result: PlanBoothsResult;
  busy: boolean;
  error: string | null;
  onFile: (f: File | null) => void;
  onPage: (page: number) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const d = state.draft;
  const textLabels = result.booths.filter((b) => b.labelSource === "text").length;
  const named = result.booths.filter((b) => b.name).length;
  const exhibitorNames = new Set(result.booths.filter((b) => b.name && b.nameKind === "exhibitor").map((b) => b.name)).size;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        {!d ? (
          <div
            role="button" tabIndex={0}
            onClick={() => inputRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0] ?? null); }}
            className={cn("grid min-h-[360px] cursor-pointer place-items-center rounded-xl border-2 border-dashed p-8 text-center transition-colors", over ? "border-brand bg-brand-soft" : "border-border bg-gray-50 hover:bg-gray-100")}
          >
            <div>
              {busy ? <p className="text-sm text-gray-600">Reading the plan…</p> : (
                <>
                  <p className="text-base font-medium">Drop the existing floor plan here</p>
                  <p className="mt-1 text-sm text-gray-500">PDF (vector or scanned), PNG, JPG, WebP or SVG. We render it, find every closed stand outline and draft the booths for you.</p>
                  <p className="mt-4 text-xs text-gray-500">Or continue without one and draw the plan from scratch in the designer.</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-xl border border-border bg-gray-100">
            <div className="relative" style={{ aspectRatio: `${d.loaded.width} / ${d.loaded.height}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- rendered upload */}
              <img src={d.previewUrl} alt="Uploaded floor plan" className="absolute inset-0 h-full w-full object-contain" />
              <svg viewBox={`0 0 ${d.loaded.width} ${d.loaded.height}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
                {result.booths.map((b, i) => (
                  <g key={i}>
                    {b.polygon
                      ? <polygon points={b.polygon.map((pt) => pt.join(",")).join(" ")} fill={b.name ? "rgba(21,128,61,0.28)" : "rgba(29,78,216,0.28)"} stroke={b.name ? "#15803d" : "#1d4ed8"} strokeWidth={Math.max(1, d.loaded.width / 900)} />
                      : <rect x={b.rect.x} y={b.rect.y} width={b.rect.w} height={b.rect.h} fill={b.labelSource === "text" ? "rgba(29,78,216,0.28)" : "rgba(249,115,22,0.28)"} stroke={b.labelSource === "text" ? "#1d4ed8" : "#ea580c"} strokeWidth={Math.max(1, d.loaded.width / 900)} />}
                    {b.rect.w > d.loaded.width / 60 && <text x={b.rect.x + b.rect.w / 2} y={b.rect.y + b.rect.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(b.rect.h * 0.45, b.rect.w / Math.max(3, b.label.length) * 1.4)} fontFamily="system-ui" fontWeight={600} fill="#111827">{b.label}</text>}
                  </g>
                ))}
              </svg>
              {busy && <div className="absolute inset-0 grid place-items-center bg-white/60 text-sm">Reading the plan…</div>}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-border bg-surface px-3 py-2 text-xs text-gray-600">
              <span className="truncate font-medium text-gray-900" title={d.file.name}>{d.file.name}</span>
              <span>{d.loaded.width} × {d.loaded.height} px · {(metersPerPixel * d.loaded.width).toFixed(0)} × {(metersPerPixel * d.loaded.height).toFixed(0)} m</span>
              {d.loaded.pages > 1 && (
                <label className="flex items-center gap-1">Page
                  <Select value={d.loaded.page} onChange={(e) => onPage(Number(e.target.value))} className="h-7 py-0 text-xs">{Array.from({ length: d.loaded.pages }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</Select>
                </label>
              )}
              <span className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>Replace</Button>
                <Button size="sm" variant="ghost" onClick={() => onFile(null)}>Remove</Button>
              </span>
            </div>
          </div>
        )}
        <input ref={inputRef} type="file" accept=".pdf,application/pdf,image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg" className="hidden" onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        {error && <Notice tone="error" className="mt-3">{error}</Notice>}
      </div>

      <div className="space-y-5">
        <Field label="Real width of the plan" hint="The width of the drawing edge to edge, in metres. It sets the scale; you can calibrate precisely later in the designer.">
          <div className="flex items-center gap-2"><Input type="number" min={5} max={5000} step={1} value={widthM} onChange={(e) => onWidthM(Math.max(5, Number(e.target.value) || 5))} /><span className="text-sm text-gray-500">m</span></div>
        </Field>
        <Switch checked={state.autoDraft} onChange={(v) => onChange({ autoDraft: v })} label="Auto-draft booths" description="Turn every closed stand outline into an editable booth." />
        {state.autoDraft && (
          <>
            {d?.loaded.kind === "svg" && d.loaded.svg && <Switch checked={state.useVectors} onChange={(v) => onChange({ useVectors: v })} label="Use the SVG's shapes" description="Labelled rectangles and paths become booths directly." />}
            {d?.loaded.kind === "pdf" && !!d.loaded.shapes?.length && <Switch checked={state.useVectors} onChange={(v) => onChange({ useVectors: v })} label="Read booths from the PDF's drawing" description="Exact outlines and numbers from a CAD or ExpoFP export. Turn off for scanned plans." />}
            {result.source === "vector" && named > 0 && <Switch checked={state.createExhibitors} onChange={(v) => onChange({ createExhibitors: v })} label={`Create ${exhibitorNames} exhibitor${exhibitorNames === 1 ? "" : "s"} from the plan`} description="Company names printed inside booths become exhibitors assigned to them, and those booths are marked sold. Named spaces (“N141: Main Stage”) are kept off sale." />}
            {result.source !== "vector" && (
              <>
                <Field label="Smallest booth" hint="Cells below this area are ignored (labels, furniture, noise).">
                  <div className="flex items-center gap-2"><Input type="number" min={0.5} max={500} step={0.5} value={state.minAreaM2} onChange={(e) => onChange({ minAreaM2: Math.max(0.5, Number(e.target.value) || 0.5) })} /><span className="text-sm text-gray-500">m²</span></div>
                </Field>
                <Field label="Numbering for unlabelled stands">
                  <Select value={state.scheme} onChange={(e) => onChange({ scheme: e.target.value as LabelOptions["scheme"] })}>
                    <option value="rows">Row letters — A1, A2 … B1, B2</option>
                    <option value="sequential">Sequential — 1, 2, 3 …</option>
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Prefix"><Input value={state.prefix} onChange={(e) => onChange({ prefix: e.target.value.toUpperCase().slice(0, 4) })} placeholder="e.g. H1-" /></Field>
                  <Field label="Start at"><Input type="number" min={0} step={1} value={state.start} onChange={(e) => onChange({ start: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></Field>
                </div>
              </>
            )}
          </>
        )}
        <div className="rounded-lg border border-border bg-gray-50 p-3 text-sm">
          {!d ? <p className="text-gray-500">No plan uploaded yet.</p> : !state.autoDraft ? <p className="text-gray-600">The plan will be placed as a background image; draw booths in the designer.</p> : (
            <>
              <p className="font-semibold">{result.booths.length} booths drafted</p>
              {result.source === "vector" ? (
                <>
                  <p className="mt-1 text-xs text-gray-600">{d.loaded.kind === "pdf" ? `Read from the PDF's drawing: ${result.cells} outlines, ${result.booths.length} with a stand number · ${named} with a name on the plan.` : "From the SVG's labelled shapes."}</p>
                  {d.loaded.kind === "pdf" && <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500"><span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-sm border border-blue-700 bg-blue-600/30" /> open stand</span><span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-sm border border-green-700 bg-green-700/30" /> named on the plan</span></p>}
                </>
              ) : (
                <>
                  <p className="mt-1 text-xs text-gray-600">{`${result.cells} closed cells found · ${textLabels} named from the drawing's text · ${result.booths.length - textLabels} numbered automatically.`}</p>
                  <p className="mt-2 flex items-center gap-3 text-xs text-gray-500"><span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-sm border border-blue-700 bg-blue-600/30" /> label from the plan</span><span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-sm border border-orange-600 bg-orange-500/30" /> generated label</span></p>
                </>
              )}
              {result.booths.length === 0 && <p className="mt-2 text-xs text-amber-700">Nothing detected. Try a smaller “smallest booth”, a higher-contrast export, or draw the booths in the designer.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
