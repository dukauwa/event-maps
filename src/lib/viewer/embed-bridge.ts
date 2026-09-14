/**
 * Embed bridge: connects a {@link ViewerController} to a parent page over postMessage using the
 * `SdkCallMessage` / `SdkResultMessage` / `SdkEventMessage` contract from `sdk-protocol.ts`.
 *
 * Active when the viewer runs inside an iframe (or `?embed=1`). Incoming calls are accepted only from origins listed in
 * `settings.embed.allowedOrigins` (`"*"` allows all); events are posted to the parent with the same origin filter.
 * The controller is also exposed on `window.__tesseraViewer` and a `tessera:ready` DOM event is dispatched so
 * same-window integrations (tests, kiosks, custom shells) can drive the viewer without an iframe.
 */
import { SDK_EVENTS, SDK_MARK, SDK_PROTOCOL_VERSION, isSdkMessage, type SdkCallMessage, type SdkEvent, type SdkEventMessage, type SdkResultMessage } from "@/lib/sdk-protocol";
import type { ViewerController } from "./controller";

export interface EmbedBridgeOptions {
  allowedOrigins: string[];
  /** Force the bridge on even when `window.parent === window` (for tests). */
  force?: boolean;
  /** Target window for events (defaults to `window.parent`). */
  target?: Window | null;
}

export interface EmbedBridge {
  readonly active: boolean;
  /** Origin of the parent page once the first message arrives (null before). */
  readonly parentOrigin: string | null;
  post: (name: SdkEvent, payload: unknown) => void;
  destroy: () => void;
}

/** Is the viewer running inside an iframe or explicitly flagged as embedded? */
export function isEmbedded(embedParam?: string): boolean {
  if (typeof window === "undefined") return false;
  if (embedParam === "1") return true;
  try { return window.parent !== window; } catch { return true; }
}

export function originAllowed(origin: string, allowed: string[]): boolean {
  if (!allowed.length) return false;
  if (allowed.includes("*")) return true;
  if (origin === "null") return allowed.includes("null");
  return allowed.some((a) => {
    const rule = a.trim().replace(/\/$/, "");
    if (!rule) return false;
    if (rule === origin) return true;
    // Wildcard subdomains: https://*.example.com
    if (rule.includes("*")) {
      const re = new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^.]+")}$`, "i");
      return re.test(origin);
    }
    return false;
  });
}

declare global {
  interface Window { __tesseraViewer?: ViewerController }
}

export function attachEmbedBridge(controller: ViewerController, opts: EmbedBridgeOptions): EmbedBridge {
  const isIframe = typeof window !== "undefined" && (() => { try { return window.parent !== window; } catch { return true; } })();
  const target = opts.target ?? (typeof window !== "undefined" && isIframe ? window.parent : null);
  const active = typeof window !== "undefined" && (isIframe || !!opts.force);
  let parentOrigin: string | null = null;
  let destroyed = false;

  function post(name: SdkEvent, payload: unknown) {
    if (destroyed || !target) return;
    const msg: SdkEventMessage = { [SDK_MARK]: true, v: SDK_PROTOCOL_VERSION, type: "event", name, payload: safe(payload) };
    try { target.postMessage(msg, parentOrigin && parentOrigin !== "null" ? parentOrigin : "*"); } catch (e) { console.warn("[tessera] postMessage failed", e); }
  }

  async function handle(ev: MessageEvent) {
    if (destroyed) return;
    const data: unknown = ev.data;
    if (!isSdkMessage(data) || data.type !== "call") return;
    if (!originAllowed(ev.origin, opts.allowedOrigins)) {
      console.warn(`[tessera] rejected SDK call from ${ev.origin}`);
      return;
    }
    if (target && ev.source !== target) return;
    parentOrigin = ev.origin;
    const call = data as SdkCallMessage;
    let reply: SdkResultMessage;
    try {
      const value = await controller.call(call.method, Array.isArray(call.args) ? call.args : []);
      reply = { [SDK_MARK]: true, v: SDK_PROTOCOL_VERSION, type: "result", id: call.id, ok: true, value: safe(value) };
    } catch (e) {
      reply = { [SDK_MARK]: true, v: SDK_PROTOCOL_VERSION, type: "result", id: call.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const src = (ev.source as Window | null) ?? target;
    try { src?.postMessage(reply, ev.origin === "null" ? "*" : ev.origin); } catch (err) { console.warn("[tessera] reply failed", err); }
  }

  const unsubs: (() => void)[] = [];
  if (active) {
    window.addEventListener("message", handle);
    unsubs.push(() => window.removeEventListener("message", handle));
    for (const name of SDK_EVENTS) unsubs.push(controller.on(name, (payload) => post(name, payload)));
  }
  if (typeof window !== "undefined") {
    window.__tesseraViewer = controller;
    try { window.dispatchEvent(new CustomEvent("tessera:ready", { detail: { controller } })); } catch { /* ignore */ }
  }

  return {
    get active() { return active; },
    get parentOrigin() { return parentOrigin; },
    post,
    destroy() {
      destroyed = true;
      for (const u of unsubs) u();
      if (typeof window !== "undefined" && window.__tesseraViewer === controller) delete window.__tesseraViewer;
    },
  };
}

/** Make a value structured-cloneable (drop functions, class instances → plain objects). */
function safe(v: unknown): unknown {
  if (v === undefined) return null;
  try { return JSON.parse(JSON.stringify(v)); } catch { return null; }
}
