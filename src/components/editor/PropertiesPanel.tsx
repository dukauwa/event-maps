"use client";
/** Right-hand panel: properties of the current selection, or options for the active tool. */
import * as React from "react";
import { Button, cn } from "@/components/ui";
import { bbox } from "@/lib/domain/geometry";
import { BOOTH_STATUSES, BOOTH_TYPES, POI_TYPES, TRANSITION_KINDS, type EventBranding, type Point } from "@/lib/domain/types";
import { getSelected, mergePolygons, nodeDegree, type EditorAction, type EditorBooth, type EditorDocument, type EditorElement, type EditorTransition, type SelectedItems } from "@/lib/editor/document";
import { boothFill } from "@/lib/editor/export";
import type { RoutePreview, ToolOptions } from "./Canvas";
import { ColorField, IconButton, NumberField, Row, SelectField, Section, TextField, Toggle, fmtM } from "./designer-ui";
import { Icon } from "./icons";
import { TOOLS, type Tool } from "./tools";

export interface PanelActions {
  merge: (ids: string[]) => void;
  split: (ids: string[], axis: "h" | "v") => void;
  renumber: (ids: string[]) => void;
  requestDelete: (ids: string[]) => void;
  zoomTo: (ids: string[]) => void;
  setActiveLevel: (id: string) => void;
  startTestRoute: () => void;
  openGenerate: () => void;
}

export interface PropertiesPanelProps {
  doc: EditorDocument;
  selection: string[];
  activeLevelId: string;
  dispatch: React.Dispatch<EditorAction>;
  exhibitorNames: Map<string, string[]>;
  colors: EventBranding["boothColors"];
  currency: string;
  tool: Tool;
  options: ToolOptions;
  setOptions: (patch: Partial<ToolOptions>) => void;
  routePreview: RoutePreview | null;
  routeInfo: { distanceM: number; durationSeconds: number } | null;
  transitionDraft: string[];
  generatedPreview: { nodes: unknown[]; edges: unknown[] } | null;
  onApplyGenerated: () => void;
  onDiscardGenerated: () => void;
  actions: PanelActions;
}

export const PropertiesPanel = React.memo(function PropertiesPanel(props: PropertiesPanelProps) {
  const { doc, selection, tool } = props;
  const sel = React.useMemo(() => getSelected(doc, selection), [doc, selection]);
  const count = sel.booths.length + sel.elements.length + sel.nodes.length + sel.edges.length + sel.transitions.length;

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col overflow-y-auto border-l border-border bg-surface text-sm">
      {props.generatedPreview && (
        <Section title="Generated network" className="bg-orange-50">
          <p className="text-xs text-gray-700">{props.generatedPreview.nodes.length} nodes, {props.generatedPreview.edges.length} edges. Applying replaces this level&apos;s network.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={props.onApplyGenerated}>Apply</Button>
            <Button size="sm" variant="outline" onClick={props.onDiscardGenerated}>Discard</Button>
          </div>
        </Section>
      )}
      {count === 0 ? <ToolPanel {...props} /> : count === 1 ? <SinglePanel sel={sel} {...props} /> : <MultiPanel sel={sel} {...props} />}
      {count > 0 && tool === "select" && (
        <div className="mt-auto border-t border-border p-3 text-xs text-gray-500">
          <p>{count} selected · Delete removes, Ctrl+D duplicates.</p>
        </div>
      )}
      {count === 0 && <TransitionsList {...props} />}
      {count === 0 && tool === "select" && <div className="mt-auto p-3 text-xs text-gray-400">Select something on the canvas to edit it.</div>}
    </aside>
  );
});

/* ---------------- tool options (nothing selected) ---------------- */

function ToolPanel(props: PropertiesPanelProps) {
  const { tool, options, setOptions, routePreview, routeInfo, transitionDraft, doc, activeLevelId } = props;
  const def = TOOLS.find((t) => t.id === tool)!;
  return (
    <>
      <Section title={def.label} right={<kbd className="rounded border border-border px-1 font-mono text-[10px] text-gray-500">{def.key}</kbd>}>
        <p className="text-xs text-gray-600">{def.hint}</p>
      </Section>
      {tool === "booth" && (
        <Section title="Default booth size">
          <Row>
            <NumberField label="Width" value={options.boothW} onChange={(v) => setOptions({ boothW: Math.max(0.5, v ?? 3) })} unit="m" step={0.5} min={0.5} />
            <NumberField label="Depth" value={options.boothD} onChange={(v) => setOptions({ boothD: Math.max(0.5, v ?? 3) })} unit="m" step={0.5} min={0.5} />
          </Row>
          <p className="text-xs text-gray-500">A single click places a booth of this size; dragging sets the size.</p>
        </Section>
      )}
      {tool === "poi" && (
        <Section title="Point of interest">
          <SelectField label="Type" value={options.poiType} onChange={(v) => setOptions({ poiType: v })} options={POI_TYPES} />
        </Section>
      )}
      {tool === "path" && (
        <>
          <Section title="New edges">
            <Toggle label="Accessible (step-free)" checked={options.edgeFlags.accessible} onChange={(v) => setOptions({ edgeFlags: { ...options.edgeFlags, accessible: v } })} />
            <Toggle label="One-way" checked={options.edgeFlags.oneWay} onChange={(v) => setOptions({ edgeFlags: { ...options.edgeFlags, oneWay: v } })} />
            <Toggle label="Virtual (not drawn, e.g. across a hall)" checked={options.edgeFlags.virtual} onChange={(v) => setOptions({ edgeFlags: { ...options.edgeFlags, virtual: v } })} />
          </Section>
          <Section title="Wayfinding helpers">
            <Button size="sm" variant="outline" className="w-full" onClick={props.actions.openGenerate}><Icon name="wand" size={14} /> Generate automatically</Button>
            <Toggle label="Test route mode" checked={options.testRoute} onChange={(v) => setOptions({ testRoute: v })} hint="Click a start and an end point on the canvas" />
            {options.testRoute && (
              <div className="rounded-lg border border-border bg-gray-50 p-2 text-xs">
                {!routePreview && <p className="text-gray-600">Click the start point, then the destination.</p>}
                {routePreview?.error && <p className="text-red-700">{routePreview.error}</p>}
                {routePreview && !routePreview.error && routeInfo && (
                  <p className="text-green-800">Route found: {fmtM(routeInfo.distanceM)} m, about {Math.round(routeInfo.durationSeconds / 60)} min{routePreview.steps.length ? "" : " (no segment on this level)"}.</p>
                )}
              </div>
            )}
          </Section>
        </>
      )}
      {tool === "transition" && (
        <Section title="Level transition">
          {transitionDraft.length === 0 ? <p className="text-xs text-gray-600">Click a path node on this level to start.</p> : (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-2 text-xs text-purple-900">
              <p>First node picked on <strong>{doc.levels.find((l) => l.id === doc.nodes.find((n) => n.id === transitionDraft[0])?.levelId)?.name ?? "?"}</strong>.</p>
              <p className="mt-1">Now switch to another level and click the matching node.</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {[...doc.levels].sort((a, b) => a.sortIndex - b.sortIndex).filter((l) => l.id !== activeLevelId).map((l) => <Button key={l.id} size="sm" variant="outline" onClick={() => props.actions.setActiveLevel(l.id)}>{l.shortName}</Button>)}
              </div>
            </div>
          )}
        </Section>
      )}
    </>
  );
}

function TransitionsList(props: PropertiesPanelProps) {
  const { doc, dispatch } = props;
  if (!doc.transitions.length) return null;
  const levelOf = (nodeId: string) => doc.levels.find((l) => l.id === doc.nodes.find((n) => n.id === nodeId)?.levelId)?.shortName ?? "?";
  return (
    <Section title={`Transitions (${doc.transitions.length})`}>
      <ul className="space-y-1">
        {doc.transitions.map((t) => (
          <li key={t.id}>
            <button type="button" className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs hover:bg-gray-100" onClick={() => dispatch({ type: "select", ids: [t.id] })}>
              <span className="truncate">{t.name || t.kind}</span>
              <span className="text-gray-500">{t.nodeIds.map(levelOf).join(" ↔ ")}</span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------------- single selection ---------------- */

function SinglePanel({ sel, ...props }: PropertiesPanelProps & { sel: SelectedItems }) {
  if (sel.booths.length) return <BoothPanel booths={sel.booths} {...props} />;
  if (sel.elements.length) return <ElementPanel elements={sel.elements} {...props} />;
  if (sel.edges.length) return <EdgePanel {...props} ids={sel.edges.map((e) => e.id)} />;
  if (sel.transitions.length) return <TransitionPanel transition={sel.transitions[0]} {...props} />;
  if (sel.nodes.length) return <NodePanel {...props} nodeId={sel.nodes[0].id} />;
  return null;
}

function BoothPanel({ booths, ...props }: PropertiesPanelProps & { booths: EditorBooth[] }) {
  const { dispatch, exhibitorNames, colors, currency, actions } = props;
  const b = booths[0];
  const ids = booths.map((x) => x.id);
  const many = booths.length > 1;
  const patch = (p: Partial<Omit<EditorBooth, "id">>) => dispatch({ type: "updateBooths", ids, patch: p });
  const box = bbox(b.polygon);
  const mixed = <K extends keyof EditorBooth>(k: K) => many && booths.some((x) => JSON.stringify(x[k]) !== JSON.stringify(b[k]));
  const exhibitors = many ? [] : exhibitorNames.get(b.id) ?? [];
  const metaEntries = Object.entries(b.metadata);
  return (
    <>
      <Section title={many ? `${booths.length} booths` : "Booth"} right={<span className="size-3 rounded-sm border border-gray-300" style={{ background: boothFill(b.status, b.boothType, colors, b.colors) }} />}>
        <Row>
          <TextField label="Label" value={many ? "" : b.label} onChange={(v) => v.trim() && patch({ label: v.trim() })} disabled={many} placeholder={many ? "Mixed" : undefined} />
          <TextField label="External id" value={many ? "" : b.externalId ?? ""} onChange={(v) => patch({ externalId: v.trim() || null })} disabled={many} placeholder={many ? "Mixed" : "—"} />
        </Row>
        <Row>
          <SelectField label={`Type${mixed("boothType") ? " (mixed)" : ""}`} value={b.boothType} onChange={(v) => patch({ boothType: v })} options={BOOTH_TYPES} />
          <SelectField label={`Status${mixed("status") ? " (mixed)" : ""}`} value={b.status} onChange={(v) => patch({ status: v })} options={BOOTH_STATUSES} />
        </Row>
        <Row>
          <NumberField label={`Price override (${currency})`} value={mixed("priceCents") ? null : b.priceCents == null ? null : b.priceCents / 100} onChange={(v) => patch({ priceCents: v == null ? null : Math.round(v * 100) })} step={1} min={0} nullable />
          <NumberField label="3D height" value={mixed("height3d") ? null : b.height3d} onChange={(v) => patch({ height3d: v })} unit="m" step={0.5} min={0} nullable />
        </Row>
        <Toggle label="Hide label on map" checked={b.labelHidden} onChange={(v) => patch({ labelHidden: v })} />
        {!many && (
          <p className="text-xs text-gray-500">{fmtM(box.maxX - box.minX)} × {fmtM(box.maxY - box.minY)} m · {b.polygon.length} corners · at {fmtM(box.minX)}, {fmtM(box.minY)}</p>
        )}
      </Section>
      <Section title="Colours">
        <ColorField label="Fill override" value={b.colors?.fill} onChange={(v) => patch({ colors: { ...(b.colors ?? {}), fill: v ?? undefined } })} />
        <ColorField label="Label" value={b.colors?.label} onChange={(v) => patch({ colors: { ...(b.colors ?? {}), label: v ?? undefined } })} />
        <ColorField label="Border" value={b.colors?.border} onChange={(v) => patch({ colors: { ...(b.colors ?? {}), border: v ?? undefined } })} />
      </Section>
      {!many && (
        <Section title="Exhibitors" right={<span className="text-[10px] text-gray-400">read-only</span>}>
          {exhibitors.length ? <ul className="space-y-0.5 text-xs text-gray-800">{exhibitors.map((n) => <li key={n} className="truncate">• {n}</li>)}</ul> : <p className="text-xs text-gray-500">No exhibitor assigned. Assign from the Booths page.</p>}
        </Section>
      )}
      {!many && (
        <Section title="Notes">
          <NotesArea value={b.notes ?? ""} onCommit={(v) => patch({ notes: v.trim() || null })} />
        </Section>
      )}
      {!many && (
        <Section title="Metadata" right={<IconButton icon="plus" label="Add field" size={14} className="size-6" onClick={() => dispatch({ type: "setBoothMetadata", id: b.id, metadata: { ...b.metadata, [uniqueKey(b.metadata)]: "" } })} />}>
          {metaEntries.length === 0 && <p className="text-xs text-gray-500">Custom key/value fields exposed in the API and viewer.</p>}
          {metaEntries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-1">
              <TextField value={k} onChange={(nk) => { const m: Record<string, string> = {}; for (const [kk, vv] of metaEntries) m[kk === k ? (nk.trim() || k) : kk] = vv; dispatch({ type: "setBoothMetadata", id: b.id, metadata: m }); }} className="w-2/5" />
              <TextField value={v} onChange={(nv) => dispatch({ type: "updateBooths", ids: [b.id], patch: { metadata: { [k]: nv } } })} className="flex-1" />
              <button type="button" className="text-gray-400 hover:text-red-600" aria-label={`Remove ${k}`} onClick={() => { const m = { ...b.metadata }; delete m[k]; dispatch({ type: "setBoothMetadata", id: b.id, metadata: m }); }}><Icon name="x" size={14} /></button>
            </div>
          ))}
        </Section>
      )}
      <Section title="Actions">
        <div className="grid grid-cols-4 gap-1">
          <IconButton icon="splitV" label="Split vertically" shortcut="Shift+S" onClick={() => actions.split(ids, "v")} tip="bottom" />
          <IconButton icon="splitH" label="Split horizontally" shortcut="Alt+Shift+S" onClick={() => actions.split(ids, "h")} tip="bottom" />
          <IconButton icon="rotate" label="Rotate 90°" shortcut="Shift+R" onClick={() => dispatch({ type: "rotate", ids, deg: 90 })} tip="bottom" />
          <IconButton icon="copy" label="Duplicate" shortcut="Ctrl+D" onClick={() => dispatch({ type: "duplicate", ids })} tip="bottom" />
          <IconButton icon="flipH" label="Flip horizontal" shortcut="Shift+H" onClick={() => dispatch({ type: "flip", ids, axis: "h" })} tip="bottom" />
          <IconButton icon="flipV" label="Flip vertical" shortcut="Shift+J" onClick={() => dispatch({ type: "flip", ids, axis: "v" })} tip="bottom" />
          <IconButton icon="number" label="Renumber" shortcut="Shift+N" onClick={() => actions.renumber(ids)} tip="bottom" />
          <IconButton icon="trash" label="Delete" shortcut="Del" onClick={() => actions.requestDelete(ids)} tip="bottom" className="text-red-600" />
        </div>
      </Section>
    </>
  );
}

function uniqueKey(m: Record<string, string>): string {
  let i = 1;
  while (`field${i}` in m) i++;
  return `field${i}`;
}

function NotesArea({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = React.useState(value);
  const [prev, setPrev] = React.useState(value);
  if (prev !== value) { setPrev(value); setDraft(value); }
  return <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== value && onCommit(draft)} rows={3} maxLength={2000} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" placeholder="Internal notes (not shown to attendees)" />;
}

function ElementPanel({ elements, ...props }: PropertiesPanelProps & { elements: EditorElement[] }) {
  const { dispatch, actions } = props;
  const el = elements[0];
  const ids = elements.map((e) => e.id);
  const many = elements.length > 1;
  const p = el.props;
  const patch = (pp: EditorElement["props"]) => dispatch({ type: "updateElements", ids, patch: { props: pp } });
  const isPoint = el.geometry.type === "point";
  const isZone = el.geometry.type === "polygon";
  const isLine = el.geometry.type === "polyline";
  const kindLabel = el.kind.charAt(0).toUpperCase() + el.kind.slice(1);
  return (
    <>
      <Section title={many ? `${elements.length} elements` : kindLabel}>
        {!many && el.kind === "text" ? (
          <TextField label="Text" value={String(p.text ?? "")} onChange={(v) => patch({ text: v })} />
        ) : (
          <TextField label="Name" value={many ? "" : String(p.name ?? "")} onChange={(v) => patch({ name: v })} placeholder={many ? "Mixed" : "Shown on the map"} />
        )}
        {(el.kind === "text" || isZone) && (
          <Row>
            <NumberField label="Font size" value={p.fontSize ?? (el.kind === "text" ? 1.5 : 1.4)} onChange={(v) => v && v > 0 && patch({ fontSize: v })} unit="m" step={0.1} min={0.1} />
            {el.kind === "text" ? <NumberField label="Rotation" value={p.rotationDeg ?? 0} onChange={(v) => patch({ rotationDeg: v ?? 0 })} unit="°" step={5} /> : <NumberField label="3D height" value={p.height3d ?? null} onChange={(v) => patch({ height3d: v ?? undefined })} unit="m" step={0.5} min={0} nullable />}
          </Row>
        )}
        {el.kind === "poi" && <SelectField label="POI type" value={p.poiType ?? "other"} onChange={(v) => patch({ poiType: v })} options={POI_TYPES} />}
        {el.kind === "entrance" && <Toggle label="Default routing start" checked={!!p.isDefaultStart} onChange={(v) => patch({ isDefaultStart: v })} hint="Routes start here when the visitor has no position" />}
        {(isZone || isLine) && <Toggle label="Blocks routing" checked={p.blocksRouting ?? el.kind === "wall"} onChange={(v) => patch({ blocksRouting: v })} hint="Auto-generated paths avoid this" />}
        {isZone && <SelectField label="Kind" value={el.kind} onChange={(v) => dispatch({ type: "updateElements", ids, patch: { kind: v } })} options={["zone", "room", "stage", "shape"]} />}
        {(el.kind === "wall" || el.kind === "line") && <SelectField label="Kind" value={el.kind} onChange={(v) => dispatch({ type: "updateElements", ids, patch: { kind: v } })} options={["wall", "line"]} />}
        {(el.kind === "poi" || el.kind === "entrance") && (
          <>
            <TextField label="Description" value={String(p.description ?? "")} onChange={(v) => patch({ description: v || undefined })} />
            <TextField label="Link URL" value={String(p.url ?? "")} onChange={(v) => patch({ url: v || undefined })} placeholder="https://" />
          </>
        )}
        {!many && isPoint && <p className="text-xs text-gray-500">at {fmtM(el.geometry.type === "point" ? el.geometry.point[0] : 0)}, {fmtM(el.geometry.type === "point" ? el.geometry.point[1] : 0)} m</p>}
      </Section>
      <Section title="Style">
        {isZone && <ColorField label="Fill" value={p.fill} onChange={(v) => patch({ fill: v ?? undefined })} />}
        {(isZone || isLine) && <ColorField label="Stroke" value={p.stroke} onChange={(v) => patch({ stroke: v ?? undefined })} />}
        {(el.kind === "text" || isZone || el.kind === "poi") && <ColorField label="Text / icon colour" value={p.color} onChange={(v) => patch({ color: v ?? undefined })} />}
        {isZone && <NumberField label="Fill opacity" value={p.opacity ?? 0.55} onChange={(v) => patch({ opacity: Math.min(1, Math.max(0, v ?? 0.55)) })} step={0.05} min={0} max={1} />}
        {isLine && <NumberField label="Stroke width" value={p.strokeWidth ?? (el.kind === "wall" ? 0.3 : 0.1)} onChange={(v) => v && v > 0 && patch({ strokeWidth: v })} unit="m" step={0.05} min={0.01} />}
      </Section>
      <Section title="Actions">
        <div className="grid grid-cols-4 gap-1">
          <IconButton icon="front" label="Bring to front" onClick={() => dispatch({ type: "order", ids, mode: "front" })} tip="bottom" />
          <IconButton icon="back" label="Send to back" onClick={() => dispatch({ type: "order", ids, mode: "back" })} tip="bottom" />
          <IconButton icon="rotate" label="Rotate 90°" shortcut="Shift+R" onClick={() => dispatch({ type: "rotate", ids, deg: 90 })} tip="bottom" />
          <IconButton icon="copy" label="Duplicate" shortcut="Ctrl+D" onClick={() => dispatch({ type: "duplicate", ids })} tip="bottom" />
          <IconButton icon="flipH" label="Flip horizontal" onClick={() => dispatch({ type: "flip", ids, axis: "h" })} tip="bottom" />
          <IconButton icon="flipV" label="Flip vertical" onClick={() => dispatch({ type: "flip", ids, axis: "v" })} tip="bottom" />
          <span />
          <IconButton icon="trash" label="Delete" shortcut="Del" onClick={() => actions.requestDelete(ids)} tip="bottom" className="text-red-600" />
        </div>
      </Section>
    </>
  );
}

function EdgePanel({ ids, ...props }: PropertiesPanelProps & { ids: string[] }) {
  const { doc, dispatch, actions } = props;
  const edges = doc.edges.filter((e) => ids.includes(e.id));
  const e = edges[0];
  if (!e) return null;
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  const a = nodes.get(e.from), b = nodes.get(e.to);
  const len = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  const patch = (p: Partial<Pick<typeof e, "accessible" | "oneWay" | "virtual" | "weight">>) => dispatch({ type: "updateEdges", ids, patch: p });
  return (
    <Section title={edges.length > 1 ? `${edges.length} path edges` : "Path edge"}>
      {edges.length === 1 && <p className="text-xs text-gray-500">{fmtM(len)} m long</p>}
      <Toggle label="Accessible (step-free)" checked={e.accessible} onChange={(v) => patch({ accessible: v })} />
      <Toggle label="One-way (from → to)" checked={e.oneWay} onChange={(v) => patch({ oneWay: v })} />
      <Toggle label="Virtual (not drawn on routes)" checked={e.virtual} onChange={(v) => patch({ virtual: v })} />
      <NumberField label="Cost weight" value={e.weight} onChange={(v) => v && v > 0 && patch({ weight: v })} step={0.1} min={0.1} />
      <Button size="sm" variant="outline" className="w-full text-red-600" onClick={() => actions.requestDelete(ids)}><Icon name="trash" size={14} /> Delete edge{edges.length > 1 ? "s" : ""}</Button>
    </Section>
  );
}

function NodePanel({ nodeId, ...props }: PropertiesPanelProps & { nodeId: string }) {
  const { doc, dispatch, actions } = props;
  const n = doc.nodes.find((x) => x.id === nodeId);
  if (!n) return null;
  const set = (p: Point) => dispatch({ type: "setGeometry", nodes: { [n.id]: p } });
  return (
    <Section title="Path node">
      <Row>
        <NumberField label="X" value={n.x} onChange={(v) => set([v ?? n.x, n.y])} unit="m" step={0.1} />
        <NumberField label="Y" value={n.y} onChange={(v) => set([n.x, v ?? n.y])} unit="m" step={0.1} />
      </Row>
      <p className="text-xs text-gray-500">{nodeDegree(doc, n.id)} connected edge(s)</p>
      <Button size="sm" variant="outline" className="w-full text-red-600" onClick={() => actions.requestDelete([n.id])}><Icon name="trash" size={14} /> Delete node</Button>
    </Section>
  );
}

function TransitionPanel({ transition: t, ...props }: PropertiesPanelProps & { transition: EditorTransition }) {
  const { doc, dispatch, actions } = props;
  const patch = (p: Partial<Omit<EditorTransition, "id">>) => dispatch({ type: "updateTransitions", ids: [t.id], patch: p });
  const levelOf = (nodeId: string) => doc.levels.find((l) => l.id === doc.nodes.find((n) => n.id === nodeId)?.levelId);
  return (
    <Section title="Level transition">
      <TextField label="Name" value={t.name} onChange={(v) => patch({ name: v })} placeholder="e.g. North stairs" />
      <Row>
        <SelectField label="Kind" value={t.kind} onChange={(v) => patch({ kind: v })} options={TRANSITION_KINDS} />
        <NumberField label="Travel time" value={t.travelSeconds} onChange={(v) => patch({ travelSeconds: Math.max(0, Math.round(v ?? 0)) })} unit="s" step={5} min={0} />
      </Row>
      <Toggle label="Accessible (lift / ramp)" checked={t.accessible} onChange={(v) => patch({ accessible: v })} />
      <div className="text-xs text-gray-600">
        <p className="mb-1 font-medium">Connects</p>
        {t.nodeIds.length < 2 && <p className="text-amber-700">Needs two nodes on different levels before it is saved.</p>}
        <ul className="space-y-0.5">
          {t.nodeIds.map((id) => { const l = levelOf(id); return <li key={id}><button type="button" className="text-primary hover:underline" onClick={() => { if (l) actions.setActiveLevel(l.id); dispatch({ type: "select", ids: [id] }); }}>{l?.name ?? "?"}</button> · node {id.slice(0, 10)}…</li>; })}
        </ul>
      </div>
      <Button size="sm" variant="outline" className="w-full text-red-600" onClick={() => actions.requestDelete([t.id])}><Icon name="trash" size={14} /> Delete transition</Button>
    </Section>
  );
}

/* ---------------- multi-selection ---------------- */

function MultiPanel({ sel, ...props }: PropertiesPanelProps & { sel: SelectedItems }) {
  const { dispatch, actions } = props;
  const geomIds = [...sel.booths.map((b) => b.id), ...sel.elements.map((e) => e.id), ...sel.nodes.map((n) => n.id)];
  const boothIds = sel.booths.map((b) => b.id);
  const sameLevel = new Set(sel.booths.map((b) => b.levelId)).size === 1;
  const canMerge = boothIds.length >= 2 && sameLevel && !!mergePolygons(sel.booths.map((b) => b.polygon));
  const onlyBooths = sel.booths.length > 0 && sel.elements.length === 0 && sel.nodes.length === 0 && sel.edges.length === 0;
  const onlyEdges = sel.edges.length > 0 && geomIds.length === 0;
  if (onlyEdges) return <EdgePanel {...props} ids={sel.edges.map((e) => e.id)} />;
  return (
    <>
      <Section title="Selection">
        <p className="text-xs text-gray-600">
          {[sel.booths.length && `${sel.booths.length} booths`, sel.elements.length && `${sel.elements.length} elements`, sel.nodes.length && `${sel.nodes.length} nodes`, sel.edges.length && `${sel.edges.length} edges`, sel.transitions.length && `${sel.transitions.length} transitions`].filter(Boolean).join(", ")}
        </p>
      </Section>
      {geomIds.length >= 2 && (
        <Section title="Align">
          <div className="grid grid-cols-6 gap-1">
            <IconButton icon="alignLeft" label="Align left" onClick={() => dispatch({ type: "align", ids: geomIds, mode: "left" })} tip="bottom" />
            <IconButton icon="alignCenterX" label="Align centres horizontally" onClick={() => dispatch({ type: "align", ids: geomIds, mode: "centerX" })} tip="bottom" />
            <IconButton icon="alignRight" label="Align right" onClick={() => dispatch({ type: "align", ids: geomIds, mode: "right" })} tip="bottom" />
            <IconButton icon="alignTop" label="Align top" onClick={() => dispatch({ type: "align", ids: geomIds, mode: "top" })} tip="bottom" />
            <IconButton icon="alignCenterY" label="Align centres vertically" onClick={() => dispatch({ type: "align", ids: geomIds, mode: "centerY" })} tip="bottom" />
            <IconButton icon="alignBottom" label="Align bottom" onClick={() => dispatch({ type: "align", ids: geomIds, mode: "bottom" })} tip="bottom" />
          </div>
          <div className="grid grid-cols-6 gap-1">
            <IconButton icon="distributeX" label="Distribute horizontally" disabled={geomIds.length < 3} onClick={() => dispatch({ type: "distribute", ids: geomIds, axis: "x" })} tip="bottom" />
            <IconButton icon="distributeY" label="Distribute vertically" disabled={geomIds.length < 3} onClick={() => dispatch({ type: "distribute", ids: geomIds, axis: "y" })} tip="bottom" />
          </div>
        </Section>
      )}
      <Section title="Transform">
        <div className="grid grid-cols-6 gap-1">
          <IconButton icon="rotate" label="Rotate 90°" shortcut="Shift+R" onClick={() => dispatch({ type: "rotate", ids: geomIds, deg: 90 })} tip="bottom" />
          <IconButton icon="flipH" label="Flip horizontal" shortcut="Shift+H" onClick={() => dispatch({ type: "flip", ids: geomIds, axis: "h" })} tip="bottom" />
          <IconButton icon="flipV" label="Flip vertical" shortcut="Shift+J" onClick={() => dispatch({ type: "flip", ids: geomIds, axis: "v" })} tip="bottom" />
          <IconButton icon="copy" label="Duplicate" shortcut="Ctrl+D" onClick={() => dispatch({ type: "duplicate", ids: geomIds })} tip="bottom" />
          <span />
          <IconButton icon="trash" label="Delete" shortcut="Del" onClick={() => actions.requestDelete([...geomIds, ...sel.edges.map((e) => e.id), ...sel.transitions.map((t) => t.id)])} tip="bottom" className="text-red-600" />
        </div>
      </Section>
      {boothIds.length > 0 && (
        <Section title="Booths">
          <div className="grid grid-cols-2 gap-1">
            <Button size="sm" variant="outline" disabled={!canMerge} onClick={() => actions.merge(boothIds)} title={!sameLevel ? "Booths must be on the same level" : !canMerge ? "Booths must touch or overlap" : undefined}><Icon name="merge" size={14} /> Merge</Button>
            <Button size="sm" variant="outline" onClick={() => actions.renumber(boothIds)}><Icon name="number" size={14} /> Renumber</Button>
            <Button size="sm" variant="outline" onClick={() => actions.split(boothIds, "v")}><Icon name="splitV" size={14} /> Split V</Button>
            <Button size="sm" variant="outline" onClick={() => actions.split(boothIds, "h")}><Icon name="splitH" size={14} /> Split H</Button>
          </div>
          {onlyBooths && <BulkBoothFields booths={sel.booths} {...props} />}
        </Section>
      )}
    </>
  );
}

function BulkBoothFields({ booths, dispatch, currency }: PropertiesPanelProps & { booths: EditorBooth[] }) {
  const ids = booths.map((b) => b.id);
  const b = booths[0];
  const same = <K extends keyof EditorBooth>(k: K) => booths.every((x) => x[k] === b[k]);
  const patch = (p: Partial<Omit<EditorBooth, "id">>) => dispatch({ type: "updateBooths", ids, patch: p });
  return (
    <div className={cn("space-y-2 pt-1")}>
      <Row>
        <SelectField label={same("boothType") ? "Type" : "Type (mixed)"} value={b.boothType} onChange={(v) => patch({ boothType: v })} options={BOOTH_TYPES} />
        <SelectField label={same("status") ? "Status" : "Status (mixed)"} value={b.status} onChange={(v) => patch({ status: v })} options={BOOTH_STATUSES} />
      </Row>
      <Row>
        <NumberField label={`Price override (${currency})`} value={same("priceCents") && b.priceCents != null ? b.priceCents / 100 : null} onChange={(v) => patch({ priceCents: v == null ? null : Math.round(v * 100) })} step={1} min={0} nullable />
        <NumberField label="3D height" value={same("height3d") ? b.height3d : null} onChange={(v) => patch({ height3d: v })} unit="m" step={0.5} min={0} nullable />
      </Row>
      <ColorField label="Fill override" value={same("colors") ? b.colors?.fill : undefined} onChange={(v) => patch({ colors: { fill: v ?? undefined } })} />
      <Toggle label="Hide labels" checked={booths.every((x) => x.labelHidden)} onChange={(v) => patch({ labelHidden: v })} />
    </div>
  );
}
