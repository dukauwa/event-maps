"use client";
/** Left panel: layer visibility/lock toggles and a searchable booth list for the active level. */
import * as React from "react";
import { cn } from "@/components/ui";
import type { EventBranding } from "@/lib/domain/types";
import type { EditorBooth } from "@/lib/editor/document";
import { boothFill } from "@/lib/editor/export";
import { Icon } from "./icons";
import { LAYER_CLASSES, LAYER_LABELS, type LayerClass, type LayerStates } from "./tools";

export interface LayersPanelProps {
  layers: LayerStates;
  setLayer: (layer: LayerClass, patch: Partial<{ visible: boolean; locked: boolean }>) => void;
  booths: EditorBooth[];
  levelName: string;
  selection: string[];
  colors: EventBranding["boothColors"];
  exhibitorNames: Map<string, string[]>;
  onPick: (id: string, additive: boolean) => void;
}

export const LayersPanel = React.memo(function LayersPanel({ layers, setLayer, booths, levelName, selection, colors, exhibitorNames, onPick }: LayersPanelProps) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<string>("");
  const [layersOpen, setLayersOpen] = React.useState(true);
  const selSet = React.useMemo(() => new Set(selection), [selection]);
  const sorted = React.useMemo(() => [...booths].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })), [booths]);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((b) => (!status || b.status === status) && (!q || b.label.toLowerCase().includes(q) || (exhibitorNames.get(b.id) ?? []).some((n) => n.toLowerCase().includes(q)) || (b.externalId ?? "").toLowerCase().includes(q)));
  }, [sorted, query, status, exhibitorNames]);
  const counts = React.useMemo(() => { const c: Record<string, number> = {}; for (const b of booths) c[b.status] = (c[b.status] ?? 0) + 1; return c; }, [booths]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface text-sm">
      <div className="border-b border-border">
        <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:bg-gray-50" onClick={() => setLayersOpen((o) => !o)}>
          <span>Layers</span><span className="text-gray-400">{layersOpen ? "▾" : "▸"}</span>
        </button>
        {layersOpen && (
          <ul className="pb-1">
            {LAYER_CLASSES.map((c) => {
              const s = layers[c];
              return (
                <li key={c} className={cn("flex items-center gap-1 px-2 py-0.5", !s.visible && "opacity-50")}>
                  <button type="button" aria-label={s.visible ? `Hide ${LAYER_LABELS[c]}` : `Show ${LAYER_LABELS[c]}`} aria-pressed={s.visible} className="grid size-6 place-items-center rounded text-gray-600 hover:bg-gray-100" onClick={() => setLayer(c, { visible: !s.visible })}><Icon name={s.visible ? "eye" : "eyeOff"} size={14} /></button>
                  <button type="button" aria-label={s.locked ? `Unlock ${LAYER_LABELS[c]}` : `Lock ${LAYER_LABELS[c]}`} aria-pressed={s.locked} className={cn("grid size-6 place-items-center rounded hover:bg-gray-100", s.locked ? "text-amber-600" : "text-gray-300 hover:text-gray-600")} onClick={() => setLayer(c, { locked: !s.locked })}><Icon name={s.locked ? "lock" : "unlock"} size={14} /></button>
                  <span className="flex-1 truncate text-xs text-gray-800">{LAYER_LABELS[c]}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Booths · {levelName}</h3>
            <span className="text-[11px] text-gray-400">{filtered.length}/{booths.length}</span>
          </div>
          <div className="relative mt-1.5">
            <Icon name="search" size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search label or exhibitor" className="h-8 w-full rounded-md border border-border bg-surface pl-7 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(["", "available", "held", "reserved", "sold", "unavailable"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setStatus(s)} className={cn("flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]", status === s ? "border-primary bg-primary/10 text-primary" : "border-border text-gray-600 hover:bg-gray-50")}>
                {s && <span className="size-2 rounded-full" style={{ background: (colors as Record<string, string>)[s] }} />}
                {s || "All"}{s && counts[s] ? ` ${counts[s]}` : ""}
              </button>
            ))}
          </div>
        </div>
        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {filtered.length === 0 && <li className="px-2 py-6 text-center text-xs text-gray-400">{booths.length ? "No booths match." : "No booths on this level yet. Press B to draw one."}</li>}
          {filtered.map((b) => {
            const ex = exhibitorNames.get(b.id);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={(e) => onPick(b.id, e.shiftKey || e.metaKey || e.ctrlKey)}
                  className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-gray-100", selSet.has(b.id) && "bg-primary/10 hover:bg-primary/15")}
                  title={`${b.label}${ex?.length ? ` — ${ex.join(", ")}` : ""}`}
                >
                  <span className="size-2.5 shrink-0 rounded-sm border border-black/10" style={{ background: boothFill(b.status, b.boothType, colors, b.colors) }} />
                  <span className="w-14 shrink-0 truncate font-medium text-gray-900">{b.label}</span>
                  <span className="flex-1 truncate text-xs text-gray-500">{ex?.length ? ex.join(", ") : <span className="italic text-gray-300">{b.status}</span>}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
});
