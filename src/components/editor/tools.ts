export type Tool = "select" | "booth" | "polygon" | "array" | "wall" | "zone" | "text" | "poi" | "entrance" | "path" | "transition" | "measure";

export interface ToolDef { id: Tool; label: string; key: string; hint: string }

export const TOOLS: ToolDef[] = [
  { id: "select", label: "Select", key: "V", hint: "Click to select, drag to move, drag on empty space for marquee. Shift adds to the selection." },
  { id: "booth", label: "Booth", key: "B", hint: "Drag a rectangle (click for a 3 × 3 m booth). Snaps to grid and neighbours." },
  { id: "polygon", label: "Polygon booth", key: "P", hint: "Click to add corners, double-click or Enter to finish, Esc to cancel." },
  { id: "array", label: "Booth array", key: "A", hint: "Drag the block area, then set columns, rows, sizes, aisles and numbering." },
  { id: "wall", label: "Wall / line", key: "W", hint: "Click to add points, double-click or Enter to finish." },
  { id: "zone", label: "Zone", key: "Z", hint: "Click corners of the zone, double-click or Enter to finish." },
  { id: "text", label: "Text", key: "T", hint: "Click to place a label; edit it in the properties panel." },
  { id: "poi", label: "Point of interest", key: "I", hint: "Pick a type, then click to place it." },
  { id: "entrance", label: "Entrance", key: "E", hint: "Click to place an entrance. Mark one as default routing start." },
  { id: "path", label: "Path network", key: "R", hint: "Click to chain nodes. Clicking an edge inserts a junction. Enter/Esc ends the chain." },
  { id: "transition", label: "Level transition", key: "X", hint: "Click a node on this level, switch level, click the matching node." },
  { id: "measure", label: "Measure", key: "M", hint: "Click two points to measure the distance." },
];

export const LAYER_CLASSES = ["background", "grid", "booths", "zones", "walls", "text", "pois", "entrances", "network"] as const;
export type LayerClass = (typeof LAYER_CLASSES)[number];
export interface LayerState { visible: boolean; locked: boolean }
export type LayerStates = Record<LayerClass, LayerState>;

export const DEFAULT_LAYERS: LayerStates = Object.fromEntries(LAYER_CLASSES.map((c) => [c, { visible: true, locked: false }])) as LayerStates;

export const LAYER_LABELS: Record<LayerClass, string> = {
  background: "Background image",
  grid: "Grid",
  booths: "Booths",
  zones: "Zones, rooms & stages",
  walls: "Walls & lines",
  text: "Text",
  pois: "Points of interest",
  entrances: "Entrances",
  network: "Path network",
};

export function layerOfElementKind(kind: string): LayerClass {
  switch (kind) {
    case "wall": case "line": return "walls";
    case "text": return "text";
    case "poi": return "pois";
    case "entrance": return "entrances";
    default: return "zones";
  }
}

export interface Shortcut { keys: string; action: string }
export const SHORTCUTS: Shortcut[] = [
  { keys: "V B P A W Z T I E R X M", action: "Switch tool" },
  { keys: "Space + drag / middle drag", action: "Pan" },
  { keys: "Wheel / pinch", action: "Zoom to cursor" },
  { keys: "F", action: "Zoom to fit" },
  { keys: "1", action: "Zoom to 100 %" },
  { keys: "Shift + click", action: "Add to selection" },
  { keys: "Ctrl + A", action: "Select all on level" },
  { keys: "Arrows / Shift + arrows", action: "Nudge 0.1 m / 1 m" },
  { keys: "Ctrl + Z / Ctrl + Shift + Z", action: "Undo / redo" },
  { keys: "Ctrl + D", action: "Duplicate" },
  { keys: "Ctrl + C / Ctrl + V", action: "Copy / paste" },
  { keys: "Delete", action: "Delete selection" },
  { keys: "Shift + M", action: "Merge selected booths" },
  { keys: "Shift + S / Alt + Shift + S", action: "Split booth vertically / horizontally" },
  { keys: "Shift + R", action: "Rotate 90°" },
  { keys: "Shift + H / Shift + J", action: "Flip horizontal / vertical" },
  { keys: "Shift + N", action: "Renumber selected booths" },
  { keys: "Ctrl + S", action: "Save now" },
  { keys: "Enter / Esc", action: "Finish / cancel drawing" },
  { keys: "?", action: "This help" },
];
