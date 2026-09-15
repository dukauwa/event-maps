"use client";
/** Modal dialogs used by the designer: booth array, level settings, publish, imports, renumber, wayfinding generation, shortcuts. */
import * as React from "react";
import { Button, Dialog, api, toast } from "@/components/ui";
import type { BBox } from "@/lib/domain/geometry";
import { distance } from "@/lib/domain/geometry";
import { BOOTH_TYPES, type BoothType, type Point } from "@/lib/domain/types";
import { DEFAULT_NUMBERING, DEFAULT_RENUMBER, generateBoothArray, type BoothArrayOptions, type EditorLevel, type NumberingScheme, type RenumberOptions } from "@/lib/editor/document";
import { importSvgBooths, type SvgImportResult } from "@/lib/editor/import-svg";
import { Icon } from "./icons";
import { NumberField, Row, SelectField, TextField, Toggle, fmtM } from "./designer-ui";
import { SHORTCUTS } from "./tools";

/* ---------------- Booth array ---------------- */

export interface ArrayDialogResult { opts: BoothArrayOptions; boothType: BoothType }

export function ArrayDialog({ box, existingLabels, onClose, onApply }: { box: BBox | null; existingLabels: Set<string>; onClose: () => void; onApply: (r: ArrayDialogResult) => void }) {
  const open = !!box;
  const key = box ? `${box.minX},${box.minY},${box.maxX},${box.maxY}` : "";
  return open ? <ArrayDialogBody key={key} box={box} existingLabels={existingLabels} onClose={onClose} onApply={onApply} /> : null;
}

function ArrayDialogBody({ box, existingLabels, onClose, onApply }: { box: BBox; existingLabels: Set<string>; onClose: () => void; onApply: (r: ArrayDialogResult) => void }) {
  const w = box.maxX - box.minX, h = box.maxY - box.minY;
  const [boothWidth, setBoothWidth] = React.useState(3);
  const [boothDepth, setBoothDepth] = React.useState(3);
  const [aisleX, setAisleX] = React.useState(0);
  const [aisleY, setAisleY] = React.useState(3);
  const [backToBack, setBackToBack] = React.useState(true);
  const [columns, setColumns] = React.useState(() => Math.max(1, Math.floor((w + 0) / 3)));
  const [rows, setRows] = React.useState(() => Math.max(1, Math.floor((h + 3) / 4.5)));
  const [fitToBox, setFitToBox] = React.useState(true);
  const [numbering, setNumbering] = React.useState<NumberingScheme>({ ...DEFAULT_NUMBERING, prefix: "A", start: 1 });
  const [boothType, setBoothType] = React.useState<BoothType>("standard");

  // Fit mode: derive columns/rows from the dragged box.
  const cols = fitToBox ? Math.max(1, Math.floor((w + aisleX) / (boothWidth + aisleX))) : columns;
  const rws = fitToBox ? (backToBack ? Math.max(1, 2 * Math.floor((h + aisleY) / (2 * boothDepth + aisleY))) : Math.max(1, Math.floor((h + aisleY) / (boothDepth + aisleY)))) : rows;
  const opts = React.useMemo<BoothArrayOptions>(() => ({ x: box.minX, y: box.minY, columns: cols, rows: rws, boothWidth, boothDepth, aisleX, aisleY, backToBack, numbering }), [box.minX, box.minY, cols, rws, boothWidth, boothDepth, aisleX, aisleY, backToBack, numbering]);
  const preview = React.useMemo(() => generateBoothArray(opts), [opts]);
  const clashes = preview.filter((p) => existingLabels.has(p.label)).length;
  const blockW = cols * boothWidth + (cols - 1) * aisleX;
  const blockH = backToBack ? Math.ceil(rws / 2) * (2 * boothDepth) + (Math.ceil(rws / 2) - 1) * aisleY : rws * boothDepth + (rws - 1) * aisleY;
  const sample = preview.slice(0, 6).map((p) => p.label).join(", ") + (preview.length > 6 ? " …" : "");

  return (
    <Dialog open onClose={onClose} title="Booth array" wide>
      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Block ({fmtM(w)} × {fmtM(h)} m dragged)</p>
            <Toggle label="Fit as many as the dragged area allows" checked={fitToBox} onChange={setFitToBox} />
            <Row>
              <NumberField label="Columns" value={cols} onChange={(v) => { setFitToBox(false); setColumns(Math.max(1, Math.round(v ?? 1))); }} step={1} min={1} max={200} />
              <NumberField label="Rows" value={rws} onChange={(v) => { setFitToBox(false); setRows(Math.max(1, Math.round(v ?? 1))); }} step={1} min={1} max={200} />
            </Row>
            <Row className="mt-2">
              <NumberField label="Booth width" value={boothWidth} onChange={(v) => setBoothWidth(Math.max(0.5, v ?? 3))} unit="m" step={0.5} min={0.5} />
              <NumberField label="Booth depth" value={boothDepth} onChange={(v) => setBoothDepth(Math.max(0.5, v ?? 3))} unit="m" step={0.5} min={0.5} />
            </Row>
            <Row className="mt-2">
              <NumberField label="Gap between columns" value={aisleX} onChange={(v) => setAisleX(Math.max(0, v ?? 0))} unit="m" step={0.5} min={0} />
              <NumberField label={backToBack ? "Aisle between pairs" : "Aisle between rows"} value={aisleY} onChange={(v) => setAisleY(Math.max(0, v ?? 0))} unit="m" step={0.5} min={0} />
            </Row>
            <Toggle label="Back-to-back rows (pairs share a back wall)" checked={backToBack} onChange={setBackToBack} />
            <SelectField label="Booth type" value={boothType} onChange={setBoothType} options={BOOTH_TYPES} />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Numbering</p>
            <div className="grid grid-cols-3 gap-2">
              <TextField label="Prefix" value={numbering.prefix} onChange={(v) => setNumbering({ ...numbering, prefix: v })} placeholder="A" />
              <NumberField label="Start" value={numbering.start} onChange={(v) => setNumbering({ ...numbering, start: Math.round(v ?? 1) })} step={1} />
              <NumberField label="Step" value={numbering.step} onChange={(v) => setNumbering({ ...numbering, step: Math.max(1, Math.round(v ?? 1)) })} step={1} min={1} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <SelectField label="Scheme" value={numbering.mode} onChange={(v) => setNumbering({ ...numbering, mode: v })} options={[{ value: "sequential", label: "Sequential (A1, A2, A3 …)" }, { value: "rowLetters", label: "Row letters (A1 … B1 …)" }, { value: "rowNumbers", label: "Row hundreds (101 … 201 …)" }]} />
              <NumberField label="Zero-pad digits" value={numbering.pad} onChange={(v) => setNumbering({ ...numbering, pad: Math.max(0, Math.round(v ?? 0)) })} step={1} min={0} max={6} />
            </div>
            <Toggle label="Snake numbering (alternate direction each row)" checked={numbering.snake} onChange={(v) => setNumbering({ ...numbering, snake: v })} />
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-gray-50 p-3 text-sm">
            <p className="font-medium">{preview.length} booths</p>
            <p className="text-xs text-gray-500">{cols} × {rws}, block {fmtM(blockW)} × {fmtM(blockH)} m</p>
            <p className="mt-2 text-xs text-gray-600">{sample}</p>
            {clashes > 0 && <p className="mt-2 text-xs text-amber-700">{clashes} label{clashes > 1 ? "s" : ""} already exist and will be renamed (B12 → B13 …).</p>}
          </div>
          <ArrayPreview cells={preview} blockW={blockW} blockH={blockH} x0={box.minX} y0={box.minY} />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => { onApply({ opts, boothType }); onClose(); }} disabled={preview.length === 0 || preview.length > 5000}>Create {preview.length} booths</Button>
      </div>
    </Dialog>
  );
}

function ArrayPreview({ cells, blockW, blockH, x0, y0 }: { cells: { label: string; polygon: Point[] }[]; blockW: number; blockH: number; x0: number; y0: number }) {
  const pad = 1;
  return (
    <svg viewBox={`${x0 - pad} ${y0 - pad} ${blockW + 2 * pad} ${blockH + 2 * pad}`} className="h-44 w-full rounded-lg border border-border bg-white" preserveAspectRatio="xMidYMid meet">
      {cells.slice(0, 600).map((c) => (
        <g key={c.label}>
          <polygon points={c.polygon.map((p) => p.join(",")).join(" ")} fill="#dbeafe" stroke="#2563eb" strokeWidth={0.08} />
          {cells.length <= 120 && <text x={(c.polygon[0][0] + c.polygon[2][0]) / 2} y={(c.polygon[0][1] + c.polygon[2][1]) / 2 + 0.3} fontSize={Math.min(0.9, blockW / 40)} textAnchor="middle" fill="#1e3a8a">{c.label}</text>}
        </g>
      ))}
    </svg>
  );
}

/* ---------------- Level settings ---------------- */

export function LevelSettingsDialog({ level, levels, onClose, onPatch, onReorder, onDelete, onCalibrate }: {
  level: EditorLevel | null;
  levels: EditorLevel[];
  onClose: () => void;
  onPatch: (id: string, patch: Partial<Omit<EditorLevel, "id">>) => void;
  onReorder: (ids: string[]) => void;
  onDelete: (id: string) => void;
  onCalibrate: (id: string) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  if (!level) return null;
  const sorted = [...levels].sort((a, b) => a.sortIndex - b.sortIndex);
  const idx = sorted.findIndex((l) => l.id === level.id);
  const bg = level.background;
  const geo = level.georef;
  const patch = (p: Partial<Omit<EditorLevel, "id">>) => onPatch(level.id, p);
  const setBg = (p: Partial<NonNullable<EditorLevel["background"]>>) => patch({ background: { ...(bg ?? { url: "", x: 0, y: 0, width: level.widthM, height: level.heightM, opacity: 0.6 }), ...p } });
  const move = (dir: -1 | 1) => {
    const ids = sorted.map((l) => l.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    onReorder(ids);
  };
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api<{ url: string }>("/api/v1/media", { method: "POST", body: fd });
      // Size the image to the level width by default, keeping its aspect ratio.
      const dims = await imageSize(r.url).catch(() => null);
      const width = level.widthM, height = dims ? (width * dims.h) / dims.w : level.heightM;
      patch({ background: { url: r.url, x: 0, y: 0, width, height, opacity: bg?.opacity ?? 0.6, rotationDeg: bg?.rotationDeg ?? 0 } });
      toast("Background uploaded", "success");
    } catch (e) {
      toast(`Upload failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={`Level: ${level.name}`} wide>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">General</p>
            <Row>
              <TextField label="Name" value={level.name} onChange={(v) => v.trim() && patch({ name: v.trim() })} />
              <TextField label="Short name" value={level.shortName} onChange={(v) => v.trim() && patch({ shortName: v.trim().slice(0, 12) })} />
            </Row>
            <Row className="mt-2">
              <NumberField label="Width" value={level.widthM} onChange={(v) => v && v > 0 && patch({ widthM: Math.min(5000, v) })} unit="m" step={1} min={1} max={5000} />
              <NumberField label="Height" value={level.heightM} onChange={(v) => v && v > 0 && patch({ heightM: Math.min(5000, v) })} unit="m" step={1} min={1} max={5000} />
            </Row>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-gray-500">Order: {idx + 1} of {sorted.length}</span>
              <Button size="sm" variant="outline" onClick={() => move(-1)} disabled={idx <= 0}>Move up</Button>
              <Button size="sm" variant="outline" onClick={() => move(1)} disabled={idx >= sorted.length - 1}>Move down</Button>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Georeference</p>
            <Toggle label="Place this level on a real-world map" checked={!!geo} onChange={(on) => patch({ georef: on ? { originLat: 0, originLng: 0, rotationDeg: 0, metersPerUnit: 1 } : null })} hint="Lets the viewer show a basemap under the plan and use GPS" />
            {geo && (
              <>
                <Row>
                  <NumberField label="Origin latitude" value={geo.originLat} onChange={(v) => patch({ georef: { ...geo, originLat: v ?? 0 } })} step={0.000001} min={-90} max={90} />
                  <NumberField label="Origin longitude" value={geo.originLng} onChange={(v) => patch({ georef: { ...geo, originLng: v ?? 0 } })} step={0.000001} min={-180} max={180} />
                </Row>
                <Row className="mt-2">
                  <NumberField label="Rotation (cw from east)" value={geo.rotationDeg} onChange={(v) => patch({ georef: { ...geo, rotationDeg: v ?? 0 } })} unit="°" step={0.1} />
                  <NumberField label="Metres per unit" value={geo.metersPerUnit} onChange={(v) => v && v > 0 && patch({ georef: { ...geo, metersPerUnit: v } })} step={0.01} min={0.0001} />
                </Row>
              </>
            )}
          </div>
        </div>
        <div className="space-y-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Background image</p>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
            <Button size="sm" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}><Icon name="upload" size={14} /> Upload image</Button>
            {bg && <Button size="sm" variant="ghost" onClick={() => patch({ background: null })}><Icon name="trash" size={14} /> Remove</Button>}
          </div>
          <TextField label="Image URL" value={bg?.url ?? ""} onChange={(v) => (v.trim() ? setBg({ url: v.trim() }) : patch({ background: null }))} placeholder="https://… or /media/…" />
          {bg && (
            <>
              <div className="overflow-hidden rounded-lg border border-border bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bg.url} alt="Background preview" className="max-h-32 w-full object-contain" />
              </div>
              <Row>
                <NumberField label="X" value={bg.x} onChange={(v) => setBg({ x: v ?? 0 })} unit="m" step={0.5} />
                <NumberField label="Y" value={bg.y} onChange={(v) => setBg({ y: v ?? 0 })} unit="m" step={0.5} />
              </Row>
              <Row>
                <NumberField label="Width" value={bg.width} onChange={(v) => v && v > 0 && setBg({ width: v })} unit="m" step={0.5} min={0.1} />
                <NumberField label="Height" value={bg.height} onChange={(v) => v && v > 0 && setBg({ height: v })} unit="m" step={0.5} min={0.1} />
              </Row>
              <Row>
                <NumberField label="Opacity" value={bg.opacity} onChange={(v) => setBg({ opacity: Math.min(1, Math.max(0, v ?? 0.6)) })} step={0.05} min={0} max={1} />
                <NumberField label="Rotation" value={bg.rotationDeg ?? 0} onChange={(v) => setBg({ rotationDeg: v ?? 0 })} unit="°" step={1} />
              </Row>
              <div className="rounded-lg border border-dashed border-border p-3 text-xs text-gray-600">
                <p className="mb-2">Scale the image from a known distance: click two points on the image, then type the real distance between them.</p>
                <Button size="sm" variant="outline" onClick={() => onCalibrate(level.id)}><Icon name="measure" size={14} /> Calibrate with 2 points</Button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="mt-6 flex items-center justify-between">
        <Button variant="danger" size="sm" disabled={levels.length <= 1} onClick={() => onDelete(level.id)} title={levels.length <= 1 ? "An event needs at least one level" : undefined}><Icon name="trash" size={14} /> Delete level</Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </Dialog>
  );
}

function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = url;
  });
}

/** After two calibration clicks: ask for the real distance. */
export function CalibrateDialog({ points, onClose, onApply }: { points: [Point, Point] | null; onClose: () => void; onApply: (factor: number, anchor: Point) => void }) {
  const [real, setReal] = React.useState<number | null>(null);
  if (!points) return null;
  const measured = distance(points[0], points[1]);
  return (
    <Dialog open onClose={onClose} title="Calibrate background">
      <p className="text-sm text-gray-700">The two points are <strong>{fmtM(measured)} m</strong> apart on the plan right now. What is the real distance?</p>
      <div className="mt-3">
        <NumberField label="Real distance" value={real} onChange={setReal} unit="m" step={0.1} min={0.01} nullable />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!real || real <= 0 || measured <= 0} onClick={() => { if (real && measured > 0) { onApply(real / measured, points[0]); onClose(); } }}>Apply scale</Button>
      </div>
    </Dialog>
  );
}

/* ---------------- Publish ---------------- */

export function PublishDialog({ open, eventId, slug, onClose, beforePublish }: { open: boolean; eventId: string; slug: string; onClose: () => void; beforePublish: () => Promise<boolean> }) {
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ version: number } | null>(null);
  const url = typeof window !== "undefined" ? `${window.location.origin}/e/${slug}` : `/e/${slug}`;
  const publish = async () => {
    setBusy(true);
    try {
      if (!(await beforePublish())) { toast("Save your changes before publishing", "error"); return; }
      const r = await api<{ version: number } | null>(`/api/v1/events/${eventId}/publish`, { method: "POST", json: { note: note.trim() || undefined } });
      setResult(r ?? { version: 0 });
      toast(`Published version ${r?.version ?? ""}`.trim(), "success");
    } catch (e) {
      toast(`Publish failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={() => { setResult(null); onClose(); }} title="Publish floor plan">
      {!result ? (
        <>
          <p className="text-sm text-gray-700">Publishing takes a snapshot of the current plan and makes it live for attendees, the embed SDK and the public API. You can keep editing afterwards; changes stay private until the next publish.</p>
          <label className="mt-4 block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">Version note (optional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" placeholder="e.g. Added hall B, renumbered row C" />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button loading={busy} onClick={() => void publish()}><Icon name="publish" size={16} /> Publish</Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-700">Version <strong>{result.version}</strong> is live.</p>
          <a href={`/e/${slug}`} target="_blank" rel="noreferrer" className="mt-3 block truncate rounded-lg border border-border bg-gray-50 px-3 py-2 font-mono text-sm text-primary hover:underline">{url}</a>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(url); toast("Link copied"); }}>Copy link</Button>
            <Button onClick={() => { setResult(null); onClose(); }}>Done</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/* ---------------- Imports ---------------- */

export function CsvImportDialog({ open, eventId, onClose, beforeImport }: { open: boolean; eventId: string; onClose: () => void; beforeImport: () => Promise<boolean> }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    if (!file) return;
    setBusy(true);
    try {
      if (!(await beforeImport())) { toast("Could not save pending changes; import cancelled", "error"); return; }
      const fd = new FormData();
      fd.append("file", file);
      const r = await api<{ created: number; updated: number; errors: { index: number; error: string }[]; parsed: number }>(`/api/v1/events/${eventId}/booths/import`, { method: "POST", body: fd });
      toast(`Imported ${r.created} new, ${r.updated} updated${r.errors.length ? `, ${r.errors.length} errors` : ""}. Reloading…`, r.errors.length ? "info" : "success");
      window.setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast(`Import failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Import booths from CSV">
      <p className="text-sm text-gray-700">Columns: <code className="rounded bg-gray-100 px-1">label, level, x, y, width, height, type, status, price, external_id, notes</code>. Booths are matched by external id, then by label; existing booths are updated. Coordinates are metres from the level's top-left corner.</p>
      <input type="file" accept=".csv,text/csv" className="mt-4 block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={busy} disabled={!file} onClick={() => void run()}>Import &amp; reload</Button>
      </div>
    </Dialog>
  );
}

export function SvgImportDialog({ open, level, onClose, onApply }: { open: boolean; level: EditorLevel | null; onClose: () => void; onApply: (booths: SvgImportResult["booths"]) => void }) {
  const [svg, setSvg] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [scale, setScale] = React.useState(1);
  const [offsetX, setOffsetX] = React.useState(0);
  const [offsetY, setOffsetY] = React.useState(0);
  const [minArea, setMinArea] = React.useState(0.25);
  const [unlabeled, setUnlabeled] = React.useState(false);
  const [prefix, setPrefix] = React.useState("S");
  const result = React.useMemo(() => (svg ? importSvgBooths(svg, { scale, offsetX, offsetY, minArea, unlabeledPrefix: unlabeled ? prefix : null }) : null), [svg, scale, offsetX, offsetY, minArea, unlabeled, prefix]);
  const fitToLevel = () => {
    if (!result?.viewBox || !level) return;
    setScale(Math.min(level.widthM / result.viewBox.width, level.heightM / result.viewBox.height));
    setOffsetX(0); setOffsetY(0);
  };
  return (
    <Dialog open={open} onClose={onClose} title="Import booths from SVG" wide>
      <p className="text-sm text-gray-700">Rectangles, polygons and simple paths become booths. Labels come from <code className="rounded bg-gray-100 px-1">data-label</code>, <code className="rounded bg-gray-100 px-1">id</code>, a <code className="rounded bg-gray-100 px-1">&lt;title&gt;</code> or the Inkscape label.</p>
      <input type="file" accept=".svg,image/svg+xml" className="mt-4 block w-full text-sm" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setName(f.name); setSvg(await f.text()); }} />
      {result && (
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_260px]">
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <NumberField label="Scale (units → m)" value={scale} onChange={(v) => v && v > 0 && setScale(v)} step={0.01} min={0.0001} />
              <NumberField label="Offset X" value={offsetX} onChange={(v) => setOffsetX(v ?? 0)} unit="m" step={0.5} />
              <NumberField label="Offset Y" value={offsetY} onChange={(v) => setOffsetY(v ?? 0)} unit="m" step={0.5} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <NumberField label="Min area" value={minArea} onChange={(v) => setMinArea(Math.max(0, v ?? 0))} unit="m²" step={0.25} min={0} />
              <TextField label="Prefix for unlabeled" value={prefix} onChange={setPrefix} disabled={!unlabeled} />
              <div className="pt-5"><Toggle label="Import unlabeled" checked={unlabeled} onChange={setUnlabeled} /></div>
            </div>
            {result.viewBox && <Button size="sm" variant="outline" onClick={fitToLevel}>Fit viewBox ({Math.round(result.viewBox.width)} × {Math.round(result.viewBox.height)}) to level</Button>}
          </div>
          <div className="rounded-lg border border-border bg-gray-50 p-3 text-sm">
            <p className="font-medium">{result.booths.length} booths found</p>
            <p className="truncate text-xs text-gray-500" title={name}>{name}</p>
            {result.bounds && <p className="mt-1 text-xs text-gray-600">Bounds {fmtM(result.bounds.minX)}, {fmtM(result.bounds.minY)} → {fmtM(result.bounds.maxX)}, {fmtM(result.bounds.maxY)} m</p>}
            {result.booths.length > 0 && <p className="mt-1 text-xs text-gray-600">{result.booths.slice(0, 8).map((b) => b.label).join(", ")}{result.booths.length > 8 ? " …" : ""}</p>}
            {result.warnings.length > 0 && <details className="mt-2 text-xs text-amber-700"><summary>{result.warnings.length} warnings</summary><ul className="mt-1 max-h-24 list-disc overflow-auto pl-4">{result.warnings.slice(0, 50).map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
          </div>
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!result || !result.booths.length || !level} onClick={() => { if (result) { onApply(result.booths); onClose(); } }}>Add {result?.booths.length ?? 0} booths to {level?.name ?? "level"}</Button>
      </div>
    </Dialog>
  );
}

/* ---------------- Renumber ---------------- */

export function RenumberDialog({ open, count, onClose, onApply }: { open: boolean; count: number; onClose: () => void; onApply: (opts: RenumberOptions) => void }) {
  const [opts, setOpts] = React.useState<RenumberOptions>({ ...DEFAULT_RENUMBER, prefix: "A" });
  return (
    <Dialog open={open} onClose={onClose} title={`Renumber ${count} booths`}>
      <div className="grid grid-cols-3 gap-2">
        <TextField label="Prefix" value={opts.prefix} onChange={(v) => setOpts({ ...opts, prefix: v })} />
        <NumberField label="Start" value={opts.start} onChange={(v) => setOpts({ ...opts, start: Math.round(v ?? 1) })} step={1} />
        <NumberField label="Step" value={opts.step} onChange={(v) => setOpts({ ...opts, step: Math.max(1, Math.round(v ?? 1)) })} step={1} min={1} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <TextField label="Suffix" value={opts.suffix} onChange={(v) => setOpts({ ...opts, suffix: v })} />
        <NumberField label="Zero-pad" value={opts.pad} onChange={(v) => setOpts({ ...opts, pad: Math.max(0, Math.round(v ?? 0)) })} step={1} min={0} max={6} />
        <SelectField label="Order" value={opts.order} onChange={(v) => setOpts({ ...opts, order: v })} options={[{ value: "rows", label: "Rows (top→bottom, left→right)" }, { value: "columns", label: "Columns" }, { value: "selection", label: "Selection order" }]} />
      </div>
      <p className="mt-3 text-xs text-gray-500">Preview: {opts.prefix}{String(opts.start).padStart(opts.pad, "0")}{opts.suffix}, {opts.prefix}{String(opts.start + opts.step).padStart(opts.pad, "0")}{opts.suffix} …</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => { onApply(opts); onClose(); }}>Renumber</Button>
      </div>
    </Dialog>
  );
}

/* ---------------- Wayfinding generation ---------------- */

export function GenerateDialog({ open, level, hasNetwork, onClose, onGenerate }: { open: boolean; level: EditorLevel | null; hasNetwork: boolean; onClose: () => void; onGenerate: (o: { cellSize: number; clearance: number }) => Promise<void> }) {
  const [cellSize, setCellSize] = React.useState(1);
  const [clearance, setClearance] = React.useState(0.6);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onClose={onClose} title="Generate path network automatically">
      <p className="text-sm text-gray-700">Builds an aisle network for <strong>{level?.name}</strong> from the saved booths, walls and blocking zones. You get a preview first; applying it replaces the level's current network{hasNetwork ? " (this level already has one)" : ""}.</p>
      <Row className="mt-4">
        <NumberField label="Grid cell" value={cellSize} onChange={(v) => setCellSize(Math.min(5, Math.max(0.25, v ?? 1)))} unit="m" step={0.25} min={0.25} max={5} />
        <NumberField label="Clearance from booths" value={clearance} onChange={(v) => setClearance(Math.min(5, Math.max(0, v ?? 0.6)))} unit="m" step={0.1} min={0} max={5} />
      </Row>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={busy} onClick={async () => { setBusy(true); try { await onGenerate({ cellSize, clearance }); onClose(); } finally { setBusy(false); } }}><Icon name="wand" size={16} /> Generate preview</Button>
      </div>
    </Dialog>
  );
}

/* ---------------- Shortcuts ---------------- */

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <table className="w-full text-sm">
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.keys} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-4 text-gray-700">{s.action}</td>
              <td className="py-1.5 text-right"><kbd className="rounded border border-border bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-800">{s.keys}</kbd></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex justify-end"><Button onClick={onClose}>Close</Button></div>
    </Dialog>
  );
}
