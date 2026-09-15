"use client";
/** Designer chrome: top bar (levels, save/publish/import/export), left tool rail, status bar. */
import * as React from "react";
import Link from "next/link";
import { Button, cn } from "@/components/ui";
import type { Point } from "@/lib/domain/types";
import type { EditorLevel } from "@/lib/editor/document";
import { IconButton, Menu, fmtM, useStore, type Store } from "./designer-ui";
import { Icon } from "./icons";
import { TOOLS, type Tool } from "./tools";

export type SaveState = "saved" | "saving" | "unsaved" | "error";

export interface TopBarProps {
  eventId: string;
  eventName: string;
  eventSlug: string;
  levels: EditorLevel[];
  activeLevelId: string;
  saveState: SaveState;
  onSelectLevel: (id: string) => void;
  onAddLevel: () => void;
  onLevelSettings: (id: string) => void;
  onSave: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onImportCsv: () => void;
  onImportSvg: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onGenerate: () => void;
  onTestRoute: () => void;
  onHelp: () => void;
}

export const TopBar = React.memo(function TopBar(p: TopBarProps) {
  const levels = [...p.levels].sort((a, b) => a.sortIndex - b.sortIndex);
  const save = {
    saved: { label: "Saved ✓", cls: "text-green-700" },
    saving: { label: "Saving…", cls: "text-gray-500" },
    unsaved: { label: "Unsaved changes", cls: "text-amber-700" },
    error: { label: "Save failed — retry", cls: "text-red-700" },
  }[p.saveState];
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-2">
      <Link href={`/admin/events/${p.eventId}`} className="grid size-8 place-items-center rounded-lg text-gray-600 hover:bg-gray-100" aria-label="Back to event" title="Back to event"><Icon name="back_arrow" /></Link>
      <div className="min-w-0 max-w-56">
        <p className="truncate text-sm font-semibold leading-tight" title={p.eventName}>{p.eventName}</p>
        <p className="text-[10px] leading-tight text-gray-400">Floor plan designer</p>
      </div>
      <div className="mx-2 h-6 w-px bg-border" />
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" role="tablist" aria-label="Levels">
        {levels.map((l) => (
          <button
            key={l.id}
            role="tab"
            aria-selected={l.id === p.activeLevelId}
            onClick={() => (l.id === p.activeLevelId ? p.onLevelSettings(l.id) : p.onSelectLevel(l.id))}
            onDoubleClick={() => p.onLevelSettings(l.id)}
            title={l.id === p.activeLevelId ? "Click for level settings" : `Switch to ${l.name}`}
            className={cn("group flex h-8 shrink-0 items-center gap-1 rounded-lg px-3 text-sm transition-colors", l.id === p.activeLevelId ? "bg-primary/10 font-medium text-primary" : "text-gray-700 hover:bg-gray-100")}
          >
            <span className="truncate">{l.name}</span>
            {l.id === p.activeLevelId && <Icon name="settings" size={13} className="opacity-60" />}
          </button>
        ))}
        <IconButton icon="plus" label="Add level" onClick={p.onAddLevel} tip="bottom" className="size-8" size={16} />
      </div>
      <span className={cn("hidden text-xs sm:block", save.cls)} aria-live="polite">{save.label}</span>
      <Button size="sm" variant="outline" onClick={p.onSave} disabled={p.saveState === "saving"} title="Save now (Ctrl+S)">Save</Button>
      <Menu
        align="right"
        trigger={(open) => <Button size="sm" variant="ghost" className={cn(open && "bg-gray-100")}><Icon name="upload" size={15} /> Import</Button>}
        items={[
          { label: "Booths from CSV…", icon: "upload", onClick: p.onImportCsv, hint: "replaces by label" },
          { label: "Booths from SVG…", icon: "polygon", onClick: p.onImportSvg },
        ]}
      />
      <Menu
        align="right"
        trigger={(open) => <Button size="sm" variant="ghost" className={cn(open && "bg-gray-100")}><Icon name="download" size={15} /> Export</Button>}
        items={[
          { label: "Current level as PNG", icon: "download", onClick: p.onExportPng },
          { label: "Current level as SVG", icon: "download", onClick: p.onExportSvg },
          "sep",
          { label: "GeoJSON (all levels)", icon: "download", href: `/api/v1/events/${p.eventSlug}/export/geojson` },
          { label: "Booths CSV", icon: "download", href: `/api/v1/events/${p.eventSlug}/export/booths.csv` },
        ]}
      />
      <Menu
        align="right"
        trigger={(open) => <Button size="sm" variant="ghost" className={cn(open && "bg-gray-100")}><Icon name="route" size={15} /> Wayfinding</Button>}
        items={[
          { label: "Generate automatically…", icon: "wand", onClick: p.onGenerate },
          { label: "Test a route", icon: "route", onClick: p.onTestRoute },
        ]}
      />
      <Button size="sm" variant="outline" onClick={p.onPreview} title="Open the attendee viewer with the unpublished plan"><Icon name="preview" size={15} /> Preview</Button>
      <Button size="sm" onClick={p.onPublish}><Icon name="publish" size={15} /> Publish</Button>
      <IconButton icon="help" label="Keyboard shortcuts" shortcut="?" onClick={p.onHelp} tip="bottom" className="size-8" />
    </header>
  );
});

export interface ToolbarProps {
  tool: Tool;
  setTool: (t: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  showGrid: boolean;
  snap: boolean;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export const Toolbar = React.memo(function Toolbar(p: ToolbarProps) {
  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-border bg-surface py-1" aria-label="Tools">
      {TOOLS.map((t) => (
        <IconButton key={t.id} icon={t.id} label={t.label} shortcut={t.key} active={p.tool === t.id} onClick={() => p.setTool(t.id)} />
      ))}
      <div className="my-1 h-px w-7 bg-border" />
      <IconButton icon="undo" label="Undo" shortcut="Ctrl+Z" disabled={!p.canUndo} onClick={p.onUndo} />
      <IconButton icon="redo" label="Redo" shortcut="Ctrl+Shift+Z" disabled={!p.canRedo} onClick={p.onRedo} />
      <div className="my-1 h-px w-7 bg-border" />
      <IconButton icon="grid" label={p.showGrid ? "Hide grid" : "Show grid"} active={p.showGrid} onClick={p.onToggleGrid} />
      <IconButton icon="magnet" label={p.snap ? "Snapping on" : "Snapping off"} active={p.snap} onClick={p.onToggleSnap} />
      <div className="my-1 h-px w-7 bg-border" />
      <IconButton icon="zoomIn" label="Zoom in" onClick={p.onZoomIn} />
      <IconButton icon="zoomOut" label="Zoom out" onClick={p.onZoomOut} />
      <IconButton icon="fit" label="Zoom to fit" shortcut="F" onClick={p.onFit} />
    </nav>
  );
});

export interface StatusBarProps {
  cursor: Store<Point | null>;
  scale: number;
  selectionCount: number;
  level: EditorLevel | null;
  dirty: boolean;
  hint: string;
  gridSize: number;
  setGridSize: (n: number) => void;
}

export function StatusBar(p: StatusBarProps) {
  const cursor = useStore(p.cursor);
  const zoomPct = Math.round(p.scale * 10);
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-surface px-3 font-mono text-[11px] text-gray-600">
      <span className="w-40 tabular-nums">{cursor ? `x ${fmtM(cursor[0])}  y ${fmtM(cursor[1])} m` : "—"}</span>
      <span className="tabular-nums">{zoomPct}%</span>
      <label className="flex items-center gap-1">
        grid
        <select value={p.gridSize} onChange={(e) => p.setGridSize(Number(e.target.value))} className="rounded border border-border bg-surface px-1 text-[11px]">
          {[0.1, 0.25, 0.5, 1, 2, 5].map((g) => <option key={g} value={g}>{g} m</option>)}
        </select>
      </label>
      {p.level && <span>{p.level.name}: {p.level.widthM} × {p.level.heightM} m</span>}
      <span>{p.selectionCount ? `${p.selectionCount} selected` : "nothing selected"}</span>
      {p.dirty && <span className="text-amber-700">● unsaved</span>}
      <span className="ml-auto truncate font-sans text-gray-400">{p.hint}</span>
    </footer>
  );
}
