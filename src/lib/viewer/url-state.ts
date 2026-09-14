/**
 * Parse and serialise the viewer's deep-link parameters (`ViewerParams`).
 * The URL is the public contract for deep links, kiosks and the embed SDK's `applyParameters`.
 */
import type { ViewerParams } from "@/lib/sdk-protocol";

export const VIEWER_PARAM_KEYS = [
  "booth", "exhibitor", "category", "level", "route", "from", "to", "accessible", "search", "lang", "kiosk", "noOverlay",
  "offHistory", "plan", "position", "view", "theme", "preview", "session", "embed", "consent", "hide", "bearing", "zoom", "center", "tab",
] as const satisfies readonly (keyof ViewerParams)[];

export type HideTarget = "controls" | "levels" | "header" | "overlay" | "searchButtons";
export const HIDE_TARGETS: readonly HideTarget[] = ["controls", "levels", "header", "overlay", "searchButtons"];

const FLAGS = new Set(["accessible", "kiosk", "noOverlay", "offHistory", "preview", "embed"]);

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined> | string | null | undefined;

function toSearchParams(src: ParamSource): URLSearchParams {
  if (!src) return new URLSearchParams();
  if (src instanceof URLSearchParams) return src;
  if (typeof src === "string") return new URLSearchParams(src.startsWith("?") ? src.slice(1) : src);
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(src)) {
    if (v === undefined) continue;
    p.set(k, Array.isArray(v) ? v[0] ?? "" : v);
  }
  return p;
}

function flag(v: string | null): "1" | "0" | undefined {
  if (v === null) return undefined;
  const s = v.toLowerCase();
  if (s === "" || s === "1" || s === "true" || s === "yes" || s === "on") return "1";
  return "0";
}

/** Parse from a query string, `URLSearchParams` or Next's `searchParams` object. Unknown keys are ignored. */
export function parseViewerParams(src: ParamSource): ViewerParams {
  const p = toSearchParams(src);
  const out: ViewerParams = {};
  for (const key of VIEWER_PARAM_KEYS) {
    const raw = p.get(key);
    if (raw === null) continue;
    if (FLAGS.has(key)) {
      const f = flag(raw);
      if (f) (out as Record<string, string>)[key] = f;
      continue;
    }
    const v = raw.trim();
    if (!v) continue;
    switch (key) {
      case "view":
        if (v === "2d" || v === "3d") out.view = v;
        break;
      case "theme":
        if (v === "light" || v === "dark") out.theme = v;
        break;
      case "consent":
        if (v === "ask" || v === "granted" || v === "denied") out.consent = v;
        break;
      case "tab":
        if (v === "exhibitors" || v === "categories" || v === "sessions" || v === "plan") out.tab = v;
        break;
      default:
        (out as Record<string, string>)[key] = v;
    }
  }
  // ExpoFP compat: `?A101` style (bare booth label) and `?exhibitor=` already handled above.
  return out;
}

/** Serialise to a query string (without `?`); empty when nothing is set. */
export function serializeViewerParams(params: ViewerParams): string {
  const p = new URLSearchParams();
  for (const key of VIEWER_PARAM_KEYS) {
    const v = params[key];
    if (v === undefined || v === null || v === "") continue;
    if (FLAGS.has(key) && v === "0") continue;
    p.set(key, String(v));
  }
  return p.toString();
}

/** Merge `patch` into `base`; `undefined` values delete keys. */
export function mergeViewerParams(base: ViewerParams, patch: Partial<Record<keyof ViewerParams, string | undefined>>): ViewerParams {
  const next: Record<string, string | undefined> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") delete next[k];
    else next[k] = v;
  }
  return next as ViewerParams;
}

export function parseHide(hide: string | undefined): Set<HideTarget> {
  const set = new Set<HideTarget>();
  if (!hide) return set;
  for (const part of hide.split(",")) {
    const v = part.trim();
    const hit = HIDE_TARGETS.find((h) => h.toLowerCase() === v.toLowerCase());
    if (hit) set.add(hit);
  }
  return set;
}

/** `"x,y"` or `"x,y,L2"` → plan point (+ optional level short name / id). */
export function parsePosition(v: string | undefined): { x: number; y: number; level?: string } | null {
  if (!v) return null;
  const parts = v.split(",").map((s) => s.trim());
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return parts[2] ? { x, y, level: parts[2] } : { x, y };
}

export function parseRouteParam(route: string | undefined): string[] {
  if (!route) return [];
  return route.split(/[,|>]/).map((s) => s.trim()).filter(Boolean);
}

export function parseNumber(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Comma-separated list (booth labels in a shared `plan=` param that is not a share id). */
export function parseList(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Write params to the address bar without a navigation (no-op for `offHistory`). */
export function writeUrl(params: ViewerParams, opts: { offHistory?: boolean; replace?: boolean } = {}): void {
  if (typeof window === "undefined" || opts.offHistory) return;
  const qs = serializeViewerParams(params);
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  try {
    if (opts.replace === false) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  } catch {
    /* sandboxed iframe without history access */
  }
}
